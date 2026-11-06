import { useRef, useState, type FormEvent } from 'react';
import {
  PRIORITIES,
  TASK_STATUSES,
  type Consultant,
  type Priority,
  type Project,
  type Task,
  type TaskStatus,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  projects: Project[];
  consultants: Consultant[];
  tasks: Task[];
  projectFilter: string; // '' = todos; vem da URL
  onFilter: (projectId: string) => void;
  onChanged: () => Promise<void>;
};
type Form = {
  projectId: string;
  title: string;
  assigneeId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  estimate: string;
};
type Errors = Partial<Record<keyof Form, string>>;

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Por fazer', doing: 'Em curso', blocked: 'Bloqueada', done: 'Concluída' };
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };

export function TasksView({ projects, consultants, tasks, projectFilter, onFilter, onChanged }: Props) {
  const emptyForm: Form = {
    projectId: projectFilter,
    title: '',
    assigneeId: '',
    status: 'todo',
    priority: 'medium',
    dueDate: '',
    estimate: '',
  };
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const today = businessDate();
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const personCode = new Map(consultants.map((c) => [c.id, c.code]));
  const visible = projectFilter === '' ? tasks : tasks.filter((t) => String(t.projectId) === projectFilter);

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setForm({ ...emptyForm, projectId: projectFilter });
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
    const estimate = form.estimate.trim() === '' ? null : Number(form.estimate);
    if (form.projectId === '') next.projectId = 'Escolhe um projeto.';
    if (form.title.trim() === '') next.title = 'Indica o título da tarefa.';
    if (estimate !== null && (!Number.isInteger(estimate) || estimate < 0))
      next.estimate = 'Indica um número inteiro de horas ≥ 0.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Corrige os campos assinalados.');

    setSaving(true);
    try {
      await api.saveTask(
        {
          projectId: Number(form.projectId),
          title: form.title.trim(),
          assigneeId: form.assigneeId === '' ? null : Number(form.assigneeId),
          status: form.status,
          priority: form.priority,
          dueDate: form.dueDate === '' ? null : form.dueDate,
          estimateHours: estimate,
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

  function edit(t: Task) {
    setEditingId(t.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      projectId: String(t.projectId),
      title: t.title,
      assigneeId: t.assigneeId === null ? '' : String(t.assigneeId),
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ?? '',
      estimate: t.estimateHours === null ? '' : String(t.estimateHours),
    });
  }

  const activeConsultants = consultants.filter((c) => c.status === 'active');

  return (
    <section aria-labelledby="task-title">
      <h2 id="task-title">Tarefas</h2>
      {projects.length === 0 ? (
        <p className="empty">Cria primeiro um projeto no separador Projetos.</p>
      ) : (
        <>
          <div className="card">
            <Field label="Filtrar por projeto">
              {(c) => (
                <select {...c} name="filter" value={projectFilter} onChange={(e) => onFilter(e.target.value)}>
                  <option value="">Todos os projetos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <form onSubmit={submit} noValidate className="card form-grid">
            <h3>{editingId === undefined ? 'Nova tarefa' : 'Editar tarefa'}</h3>
            {formError && (
              <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>
            )}
            <Field label="Projeto" error={errors.projectId}>
              {(c) => (
                <select {...c} name="project" value={form.projectId} onChange={set('projectId')}>
                  <option value="">Escolher…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Título" error={errors.title}>
              {(c) => <input {...c} name="title" type="text" autoComplete="off" value={form.title} onChange={set('title')} />}
            </Field>
            <Field label="Responsável" hint="Código do consultor">
              {(c) => (
                <select {...c} name="assignee" value={form.assigneeId} onChange={set('assigneeId')}>
                  <option value="">Sem responsável</option>
                  {activeConsultants.map((p) => (
                    <option key={p.id} value={p.id}>{p.code}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Estado">
              {(c) => (
                <select {...c} name="status" value={form.status} onChange={set('status')}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Prioridade">
              {(c) => (
                <select {...c} name="priority" value={form.priority} onChange={set('priority')}>
                  {PRIORITIES.map((s) => (
                    <option key={s} value={s}>{PRIORITY_LABEL[s]}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Data limite" hint="Opcional">
              {(c) => <input {...c} name="dueDate" type="date" value={form.dueDate} onChange={set('dueDate')} />}
            </Field>
            <Field label="Estimativa (horas)" hint="Opcional" error={errors.estimate}>
              {(c) => <input {...c} name="estimate" type="number" inputMode="numeric" min={0} step={1} value={form.estimate} onChange={set('estimate')} />}
            </Field>
            <div className="actions">
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar tarefa' : 'Guardar alterações'}
              </button>
              {editingId !== undefined && <button type="button" onClick={reset}>Cancelar edição</button>}
            </div>
          </form>

          {visible.length === 0 ? (
            <p className="empty">Sem tarefas {projectFilter === '' ? 'registadas' : 'neste projeto'}.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Tarefas</caption>
                <thead>
                  <tr>
                    <th scope="col">Tarefa</th>
                    <th scope="col">Projeto</th>
                    <th scope="col">Responsável</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Prioridade</th>
                    <th scope="col">Data limite</th>
                    <th scope="col" className="num">Estimativa (h)</th>
                    <th scope="col"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => {
                    const overdue = t.status !== 'done' && t.dueDate !== null && t.dueDate < today;
                    return (
                      <tr key={t.id} className={t.status === 'done' ? 'muted' : undefined}>
                        <th scope="row">{t.title}</th>
                        <td>{projectName.get(t.projectId) ?? '—'}</td>
                        <td>{t.assigneeId === null ? '—' : (personCode.get(t.assigneeId) ?? '—')}</td>
                        <td>
                          {STATUS_LABEL[t.status]}
                          {t.status === 'blocked' && <span className="flag"> ▲</span>}
                        </td>
                        <td>{PRIORITY_LABEL[t.priority]}</td>
                        <td>
                          {t.dueDate ?? '—'}
                          {overdue && <span className="flag"> ▲ em atraso</span>}
                        </td>
                        <td className="num">{t.estimateHours ?? '—'}</td>
                        <td className="row-actions">
                          <button type="button" className="link" onClick={() => edit(t)} aria-label={`Editar ${t.title}`}>
                            Editar
                          </button>
                          <ConfirmDelete
                            label={t.title}
                            onConfirm={async () => {
                              try {
                                await api.deleteTask(t.id);
                                await onChanged();
                              } catch (err) {
                                fail(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
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
        </>
      )}
    </section>
  );
}
