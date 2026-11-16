import { useRef, useState, type FormEvent } from 'react';
import { SKILL_LEVEL_LABEL, type Rating, type Requirement, type Skill, type SkillCoverage, type Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  teams: Team[];
  skills: Skill[];
  ratings: Rating[];
  requirements: Requirement[];
  coverage: SkillCoverage[];
  onChanged: () => Promise<void>;
};

export function SkillsView({ teams, skills, ratings, requirements, coverage, onChanged }: Props) {
  // --- catálogo ---
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [editingId, setEditingId] = useState<number | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [skillError, setSkillError] = useState<string | undefined>();
  const [savingSkill, setSavingSkill] = useState(false);
  const skillErrRef = useRef<HTMLParagraphElement>(null);

  // --- requisitos ---
  const [reqTeam, setReqTeam] = useState('');
  const [reqSkill, setReqSkill] = useState('');
  const [reqLevel, setReqLevel] = useState('3');
  const [reqMin, setReqMin] = useState('1');
  const [reqError, setReqError] = useState<string | undefined>();
  const [savingReq, setSavingReq] = useState(false);
  const reqErrRef = useRef<HTMLParagraphElement>(null);

  const skillName = new Map(skills.map((k) => [k.id, k.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const ratingsPerSkill = new Map<number, number>();
  for (const r of ratings) ratingsPerSkill.set(r.skillId, (ratingsPerSkill.get(r.skillId) ?? 0) + 1);
  const cov = new Map(coverage.map((c) => [`${c.teamName}|${c.skill}`, c]));

  function failSkill(msg: string) {
    setSkillError(msg);
    queueMicrotask(() => skillErrRef.current?.focus());
  }
  function failReq(msg: string) {
    setReqError(msg);
    queueMicrotask(() => reqErrRef.current?.focus());
  }

  async function submitSkill(e: FormEvent) {
    e.preventDefault();
    setSkillError(undefined);
    if (name.trim() === '') {
      setNameError('Enter the skill name.');
      return failSkill('Fix the highlighted fields.');
    }
    setNameError(undefined);
    setSavingSkill(true);
    try {
      await api.saveSkill({ name: name.trim(), category: category.trim() === '' ? null : category.trim() }, editingId);
      await onChanged();
      setName('');
      setCategory('');
      setEditingId(undefined);
    } catch (err) {
      failSkill(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSavingSkill(false);
    }
  }

  async function submitReq(e: FormEvent) {
    e.preventDefault();
    setReqError(undefined);
    const min = Number(reqMin);
    if (reqTeam === '' || reqSkill === '') return failReq('Choose the team and the skill.');
    if (!Number.isInteger(min) || min < 1) return failReq('Minimum people must be a whole number ≥ 1.');
    setSavingReq(true);
    try {
      await api.saveRequirement({
        teamId: Number(reqTeam),
        skillId: Number(reqSkill),
        requiredLevel: Number(reqLevel),
        minPeople: min,
      });
      await onChanged();
    } catch (err) {
      failReq(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSavingReq(false);
    }
  }

  return (
    <section aria-labelledby="sk-title">
      <h2 id="sk-title">Skills</h2>

      <form onSubmit={submitSkill} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'New skill' : 'Edit skill'}</h3>
        {skillError && (
          <p ref={skillErrRef} tabIndex={-1} role="alert" className="error banner">{skillError}</p>
        )}
        <Field label="Name" hint="E.g. PySpark, Oracle SQL, MiFID II" error={nameError}>
          {(c) => <input {...c} name="skill" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Category" hint="Optional. E.g. Data, Business, Management">
          {(c) => <input {...c} name="category" type="text" autoComplete="off" value={category} onChange={(e) => setCategory(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={savingSkill}>
            {savingSkill ? 'Saving…' : editingId === undefined ? 'Add skill' : 'Save changes'}
          </button>
          {editingId !== undefined && (
            <button
              type="button"
              onClick={() => {
                setEditingId(undefined);
                setName('');
                setCategory('');
                setNameError(undefined);
                setSkillError(undefined);
              }}
            >
              Cancel editing
            </button>
          )}
        </div>
      </form>

      {skills.length === 0 ? (
        <p className="empty">No skills yet. Add the 5–10 that really drive staffing; beyond that the matrix stops being maintained.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Skill catalogue</caption>
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">Assessments</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {skills.map((k) => (
                <tr key={k.id}>
                  <th scope="row">{k.name}</th>
                  <td>{k.category ?? '—'}</td>
                  <td className="num">{ratingsPerSkill.get(k.id) ?? 0}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      aria-label={`Edit ${k.name}`}
                      onClick={() => {
                        setEditingId(k.id);
                        setName(k.name);
                        setCategory(k.category ?? '');
                        setNameError(undefined);
                        setSkillError(undefined);
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDelete
                      label={`${k.name} and its ${ratingsPerSkill.get(k.id) ?? 0} assessment(s) and requirements`}
                      onConfirm={async () => {
                        try {
                          await api.deleteSkill(k.id);
                          await onChanged();
                        } catch (err) {
                          failSkill(err instanceof ApiError ? err.message : 'Something went wrong.');
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

      <h2>Requirements by team</h2>
      <p className="muted-text">
        Set how many active people in each team need at least a given level. Saving the same team + skill pair updates the requirement.
      </p>
      {teams.length === 0 || skills.length === 0 ? (
        <p className="empty">You need at least one team and one skill.</p>
      ) : (
        <form onSubmit={submitReq} noValidate className="card form-grid">
          {reqError && (
            <p ref={reqErrRef} tabIndex={-1} role="alert" className="error banner">{reqError}</p>
          )}
          <Field label="Team">
            {(c) => (
              <select {...c} name="reqTeam" value={reqTeam} onChange={(e) => setReqTeam(e.target.value)}>
                <option value="">Choose…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Skill">
            {(c) => (
              <select {...c} name="reqSkill" value={reqSkill} onChange={(e) => setReqSkill(e.target.value)}>
                <option value="">Choose…</option>
                {skills.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Minimum required level">
            {(c) => (
              <select {...c} name="reqLevel" value={reqLevel} onChange={(e) => setReqLevel(e.target.value)}>
                {[1, 2, 3, 4].map((l) => (
                  <option key={l} value={l}>{SKILL_LEVEL_LABEL[l]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Minimum people" hint="At that level or above">
            {(c) => <input {...c} name="reqMin" type="number" inputMode="numeric" min={1} step={1} value={reqMin} onChange={(e) => setReqMin(e.target.value)} />}
          </Field>
          <div className="actions">
            <button type="submit" className="primary" disabled={savingReq}>
              {savingReq ? 'Saving…' : 'Save requirement'}
            </button>
          </div>
        </form>
      )}

      {requirements.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Requirements and current coverage</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Skill</th>
                <th scope="col" className="num">Required level</th>
                <th scope="col" className="num">Minimum</th>
                <th scope="col" className="num">Qualified</th>
                <th scope="col" className="num">Validated</th>
                <th scope="col" className="num">Shortfall</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => {
                const t = teamName.get(r.teamId) ?? '—';
                const k = skillName.get(r.skillId) ?? '—';
                const c = cov.get(`${t}|${k}`);
                return (
                  <tr key={`${r.teamId}-${r.skillId}`}>
                    <th scope="row">{t}</th>
                    <td>{k}</td>
                    <td className="num">≥ {r.requiredLevel}</td>
                    <td className="num">{r.minPeople}</td>
                    <td className="num">{c?.qualified ?? 0}</td>
                    <td className="num">{c?.qualifiedValidated ?? 0}</td>
                    <td className="num">
                      {c?.gap ?? r.minPeople}
                      {(c?.gap ?? 1) > 0 && <span className="flag"> ▲ gap</span>}
                    </td>
                    <td className="row-actions">
                      <ConfirmDelete
                        label={`requirement ${k} for team ${t}`}
                        onConfirm={async () => {
                          try {
                            await api.deleteRequirement(r.teamId, r.skillId);
                            await onChanged();
                          } catch (err) {
                            failReq(err instanceof ApiError ? err.message : 'Something went wrong.');
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
