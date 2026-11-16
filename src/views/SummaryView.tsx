import type { Summary } from '../../shared/types.ts';
import { formatBp, formatCents, formatHc } from '../money.ts';
import { BarChart, StatusBar } from '../components/Charts.tsx';
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

type Props = { summary: Summary };
const fte = (pct: number) => (pct / 100).toFixed(1).replace('.', ',');
const updated = (summary: Summary) => `Updated on ${summary.generatedAt.slice(0, 16).replace('T', ' ')} UTC`;

/** Dashboard 1: a unidade num relance. */
export function OverviewDashboard({ summary }: Props) {
  const { totals, teams, alerts, projects, training, objectives, evaluations } = summary;
  const openPositions = teams.reduce((a, t) => a + Math.max(0, Math.round(t.headcountGap * 100)), 0) / 100;
  const understaffed = projects.filter((p) => p.gapPct > 0 && p.status !== 'done').length;
  return (
    <section aria-labelledby="sum-title">
      <h2 id="sum-title">Unit overview</h2>
      <p className="muted-text">{updated(summary)}</p>

      <dl className="kpis">
        <div className="card"><dt>Headcount active / budgeted</dt><dd>{totals.activeHeadcount} / {formatHc(totals.plannedHeadcount)}</dd></div>
        <div className="card"><dt>Open positions</dt><dd>{formatHc(openPositions)}</dd></div>
        <div className="card"><dt>External cost / year</dt><dd>{formatCents(totals.externalAnnualCostCents)}</dd></div>
        <div className="card"><dt>Open projects</dt><dd>{totals.openProjects}</dd></div>
        <div className="card"><dt>Under-staffed projects</dt><dd>{understaffed}</dd></div>
        <div className="card"><dt>Open training</dt><dd>{training.openCount}</dd></div>
        <div className="card"><dt>Evaluations {evaluations.year} final / missing</dt><dd>{evaluations.finalCount} / {evaluations.missingCount}</dd></div>
        <div className="card"><dt>Alerts</dt><dd>{alerts.length}</dd></div>
      </dl>

      <div className="dash-grid">
        <BarChart
          title="Headcount against budget, by team"
          legend={[{ series: 'a', name: 'Internal' }, { series: 'b', name: 'External' }]}
          targetName="Budgeted"
          empty="No teams yet. Start on the Teams page."
          rows={teams.map((t) => ({
            label: t.name,
            segments: [
              { series: 'a' as const, value: t.internalHeadcount, name: 'Internal', text: formatHc(t.internalHeadcount) },
              { series: 'b' as const, value: t.externalHeadcount, name: 'External', text: formatHc(t.externalHeadcount) },
            ],
            target: t.plannedHeadcount,
            targetText: formatHc(t.plannedHeadcount),
            valueText: `${formatHc(t.activeHeadcount)} / ${formatHc(t.plannedHeadcount)}`,
          }))}
        />
        <StatusBar
          title={`Objectives ${objectives.year}`}
          empty="No objectives for this year yet."
          segments={[
            { status: 'good', name: 'Achieved', value: objectives.achieved },
            { status: 'info', name: 'On track', value: objectives.onTrack },
            { status: 'neutral', name: 'Not started', value: objectives.notStarted },
            { status: 'warning', name: 'At risk', value: objectives.atRisk },
            { status: 'critical', name: 'Missed', value: objectives.missed },
          ]}
        />
      </div>

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
    </section>
  );
}

/** Dashboard 2: headcount e custo de externos. */
export function HeadcountDashboard({ summary }: Props) {
  const { totals, teams, suppliers } = summary;
  const hasMoney = totals.budgetCents > 0; // budget em euros é opcional (muitas unidades só têm budget em headcount)
  return (
    <section aria-labelledby="hc-title">
      <h2 id="hc-title">Headcount &amp; cost</h2>
      <p className="muted-text">{updated(summary)}</p>

      <dl className="kpis">
        <div className="card"><dt>Internal active / budgeted</dt><dd>{totals.internalHeadcount} / {formatHc(totals.plannedInternalHeadcount)}</dd></div>
        <div className="card"><dt>External active / budgeted</dt><dd>{totals.externalHeadcount} / {formatHc(totals.plannedExternalHeadcount)}</dd></div>
        <div className="card"><dt>People split across teams</dt><dd>{totals.sharedPeople}</dd></div>
        <div className="card"><dt>External cost / month</dt><dd>{formatCents(totals.externalMonthlyCostCents)}</dd></div>
        <div className="card"><dt>External cost / year</dt><dd>{formatCents(totals.externalAnnualCostCents)}</dd></div>
        {hasMoney && <div className="card"><dt>Total budget</dt><dd>{formatCents(totals.budgetCents)}</dd></div>}
        {hasMoney && <div className="card"><dt>Actual spend</dt><dd>{formatCents(totals.actualCents)}</dd></div>}
      </dl>

      <div className="dash-grid">
        <BarChart
          title="External cost per year, by supplier"
          empty="No active externals with a supplier."
          rows={suppliers.map((f) => ({
            label: f.supplier,
            segments: [{ series: 'b' as const, value: f.annualCostCents, name: 'Cost/year', text: formatCents(f.annualCostCents) }],
            valueText: formatCents(f.annualCostCents),
          }))}
        />
        <BarChart
          title="External cost per year, by team"
          empty="No teams with active externals."
          rows={teams
            .filter((t) => t.externalAnnualCostCents > 0)
            .map((t) => ({
              label: t.name,
              segments: [{ series: 'b' as const, value: t.externalAnnualCostCents, name: 'Cost/year', text: formatCents(t.externalAnnualCostCents) }],
              valueText: formatCents(t.externalAnnualCostCents),
            }))}
        />
      </div>

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
                      {t.utilisationBp !== null && t.utilisationBp >= 9000 && <span className="flag"> ▲ high</span>}
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
    </section>
  );
}

