import { businessDate } from '../shared/dates.ts';
import type {
  Alert,
  Allocation,
  Consultant,
  ConsultantAllocation,
  Evaluation,
  Objective,
  Project,
  ProjectSummary,
  Rating,
  Requirement,
  Skill,
  SkillCoverage,
  Summary,
  Team,
  TeamSummary,
  Training,
} from '../shared/types.ts';

const DAY_MS = 86_400_000;
const STALE_DAYS = 30;
const EXPIRY_DAYS = 90;
const ASSESSMENT_OLD_DAYS = 365;
// Avisos de avaliações em falta só a partir deste mês (outubro): antes disso o ciclo ainda decorre.
const EVALUATION_ALERT_FROM_MONTH = 10;

function avgRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function pct(bp: number): string {
  return `${(bp / 100).toFixed(1).replace('.', ',')}%`;
}

const fte = (allocatedPct: number) => (allocatedPct / 100).toFixed(1).replace('.', ',');
const isOpenProject = (p: Project) => p.status !== 'done';
const isOpenTraining = (t: Training) => t.status === 'planned' || t.status === 'in_progress';

export function buildSummary(
  teams: Team[],
  consultants: Consultant[],
  projects: Project[],
  allocations: Allocation[],
  skills: Skill[],
  ratings: Rating[],
  requirements: Requirement[],
  trainings: Training[],
  objectives: Objective[],
  evaluations: Evaluation[],
  now = new Date(),
): Summary {
  const today = businessDate(now);
  const limit = businessDate(new Date(now.getTime() + EXPIRY_DAYS * DAY_MS));
  const staleBefore = now.getTime() - STALE_DAYS * DAY_MS;
  const oldBefore = businessDate(new Date(now.getTime() - ASSESSMENT_OLD_DAYS * DAY_MS));
  const alerts: Alert[] = [];
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const skillById = new Map(skills.map((k) => [k.id, k]));
  const ratingKey = (c: number, k: number) => `${c}:${k}`;
  const ratingMap = new Map(ratings.map((r) => [ratingKey(r.consultantId, r.skillId), r]));
  const coverage: SkillCoverage[] = [];

  // % alocada por consultor, só em projetos em aberto (um projeto concluído já não consome ninguém).
  const openProjectIds = new Set(projects.filter(isOpenProject).map((p) => p.id));
  const pctByConsultant = new Map<number, { pct: number; projects: number }>();
  for (const a of allocations) {
    if (!openProjectIds.has(a.projectId)) continue;
    const cur = pctByConsultant.get(a.consultantId) ?? { pct: 0, projects: 0 };
    pctByConsultant.set(a.consultantId, { pct: cur.pct + a.allocationPct, projects: cur.projects + 1 });
  }

  const teamSummaries: TeamSummary[] = teams.map((t) => {
    const members = consultants.filter((c) => c.teamId === t.id && c.status === 'active');
    // Rates só existem para externos; os internos não entram em médias nem em alertas de rate.
    const externals = members.filter((c) => c.kind === 'external');
    const withBill = externals.filter((c) => c.billRateCentsPerDay !== null);
    const avgCost = avgRounded(externals.filter((c) => c.costRateCentsPerDay > 0).map((c) => c.costRateCentsPerDay));
    const avgBill = avgRounded(withBill.map((c) => c.billRateCentsPerDay ?? 0));
    const avgCostOfBilled = avgRounded(withBill.map((c) => c.costRateCentsPerDay));
    const marginBp =
      avgBill !== null && avgBill > 0 && avgCostOfBilled !== null
        ? Math.round(((avgBill - avgCostOfBilled) * 10_000) / avgBill)
        : null;
    const utilisationBp =
      t.budgetCents > 0 ? Math.round((t.actualCents * 10_000) / t.budgetCents) : null;
    const expiring = members.filter(
      (c) => c.contractEnd !== null && c.contractEnd >= today && c.contractEnd <= limit,
    );
    const gap = t.plannedHeadcount - members.length;

    const openProjects = projects.filter((p) => p.teamId === t.id && isOpenProject(p));
    const projectBudget = openProjects.reduce((a, p) => a + p.budgetCents, 0);
    const unallocated = members.filter((m) => (pctByConsultant.get(m.id)?.pct ?? 0) === 0);
    const overallocated = members.filter((m) => (pctByConsultant.get(m.id)?.pct ?? 0) > 100);

    if (utilisationBp !== null && utilisationBp >= 9000)
      alerts.push({ type: 'budget_over_90', scope: t.name, message: `Budget consumido: ${pct(utilisationBp)}.` });
    if (gap > 0) alerts.push({ type: 'vacancies', scope: t.name, message: `${gap} vaga(s) por preencher.` });
    if (gap < 0)
      alerts.push({
        type: 'over_headcount',
        scope: t.name,
        message: `${-gap} pessoa(s) acima do headcount orçamentado.`,
      });
    for (const c of expiring)
      alerts.push({ type: 'contract_expiring', scope: `${t.name} / ${c.code}`, message: `Contrato termina a ${c.contractEnd}.` });
    for (const c of externals.filter((m) => m.costRateCentsPerDay === 0))
      alerts.push({ type: 'missing_cost_rate', scope: `${t.name} / ${c.code}`, message: 'Externo sem rate registada.' });
    if (Date.parse(t.updatedAt) < staleBefore)
      alerts.push({
        type: 'stale_data',
        scope: t.name,
        message: `Dados da equipa sem atualização há mais de ${STALE_DAYS} dias.`,
      });
    for (const c of members.filter((m) => Date.parse(m.updatedAt) < staleBefore))
      alerts.push({
        type: 'stale_data',
        scope: `${t.name} / ${c.code}`,
        message: `Consultor sem atualização há mais de ${STALE_DAYS} dias.`,
      });
    if (t.budgetCents > 0 && projectBudget > t.budgetCents)
      alerts.push({
        type: 'projects_exceed_budget',
        scope: t.name,
        message: 'A soma do budget dos projetos em aberto excede o budget da equipa.',
      });
    for (const c of unallocated)
      alerts.push({ type: 'consultant_unallocated', scope: `${t.name} / ${c.code}`, message: 'Ativo sem alocação a nenhum projeto.' });
    for (const c of overallocated)
      alerts.push({
        type: 'consultant_overallocated',
        scope: `${t.name} / ${c.code}`,
        message: `Alocado a ${pctByConsultant.get(c.id)?.pct ?? 0}% (acima de 100%).`,
      });

    let skillGaps = 0;
    for (const rq of requirements.filter((r) => r.teamId === t.id)) {
      const skillName = skillById.get(rq.skillId)?.name ?? '—';
      const qualifiedRatings = members
        .map((m) => ratingMap.get(ratingKey(m.id, rq.skillId)))
        .filter((r): r is Rating => r !== undefined && r.level >= rq.requiredLevel);
      const qualified = qualifiedRatings.length;
      const qualifiedValidated = qualifiedRatings.filter((r) => r.validated).length;
      const skillGap = Math.max(0, rq.minPeople - qualified);
      const qualifiedIds = new Set(
        members.filter((m) => (ratingMap.get(ratingKey(m.id, rq.skillId))?.level ?? -1) >= rq.requiredLevel).map((m) => m.id),
      );
      // Só conta quem ainda não é qualificado e tem formação em aberto que chega ao nível exigido.
      const inTraining = new Set(
        trainings
          .filter(
            (tr) =>
              isOpenTraining(tr) &&
              tr.skillId === rq.skillId &&
              tr.targetLevel >= rq.requiredLevel &&
              members.some((m) => m.id === tr.consultantId) &&
              !qualifiedIds.has(tr.consultantId),
          )
          .map((tr) => tr.consultantId),
      ).size;
      const gapAfterTraining = Math.max(0, skillGap - inTraining);
      coverage.push({
        teamName: t.name,
        skill: skillName,
        requiredLevel: rq.requiredLevel,
        minPeople: rq.minPeople,
        qualified,
        qualifiedValidated,
        gap: skillGap,
        inTraining,
        gapAfterTraining,
      });
      if (skillGap > 0) {
        skillGaps += 1;
        alerts.push({
          type: 'skill_gap',
          scope: `${t.name} / ${skillName}`,
          message: `Faltam ${skillGap} pessoa(s) com nível ≥ ${rq.requiredLevel} (tem ${qualified}, mínimo ${rq.minPeople}).`,
        });
        if (gapAfterTraining > 0)
          alerts.push({
            type: 'training_gap_uncovered',
            scope: `${t.name} / ${skillName}`,
            message: `Mesmo com as formações em aberto (${inTraining}), faltam ${gapAfterTraining} pessoa(s): não há plano que feche o gap.`,
          });
      } else if (qualifiedValidated < rq.minPeople) {
        alerts.push({
          type: 'skill_unvalidated',
          scope: `${t.name} / ${skillName}`,
          message: `A cobertura depende de autoavaliações: só ${qualifiedValidated} de ${rq.minPeople} validada(s).`,
        });
      }
    }
    const oldRatings = members.flatMap((m) =>
      ratings.filter((r) => r.consultantId === m.id && r.assessedAt < oldBefore),
    );
    if (oldRatings.length > 0)
      alerts.push({
        type: 'skill_assessment_old',
        scope: t.name,
        message: `${oldRatings.length} avaliação(ões) de competências com mais de ${ASSESSMENT_OLD_DAYS} dias.`,
      });

    return {
      teamId: t.id,
      name: t.name,
      budgetCents: t.budgetCents,
      actualCents: t.actualCents,
      remainingCents: t.budgetCents - t.actualCents,
      utilisationBp,
      plannedHeadcount: t.plannedHeadcount,
      activeHeadcount: members.length,
      headcountGap: gap,
      internalHeadcount: members.length - externals.length,
      externalHeadcount: externals.length,
      avgCostRateCentsPerDay: avgCost,
      avgBillRateCentsPerDay: avgBill,
      marginBp,
      contractsExpiring90d: expiring.length,
      openProjects: openProjects.length,
      unallocatedPeople: unallocated.length,
      overallocatedPeople: overallocated.length,
      skillGaps,
    };
  });

  const personById = new Map(consultants.map((c) => [c.id, c]));

  // ---- Objetivos (ano corrente) e avaliações: só agregados saem daqui ----
  const activeIds = new Set(consultants.filter((c) => c.status === 'active').map((c) => c.id));
  const teamOfObjective = (o: Objective): number | undefined =>
    o.teamId ?? (o.consultantId !== null ? personById.get(o.consultantId)?.teamId : undefined);
  const yearObjectives = objectives.filter(
    (o) => o.period.startsWith(year) && (o.consultantId === null || activeIds.has(o.consultantId)),
  );
  const isOverdueObjective = (o: Objective) =>
    o.dueDate !== null && o.dueDate < today && o.status !== 'achieved' && o.status !== 'missed';
  const avgBp = (os: Objective[]) =>
    os.length === 0 ? null : Math.round((os.reduce((a, o) => a + o.progressPct, 0) * 100) / os.length);
  const count = (st: Objective['status']) => yearObjectives.filter((o) => o.status === st).length;

  const objectivesByTeam = teams.map((t) => {
    const os = yearObjectives.filter((o) => teamOfObjective(o) === t.id);
    const overdue = os.filter(isOverdueObjective).length;
    const atRisk = os.filter((o) => o.status === 'at_risk').length;
    if (atRisk > 0)
      alerts.push({ type: 'objective_at_risk', scope: t.name, message: `${atRisk} objetivo(s) em risco.` });
    if (overdue > 0)
      alerts.push({ type: 'objective_overdue', scope: t.name, message: `${overdue} objetivo(s) com data limite ultrapassada.` });
    const withoutObjectives = consultants.filter(
      (c) => c.teamId === t.id && c.status === 'active' && !yearObjectives.some((o) => o.consultantId === c.id),
    ).length;
    if (withoutObjectives > 0)
      alerts.push({
        type: 'consultant_without_objectives',
        scope: t.name,
        message: `${withoutObjectives} consultor(es) ativo(s) sem objetivos para ${year}.`,
      });
    return {
      teamName: t.name,
      total: os.length,
      achieved: os.filter((o) => o.status === 'achieved').length,
      atRisk,
      overdue,
      avgProgressBp: avgBp(os),
    };
  });

  const yearEvals = evaluations.filter((e) => e.period.startsWith(year) && activeIds.has(e.consultantId));
  const withFinal = new Set(yearEvals.filter((e) => e.status === 'final').map((e) => e.consultantId));
  const missingEvals = consultants.filter((c) => c.status === 'active' && !withFinal.has(c.id));
  if (month >= EVALUATION_ALERT_FROM_MONTH) {
    for (const t of teams) {
      const n = missingEvals.filter((c) => c.teamId === t.id).length;
      if (n > 0)
        alerts.push({
          type: 'evaluation_pending',
          scope: t.name,
          message: `${n} consultor(es) sem avaliação final de ${year}.`,
        });
    }
  }
  const overdueTrainings = trainings.filter((tr) => isOpenTraining(tr) && tr.dueDate !== null && tr.dueDate < today);
  for (const tr of overdueTrainings) {
    const c = personById.get(tr.consultantId);
    alerts.push({
      type: 'training_overdue',
      scope: `${c ? (teamById.get(c.teamId)?.name ?? '—') : '—'} / ${c?.code ?? '—'}`,
      message: `Formação "${tr.title}" com data limite ${tr.dueDate} ultrapassada.`,
    });
  }

  const projectSummaries: ProjectSummary[] = projects.map((p) => {
    const mine = allocations.filter((a) => a.projectId === p.id);
    const allocatedPct = mine.reduce((a, x) => a + x.allocationPct, 0);
    const gapPct = Math.max(0, p.plannedHeadcount * 100 - allocatedPct);
    const teamName = teamById.get(p.teamId)?.name ?? '—';
    const scope = `${teamName} / ${p.name}`;
    if (p.status === 'at_risk') alerts.push({ type: 'project_at_risk', scope, message: 'Projeto marcado em risco.' });
    if (isOpenProject(p) && p.endDate !== null && p.endDate < today)
      alerts.push({
        type: 'project_overdue',
        scope,
        message: `Data de fim (${p.endDate}) ultrapassada e projeto não concluído.`,
      });
    if (isOpenProject(p) && gapPct > 0)
      alerts.push({
        type: 'project_understaffed',
        scope,
        message: `Precisa de ${p.plannedHeadcount} HC e tem ${fte(allocatedPct)} FTE alocados.`,
      });
    return {
      projectId: p.id,
      name: p.name,
      teamName,
      status: p.status,
      priority: p.priority,
      endDate: p.endDate,
      budgetCents: p.budgetCents,
      plannedHeadcount: p.plannedHeadcount,
      allocatedPeople: mine.length,
      allocatedPct,
      gapPct,
    };
  });

  const allocationSummaries: ConsultantAllocation[] = consultants
    .filter((c) => c.status === 'active')
    .map((c) => ({
      code: c.code,
      teamName: teamById.get(c.teamId)?.name ?? '—',
      allocatedPct: pctByConsultant.get(c.id)?.pct ?? 0,
      projectCount: pctByConsultant.get(c.id)?.projects ?? 0,
    }));

  return {
    generatedAt: now.toISOString(),
    currency: 'EUR',
    totals: {
      budgetCents: teams.reduce((a, t) => a + t.budgetCents, 0),
      actualCents: teams.reduce((a, t) => a + t.actualCents, 0),
      plannedHeadcount: teams.reduce((a, t) => a + t.plannedHeadcount, 0),
      activeHeadcount: teamSummaries.reduce((a, t) => a + t.activeHeadcount, 0),
      internalHeadcount: teamSummaries.reduce((a, t) => a + t.internalHeadcount, 0),
      externalHeadcount: teamSummaries.reduce((a, t) => a + t.externalHeadcount, 0),
      openProjects: projects.filter(isOpenProject).length,
    },
    teams: teamSummaries,
    projects: projectSummaries,
    allocations: allocationSummaries,
    skills: {
      skillCount: skills.length,
      ratingCount: ratings.length,
      validatedRatioBp:
        ratings.length > 0
          ? Math.round((ratings.filter((r) => r.validated).length * 10_000) / ratings.length)
          : null,
      coverage,
    },
    objectives: {
      year,
      total: yearObjectives.length,
      achieved: count('achieved'),
      onTrack: count('on_track'),
      atRisk: count('at_risk'),
      missed: count('missed'),
      notStarted: count('not_started'),
      overdue: yearObjectives.filter(isOverdueObjective).length,
      avgProgressBp: avgBp(yearObjectives),
      byTeam: objectivesByTeam,
    },
    evaluations: {
      year,
      finalCount: yearEvals.filter((e) => e.status === 'final').length,
      draftCount: yearEvals.filter((e) => e.status === 'draft').length,
      missingCount: missingEvals.length,
    },
    training: {
      openCount: trainings.filter(isOpenTraining).length,
      overdueCount: overdueTrainings.length,
      openCostCents: trainings.filter(isOpenTraining).reduce((a, tr) => a + tr.costCents, 0),
    },
    alerts,
  };
}
