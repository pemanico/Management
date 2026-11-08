import { businessDate } from '../shared/dates.ts';
import type {
  Alert,
  Allocation,
  Consultant,
  ConsultantAllocation,
  Project,
  ProjectSummary,
  Rating,
  Requirement,
  Skill,
  SkillCoverage,
  Summary,
  Team,
  TeamSummary,
} from '../shared/types.ts';

const DAY_MS = 86_400_000;
const STALE_DAYS = 30;
const EXPIRY_DAYS = 90;
const ASSESSMENT_OLD_DAYS = 365;

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

export function buildSummary(
  teams: Team[],
  consultants: Consultant[],
  projects: Project[],
  allocations: Allocation[],
  skills: Skill[],
  ratings: Rating[],
  requirements: Requirement[],
  now = new Date(),
): Summary {
  const today = businessDate(now);
  const limit = businessDate(new Date(now.getTime() + EXPIRY_DAYS * DAY_MS));
  const staleBefore = now.getTime() - STALE_DAYS * DAY_MS;
  const oldBefore = businessDate(new Date(now.getTime() - ASSESSMENT_OLD_DAYS * DAY_MS));
  const alerts: Alert[] = [];

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
    const withBill = members.filter((c) => c.billRateCentsPerDay !== null);
    const avgCost = avgRounded(members.map((c) => c.costRateCentsPerDay));
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
    for (const c of members.filter((m) => m.billRateCentsPerDay === null))
      alerts.push({ type: 'missing_bill_rate', scope: `${t.name} / ${c.code}`, message: 'Sem rate faturada registada.' });
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
      coverage.push({
        teamName: t.name,
        skill: skillName,
        requiredLevel: rq.requiredLevel,
        minPeople: rq.minPeople,
        qualified,
        qualifiedValidated,
        gap: skillGap,
      });
      if (skillGap > 0) {
        skillGaps += 1;
        alerts.push({
          type: 'skill_gap',
          scope: `${t.name} / ${skillName}`,
          message: `Faltam ${skillGap} pessoa(s) com nível ≥ ${rq.requiredLevel} (tem ${qualified}, mínimo ${rq.minPeople}).`,
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
    alerts,
  };
}
