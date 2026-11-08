import type { Summary } from '../../shared/types.ts';
import { formatBp, formatCents } from '../money.ts';
import { PROJECT_STATUS_LABEL } from './ProjectsView.tsx';

const ALERT_LABEL: Record<Summary['alerts'][number]['type'], string> = {
  budget_over_90: 'Budget',
  vacancies: 'Vagas',
  over_headcount: 'Headcount',
  contract_expiring: 'Contrato',
  missing_bill_rate: 'Rate em falta',
  stale_data: 'Dados antigos',
  project_at_risk: 'Projeto em risco',
  project_overdue: 'Projeto em atraso',
  projects_exceed_budget: 'Budget de projetos',
  tasks_overdue: 'Tarefas em atraso',
  tasks_blocked: 'Tarefas bloqueadas',
  tasks_unassigned: 'Sem responsável',
  skill_gap: 'Gap de competência',
  skill_unvalidated: 'Competência não validada',
  skill_assessment_old: 'Avaliações antigas',
};

export function SummaryView({ summary }: { summary: Summary }) {
  const { totals, teams, alerts, projects, workload, skills } = summary;
  const hasMoney = totals.budgetCents > 0; // budget em euros é opcional (muitas unidades só têm budget em headcount)
  return (
    <section aria-labelledby="sum-title">
      <h2 id="sum-title">Resumo da unidade</h2>
      <p className="muted-text">Atualizado a {summary.generatedAt.slice(0, 16).replace('T', ' ')} UTC</p>

      <dl className="kpis">
        {hasMoney && <div className="card"><dt>Budget total</dt><dd>{formatCents(totals.budgetCents)}</dd></div>}
        {hasMoney && <div className="card"><dt>Gasto real</dt><dd>{formatCents(totals.actualCents)}</dd></div>}
        <div className="card"><dt>Headcount ativo / orçamentado</dt><dd>{totals.activeHeadcount} / {totals.plannedHeadcount}</dd></div>
        <div className="card"><dt>Projetos / tarefas em aberto</dt><dd>{totals.openProjects} / {totals.openTasks}</dd></div>
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
                <th scope="col" className="num">Rate paga média</th>
                <th scope="col" className="num">Rate faturada média</th>
                <th scope="col" className="num">Margem</th>
                <th scope="col" className="num">Contratos a expirar (90d)</th>
                <th scope="col" className="num">Tarefas abertas</th>
                <th scope="col" className="num">Em atraso</th>
                <th scope="col" className="num">Bloqueadas</th>
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
                  <td className="num">{formatCents(t.avgCostRateCentsPerDay)}</td>
                  <td className="num">{formatCents(t.avgBillRateCentsPerDay)}</td>
                  <td className="num">{formatBp(t.marginBp)}</td>
                  <td className="num">{t.contractsExpiring90d}</td>
                  <td className="num">{t.openTasks}</td>
                  <td className="num">{t.overdueTasks}</td>
                  <td className="num">{t.blockedTasks}</td>
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
                <th scope="col">Fim previsto</th>
                <th scope="col" className="num">Progresso</th>
                <th scope="col" className="num">Tarefas abertas</th>
                <th scope="col" className="num">Em atraso</th>
                <th scope="col" className="num">Bloqueadas</th>
                <th scope="col" className="num">Horas em aberto</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectId}>
                  <th scope="row">{p.name}</th>
                  <td>{p.teamName}</td>
                  <td>{PROJECT_STATUS_LABEL[p.status]}</td>
                  <td>{p.endDate ?? '—'}</td>
                  <td className="num">{formatBp(p.progressBp)}</td>
                  <td className="num">{p.openTasks}</td>
                  <td className="num">{p.overdueTasks}</td>
                  <td className="num">{p.blockedTasks}</td>
                  <td className="num">{p.openEstimateHours}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Carga por consultor</h3>
      {workload.length === 0 ? (
        <p className="empty">Sem consultores ativos.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Carga de trabalho por consultor</caption>
            <thead>
              <tr>
                <th scope="col">Consultor</th>
                <th scope="col">Equipa</th>
                <th scope="col" className="num">Tarefas abertas</th>
                <th scope="col" className="num">Em atraso</th>
                <th scope="col" className="num">Horas em aberto</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w) => (
                <tr key={w.code}>
                  <th scope="row">{w.code}</th>
                  <td>{w.teamName}</td>
                  <td className="num">{w.openTasks}</td>
                  <td className="num">{w.overdueTasks}</td>
                  <td className="num">{w.openEstimateHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
