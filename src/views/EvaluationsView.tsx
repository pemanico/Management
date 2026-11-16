import { useRef, useState, type FormEvent } from 'react';
import { teamLabel } from '../home.ts';
import { usePersistedState } from '../usePersistedState.ts';
import {
  EVALUATION_STATUSES,
  PERIOD_RE,
  type Consultant,
  type Evaluation,
  type EvaluationStatus,
  type Objective,
  type Team,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';
import { OBJECTIVE_STATUS_LABEL } from './ObjectivesView.tsx';

type Props = {
  teams: Team[];
  consultants: Consultant[];
  objectives: Objective[];
  evaluations: Evaluation[];
  onChanged: () => Promise<void>;
};

const STATUS_LABEL: Record<EvaluationStatus, string> = { draft: 'Draft', final: 'Final' };
const RATING_LABEL: Record<number, string> = { 1: '1 – Below expectations', 2: '2 – Partially meets', 3: '3 – Meets', 4: '4 – Exceeds' };

type Form = { consultantId: string; period: string; rating: string; summary: string; status: EvaluationStatus; evaluatedAt: string };
type Errors = Partial<Record<keyof Form, string>>;

export function EvaluationsView({ teams, consultants, objectives, evaluations, onChanged }: Props) {
  const today = businessDate();
  const year = today.slice(0, 4);
  const empty: Form = { consultantId: '', period: year, rating: '3', summary: '', status: 'draft', evaluatedAt: today };
  const [form, setForm] = usePersistedState<Form>('gu:avaliacoes:form', empty);
  const [editingId, setEditingId] = usePersistedState<number | undefined>('gu:avaliacoes:editing', undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const personById = new Map(consultants.map((c) => [c.id, c]));
  const active = consultants.filter((c) => c.status === 'active');
  const evalOf = (cid: number, period: string) => evaluations.find((e) => e.consultantId === cid && e.period === period);
  const formCid = form.consultantId === '' ? null : Number(form.consultantId);
  const relatedObjectives =
    formCid === null || !PERIOD_RE.test(form.period)
      ? []
      : objectives.filter((o) => o.consultantId === formCid && (o.period === form.period || form.period.startsWith(o.period) || o.period.startsWith(form.period)));

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
  function startFor(cid: number) {
    const existing = evalOf(cid, year);
    if (existing) return edit(existing);
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
    setForm({ ...empty, consultantId: String(cid) });
    queueMicrotask(() => summaryRef.current?.focus());
  }
  function edit(ev: Evaluation) {
    setEditingId(ev.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      consultantId: String(ev.consultantId),
      period: ev.period,
      rating: String(ev.rating),
      summary: ev.summary,
      status: ev.status,
      evaluatedAt: ev.evaluatedAt,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (form.consultantId === '') next.consultantId = 'Choose the consultant.';
    if (!PERIOD_RE.test(form.period)) next.period = 'Use 2026, 2026-H1 or 2026-H2.';
    if (form.summary.length > 500) next.summary = 'Maximum 500 characters.';
    if (form.status === 'final' && form.summary.trim() === '') next.summary = 'A final evaluation needs a summary with the evidence.';
    if (form.evaluatedAt === '' || form.evaluatedAt > today) next.evaluatedAt = 'Invalid date (cannot be in the future).';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Fix the highlighted fields.');
    setSaving(true);
    try {
      await api.saveEvaluation(
        {
          consultantId: Number(form.consultantId),
          period: form.period,
          rating: Number(form.rating),
          summary: form.summary.trim(),
          status: form.status,
          evaluatedAt: form.evaluatedAt,
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

  if (consultants.length === 0)
    return (
      <section aria-labelledby="ev-title">
        <h2 id="ev-title">Evaluations</h2>
        <p className="empty">You need consultants first (Consultants page).</p>
      </section>
    );

  return (
    <section aria-labelledby="ev-title">
      <h2 id="ev-title">Evaluations</h2>
      <p className="banner">
        The rating and the summary are your decision and stay in the local database only. The app and Claude never
        suggest or calculate ratings; Claude only receives counts (final, draft, missing).
      </p>

      <h3>Ciclo {year}</h3>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Current-year evaluation status by active consultant</caption>
          <thead>
            <tr>
              <th scope="col">Consultant</th>
              <th scope="col">Team</th>
              <th scope="col" className="num">Objectives (achieved / total)</th>
              <th scope="col">Evaluation {year}</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {active.map((c) => {
              const mine = objectives.filter((o) => o.consultantId === c.id && o.period.startsWith(year));
              const ev = evalOf(c.id, year);
              return (
                <tr key={c.id}>
                  <th scope="row">{c.code}</th>
                  <td>{teamLabel(c, teamName)}</td>
                  <td className="num">{mine.filter((o) => o.status === 'achieved').length} / {mine.length}</td>
                  <td>{ev ? STATUS_LABEL[ev.status] : <span className="flag">▲ to do</span>}</td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => startFor(c.id)} aria-label={`${ev ? 'Open' : 'Start'} evaluation of ${c.code}`}>
                      {ev ? 'Open' : 'Start'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'New assessment' : 'Edit assessment'}</h3>
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>}
        <Field label="Consultant" error={errors.consultantId}>
          {(c) => (
            <select {...c} name="consultant" value={form.consultantId} disabled={editingId !== undefined} onChange={(e) => set('consultantId', e.target.value)}>
              <option value="">Choose…</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.code} ({teamLabel(p, teamName)})</option>)}
            </select>
          )}
        </Field>
        <Field label="Period" hint="2026, 2026-H1 or 2026-H2" error={errors.period}>
          {(c) => <input {...c} name="period" type="text" autoComplete="off" value={form.period} onChange={(e) => set('period', e.target.value)} />}
        </Field>
        {relatedObjectives.length > 0 && (
          <div className="field">
            <p><strong>This consultant's objectives in this period</strong></p>
            <ul>
              {relatedObjectives.map((o) => (
                <li key={o.id}>{o.title}: {OBJECTIVE_STATUS_LABEL[o.status]}, {o.progressPct} %</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Rating (your decision)">
          {(c) => (
            <select {...c} name="rating" value={form.rating} onChange={(e) => set('rating', e.target.value)}>
              {[1, 2, 3, 4].map((r) => <option key={r} value={r}>{RATING_LABEL[r]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Summary and evidence" hint="Required for a final evaluation. Max. 500 characters." error={errors.summary}>
          {(c) => <textarea {...c} ref={summaryRef} name="summary" rows={4} maxLength={600} value={form.summary} onChange={(e) => set('summary', e.target.value)} />}
        </Field>
        <Field label="Status">
          {(c) => (
            <select {...c} name="status" value={form.status} onChange={(e) => set('status', e.target.value as EvaluationStatus)}>
              {EVALUATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Assessment date" error={errors.evaluatedAt}>
          {(c) => <input {...c} name="evaluatedAt" type="date" max={today} value={form.evaluatedAt} onChange={(e) => set('evaluatedAt', e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editingId === undefined ? 'Add evaluation' : 'Save changes'}
          </button>
          {editingId !== undefined && <button type="button" onClick={reset}>Cancel editing</button>}
        </div>
      </form>

      {evaluations.length === 0 ? (
        <p className="empty">No evaluations yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Recorded evaluations</caption>
            <thead>
              <tr>
                <th scope="col">Consultant</th>
                <th scope="col">Period</th>
                <th scope="col">Rating</th>
                <th scope="col">Status</th>
                <th scope="col">Date</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((ev) => {
                const code = personById.get(ev.consultantId)?.code ?? '—';
                return (
                  <tr key={ev.id} className={ev.status === 'draft' ? 'muted' : undefined}>
                    <th scope="row">{code}</th>
                    <td>{ev.period}</td>
                    <td>{RATING_LABEL[ev.rating]}</td>
                    <td>{STATUS_LABEL[ev.status]}</td>
                    <td>{ev.evaluatedAt}</td>
                    <td className="row-actions">
                      <button type="button" className="link" onClick={() => edit(ev)} aria-label={`Edit evaluation of ${code} ${ev.period}`}>Edit</button>
                      <ConfirmDelete
                        label={`evaluation of ${code} ${ev.period}`}
                        onConfirm={async () => {
                          try {
                            await api.deleteEvaluation(ev.id);
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
