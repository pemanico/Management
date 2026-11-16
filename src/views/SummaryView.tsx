import type { Summary } from '../../shared/types.ts';
import { formatBp, formatCents, formatHc } from '../money.ts';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from './ProjectsView.tsx';

const ALERT_LABEL: Record<Summary['alerts'][number]['type'], string> = {
  budget_over_90: 'Budget',
  vacancies: 'Open positions',
  over_headcount: 'Headcount',
  contract_expiring: 'Contract',
  missing_cost_rate: 'External without rate',
  missing_supplier: 'External without supplier',
  stale_data: 'Stale data',
  project_at_risk: 'Project at risk',
  project_overdue: 'Project overdue',
  projects_exceed_budget: 'Project budget',
  project_understaffed: 'Project under-staffed',
  consultant_overallocated: 'Over-allocation',
  consultant_unallocated: 'Unallocated',
  skill_gap: 'Skill gap',
  skill_unvalidated: 'Skill not validated',
  skill_assessment_old: 'Old assessments',
  training_overdue: 'Training overdue',
  training_gap_uncovered: 'Gap with no training plan',
  objective_at_risk: 'Objectives at risk',
  objective_overdue: 'Objectives overdue',
  consultant_without_objectives: 'No objectives',
  evaluation_pending: 'Missing evaluations',
};

