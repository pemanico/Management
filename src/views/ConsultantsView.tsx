import { useRef, useState, type FormEvent } from 'react';
import { teamLabel } from '../home.ts';
import { usePersistedState } from '../usePersistedState.ts';
import { WORK_DAYS_PER_MONTH, WORK_MONTHS_PER_YEAR, CONSULTANT_KINDS, SENIORITIES, STATUSES, type Consultant, type ConsultantKind, type Department, type Profile, type Seniority, type Status, type Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { centsToInput, formatCents, parseEuroToCents } from '../money.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = { teams: Team[]; departments: Department[]; profiles: Profile[]; consultants: Consultant[]; onChanged: () => Promise<void> };
type Form = {
  code: string;
  teamId: string;
  departmentId: string; // em vez de equipa: só para o manager (conta por todas as equipas do departamento)
  profile: string;
  seniority: Seniority;
  kind: ConsultantKind;
  cost: string;
  supplier: string;
  contractEnd: string;
  status: Status;
  extra: { teamId: string; pct: string }[];
};
type Errors = Partial<Record<keyof Form, string>>;

const EMPTY: Form = {
  code: '', teamId: '', departmentId: '', profile: '', seniority: 'pleno', kind: 'external', cost: '', supplier: '', contractEnd: '', status: 'active', extra: [],
};

const SENIORITY_LABEL: Record<Seniority, string> = { junior: 'Junior', pleno: 'Mid-level', senior: 'Senior', lead: 'Lead' };
const KIND_LABEL: Record<ConsultantKind, string> = { internal: 'Internal', external: 'External' };
const STATUS_LABEL: Record<Status, string> = { active: 'Active', inactive: 'Inactive' };

export function ConsultantsView({ teams, departments, profiles, consultants, onChanged }: Props) {
  const [form, setForm] = usePersistedState<Form>('gu:consultores:form', EMPTY);
  const [editingId, setEditingId] = usePersistedState<number | undefined>('gu:consultores:editing', undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  // Sugestões no campo Fornecedor: evita o mesmo fornecedor escrito de duas maneiras.
  const suppliers = [...new Set(consultants.map((c) => c.supplier).filter((n): n is string => n !== null))].sort();

  const set = (k: Exclude<keyof Form, 'extra'>) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ---- Departamento (manager): não tem equipa principal nem outras equipas; conta por todas as equipas do departamento ----
  const ofDept = form.departmentId !== '';
  const deptTeams = teams.filter((t) => String(t.departmentId) === form.departmentId);
  const chooseDept = (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, departmentId: e.target.value, teamId: '', extra: [] }));

  // ---- Outras equipas (pessoa repartida): a equipa principal fica com o resto ----
  const extraSum = form.extra.reduce((a, x) => a + (Number.isInteger(Number(x.pct)) ? Number(x.pct) : 0), 0);
  const setExtra = (i: number, patch: Partial<{ teamId: string; pct: string }>) =>
    setForm((f) => ({ ...f, extra: f.extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addExtra = () => setForm((f) => ({ ...f, extra: [...f.extra, { teamId: '', pct: '' }] }));
  const removeExtra = (i: number) => setForm((f) => ({ ...f, extra: f.extra.filter((_, j) => j !== i) }));
  // Para quem está em todas as equipas (ex.: o manager): partes iguais, o resto fica na principal.
  const splitAll = () =>
    setForm((f) => {
      const others = teams.filter((t) => String(t.id) !== f.teamId);
      const each = Math.floor(100 / (others.length + 1));
      return { ...f, extra: each < 1 ? f.extra : others.map((t) => ({ teamId: String(t.id), pct: String(each) })) };
    });

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
    const external = form.kind === 'external';
    // Internos: não se regista rate nem salário.
    const costCents = external ? parseEuroToCents(form.cost) : 0;
    const supplier = external ? form.supplier.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(form.code.trim())) next.code = 'Use a code (e.g. C001), with no spaces or real names.';
    if (ofDept) {
      if (deptTeams.length === 0) next.departmentId = 'This department has no teams yet.';
    } else {
      if (form.teamId === '') next.teamId = 'Choose a team or a department.';
      const extraOk =
        form.extra.every((x) => x.teamId !== '' && x.teamId !== form.teamId && /^\d{1,2}$/.test(x.pct) && Number(x.pct) >= 1) &&
        new Set(form.extra.map((x) => x.teamId)).size === form.extra.length &&
        extraSum <= 99;
      if (!extraOk)
        next.extra = 'Each additional team needs a team (different from the main one, no repeats) and 1 to 99 %; the total must stay below 100 %.';
    }
    if (form.profile === '') next.profile = 'Choose a profile from the list (or create it on the Profiles page).';
    if (costCents === null) next.cost = 'Invalid format. Example: 450,00';
    else if (external && costCents === 0) next.cost = 'An external consultant needs a rate above zero.';
    if (external && (supplier === '' || supplier.length > 60)) next.supplier = 'Enter the supplier (max. 60 characters).';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0 || costCents === null) return fail('Fix the highlighted fields.');

    setSaving(true);
    try {
      await api.saveConsultant(
        {
          code: form.code.trim(),
          teamId: ofDept ? null : Number(form.teamId),
          departmentId: ofDept ? Number(form.departmentId) : null,
          extraTeams: ofDept ? [] : form.extra.map((x) => ({ teamId: Number(x.teamId), pct: Number(x.pct) })),
          profile: form.profile,
          seniority: form.seniority,
          kind: form.kind,
          costRateCentsPerDay: costCents,
          supplier: external ? supplier : null,
          contractEnd: form.contractEnd === '' ? null : form.contractEnd,
          status: form.status,
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

  function edit(c: Consultant) {
    setEditingId(c.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      code: c.code,
      teamId: c.teamId === null ? '' : String(c.teamId),
      departmentId: c.departmentId === null ? '' : String(c.departmentId),
      profile: c.profile,
      seniority: c.seniority,
      kind: c.kind,
      cost: c.kind === 'external' && c.costRateCentsPerDay > 0 ? centsToInput(c.costRateCentsPerDay) : '',
      supplier: c.supplier ?? '',
      contractEnd: c.contractEnd ?? '',
      status: c.status,
      extra: c.extraTeams.map((x) => ({ teamId: String(x.teamId), pct: String(x.pct) })),
    });
  }

  return (
    <section aria-labelledby="cons-title">
      <h2 id="cons-title">Consultants &amp; rates</h2>
      {teams.length === 0 ? (
        <p className="empty">Create a team on the Teams page first.</p>
      ) : (
        <form onSubmit={submit} noValidate className="card form-grid">
          <h3>{editingId === undefined ? 'New consultant' : 'Edit consultant'}</h3>
          {formError && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">
              {formError}
            </p>
          )}
          <Field label="Code (pseudonym)" hint="E.g. C001. Do not use real names." error={errors.code}>
            {(c) => <input {...c} name="code" type="text" autoComplete="off" value={form.code} onChange={set('code')} />}
          </Field>
          <Field
            label="Department"
            hint="Manager only: counts equally in every team of the department. Leave empty for a team member."
            error={errors.departmentId}
          >
            {(c) => (
              <select {...c} name="department" value={form.departmentId} onChange={chooseDept}>
                <option value="">None (team member)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </Field>
          {!ofDept && (
            <Field label="Main team" hint="Where skills and objectives count" error={errors.teamId}>
              {(c) => (
                <select {...c} name="team" value={form.teamId} onChange={set('teamId')}>
                  <option value="">Choose…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Profile" hint="Single list; create and rename profiles on the Profiles page." error={errors.profile}>
            {(c) => (
              <select {...c} name="profile" value={form.profile} onChange={set('profile')}>
                <option value="">Choose…</option>
                {/* Mantém o perfil atual visível mesmo que já não esteja na lista (evita perder o valor ao editar). */}
                {form.profile !== '' && !profiles.some((p) => p.name === form.profile) && (
                  <option value={form.profile}>{form.profile} (not in the list)</option>
                )}
                {profiles.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Seniority">
            {(c) => (
              <select {...c} name="seniority" value={form.seniority} onChange={set('seniority')}>
                {SENIORITIES.map((s) => (
                  <option key={s} value={s}>{SENIORITY_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Type" hint="Internal staff: no rate or salary is stored">
            {(c) => (
              <select {...c} name="kind" value={form.kind} onChange={set('kind')}>
                {CONSULTANT_KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            )}
          </Field>
          {form.kind === 'external' && (
            <>
              <Field label="Supplier" hint="Company that supplies the consultant" error={errors.supplier}>
                {(c) => <input {...c} name="supplier" type="text" list="supplier-options" autoComplete="off" value={form.supplier} onChange={set('supplier')} />}
              </Field>
              <Field label="Rate per day (EUR)" hint="Daily rate. Cost is calculated at 20 days × 11 months." error={errors.cost}>
                {(c) => <input {...c} name="cost" type="text" inputMode="decimal" autoComplete="off" value={form.cost} onChange={set('cost')} />}
              </Field>
              <datalist id="supplier-options">
                {suppliers.map((n) => <option key={n} value={n} />)}
              </datalist>
            </>
          )}
          <Field label="Contract end" hint="Optional">
            {(c) => <input {...c} name="contractEnd" type="date" value={form.contractEnd} onChange={set('contractEnd')} />}
          </Field>
          <Field label="Status">
            {(c) => (
              <select {...c} name="status" value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          {!ofDept && (
          <fieldset className="shares">
            <legend>Other teams (optional)</legend>
            <p className="hint">
              For people in more than one team (project manager, cross-team architect). Headcount and cost are split by
              the percentages; the main team keeps the rest: <strong>{100 - extraSum} %</strong>.
            </p>
            {form.extra.map((x, i) => (
              <div key={i} className="share-row">
                <select aria-label={`Other team ${i + 1}`} value={x.teamId} onChange={(e) => setExtra(i, { teamId: e.target.value })}>
                  <option value="">Choose…</option>
                  {teams.filter((t) => String(t.id) !== form.teamId).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input
                  aria-label={`Percentage in other team ${i + 1}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="%"
                  value={x.pct}
                  onChange={(e) => setExtra(i, { pct: e.target.value })}
                />
                <button type="button" className="link danger" onClick={() => removeExtra(i)} aria-label={`Remove other team ${i + 1}`}>
                  Remove
                </button>
              </div>
            ))}
            {errors.extra && <small className="error" role="alert">{errors.extra}</small>}
            <div className="actions">
              <button type="button" onClick={addExtra} disabled={teams.length < 2}>Add another team</button>
              <button type="button" onClick={splitAll} disabled={teams.length < 2 || form.teamId === ''}>
                Split across all teams
              </button>
            </div>
          </fieldset>
          )}
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId === undefined ? 'Add consultant' : 'Save changes'}
            </button>
            {editingId !== undefined && (
              <button type="button" onClick={reset}>Cancel editing</button>
            )}
          </div>
        </form>
      )}

      {consultants.length === 0 ? (
        teams.length > 0 && <p className="empty">No consultants yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Consultants and rates</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Team(s)</th>
                <th scope="col">Profile</th>
                <th scope="col">Seniority</th>
                <th scope="col">Type</th>
                <th scope="col">Supplier</th>
                <th scope="col" className="num">Rate/day</th>
                <th scope="col" className="num">Cost/year</th>
                <th scope="col">Contract end</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {consultants.map((c) => (
                <tr key={c.id} className={c.status === 'inactive' ? 'muted' : undefined}>
                  <th scope="row">{c.code}</th>
                  <td>
                    {c.teamId !== null
                      ? teamLabel(c, teamName)
                      : `Department ${departments.find((d) => d.id === c.departmentId)?.name ?? '—'}`}
                    {c.extraTeams.length > 0 && (
                      <>
                        {' '}{100 - c.extraTeams.reduce((a, x) => a + x.pct, 0)} %
                        {c.extraTeams.map((x) => ` · ${teamName.get(x.teamId) ?? '—'} ${x.pct} %`).join('')}
                      </>
                    )}
                  </td>
                  <td>{c.profile}</td>
                  <td>{SENIORITY_LABEL[c.seniority]}</td>
                  <td>{KIND_LABEL[c.kind]}</td>
                  <td>{c.kind === 'internal' ? '—' : (c.supplier ?? <span className="flag">▲ missing</span>)}</td>
                  <td className="num">
                    {c.kind === 'internal' ? '—' : c.costRateCentsPerDay > 0 ? formatCents(c.costRateCentsPerDay) : <span className="flag">▲ missing</span>}
                  </td>
                  <td className="num">
                    {c.kind === 'internal' || c.costRateCentsPerDay === 0
                      ? '—'
                      : formatCents(c.costRateCentsPerDay * WORK_DAYS_PER_MONTH * WORK_MONTHS_PER_YEAR)}
                  </td>
                  <td>{c.contractEnd ?? '—'}</td>
                  <td>{STATUS_LABEL[c.status]}</td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(c)} aria-label={`Edit ${c.code}`}>
                      Edit
                    </button>
                    <ConfirmDelete
                      label={c.code}
                      onConfirm={async () => {
                        try {
                          await api.deleteConsultant(c.id);
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
