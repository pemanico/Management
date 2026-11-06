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
      setNameError('Indica o nome da competência.');
      return failSkill('Corrige os campos assinalados.');
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
      failSkill(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
    } finally {
      setSavingSkill(false);
    }
  }

  async function submitReq(e: FormEvent) {
    e.preventDefault();
    setReqError(undefined);
    const min = Number(reqMin);
    if (reqTeam === '' || reqSkill === '') return failReq('Escolhe a equipa e a competência.');
    if (!Number.isInteger(min) || min < 1) return failReq('O mínimo de pessoas deve ser um inteiro ≥ 1.');
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
      failReq(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
    } finally {
      setSavingReq(false);
    }
  }

  return (
    <section aria-labelledby="sk-title">
      <h2 id="sk-title">Competências</h2>

      <form onSubmit={submitSkill} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'Nova competência' : 'Editar competência'}</h3>
        {skillError && (
          <p ref={skillErrRef} tabIndex={-1} role="alert" className="error banner">{skillError}</p>
        )}
        <Field label="Nome" hint="Ex.: PySpark, Oracle SQL, MiFID II" error={nameError}>
          {(c) => <input {...c} name="skill" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Categoria" hint="Opcional. Ex.: Dados, Negócio, Gestão">
          {(c) => <input {...c} name="category" type="text" autoComplete="off" value={category} onChange={(e) => setCategory(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={savingSkill}>
            {savingSkill ? 'A guardar…' : editingId === undefined ? 'Adicionar competência' : 'Guardar alterações'}
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
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {skills.length === 0 ? (
        <p className="empty">Ainda não há competências. Adiciona as 5–10 que realmente decidem a staffing; mais do que isso e a matriz deixa de ser mantida.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Catálogo de competências</caption>
            <thead>
              <tr>
                <th scope="col">Competência</th>
                <th scope="col">Categoria</th>
                <th scope="col" className="num">Avaliações</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
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
                      aria-label={`Editar ${k.name}`}
                      onClick={() => {
                        setEditingId(k.id);
                        setName(k.name);
                        setCategory(k.category ?? '');
                        setNameError(undefined);
                        setSkillError(undefined);
                      }}
                    >
                      Editar
                    </button>
                    <ConfirmDelete
                      label={`${k.name} e as suas ${ratingsPerSkill.get(k.id) ?? 0} avaliação(ões) e requisitos`}
                      onConfirm={async () => {
                        try {
                          await api.deleteSkill(k.id);
                          await onChanged();
                        } catch (err) {
                          failSkill(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
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

      <h2>Requisitos por equipa</h2>
      <p className="muted-text">
        Define quantas pessoas ativas de cada equipa precisam de ter pelo menos um dado nível. Guardar o mesmo par equipa + competência atualiza o requisito.
      </p>
      {teams.length === 0 || skills.length === 0 ? (
        <p className="empty">Precisas de pelo menos uma equipa e uma competência.</p>
      ) : (
        <form onSubmit={submitReq} noValidate className="card form-grid">
          {reqError && (
            <p ref={reqErrRef} tabIndex={-1} role="alert" className="error banner">{reqError}</p>
          )}
          <Field label="Equipa">
            {(c) => (
              <select {...c} name="reqTeam" value={reqTeam} onChange={(e) => setReqTeam(e.target.value)}>
                <option value="">Escolher…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Competência">
            {(c) => (
              <select {...c} name="reqSkill" value={reqSkill} onChange={(e) => setReqSkill(e.target.value)}>
                <option value="">Escolher…</option>
                {skills.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Nível mínimo exigido">
            {(c) => (
              <select {...c} name="reqLevel" value={reqLevel} onChange={(e) => setReqLevel(e.target.value)}>
                {[1, 2, 3, 4].map((l) => (
                  <option key={l} value={l}>{SKILL_LEVEL_LABEL[l]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Mínimo de pessoas" hint="Com esse nível ou superior">
            {(c) => <input {...c} name="reqMin" type="number" inputMode="numeric" min={1} step={1} value={reqMin} onChange={(e) => setReqMin(e.target.value)} />}
          </Field>
          <div className="actions">
            <button type="submit" className="primary" disabled={savingReq}>
              {savingReq ? 'A guardar…' : 'Guardar requisito'}
            </button>
          </div>
        </form>
      )}

      {requirements.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Requisitos e cobertura atual</caption>
            <thead>
              <tr>
                <th scope="col">Equipa</th>
                <th scope="col">Competência</th>
                <th scope="col" className="num">Nível exigido</th>
                <th scope="col" className="num">Mínimo</th>
                <th scope="col" className="num">Qualificados</th>
                <th scope="col" className="num">Validados</th>
                <th scope="col" className="num">Défice</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
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
                        label={`requisito ${k} da equipa ${t}`}
                        onConfirm={async () => {
                          try {
                            await api.deleteRequirement(r.teamId, r.skillId);
                            await onChanged();
                          } catch (err) {
                            failReq(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
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