export function SummaryView({ summary }: { summary: Summary }) {
  const { totals, teams, alerts, projects, allocations, skills, training, objectives, evaluations, suppliers } = summary;
  const hasMoney = totals.budgetCents > 0; // budget em euros é opcional (muitas unidades só têm budget em headcount)
  return (
    <section aria-labelledby="sum-title">
      <h2 id="sum-title">Unit overview</h2>
      <p className="muted-text">Updated on {summary.generatedAt.slice(0, 16).replace('T', ' ')} UTC</p>

      <dl className="kpis">
        {hasMoney && <div className="card"><dt>Total budget</dt><dd>{formatCents(totals.budgetCents)}</dd></div>}
        {hasMoney && <div className="card"><dt>Actual spend</dt><dd>{formatCents(totals.actualCents)}</dd></div>}
        <div className="card"><dt>Headcount active / budgeted</dt><dd>{totals.activeHeadcount} / {formatHc(totals.plannedHeadcount)}</dd></div>
        <div className="card"><dt>Internal active / budgeted</dt><dd>{totals.internalHeadcount} / {formatHc(totals.plannedInternalHeadcount)}</dd></div>
        <div className="card"><dt>External active / budgeted</dt><dd>{totals.externalHeadcount} / {formatHc(totals.plannedExternalHeadcount)}</dd></div>
        <div className="card"><dt>People split across teams</dt><dd>{totals.sharedPeople}</dd></div>
        <div className="card"><dt>External cost / month</dt><dd>{formatCents(totals.externalMonthlyCostCents)}</dd></div>
        <div className="card"><dt>External cost / year</dt><dd>{formatCents(totals.externalAnnualCostCents)}</dd></div>
        <div className="card"><dt>Open training</dt><dd>{training.openCount}</dd></div>
        <div className="card"><dt>Objectives {objectives.year} achieved / total</dt><dd>{objectives.achieved} / {objectives.total}</dd></div>
        <div className="card"><dt>Evaluations {evaluations.year} final / missing</dt><dd>{evaluations.finalCount} / {evaluations.missingCount}</dd></div>
        <div className="card"><dt>Open projects</dt><dd>{totals.openProjects}</dd></div>
        <div className="card"><dt>Alerts</dt><dd>{alerts.length}</dd></div>
      </dl>

      <h3>Alerts</h3>
      {alerts.length === 0 ? (
        <p className="empty">No alerts. A good sign, or data is missing.</p>
      ) : (
        <ul className="alerts">
          {alerts.map((a) => (
            <li key={`${a.type}|${a.scope}|${a.message}`}>
              <strong>{ALERT_LABEL[a.type]}</strong> · {a.scope}: {a.message}
            </li>
          ))}
        </ul>
      )}

      <h3>External suppliers</h3>
      <p className="muted-text">Costs = daily rate × 20 days × 11 months, at 100 % (allocation % is not considered).</p>
      {suppliers.length === 0 ? (
        <p className="empty">No active externals with a supplier.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Active externals by supplier</caption>
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col" className="num">Active externals</th>
                <th scope="col" className="num">% of externals</th>
                <th scope="col" className="num">Average rate/day</th>
                <th scope="col" className="num">Cost/month</th>
                <th scope="col" className="num">Cost/year</th>
                <th scope="col" className="num">Contracts expiring (90d)</th>
                <th scope="col">Teams</th>
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

      <h3>By team</h3>
      <p className="muted-text">Headcount and cost count by fraction: a person split 50/50 is 0,5 in each team. Skills, objectives and allocation count only in the main team.</p>
      {teams.length === 0 ? (
        <p className="empty">No teams yet. Start on the Teams page.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Indicators by team</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col" className="num">Active / budgeted</th>
                {hasMoney && <th scope="col" className="num">Budget</th>}
                {hasMoney && <th scope="col" className="num">Spend</th>}
                {hasMoney && <th scope="col" className="num">% used</th>}
                <th scope="col" className="num">Internal (active / budg.)</th>
                <th scope="col" className="num">External (active / budg.)</th>
                <th scope="col" className="num">Average rate (externals)</th>
                <th scope="col" className="num">External cost/year</th>
                <th scope="col" className="num">Contracts expiring (90d)</th>
                <th scope="col" className="num">Open projects</th>
                <th scope="col" className="num">Unallocated</th>
                <th scope="col" className="num">Over-allocated</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.teamId}>
                  <th scope="row">{t.name}</th>
                  <td className="num">
                    {formatHc(t.activeHeadcount)} / {formatHc(t.plannedHeadcount)}
                    {t.headcountGap !== 0 && (
                      <span className="flag"> {t.headcountGap > 0 ? `${formatHc(t.headcountGap)} open` : `+${formatHc(-t.headcountGap)} over`}</span>
                    )}
                    {t.sharedIn > 0 && <span className="muted-text"> ({t.sharedIn} shared)</span>}
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
                    {formatHc(t.internalHeadcount)} / {formatHc(t.plannedInternalHeadcount)}
                    {t.internalHeadcount !== t.plannedInternalHeadcount && <span className="flag"> ▲</span>}
                  </td>
                  <td className="num">
                    {formatHc(t.externalHeadcount)} / {formatHc(t.plannedExternalHeadcount)}
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
      <h3>Projects</h3>
      {projects.length === 0 ? (
        <p className="empty">No projects yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Projects and progress</caption>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Team</th>
                <th scope="col">Status</th>
                <th scope="col">Priority</th>
                <th scope="col">Planned end</th>
                <th scope="col" className="num">HC needed</th>
                <th scope="col" className="num">Allocated</th>
                <th scope="col" className="num">Shortfall</th>
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

      <h3>Skill coverage</h3>
      {skills.coverage.length === 0 ? (
        <p className="empty">No requirements set. Set them on the Skills page.</p>
      ) : (
        <>
          <p className="muted-text">
            {skills.skillCount} skill(s), {skills.ratingCount} assessment(s), {formatBp(skills.validatedRatioBp)} validated.
          </p>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Skill coverage by team</caption>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Skill</th>
                  <th scope="col" className="num">Required level</th>
                  <th scope="col" className="num">Minimum</th>
                  <th scope="col" className="num">Qualified</th>
                  <th scope="col" className="num">Validated</th>
                  <th scope="col" className="num">Shortfall</th>
                  <th scope="col" className="num">In training</th>
                  <th scope="col" className="num">Shortfall after training</th>
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
                      {c.gapAfterTraining > 0 && <span className="flag"> ▲ no plan</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Allocation by consultant</h3>
      {allocations.length === 0 ? (
        <p className="empty">No active consultants.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Total allocated per consultant</caption>
            <thead>
              <tr>
                <th scope="col">Consultant</th>
                <th scope="col">Team</th>
                <th scope="col" className="num">Projects</th>
                <th scope="col" className="num">Total allocated</th>
                <th scope="col">Status</th>
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
                    {a.allocatedPct === 0 && <span className="flag">▲ unallocated</span>}
                    {a.allocatedPct > 100 && <span className="flag">▲ over-allocated</span>}
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
