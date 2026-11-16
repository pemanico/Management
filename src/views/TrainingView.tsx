import { useRef, useState, type FormEvent } from 'react';
import { teamLabel } from '../home.ts';
import { usePersistedState } from '../usePersistedState.ts';
import {
  SKILL_LEVEL_LABEL,
  TRAINING_KINDS,
  TRAINING_STATUSES,
  type Consultant,
  type Rating,
  type Requirement,
  type Skill,
  type SkillCoverage,
  type Team,
  type Training,
  type TrainingKind,
  type TrainingStatus,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { centsToInput, formatOptionalCents, parseOptionalEuroToCents } from '../money.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  teams: Team[];
  consultants: Consultant[];
  skills: Skill[];
  ratings: Rating[];
  requirements: Requirement[];
  trainings: Training[];
  coverage: SkillCoverage[];
  onChanged: () => Promise<void>;
};

type Form = {
  consultantId: string;
  skillId: string;
  targetLevel: string;
  kind: TrainingKind;
  title: string;
  status: TrainingStatus;
  dueDate: string;
  cost: string;
};
type Errors = Partial<Record<keyof Form, string>>;

const KIND_LABEL: Record<TrainingKind, string> = {
  course: 'Course',
  certification: 'Certification',
  mentoring: 'Mentoring',
  on_the_job: 'On-the-job',
};
const STATUS_LABEL: Record<TrainingStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};
const isOpen = (t: Training) => t.status === 'planned' || t.status === 'in_progress';

const EMPTY: Form = {
  consultantId: '',
  skillId: '',
  targetLevel: '3',
  kind: 'course',
  title: '',
  status: 'planned',
  dueDate: '',
  cost: '',
};

