import { useRef, useState, type FormEvent } from 'react';
import { usePersistedState } from '../usePersistedState.ts';
import { PRIORITIES, PROJECT_STATUSES, type Allocation, type Priority, type Project, type ProjectStatus, type Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { centsToInput, formatOptionalCents, parseOptionalEuroToCents } from '../money.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = { teams: Team[]; projects: Project[]; allocations: Allocation[]; onChanged: () => Promise<void> };
type Form = {
  name: string;
  description: string;
  teamId: string;
  status: ProjectStatus;
  priority: Priority;
  plannedHeadcount: string;
  startDate: string;
  endDate: string;
  budget: string;
};
type Errors = Partial<Record<keyof Form, string>>;

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  at_risk: 'At risk',
  on_hold: 'On hold',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

const EMPTY: Form = {
  name: '',
  description: '',
  teamId: '',
  status: 'planned',
  priority: 'medium',
  plannedHeadcount: '0',
  startDate: '',
  endDate: '',
  budget: '',
};

export function ProjectsView({ teams, projects, allocations, onChanged }: Props) {
  const [form, setForm] = usePersistedState<Form>('gu:projetos:form', EMPTY);
  const [editingId, setEditingId] = usePersistedState<number | undefined>('gu:projetos:editing', undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const allocated = new Map<number, { people: number; pct: number }>();
  for (const a of allocations) {
    const cur = allocated.get(a.projectId) ?? { people: 0, pct: 0 };
    allocated.set(a.projectId, { people: cur.people + 1, pct: cur.pct + a.allocationPct });
  }

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setForm(EMPTY);
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
  }

  function fail(msg: string) {
    setFormError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const budgetCents = parseOptionalEuroToCents(form.budget);
    if (form.name.trim() === '') next.name = 'Enter the project name.';
    if (form.teamId === '') next.teamId = 'Choose a team.';
    const planned = Number(form.plannedHeadcount);
    if (!Number.isInteger(planned) || planned < 0) next.plannedHeadcount = 'Enter a whole number ≥ 0.';
    if (budgetCents === null) next.budget = 'Invalid format. Example: 25.000,00';
    if (form.description.trim().length > 500) next.description = 'Maximum 500 characters.';
    if (form.startDate !== '' && form.endDate !== '' && form.endDate < form.startDate)
      next.endDate = 'The end date cannot be before the start date.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0 || budgetCents === null) return fail('Fix the highlighted fields.');

    setSaving(true);
    try {
      await api.saveProject(
        {
          name: form.name.trim(),
          description: form.description.trim() === '' ? null : form.description.trim(),
          teamId: Number(form.teamId),
          status: form.status,
          priority: form.priority,
          plannedHeadcount: planned,
          startDate: form.startDate === '' ? null : form.startDate,
          endDate: form.endDate === '' ? null : form.endDate,
          budgetCents,
        },
        editingId,
      );
      await onChanged();
      reset();
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function edit(p: Project) {
    setEditingId(p.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      name: p.name,
      description: p.description ?? '',
      teamId: String(p.teamId),
      status: p.status,
      priority: p.priority,
      plannedHeadcount: String(p.plannedHeadcount),
      startDate: p.startDate ?? '',
      endDate: p.endDate ?? '',
      budget: p.budgetCents === 0 ? '' : centsToInput(p.budgetCents),
    });
  }

  return (
    <section aria-labelledby="proj-title">
      <h2 id="proj-title">Projects</h2>
      {teams.length === 0 ? (
        <p className="empty">Create a team on the Teams page first.</p>
      ) : (
        <form onSubmit={submit} noValidate className="card form-grid">
          <h3>{editingId === undefined ? 'New project' : 'Edit project'}</h3>
          {formError && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>
          )}
          <Field label="Name" error={errors.name}>
            {(c) => <input {...c} name="name" type="text" autoComplete="off" value={form.name} onChange={set('name')} />}
          </Field>
          <Field label="Team" error={errors.teamId}>
            {(c) => (
              <select {...c} name="team" value={form.teamId} onChange={set('teamId')}>
                <option value="">Choose…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Status">
            {(c) => (
              <select {...c} name="status" value={form.status} onChange={set('status')}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Priority">
            {(c) => (
              <select {...c} name="priority" value={form.priority} onChange={set('priority')}>
                {PRIORITIES.map((s) => (
                  <option key={s} value={s}>{PRIORITY_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="HC the project needs" hint="Number of full-time people. 0 = not set" error={errors.plannedHeadcount}>
            {(c) => <input {...c} name="plannedHeadcount" type="number" inputMode="numeric" min={0} step={1} value={form.plannedHeadcount} onChange={set('plannedHeadcount')} />}
          </Field>
          <Field label="Project budget (EUR)" hint="Optional" error={errors.budget}>
            {(c) => <input {...c} name="budget" type="text" inputMode="decimal" autoComplete="off" value={form.budget} onChange={set('budget')} />}
          </Field>
          <Field label="Start" hint="Optional">
            {(c) => <input {...c} name="startDate" type="date" value={form.startDate} onChange={set('startDate')} />}
          </Field>
          <Field label="Planned end" hint="Optional" error={errors.endDate}>
            {(c) => <input {...c} name="endDate" type="date" value={form.endDate} onChange={set('endDate')} />}
          </Field>
          <Field label="Description" hint="Optional. What the project is for, in a few lines (max. 500 characters)." error={errors.description} wide>
            {(c) => <textarea {...c} name="description" className="prose" rows={3} maxLength={500} value={form.description} onChange={set('description')} />}
          </Field>
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId === undefined ? 'Add project' : 'Save changes'}
            </button>
            {editingId !== undefined && <button type="button" onClick={reset}>Cancel editing</button>}
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        teams.length > 0 && <p className="empty">No projects yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Projects in the unit</caption>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Team</th>
                <th scope="col">Status</th>
                <th scope="col">Priority</th>
                <th scope="col">Planned end</th>
                <th scope="col" className="num">HC needed</th>
                <th scope="col" className="num">Allocated</th>
                <th scope="col" className="num">Budget (EUR)</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={p.status === 'done' ? 'muted' : undefined}>
                  <th scope="row">
                    {p.name}
                    {p.description && <span className="cell-note">{p.description}</span>}
                  </th>
                  <td>{teamName.get(p.teamId) ?? '—'}</td>
                  <td>
                    {PROJECT_STATUS_LABEL[p.status]}
                    {p.status === 'at_risk' && <span className="flag"> ▲</span>}
                  </td>
                  <td>{PRIORITY_LABEL[p.priority]}</td>
                  <td>{p.endDate ?? '—'}</td>
                  <td className="num">{p.plannedHeadcount === 0 ? '—' : p.plannedHeadcount}</td>
                  <td className="num">
                    <a href={`#/allocations?project=${p.id}`}>
                      {allocated.get(p.id)?.people ?? 0} · {((allocated.get(p.id)?.pct ?? 0) / 100).toFixed(1).replace('.', ',')} FTE
                    </a>
                  </td>
                  <td className="num">{formatOptionalCents(p.budgetCents)}</td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(p)} aria-label={`Edit ${p.name}`}>
                      Edit
                    </button>
                    <ConfirmDelete
                      label={`${p.name} and its ${allocated.get(p.id)?.people ?? 0} allocation(s)`}
                      onConfirm={async () => {
                        try {
                          await api.deleteProject(p.id);
                          await onChanged();
                        } catch (err) {
                          fail(err instanceof ApiError ? err.message : 'Something went wrong.');
                        }
                      }}
                    />
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
