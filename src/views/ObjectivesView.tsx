import { useRef, useState, type FormEvent } from 'react';
import { teamLabel } from '../home.ts';
import { usePersistedState } from '../usePersistedState.ts';
import {
  OBJECTIVE_STATUSES,
  PERIOD_RE,
  type Consultant,
  type Objective,
  type ObjectiveStatus,
  type Team,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  teams: Team[];
  consultants: Consultant[];
  objectives: Objective[];
  periodFilter: string;
  onFilter: (period: string) => void;
  onChanged: () => Promise<void>;
};

export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  not_started: 'Not started',
  on_track: 'On track',
  at_risk: 'At risk',
  achieved: 'Achieved',
  missed: 'Missed',
};

type Form = { scope: string; title: string; period: string; status: ObjectiveStatus; progress: string; dueDate: string };
type Errors = Partial<Record<keyof Form, string>>;

export function ObjectivesView({ teams, consultants, objectives, periodFilter, onFilter, onChanged }: Props) {
  const year = businessDate().slice(0, 4);
  const empty: Form = { scope: '', title: '', period: year, status: 'not_started', progress: '0', dueDate: '' };
  const [form, setForm] = usePersistedState<Form>('gu:objetivos:form', empty);
  const [editingId, setEditingId] = usePersistedState<number | undefined>('gu:objetivos:editing', undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const today = businessDate();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const personById = new Map(consultants.map((c) => [c.id, c]));
  const periods = [...new Set([year, ...objectives.map((o) => o.period)])].sort().reverse();
  const shown = objectives.filter((o) => periodFilter === '' || o.period === periodFilter);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  function fail(msg: string) {
    setFormError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  }
  function reset() {
    setForm(empty);
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const progress = Number(form.progress);
    if (form.scope === '') next.scope = 'Choose the team or the consultant.';
    if (form.title.trim() === '' || form.title.trim().length > 140) next.title = 'Title is required (max. 140 characters).';
    if (!PERIOD_RE.test(form.period)) next.period = 'Use 2026, 2026-H1 or 2026-H2.';
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) next.progress = 'From 0 to 100.';
    else if (form.status === 'achieved' && progress !== 100) next.progress = 'An achieved objective is at 100 %.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Fix the highlighted fields.');

    const [kind, id] = form.scope.split(':');
    setSaving(true);
    try {
      await api.saveObjective(
        {
          consultantId: kind === 'c' ? Number(id) : null,
          teamId: kind === 't' ? Number(id) : null,
          title: form.title.trim(),
          period: form.period,
          status: form.status,
          progressPct: progress,
          dueDate: form.dueDate === '' ? null : form.dueDate,
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

  function edit(o: Objective) {
    setEditingId(o.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      scope: o.teamId !== null ? `t:${o.teamId}` : `c:${o.consultantId}`,
      title: o.title,
      period: o.period,
      status: o.status,
      progress: String(o.progressPct),
      dueDate: o.dueDate ?? '',
    });
  }

  if (teams.length === 0)
    return (
      <section aria-labelledby="ob-title">
        <h2 id="ob-title">Objectives</h2>
        <p className="empty">Create a team first (Teams page).</p>
      </section>
    );

  return (
    <section aria-labelledby="ob-title">
      <h2 id="ob-title">Objectives</h2>
      <p className="banner">
        Objectives stay in the local database only. Claude only receives aggregates by team
        (counts and average progress), never the text or the consultant.
      </p>

      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'New objective' : 'Edit objective'}</h3>
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>}
        <Field label="Scope" error={errors.scope}>
          {(c) => (
            <select {...c} name="scope" value={form.scope} onChange={(e) => set('scope', e.target.value)}>
              <option value="">Choose…</option>
              <optgroup label="Team">
                {teams.map((t) => <option key={`t${t.id}`} value={`t:${t.id}`}>{t.name}</option>)}
              </optgroup>
              <optgroup label="Consultant">
                {consultants.filter((p) => p.status === 'active').map((p) => (
                  <option key={`c${p.id}`} value={`c:${p.id}`}>{p.code} ({teamLabel(p, teamName)})</option>
                ))}
              </optgroup>
            </select>
          )}
        </Field>
        <Field label="Objective" error={errors.title}>
          {(c) => <input {...c} name="title" type="text" autoComplete="off" value={form.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="Period" hint="2026, 2026-H1 or 2026-H2" error={errors.period}>
          {(c) => <input {...c} name="period" type="text" autoComplete="off" value={form.period} onChange={(e) => set('period', e.target.value)} />}
        </Field>
        <Field label="Status">
          {(c) => (
            <select {...c} name="status" value={form.status} onChange={(e) => set('status', e.target.value as ObjectiveStatus)}>
              {OBJECTIVE_STATUSES.map((s) => <option key={s} value={s}>{OBJECTIVE_STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Progress (%)" error={errors.progress}>
          {(c) => <input {...c} name="progress" type="text" inputMode="numeric" autoComplete="off" value={form.progress} onChange={(e) => set('progress', e.target.value)} />}
        </Field>
        <Field label="Due date" hint="Optional">
          {(c) => <input {...c} name="dueDate" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editingId === undefined ? 'Add objective' : 'Save changes'}
          </button>
          {editingId !== undefined && <button type="button" onClick={reset}>Cancel editing</button>}
        </div>
      </form>

      <div className="field">
        <label htmlFor="ob-period">Period</label>
        <select id="ob-period" value={periodFilter} onChange={(e) => onFilter(e.target.value)}>
          <option value="">All</option>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="empty">No objectives for this filter.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Objectives</caption>
            <thead>
              <tr>
                <th scope="col">Scope</th>
                <th scope="col">Objective</th>
                <th scope="col">Period</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Progress</th>
                <th scope="col">Due date</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const overdue = o.dueDate !== null && o.dueDate < today && o.status !== 'achieved' && o.status !== 'missed';
                const scope = o.teamId !== null ? `Team ${teamName.get(o.teamId) ?? '—'}` : (personById.get(o.consultantId ?? 0)?.code ?? '—');
                return (
                  <tr key={o.id} className={o.status === 'achieved' || o.status === 'missed' ? 'muted' : undefined}>
                    <th scope="row">{scope}</th>
                    <td>{o.title}</td>
                    <td>{o.period}</td>
                    <td>{OBJECTIVE_STATUS_LABEL[o.status]}{o.status === 'at_risk' && <span className="flag"> ▲</span>}</td>
                    <td className="num">{o.progressPct} %</td>
                    <td>{o.dueDate ?? '—'}{overdue && <span className="flag"> ▲ overdue</span>}</td>
                    <td className="row-actions">
                      <button type="button" className="link" onClick={() => edit(o)} aria-label={`Edit ${o.title}`}>Edit</button>
                      <ConfirmDelete
                        label={o.title}
                        onConfirm={async () => {
                          try {
                            await api.deleteObjective(o.id);
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
    </section>
  );
}
