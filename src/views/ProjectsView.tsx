import { useRef, useState, type FormEvent } from 'react';
import { PROJECT_STATUSES, type Project, type ProjectStatus, type Task, type Team } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { centsToInput, formatOptionalCents, parseOptionalEuroToCents } from '../money.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = { teams: Team[]; projects: Project[]; tasks: Task[]; onChanged: () => Promise<void> };
type Form = { name: string; teamId: string; status: ProjectStatus; startDate: string; endDate: string; budget: string };
type Errors = Partial<Record<keyof Form, string>>;

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: 'Planeado',
  active: 'Ativo',
  at_risk: 'Em risco',
  on_hold: 'Em pausa',
  done: 'Concluído',
};

const EMPTY: Form = { name: '', teamId: '', status: 'planned', startDate: '', endDate: '', budget: '' };

export function ProjectsView({ teams, projects, tasks, onChanged }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const taskCount = new Map<number, number>();
  for (const t of tasks) taskCount.set(t.projectId, (taskCount.get(t.projectId) ?? 0) + 1);

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
    if (form.name.trim() === '') next.name = 'Indica o nome do projeto.';
    if (form.teamId === '') next.teamId = 'Escolhe uma equipa.';
    if (budgetCents === null) next.budget = 'Formato inválido. Exemplo: 25.000,00';
    if (form.startDate !== '' && form.endDate !== '' && form.endDate < form.startDate)
      next.endDate = 'O fim não pode ser anterior ao início.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0 || budgetCents === null) return fail('Corrige os campos assinalados.');

    setSaving(true);
    try {
      await api.saveProject(
        {
          name: form.name.trim(),
          teamId: Number(form.teamId),
          status: form.status,
          startDate: form.startDate === '' ? null : form.startDate,
          endDate: form.endDate === '' ? null : form.endDate,
          budgetCents,
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

  function edit(p: Project) {
    setEditingId(p.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      name: p.name,
      teamId: String(p.teamId),
      status: p.status,
      startDate: p.startDate ?? '',
      endDate: p.endDate ?? '',
      budget: p.budgetCents === 0 ? '' : centsToInput(p.budgetCents),
    });
  }

  return (
    <section aria-labelledby="proj-title">
      <h2 id="proj-title">Projetos</h2>
      {teams.length === 0 ? (
        <p className="empty">Cria primeiro uma equipa no separador Equipas.</p>
      ) : (
        <form onSubmit={submit} noValidate className="card form-grid">
          <h3>{editingId === undefined ? 'Novo projeto' : 'Editar projeto'}</h3>
          {formError && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>
          )}
          <Field label="Nome" error={errors.name}>
            {(c) => <input {...c} name="name" type="text" autoComplete="off" value={form.name} onChange={set('name')} />}
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
          <Field label="Estado">
            {(c) => (
              <select {...c} name="status" value={form.status} onChange={set('status')}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Budget do projeto (EUR)" hint="Opcional" error={errors.budget}>
            {(c) => <input {...c} name="budget" type="text" inputMode="decimal" autoComplete="off" value={form.budget} onChange={set('budget')} />}
          </Field>
          <Field label="Início" hint="Opcional">
            {(c) => <input {...c} name="startDate" type="date" value={form.startDate} onChange={set('startDate')} />}
          </Field>
          <Field label="Fim previsto" hint="Opcional" error={errors.endDate}>
            {(c) => <input {...c} name="endDate" type="date" value={form.endDate} onChange={set('endDate')} />}
          </Field>
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar projeto' : 'Guardar alterações'}
            </button>
            {editingId !== undefined && <button type="button" onClick={reset}>Cancelar edição</button>}
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        teams.length > 0 && <p className="empty">Ainda não há projetos registados.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Projetos da unidade</caption>
            <thead>
              <tr>
                <th scope="col">Projeto</th>
                <th scope="col">Equipa</th>
                <th scope="col">Estado</th>
                <th scope="col">Início</th>
                <th scope="col">Fim previsto</th>
                <th scope="col" className="num">Budget</th>
                <th scope="col" className="num">Tarefas</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={p.status === 'done' ? 'muted' : undefined}>
                  <th scope="row">{p.name}</th>
                  <td>{teamName.get(p.teamId) ?? '—'}</td>
                  <td>
                    {PROJECT_STATUS_LABEL[p.status]}
                    {p.status === 'at_risk' && <span className="flag"> ▲</span>}
                  </td>
                  <td>{p.startDate ?? '—'}</td>
                  <td>{p.endDate ?? '—'}</td>
                  <td className="num">{formatOptionalCents(p.budgetCents)}</td>
                  <td className="num">
                    <a href={`#/tarefas?projeto=${p.id}`}>{taskCount.get(p.id) ?? 0}</a>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(p)} aria-label={`Editar ${p.name}`}>
                      Editar
                    </button>
                    <ConfirmDelete
                      label={`${p.name} e as suas ${taskCount.get(p.id) ?? 0} tarefa(s)`}
                      onConfirm={async () => {
                        try {
                          await api.deleteProject(p.id);
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
