import { useRef, useState, type FormEvent } from 'react';
import { teamLabel } from '../home.ts';
import type { Allocation, Consultant, Project, Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  teams: Team[];
  projects: Project[];
  consultants: Consultant[];
  allocations: Allocation[];
  projectFilter: string; // '' = todos; vem da URL
  onFilter: (projectId: string) => void;
  onChanged: () => Promise<void>;
};

const fte = (pct: number) => (pct / 100).toFixed(1).replace('.', ',');

export function AllocationsView({ teams, projects, consultants, allocations, projectFilter, onFilter, onChanged }: Props) {
  const [projectId, setProjectId] = useState(projectFilter);
  const [consultantId, setConsultantId] = useState('');
  const [pctText, setPctText] = useState('100');
  const [errors, setErrors] = useState<{ projectId?: string; consultantId?: string; pct?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const personById = new Map(consultants.map((c) => [c.id, c]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const active = consultants.filter((c) => c.status === 'active');
  const openProjects = projects.filter((p) => p.status !== 'done');
  const visible = projectFilter === '' ? allocations : allocations.filter((a) => String(a.projectId) === projectFilter);

  // Total por consultor só em projetos em aberto (igual ao resumo).
  const totals = new Map<number, { pct: number; projects: number }>();
  for (const a of allocations) {
    if (projectById.get(a.projectId)?.status === 'done') continue;
    const cur = totals.get(a.consultantId) ?? { pct: 0, projects: 0 };
    totals.set(a.consultantId, { pct: cur.pct + a.allocationPct, projects: cur.projects + 1 });
  }

  function fail(msg: string) {
    setFormError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const pct = Number(pctText);
    if (projectId === '') next.projectId = 'Choose the project.';
    if (consultantId === '') next.consultantId = 'Choose the consultant.';
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) next.pct = 'Enter a whole number from 1 to 100.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Fix the highlighted fields.');
    setSaving(true);
    try {
      await api.saveAllocation({ projectId: Number(projectId), consultantId: Number(consultantId), allocationPct: pct });
      await onChanged();
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (projects.length === 0 || consultants.length === 0)
    return (
      <section aria-labelledby="al-title">
        <h2 id="al-title">Allocations</h2>
        <p className="empty">You need consultants (Consultants page) and projects (Projects page) first.</p>
      </section>
    );

  return (
    <section aria-labelledby="al-title">
      <h2 id="al-title">Allocations</h2>
      <p className="muted-text">
        Who is on which project and for what % of their time. 100 % = 1 FTE. Saving the same project + consultant pair updates the allocation.
      </p>

      <form onSubmit={submit} noValidate className="card form-grid">
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>}
        <Field label="Project" error={errors.projectId}>
          {(c) => (
            <select {...c} name="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Choose…</option>
              {openProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({teamLabel(p, teamName)})</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Consultant" error={errors.consultantId}>
          {(c) => (
            <select {...c} name="consultant" value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
              <option value="">Choose…</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>{p.code} ({teamLabel(p, teamName)})</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Allocation (%)" hint="1–100" error={errors.pct}>
          {(c) => <input {...c} name="pct" type="number" inputMode="numeric" min={1} max={100} step={1} value={pctText} onChange={(e) => setPctText(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save allocation'}</button>
        </div>
      </form>

      <div className="card">
        <Field label="Filter by project">
          {(c) => (
            <select {...c} name="filter" value={projectFilter} onChange={(e) => onFilter(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {visible.length === 0 ? (
        <p className="empty">No allocations yet{projectFilter === '' ? '' : ' on this project'}.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Allocations by project</caption>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Consultant</th>
                <th scope="col">Consultant's team</th>
                <th scope="col" className="num">Allocation</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const p = projectById.get(a.projectId);
                const c = personById.get(a.consultantId);
                return (
                  <tr key={`${a.projectId}-${a.consultantId}`} className={p?.status === 'done' ? 'muted' : undefined}>
                    <th scope="row">{p?.name ?? '—'}</th>
                    <td>{c?.code ?? '—'}</td>
                    <td>{c ? (teamLabel(c, teamName)) : '—'}</td>
                    <td className="num">{a.allocationPct}&nbsp;%</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link"
                        aria-label={`Edit allocation of ${c?.code ?? ''} to ${p?.name ?? ''}`}
                        onClick={() => {
                          setProjectId(String(a.projectId));
                          setConsultantId(String(a.consultantId));
                          setPctText(String(a.allocationPct));
                          setErrors({});
                          setFormError(undefined);
                        }}
                      >
                        Edit
                      </button>
                      <ConfirmDelete
                        label={`allocation of ${c?.code ?? ''} to ${p?.name ?? ''}`}
                        onConfirm={async () => {
                          try {
                            await api.deleteAllocation(a.projectId, a.consultantId);
                            await onChanged();
                          } catch (err) {
                            fail(err instanceof ApiError ? err.message : 'Something went wrong.');
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3>By active consultant</h3>
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
            {active.map((c) => {
              const t = totals.get(c.id) ?? { pct: 0, projects: 0 };
              return (
                <tr key={c.id}>
                  <th scope="row">{c.code}</th>
                  <td>{teamLabel(c, teamName)}</td>
                  <td className="num">{t.projects}</td>
                  <td className="num">{t.pct}&nbsp;% ({fte(t.pct)}&nbsp;FTE)</td>
                  <td>
                    {t.pct === 0 && <span className="flag">▲ unallocated</span>}
                    {t.pct > 100 && <span className="flag">▲ over-allocated</span>}
                    {t.pct > 0 && t.pct <= 100 && 'OK'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