/** Dashboard 3: projetos e alocações. */
export function StaffingDashboard({ summary }: Props) {
  const { totals, projects, allocations } = summary;
  const open = projects.filter((p) => p.status !== 'done');
  const unallocated = allocations.filter((a) => a.allocatedPct === 0).length;
  const over = allocations.filter((a) => a.allocatedPct > 100).length;
  return (
    <section aria-labelledby="st-title">
      <h2 id="st-title">Projects &amp; allocations</h2>
      <p className="muted-text">{updated(summary)}</p>

      <dl className="kpis">
        <div className="card"><dt>Open projects</dt><dd>{totals.openProjects}</dd></div>
        <div className="card"><dt>Under-staffed projects</dt><dd>{open.filter((p) => p.gapPct > 0).length}</dd></div>
        <div className="card"><dt>Unallocated consultants</dt><dd>{unallocated}</dd></div>
        <div className="card"><dt>Over-allocated consultants</dt><dd>{over}</dd></div>
      </dl>

      <div className="dash-grid">
        <BarChart
          title="Allocated FTE against HC needed, open projects"
          targetName="HC needed"
          empty="No open projects."
          rows={open.map((p) => ({
            label: p.name,
            segments: [{ series: 'a' as const, value: p.allocatedPct / 100, name: 'Allocated', text: `${fte(p.allocatedPct)} FTE` }],
            target: p.plannedHeadcount,
            targetText: String(p.plannedHeadcount),
            valueText: p.plannedHeadcount === 0 ? `${fte(p.allocatedPct)} FTE` : `${fte(p.allocatedPct)} / ${p.plannedHeadcount} FTE`,
          }))}
        />
        <StatusBar
          title="Active consultants by allocation"
          empty="No active consultants."
          segments={[
            { status: 'good', name: 'Allocated (up to 100 %)', value: allocations.length - unallocated - over },
            { status: 'warning', name: 'Unallocated', value: unallocated },
            { status: 'critical', name: 'Over-allocated', value: over },
          ]}
        />
      </div>

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

/** Dashboard 4: cobertura de competências e formação. */
export function CoverageDashboard({ summary }: Props) {
  const { skills, training } = summary;
  const gaps = skills.coverage.filter((c) => c.gap > 0).length;
  const uncovered = skills.coverage.filter((c) => c.gapAfterTraining > 0).length;
  return (
    <section aria-labelledby="cov-title">
      <h2 id="cov-title">Skills &amp; training</h2>
      <p className="muted-text">{updated(summary)}</p>

      <dl className="kpis">
        <div className="card"><dt>Skills in the catalogue</dt><dd>{skills.skillCount}</dd></div>
        <div className="card"><dt>Assessments validated</dt><dd>{formatBp(skills.validatedRatioBp)}</dd></div>
        <div className="card"><dt>Requirements with a gap</dt><dd>{gaps}</dd></div>
        <div className="card"><dt>Gaps with no training plan</dt><dd>{uncovered}</dd></div>
        <div className="card"><dt>Open training</dt><dd>{training.openCount}</dd></div>
        <div className="card"><dt>Training overdue</dt><dd>{training.overdueCount}</dd></div>
        {training.openCostCents > 0 && <div className="card"><dt>Open training cost</dt><dd>{formatCents(training.openCostCents)}</dd></div>}
      </dl>

      <BarChart
        title="Qualified people against the minimum, by requirement"
        legend={[{ series: 'a', name: 'Qualified' }, { series: 'b', name: 'In training' }]}
        targetName="Minimum"
        empty="No requirements set. Set them on the Skills page."
        rows={skills.coverage.map((c) => ({
          label: `${c.teamName} · ${c.skill}`,
          segments: [
            { series: 'a' as const, value: c.qualified, name: 'Qualified', text: String(c.qualified) },
            { series: 'b' as const, value: c.inTraining, name: 'In training', text: String(c.inTraining) },
          ],
          target: c.minPeople,
          targetText: String(c.minPeople),
          valueText: `${c.qualified} / ${c.minPeople}`,
        }))}
      />

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
    </section>
  );
}
