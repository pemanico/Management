import type { Summary } from '../../shared/types.ts';
import { formatBp, formatCents } from '../money.ts';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from './ProjectsView.tsx';

const ALERT_LABEL: Record<Summary['alerts'][number]['type'], string> = {
  budget_over_90: 'Budget',
  vacancies: 'Vagas',
  over_headcount: 'Headcount',
  contract_expiring: 'Contrato',
  missing_cost_rate: 'Externo sem rate',
  missing_supplier: 'Externo sem fornecedor',
  stale_data: 'Dados antigos',
  project_at_risk: 'Projeto em risco',
  project_overdue: 'Projeto em atraso',
  projects_exceed_budget: 'Budget de projetos',
  project_understaffed: 'Projeto sub-staffed',
  consultant_overallocated: 'Sobre-alocação',
  consultant_unallocated: 'Sem alocação',
  skill_gap: 'Gap de competência',
  skill_unvalidated: 'Competência não validada',
  skill_assessment_old: 'Avaliações antigas',
  training_overdue: 'Formação em atraso',
  training_gap_uncovered: 'Gap sem plano de formação',
  objective_at_risk: 'Objetivos em risco',
  objective_overdue: 'Objetivos em atraso',
  consultant_without_objectives: 'Sem objetivos',
  evaluation_pending: 'Avaliações em falta',
};

