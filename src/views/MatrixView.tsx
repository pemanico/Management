import { useRef, useState, type FormEvent } from 'react';
import {
  SKILL_LEVEL_LABEL,
  type Consultant,
  type Rating,
  type Requirement,
  type Skill,
  type Team,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  teams: Team[];
  consultants: Consultant[];
  skills: Skill[];
  ratings: Rating[];
  requirements: Requirement[];
  onChanged: () => Promise<void>;
};

type Form = {
  consultantId: string;
  skillId: string;
  level: string;
  validated: boolean;
  evidence: string;
  assessedAt: string;
};

const todayIso = () => businessDate();
const blank = (): Form => ({ consultantId: '', skillId: '', level: '2', validated: false, evidence: '', assessedAt: todayIso() });

export function MatrixView({ teams, consultants, skills, ratings, requirements, onChanged }: Props) {
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const levelRef = useRef<HTMLSelectElement>(null);

  const ratingMap = new Map(ratings.map((r) => [`${r.consultantId}:${r.skillId}`, r]));
  const reqMap = new Map(requirements.map((r) => [`${r.teamId}:${r.skillId}`, r]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const existing = ratingMap.get(`${form.consultantId}:${form.skillId}`);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function fail(msg: string) {
    setFormError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  }

  function pick(c: Consultant, k: Skill) {
    const r = ratingMap.get(`${c.id}:${k.id}`);
    setErrors({});
    setFormError(undefined);
    setForm(
      r
        ? {
            consultantId: String(c.id),
            skillId: String(k.id),
            level: String(r.level),
            validated: r.validated,
            evidence: r.evidence ?? '',
            assessedAt: r.assessedAt,
          }
        : { ...blank(), consultantId: String(c.id), skillId: String(k.id) },
    );
    queueMicrotask(() => levelRef.current?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.consultantId === '') next.consultantId = 'Escolhe o consultor.';
    if (form.skillId === '') next.skillId = 'Escolhe a competência.';
    if (form.validated && form.evidence.trim() === '')
      next.evidence = 'Uma avaliação validada precisa de evidência (projeto, certificação, entrega).';
    if (form.assessedAt === '' || form.assessedAt > todayIso()) next.assessedAt = 'Indica uma data que não seja futura.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Corrige os campos assinalados.');

    setSaving(true);
    try {
      await api.saveRating({
        consultantId: Number(form.consultantId),
        skillId: Number(form.skillId),
        level: Number(form.level),
        validated: form.validated,
        evidence: form.evidence.trim() === '' ? null : form.evidence.trim(),
        assessedAt: form.assessedAt,
      });
      await onChanged();
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
    } finally {
      setSaving(false);
    }
  }

  if (consultants.length === 0 || skills.length === 0)
    return (
      <section aria-labelledby="mx-title">
        <h2 id="mx-title">Skill matrix</h2>
        <p className="empty">Precisas de consultores (separador Consultores) e de competências (separador Competências).</p>
      </section>
    );

  return (
    <section aria-labelledby="mx-title">
      <h2 id="mx-title">Skill matrix</h2>
      <p className="muted-text">
        Legenda: <strong>✓</strong> validada com evidência · <strong>?</strong> autoavaliação · <strong>▲</strong> abaixo do exigido para a equipa · <strong>—</strong> sem avaliação.
        Níveis: {SKILL_LEVEL_LABEL.join(' · ')}.
      </p>

      <div className="table-wrap">
        <table>
          <caption className="sr-only">Matriz de competências por consultor</caption>
          <thead>
            <tr>
              <th scope="col">Consultor</th>
              <th scope="col">Equipa</th>
              {skills.map((k) => (
                <th key={k.id} scope="col" className="num">{k.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consultants.map((c) => (
              <tr key={c.id} className={c.status === 'inactive' ? 'muted' : undefined}>
                <th scope="row">{c.code}</th>
                <td>{teamName.get(c.teamId) ?? '—'}</td>
                {skills.map((k) => {
                  const r = ratingMap.get(`${c.id}:${k.id}`);
                  const req = reqMap.get(`${c.teamId}:${k.id}`);
                  const below = req !== undefined && (r === undefined || r.level < req.requiredLevel);
                  const text = r === undefined ? '—' : `${r.level}${r.validated ? ' ✓' : ' ?'}`;
                  const desc = r === undefined ? 'sem avaliação' : `nível ${r.level}, ${r.validated ? 'validada' : 'autoavaliação'}`;
                  return (
                    <td key={k.id} className="num">
                      <button
                        type="button"
                        className="link"
                        aria-label={`${c.code}, ${k.name}: ${desc}${below ? ', abaixo do exigido' : ''}. Editar`}
                        onClick={() => pick(c, k)}
                      >
                        {text}
                      </button>
                      {below && c.status === 'active' && <span className="flag" aria-hidden="true"> ▲</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{existing ? 'Editar avaliação' : 'Nova avaliação'}</h3>
        {formError && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>
        )}
        <Field label="Consultor" error={errors.consultantId}>
          {(c) => (
            <select {...c} name="consultant" value={form.consultantId} onChange={(e) => set('consultantId', e.target.value)}>
              <option value="">Escolher…</option>
              {consultants.map((p) => (
                <option key={p.id} value={p.id}>{p.code}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Competência" error={errors.skillId}>
          {(c) => (
            <select {...c} name="skill" value={form.skillId} onChange={(e) => set('skillId', e.target.value)}>
              <option value="">Escolher…</option>
              {skills.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Nível">
          {(c) => (
            <select {...c} ref={levelRef} name="level" value={form.level} onChange={(e) => set('level', e.target.value)}>
              {SKILL_LEVEL_LABEL.map((label, i) => (
                <option key={label} value={i}>{label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Data da avaliação" error={errors.assessedAt}>
          {(c) => <input {...c} name="assessedAt" type="date" max={todayIso()} value={form.assessedAt} onChange={(e) => set('assessedAt', e.target.value)} />}
        </Field>
        <Field label="Evidência" hint="Projeto, certificação ou entrega que sustenta o nível. Obrigatória se validada." error={errors.evidence}>
          {(c) => <input {...c} name="evidence" type="text" autoComplete="off" maxLength={200} value={form.evidence} onChange={(e) => set('evidence', e.target.value)} />}
        </Field>
        <div className="field">
          <label>
            <input type="checkbox" name="validated" checked={form.validated} onChange={(e) => set('validated', e.target.checked)} />{' '}
            Validada por mim (não é autoavaliação)
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar avaliação'}
          </button>
          {existing && (
            <ConfirmDelete
              label="esta avaliação"
              onConfirm={async () => {
                try {
                  await api.deleteRating(Number(form.consultantId), Number(form.skillId));
                  await onChanged();
                  setForm(blank());
                } catch (err) {
                  fail(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
                }
              }}
            />
          )}
        </div>
      </form>
    </section>
  );
}
