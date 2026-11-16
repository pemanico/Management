import { useRef, useState, type FormEvent } from 'react';
import { usePersistedState } from '../usePersistedState.ts';
import type { Department, Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { centsToInput, formatHc, formatOptionalCents, parseHc, parseOptionalEuroToCents } from '../money.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = { teams: Team[]; departments: Department[]; onChanged: () => Promise<void> };
type Form = { name: string; departmentId: string; budget: string; actual: string; plannedInt: string; plannedExt: string };
type Errors = Partial<Record<keyof Form, string>>;

const EMPTY: Form = { name: '', departmentId: '', budget: '', actual: '', plannedInt: '0', plannedExt: '0' };

export function TeamsView({ teams, departments, onChanged }: Props) {
  const [form, setForm] = usePersistedState<Form>('gu:equipas:form', EMPTY);
  const [editingId, setEditingId] = usePersistedState<number | undefined>('gu:equipas:editing', undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // Departamentos: criar e apagar (renomear fica para depois).
  const [deptDraft, setDeptDraft] = useState('');
  const [deptError, setDeptError] = useState<string | undefined>();
  const deptErrorRef = useRef<HTMLParagraphElement>(null);

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setForm(EMPTY);
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const budgetCents = parseOptionalEuroToCents(form.budget);
    const actualCents = parseOptionalEuroToCents(form.actual);
    const plannedInt = parseHc(form.plannedInt);
    const plannedExt = parseHc(form.plannedExt);
    if (form.name.trim() === '') next.name = 'Indica o nome da equipa.';
    if (budgetCents === null) next.budget = 'Formato inválido. Exemplo: 120.000,00';
    if (actualCents === null) next.actual = 'Formato inválido. Exemplo: 95.500,00';
    if (plannedInt === null) next.plannedInt = 'Formato inválido. Exemplos: 3 ou 2,5';
    if (plannedExt === null) next.plannedExt = 'Formato inválido. Exemplos: 3 ou 2,5';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0 || budgetCents === null || actualCents === null || plannedInt === null || plannedExt === null) {
      setFormError('Corrige os campos assinalados.');
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    setSaving(true);
    try {
      await api.saveTeam(
        {
          name: form.name.trim(),
          departmentId: form.departmentId === '' ? null : Number(form.departmentId),
          budgetCents,
          actualCents,
          plannedInternalHeadcount: plannedInt,
          plannedExternalHeadcount: plannedExt,
        },
        editingId,
      );
      await onChanged();
      reset();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  function edit(t: Team) {
    setEditingId(t.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      name: t.name,
      departmentId: t.departmentId === null ? '' : String(t.departmentId),
      budget: centsToInput(t.budgetCents),
      actual: centsToInput(t.actualCents),
      plannedInt: formatHc(t.plannedInternalHeadcount),
      plannedExt: formatHc(t.plannedExternalHeadcount),
    });
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    const name = deptDraft.trim();
    if (name === '') {
      setDeptError('Indica o nome do departamento.');
      queueMicrotask(() => deptErrorRef.current?.focus());
      return;
    }
    try {
      await api.saveDepartment({ name });
      setDeptDraft('');
      setDeptError(undefined);
      await onChanged();
    } catch (err) {
      setDeptError(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
      queueMicrotask(() => deptErrorRef.current?.focus());
    }
  }

  return (
    <section aria-labelledby="teams-title">
      <h2 id="teams-title">Equipas</h2>
      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'Nova equipa' : 'Editar equipa'}</h3>
        {formError && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">
            {formError}
          </p>
        )}
        <Field label="Nome" error={errors.name}>
          {(c) => <input {...c} name="name" type="text" autoComplete="off" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Departamento" hint="Opcional. Agrupa equipas (ex.: Direção Dados)." error={errors.departmentId}>
          {(c) => (
            <select {...c} name="department" value={form.departmentId} onChange={set('departmentId')}>
              <option value="">Sem departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Budget em dinheiro (EUR)" hint="Opcional. Deixa vazio se o teu budget é só em headcount." error={errors.budget}>
          {(c) => <input {...c} name="budget" type="text" inputMode="decimal" autoComplete="off" value={form.budget} onChange={set('budget')} />}
        </Field>
        <Field label="Gasto real até hoje (EUR)" hint="Opcional" error={errors.actual}>
          {(c) => <input {...c} name="actual" type="text" inputMode="decimal" autoComplete="off" value={form.actual} onChange={set('actual')} />}
        </Field>
        <Field label="Headcount orçamentado: internos" hint="Vagas de internos. Aceita frações: 2,5" error={errors.plannedInt}>
          {(c) => <input {...c} name="plannedInt" type="text" inputMode="decimal" autoComplete="off" value={form.plannedInt} onChange={set('plannedInt')} />}
        </Field>
        <Field label="Headcount orçamentado: externos" hint="Vagas de externos. Aceita frações: 2,5" error={errors.plannedExt}>
          {(c) => <input {...c} name="plannedExt" type="text" inputMode="decimal" autoComplete="off" value={form.plannedExt} onChange={set('plannedExt')} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar equipa' : 'Guardar alterações'}
          </button>
          {editingId !== undefined && (
            <button type="button" onClick={reset}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {teams.length === 0 ? (
        <p className="empty">Ainda não há equipas. Adiciona a primeira no formulário acima.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Equipas da unidade</caption>
            <thead>
              <tr>
                <th scope="col">Equipa</th>
                <th scope="col">Departamento</th>
                <th scope="col" className="num">HC orçamentado: internos</th>
                <th scope="col" className="num">HC orçamentado: externos</th>
                <th scope="col" className="num">Total</th>
                <th scope="col" className="num">Budget (EUR)</th>
                <th scope="col" className="num">Gasto real (EUR)</th>
                <th scope="col">Atualizado</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <th scope="row">{t.name}</th>
                  <td>{t.departmentId === null ? '—' : (deptName.get(t.departmentId) ?? '—')}</td>
                  <td className="num">{formatHc(t.plannedInternalHeadcount)}</td>
                  <td className="num">{formatHc(t.plannedExternalHeadcount)}</td>
                  <td className="num">{formatHc(t.plannedHeadcount)}</td>
                  <td className="num">{formatOptionalCents(t.budgetCents)}</td>
                  <td className="num">{t.budgetCents === 0 ? '—' : formatOptionalCents(t.actualCents)}</td>
                  <td>{t.updatedAt.slice(0, 10)}</td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(t)} aria-label={`Editar ${t.name}`}>
                      Editar
                    </button>
                    <ConfirmDelete
                      label={t.name}
                      onConfirm={async () => {
                        try {
                          await api.deleteTeam(t.id);
                          await onChanged();
                        } catch (err) {
                          setFormError(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
                          queueMicrotask(() => errorRef.current?.focus());
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

      <h3>Departamentos</h3>
      <form onSubmit={addDepartment} noValidate className="card form-grid">
        {deptError && (
          <p ref={deptErrorRef} tabIndex={-1} role="alert" className="error banner">
            {deptError}
          </p>
        )}
        <Field label="Nome do departamento" hint="Ex.: Direção Dados">
          {(c) => <input {...c} name="deptName" type="text" autoComplete="off" value={deptDraft} onChange={(e) => setDeptDraft(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary">Adicionar departamento</button>
        </div>
      </form>
      {departments.length > 0 && (
        <ul className="plain-list">
          {departments.map((d) => (
            <li key={d.id}>
              {d.name}{' '}
              <ConfirmDelete
                label={d.name}
                onConfirm={async () => {
                  try {
                    await api.deleteDepartment(d.id);
                    await onChanged();
                  } catch (err) {
                    setDeptError(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
                    queueMicrotask(() => deptErrorRef.current?.focus());
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