export function SummaryView({ summary }: { summary: Summary }) {
  const { totals, teams, alerts, projects, allocations, skills, training, objectives, evaluations, suppliers } = summary;
  const hasMoney = totals.budgetCents > 0; // budget em euros é opcional (muitas unidades só têm budget em headcount)
  return (
    <section aria-labelledby="sum-title">
      <h2 id="sum-title">Resumo da unidade</h2>
      <p className="muted-text">Atualizado a {summary.generatedAt.slice(0, 16).replace('T', ' ')} UTC</p>

      <dl className="kpis">
        {hasMoney && <div className="card"><dt>Budget total</dt><dd>{formatCents(totals.budgetCents)}</dd></div>}
        {hasMoney && <div className="card"><dt>Gasto real</dt><dd>{formatCents(totals.actualCents)}</dd></div>}
        <div className="card"><dt>Headcount ativo / orçamentado</dt><dd>{totals.activeHeadcount} / {totals.plannedHeadcount}</dd></div>
        <div className="card"><dt>Internos ativos / orçamentados</dt><dd>{totals.internalHeadcount} / {totals.plannedInternalHeadcount}</dd></div>
        <div className="card"><dt>Externos ativos / orçamentados</dt><dd>{totals.externalHeadcount} / {totals.plannedExternalHeadcount}</dd></div>
        <div className="card"><dt>Custo de externos / mês</dt><dd>{formatCents(totals.externalMonthlyCostCents)}</dd></div>
        <div className="card"><dt>Custo de externos / ano</dt><dd>{formatCents(totals.externalAnnualCostCents)}</dd></div>
        <div className="card"><dt>Formações em aberto</dt><dd>{training.openCount}</dd></div>
        <div className="card"><dt>Objetivos {objectives.year} atingidos / total</dt><dd>{objectives.achieved} / {objectives.total}</dd></div>
        <div className="card"><dt>Avaliações {evaluations.year} finais / em falta</dt><dd>{evaluations.finalCount} / {evaluations.missingCount}</dd></div>
        <div className="card"><dt>Projetos em aberto</dt><dd>{totals.openProjects}</dd></div>
        <div className="card"><dt>Alertas</dt><dd>{alerts.length}</dd></div>
      </dl>

      <h3>Alertas</h3>
      {alerts.length === 0 ? (
        <p className="empty">Sem alertas. Bom sinal, ou faltam dados.</p>
      ) : (
        <ul className="alerts">
          {alerts.map((a) => (
            <li key={`${a.type}|${a.scope}|${a.message}`}>
              <strong>{ALERT_LABEL[a.type]}</strong> · {a.scope}: {a.message}
            </li>
          ))}
        </ul>
      )}

      <h3>Fornecedores de externos</h3>
      <p className="muted-text">Custos = rate diária × 20 dias × 11 meses, a 100 % (não considera a % de alocação).</p>
      {suppliers.length === 0 ? (
        <p className="empty">Sem externos ativos com fornecedor registado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Externos ativos por fornecedor</caption>
            <thead>
              <tr>
                <th scope="col">Fornecedor</th>
                <th scope="col" className="num">Externos ativos</th>
                <th scope="col" className="num">% dos externos</th>
                <th scope="col" className="num">Rate média/dia</th>
                <th scope="col" className="num">Custo/mês</th>
                <th scope="col" className="num">Custo/ano</th>
                <th scope="col" className="num">Contratos a expirar (90d)</th>
                <th scope="col">Equipas</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((f) => (
                <tr key={f.supplier}>
                  <th scope="row">{f.supplier}</th>
                  <td className="num">{f.activeHeadcount}</td>
                  <td className="num">{formatBp(f.shareBp)}</td>
                  <td className="num">{formatCents(f.avgCostRateCentsPerDay)}</td>
                  <td className="num">{formatCents(f.monthlyCostCents)}</td>
                  <td className="num">{formatCents(f.annualCostCents)}</td>
                  <td className="num">
                    {f.contractsExpiring90d}
                    {f.contractsExpiring90d > 0 && <span className="flag"> ▲</span>}
                  </td>
                  <td>{f.teams.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Por equipa</h3>
      {teams.length === 0 ? (
        <p className="empty">Ainda não há equipas. Começa no separador Equipas.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Indicadores por equipa</caption>
            <thead>
              <tr>
                <th scope="col">Equipa</th>
                <th scope="col" className="num">Ativos / orçamentados</th>
                {hasMoney && <th scope="col" className="num">Budget</th>}
                {hasMoney && <th scope="col" className="num">Gasto</th>}
                {hasMoney && <th scope="col" className="num">% consumido</th>}
                <th scope="col" className="num">Internos (ativos / orç.)</th>
                <th scope="col" className="num">Externos (ativos / orç.)</th>
                <th scope="col" className="num">Rate média (externos)</th>
                <th scope="col" className="num">Custo externos/ano</th>
                <th scope="col" className="num">Contratos a expirar (90d)</th>
                <th scope="col" className="num">Projetos abertos</th>
                <th scope="col" className="num">Sem alocação</th>
                <th scope="col" className="num">Sobre-alocados</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.teamId}>
                  <th scope="row">{t.name}</th>
                  <td className="num">
                    {t.activeHeadcount} / {t.plannedHeadcount}
                    {t.headcountGap !== 0 && (
                      <span className="flag"> {t.headcountGap > 0 ? `${t.headcountGap} vaga(s)` : `+${-t.headcountGap} acima`}</span>
                    )}
                  </td>
                  {hasMoney && <td className="num">{formatCents(t.budgetCents)}</td>}
                  {hasMoney && <td className="num">{formatCents(t.actualCents)}</td>}
                  {hasMoney && (
                    <td className="num">
                      {formatBp(t.utilisationBp)}
                      {t.utilisationBp !== null && t.utilisationBp >= 9000 && <span className="flag"> ▲ alto</span>}
                    </td>
                  )}
                  <td className="num">
                    {t.internalHeadcount} / {t.plannedInternalHeadcount}
                    {t.internalHeadcount !== t.plannedInternalHeadcount && <span className="flag"> ▲</span>}
                  </td>
                  <td className="num">
                    {t.externalHeadcount} / {t.plannedExternalHeadcount}
                    {t.externalHeadcount !== t.plannedExternalHeadcount && <span className="flag"> ▲</span>}
                  </td>
                  <td className="num">{formatCents(t.avgCostRateCentsPerDay)}</td>
                  <td className="num">{t.externalHeadcount === 0 ? '—' : formatCents(t.externalAnnualCostCents)}</td>
                  <td className="num">{t.contractsExpiring90d}</td>
                  <td className="num">{t.openProjects}</td>
                  <td className="num">{t.unallocatedPeople}</td>
                  <td className="num">{t.overallocatedPeople}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>Projetos</h3>
      {projects.length === 0 ? (
        <p className="empty">Ainda não há projetos.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Projetos e progresso</caption>
            <thead>
              <tr>
                <th scope="col">Projeto</th>
                <th scope="col">Equipa</th>
                <th scope="col">Estado</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Fim previsto</th>
                <th scope="col" className="num">HC necessário</th>
                <th scope="col" className="num">Alocados</th>
                <th scope="col" className="num">Défice</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectId}>
                  <th scope="row">{p.name}</th>
                  <td>{p.teamName}</td>
                  <td>{PROJECT_STATUS_LABEL[p.status]}</td>
                  <td>{PRIORITY_LABEL[p.priority]}</td>
                  <td>{p.endDate ?? '—'}</td>
                  <td className="num">{p.plannedHeadcount === 0 ? '—' : p.plannedHeadcount}</td>
                  <td className="num">{p.allocatedPeople} · {(p.allocatedPct / 100).toFixed(1).replace('.', ',')}&nbsp;FTE</td>
                  <td className="num">
                    {p.gapPct === 0 ? '—' : `${(p.gapPct / 100).toFixed(1).replace('.', ',')} FTE`}
                    {p.gapPct > 0 && p.status !== 'done' && <span className="flag"> ▲</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Cobertura de competências</h3>
      {skills.coverage.length === 0 ? (
        <p className="empty">Sem requisitos definidos. Define-os em Competências.</p>
      ) : (
        <>
          <p className="muted-text">
            {skills.skillCount} competência(s), {skills.ratingCount} avaliação(ões), {formatBp(skills.validatedRatioBp)} validadas.
          </p>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Cobertura de competências por equipa</caption>
              <thead>
                <tr>
                  <th scope="col">Equipa</th>
                  <th scope="col">Competência</th>
                  <th scope="col" className="num">Nível exigido</th>
                  <th scope="col" className="num">Mínimo</th>
                  <th scope="col" className="num">Qualificados</th>
                  <th scope="col" className="num">Validados</th>
                  <th scope="col" className="num">Défice</th>
                  <th scope="col" className="num">Em formação</th>
                  <th scope="col" className="num">Défice após formação</th>
                </tr>
              </thead>
              <tbody>
                {skills.coverage.map((c) => (
                  <tr key={`${c.teamName}|${c.skill}`}>
                    <th scope="row">{c.teamName}</th>
                    <td>{c.skill}</td>
                    <td className="num">≥ {c.requiredLevel}</td>
                    <td className="num">{c.minPeople}</td>
                    <td className="num">{c.qualified}</td>
                    <td className="num">{c.qualifiedValidated}</td>
                    <td className="num">
                      {c.gap}
                      {c.gap > 0 && <span className="flag"> ▲ gap</span>}
                    </td>
                    <td className="num">{c.inTraining}</td>
                    <td className="num">
                      {c.gapAfterTraining}
                      {c.gapAfterTraining > 0 && <span className="flag"> ▲ sem plano</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Alocação por consultor</h3>
      {allocations.length === 0 ? (
        <p className="empty">Sem consultores ativos.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Total alocado por consultor</caption>
            <thead>
              <tr>
                <th scope="col">Consultor</th>
                <th scope="col">Equipa</th>
                <th scope="col" className="num">Projetos</th>
                <th scope="col" className="num">Total alocado</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.code}>
                  <th scope="row">{a.code}</th>
                  <td>{a.teamName}</td>
                  <td className="num">{a.projectCount}</td>
                  <td className="num">{a.allocatedPct}&nbsp;%</td>
                  <td>
                    {a.allocatedPct === 0 && <span className="flag">▲ sem alocação</span>}
                    {a.allocatedPct > 100 && <span className="flag">▲ sobre-alocado</span>}
                    {a.allocatedPct > 0 && a.allocatedPct <= 100 && 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
