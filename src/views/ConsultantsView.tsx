import { useRef, useState, type FormEvent } from 'react';
import { CONSULTANT_KINDS, SENIORITIES, STATUSES, type Consultant, type ConsultantKind, type Seniority, type Status, type Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { centsToInput, formatCents, parseEuroToCents } from '../money.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = { teams: Team[]; consultants: Consultant[]; onChanged: () => Promise<void> };
type Form = {
  code: string;
  teamId: string;
  profile: string;
  seniority: Seniority;
  kind: ConsultantKind;
  cost: string;
  supplier: string;
  contractEnd: string;
  status: Status;
};
type Errors = Partial<Record<keyof Form, string>>;

const EMPTY: Form = {
  code: '', teamId: '', profile: '', seniority: 'pleno', kind: 'external', cost: '', supplier: '', contractEnd: '', status: 'active',
};

const SENIORITY_LABEL: Record<Seniority, string> = { junior: 'Júnior', pleno: 'Pleno', senior: 'Sénior', lead: 'Lead' };
const KIND_LABEL: Record<ConsultantKind, string> = { internal: 'Interno', external: 'Externo' };
const STATUS_LABEL: Record<Status, string> = { active: 'Ativo', inactive: 'Inativo' };

export function ConsultantsView({ teams, consultants, onChanged }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  // Sugestões no campo Fornecedor: evita o mesmo fornecedor escrito de duas maneiras.
  const suppliers = [...new Set(consultants.map((c) => c.supplier).filter((n): n is string => n !== null))].sort();

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
    const external = form.kind === 'external';
    // Internos: não se regista rate nem salário.
    const costCents = external ? parseEuroToCents(form.cost) : 0;
    const supplier = external ? form.supplier.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(form.code.trim())) next.code = 'Usa um código (ex.: C001), sem espaços nem nomes reais.';
    if (form.teamId === '') next.teamId = 'Escolhe uma equipa.';
    if (form.profile.trim() === '') next.profile = 'Indica o perfil.';
    if (costCents === null) next.cost = 'Formato inválido. Exemplo: 450,00';
    else if (external && costCents === 0) next.cost = 'Um externo precisa de rate maior que zero.';
    if (external && (supplier === '' || supplier.length > 60)) next.supplier = 'Indica o fornecedor (máx. 60 caracteres).';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0 || costCents === null) return fail('Corrige os campos assinalados.');

    setSaving(true);
    try {
      await api.saveConsultant(
        {
          code: form.code.trim(),
          teamId: Number(form.teamId),
          profile: form.profile.trim(),
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
      fail(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
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
      teamId: String(c.teamId),
      profile: c.profile,
      seniority: c.seniority,
      kind: c.kind,
      cost: c.kind === 'external' && c.costRateCentsPerDay > 0 ? centsToInput(c.costRateCentsPerDay) : '',
      supplier: c.supplier ?? '',
      contractEnd: c.contractEnd ?? '',
      status: c.status,
    });
  }

  return (
    <section aria-labelledby="cons-title">
      <h2 id="cons-title">Consultores &amp; rates</h2>
      {teams.length === 0 ? (
        <p className="empty">Cria primeiro uma equipa no separador Equipas.</p>
      ) : (
        <form onSubmit={submit} noValidate className="card form-grid">
          <h3>{editingId === undefined ? 'Novo consultor' : 'Editar consultor'}</h3>
          {formError && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">
              {formError}
            </p>
          )}
          <Field label="Código (pseudónimo)" hint="Ex.: C001. Não uses nomes reais." error={errors.code}>
            {(c) => <input {...c} name="code" type="text" autoComplete="off" value={form.code} onChange={set('code')} />}
          </Field>
          <Field label="Equipa" error={errors.teamId}>
            {(c) => (
              <select {...c} name="team" value={form.teamId} onChange={set('teamId')}>
                <option value="">Escolher…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Perfil" hint="Ex.: Data Engineer" error={errors.profile}>
            {(c) => <input {...c} name="profile" type="text" autoComplete="off" value={form.profile} onChange={set('profile')} />}
          </Field>
          <Field label="Senioridade">
            {(c) => (
              <select {...c} name="seniority" value={form.seniority} onChange={set('seniority')}>
                {SENIORITIES.map((s) => (
                  <option key={s} value={s}>{SENIORITY_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Tipo" hint="Internos: sem rate nem salário registados">
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
              <Field label="Fornecedor" hint="Empresa que coloca o consultor" error={errors.supplier}>
                {(c) => <input {...c} name="supplier" type="text" list="supplier-options" autoComplete="off" value={form.supplier} onChange={set('supplier')} />}
              </Field>
              <Field label="Rate por dia (EUR)" hint="Obrigatória para externos" error={errors.cost}>
                {(c) => <input {...c} name="cost" type="text" inputMode="decimal" autoComplete="off" value={form.cost} onChange={set('cost')} />}
              </Field>
              <datalist id="supplier-options">
                {suppliers.map((n) => <option key={n} value={n} />)}
              </datalist>
            </>
          )}
          <Field label="Fim de contrato" hint="Opcional">
            {(c) => <input {...c} name="contractEnd" type="date" value={form.contractEnd} onChange={set('contractEnd')} />}
          </Field>
          <Field label="Estado">
            {(c) => (
              <select {...c} name="status" value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar consultor' : 'Guardar alterações'}
            </button>
            {editingId !== undefined && (
              <button type="button" onClick={reset}>Cancelar edição</button>
            )}
          </div>
        </form>
      )}

      {consultants.length === 0 ? (
        teams.length > 0 && <p className="empty">Ainda não há consultores registados.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Consultores e rates</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Equipa</th>
                <th scope="col">Perfil</th>
                <th scope="col">Senioridade</th>
                <th scope="col">Tipo</th>
                <th scope="col">Fornecedor</th>
                <th scope="col" className="num">Rate/dia</th>
                <th scope="col">Fim contrato</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {consultants.map((c) => (
                <tr key={c.id} className={c.status === 'inactive' ? 'muted' : undefined}>
                  <th scope="row">{c.code}</th>
                  <td>{teamName.get(c.teamId) ?? '—'}</td>
                  <td>{c.profile}</td>
                  <td>{SENIORITY_LABEL[c.seniority]}</td>
                  <td>{KIND_LABEL[c.kind]}</td>
                  <td>{c.kind === 'internal' ? '—' : (c.supplier ?? <span className="flag">▲ em falta</span>)}</td>
                  <td className="num">
                    {c.kind === 'internal' ? '—' : c.costRateCentsPerDay > 0 ? formatCents(c.costRateCentsPerDay) : <span className="flag">▲ em falta</span>}
                  </td>
                  <td>{c.contractEnd ?? '—'}</td>
                  <td>{STATUS_LABEL[c.status]}</td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(c)} aria-label={`Editar ${c.code}`}>
                      Editar
                    </button>
                    <ConfirmDelete
                      label={c.code}
                      onConfirm={async () => {
                        try {
                          await api.deleteConsultant(c.id);
                          await onChanged();
                        } catch (err) {
                          fail(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
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