export function TrainingView({ teams, consultants, skills, ratings, requirements, trainings, coverage, onChanged }: Props) {
  const [form, setForm] = usePersistedState<Form>('gu:formacao:form', EMPTY);
  const [editingId, setEditingId] = usePersistedState<number | undefined>('gu:formacao:editing', undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const today = businessDate();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const skillName = new Map(skills.map((k) => [k.id, k.name]));
  const personById = new Map(consultants.map((c) => [c.id, c]));
  const active = consultants.filter((c) => c.status === 'active');
  const levelOf = (consultantId: number, skillId: number) =>
    ratings.find((r) => r.consultantId === consultantId && r.skillId === skillId)?.level ?? null;
  const covByKey = new Map(coverage.map((c) => [`${c.teamName}|${c.skill}`, c]));

  // Gaps por fechar: requisitos com défice, e quem ainda pode ser formado.
  const gaps = requirements
    .map((rq) => {
      const t = teamName.get(rq.teamId) ?? '—';
      const k = skillName.get(rq.skillId) ?? '—';
      const cov = covByKey.get(`${t}|${k}`);
      if (cov === undefined || cov.gap === 0) return null;
      const candidates = active
        .filter((c) => c.teamId === rq.teamId)
        .filter((c) => (levelOf(c.id, rq.skillId) ?? -1) < rq.requiredLevel)
        .filter(
          (c) =>
            !trainings.some(
              (tr) => isOpen(tr) && tr.consultantId === c.id && tr.skillId === rq.skillId && tr.targetLevel >= rq.requiredLevel,
            ),
        );
      return { rq, team: t, skill: k, cov, candidates };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function fail(msg: string) {
    setFormError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  }

  function reset() {
    setForm(EMPTY);
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
  }

  function plan(consultantId: number, skillId: number, level: number) {
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
    setForm({
      ...EMPTY,
      consultantId: String(consultantId),
      skillId: String(skillId),
      targetLevel: String(level),
      title: `Training in ${skillName.get(skillId) ?? ''}`.trim(),
    });
    queueMicrotask(() => titleRef.current?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const costCents = parseOptionalEuroToCents(form.cost);
    const target = Number(form.targetLevel);
    const current = form.consultantId && form.skillId ? levelOf(Number(form.consultantId), Number(form.skillId)) : null;
    if (form.consultantId === '') next.consultantId = 'Choose the consultant.';
    if (form.skillId === '') next.skillId = 'Choose the skill.';
    if (form.title.trim() === '') next.title = 'Enter the training title.';
    if (costCents === null) next.cost = 'Invalid format. Example: 450,00';
    if (current !== null && target <= current)
      next.targetLevel = `The consultant is already at level ${current}; the target level must be higher.`;
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0 || costCents === null) return fail('Fix the highlighted fields.');

    setSaving(true);
    try {
      await api.saveTraining(
        {
          consultantId: Number(form.consultantId),
          skillId: Number(form.skillId),
          targetLevel: target,
          kind: form.kind,
          title: form.title.trim(),
          status: form.status,
          dueDate: form.dueDate === '' ? null : form.dueDate,
          costCents,
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

  function edit(t: Training) {
    setEditingId(t.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      consultantId: String(t.consultantId),
      skillId: String(t.skillId),
      targetLevel: String(t.targetLevel),
      kind: t.kind,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate ?? '',
      cost: t.costCents === 0 ? '' : centsToInput(t.costCents),
    });
  }

  if (consultants.length === 0 || skills.length === 0)
    return (
      <section aria-labelledby="tr-title">
        <h2 id="tr-title">Training</h2>
        <p className="empty">You need consultants (Consultants page) and skills (Skills page) first.</p>
      </section>
    );

  return (
    <section aria-labelledby="tr-title">
      <h2 id="tr-title">Training</h2>

      <h3>Open skill gaps</h3>
      {gaps.length === 0 ? (
        <p className="empty">No gaps. Set team requirements on the Skills page so the app can show where training is needed.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Skill gaps and training candidates</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Skill</th>
                <th scope="col" className="num">Shortfall</th>
                <th scope="col" className="num">In training</th>
                <th scope="col" className="num">Shortfall after training</th>
                <th scope="col">Candidates (no open training that reaches the level)</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={`${g.rq.teamId}-${g.rq.skillId}`}>
                  <th scope="row">{g.team}</th>
                  <td>{g.skill} ≥ {g.rq.requiredLevel}</td>
                  <td className="num">{g.cov.gap}</td>
                  <td className="num">{g.cov.inTraining}</td>
                  <td className="num">
                    {g.cov.gapAfterTraining}
                    {g.cov.gapAfterTraining > 0 && <span className="flag"> ▲ no plan</span>}
                  </td>
                  <td>
                    {g.candidates.length === 0 ? (
                      '—'
                    ) : (
                      <span className="candidates">
                        {g.candidates.map((c) => {
                          const lvl = levelOf(c.id, g.rq.skillId);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className="link"
                              aria-label={`Plan training for ${c.code} in ${g.skill}, current level ${lvl ?? 'not assessed'}`}
                              onClick={() => plan(c.id, g.rq.skillId, g.rq.requiredLevel)}
                            >
                              {c.code} ({lvl === null ? 'not assessed' : `level ${lvl}`})
                            </button>
                          );
                        })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'New training' : 'Edit training'}</h3>
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>}
        <Field label="Consultant" error={errors.consultantId}>
          {(c) => (
            <select {...c} name="consultant" value={form.consultantId} onChange={(e) => set('consultantId', e.target.value)}>
              <option value="">Choose…</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>{p.code} ({teamLabel(p, teamName)})</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Skill" error={errors.skillId}>
          {(c) => (
            <select {...c} name="skill" value={form.skillId} onChange={(e) => set('skillId', e.target.value)}>
              <option value="">Choose…</option>
              {skills.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Target level" hint="Level the training should bring the consultant to" error={errors.targetLevel}>
          {(c) => (
            <select {...c} name="targetLevel" value={form.targetLevel} onChange={(e) => set('targetLevel', e.target.value)}>
              {[1, 2, 3, 4].map((l) => (
                <option key={l} value={l}>{SKILL_LEVEL_LABEL[l]}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Type">
          {(c) => (
            <select {...c} name="kind" value={form.kind} onChange={(e) => set('kind', e.target.value as TrainingKind)}>
              {TRAINING_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Title" error={errors.title}>
          {(c) => <input {...c} ref={titleRef} name="title" type="text" autoComplete="off" value={form.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="Status">
          {(c) => (
            <select {...c} name="status" value={form.status} onChange={(e) => set('status', e.target.value as TrainingStatus)}>
              {TRAINING_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Due date" hint="Optional">
          {(c) => <input {...c} name="dueDate" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}
        </Field>
        <Field label="Cost (EUR)" hint="Optional" error={errors.cost}>
          {(c) => <input {...c} name="cost" type="text" inputMode="decimal" autoComplete="off" value={form.cost} onChange={(e) => set('cost', e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editingId === undefined ? 'Add training' : 'Save changes'}
          </button>
          {editingId !== undefined && <button type="button" onClick={reset}>Cancel editing</button>}
        </div>
      </form>

      {trainings.length === 0 ? (
        <p className="empty">No training planned yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Training plan</caption>
            <thead>
              <tr>
                <th scope="col">Consultant</th>
                <th scope="col">Skill</th>
                <th scope="col" className="num">Current → target level</th>
                <th scope="col">Type</th>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Due date</th>
                <th scope="col" className="num">Cost</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {trainings.map((t) => {
                const c = personById.get(t.consultantId);
                const cur = levelOf(t.consultantId, t.skillId);
                const overdue = isOpen(t) && t.dueDate !== null && t.dueDate < today;
                const toUpdate = t.status === 'done' && (cur === null || cur < t.targetLevel);
                return (
                  <tr key={t.id} className={t.status === 'done' || t.status === 'cancelled' ? 'muted' : undefined}>
                    <th scope="row">{c?.code ?? '—'}</th>
                    <td>{skillName.get(t.skillId) ?? '—'}</td>
                    <td className="num">{cur ?? '—'} → {t.targetLevel}</td>
                    <td>{KIND_LABEL[t.kind]}</td>
                    <td>{t.title}</td>
                    <td>
                      {STATUS_LABEL[t.status]}
                      {toUpdate && (
                        <span className="flag"> ▲ <a href="#/matrix">updates the level in the skill matrix</a></span>
                      )}
                    </td>
                    <td>
                      {t.dueDate ?? '—'}
                      {overdue && <span className="flag"> ▲ overdue</span>}
                    </td>
                    <td className="num">{formatOptionalCents(t.costCents)}</td>
                    <td className="row-actions">
                      <button type="button" className="link" onClick={() => edit(t)} aria-label={`Edit ${t.title}`}>
                        Edit
                      </button>
                      <ConfirmDelete
                        label={t.title}
                        onConfirm={async () => {
                          try {
                            await api.deleteTraining(t.id);
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
