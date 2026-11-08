import { useRef, useState, type FormEvent } from 'react';
import {
  OBJECTIVE_STATUSES,
  PERIOD_RE,
  type Consultant,
  type Objective,
  type ObjectiveStatus,
  type Team,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = {
  teams: Team[];
  consultants: Consultant[];
  objectives: Objective[];
  periodFilter: string;
  onFilter: (period: string) => void;
  onChanged: () => Promise<void>;
};

export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  not_started: 'Por iniciar',
  on_track: 'No bom caminho',
  at_risk: 'Em risco',
  achieved: 'Atingido',
  missed: 'Não atingido',
};

type Form = { scope: string; title: string; period: string; status: ObjectiveStatus; progress: string; dueDate: string };
type Errors = Partial<Record<keyof Form, string>>;

export function ObjectivesView({ teams, consultants, objectives, periodFilter, onFilter, onChanged }: Props) {
  const year = businessDate().slice(0, 4);
  const empty: Form = { scope: '', title: '', period: year, status: 'not_started', progress: '0', dueDate: '' };
  const [form, setForm] = useState<Form>(empty);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const today = businessDate();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const personById = new Map(consultants.map((c) => [c.id, c]));
  const periods = [...new Set([year, ...objectives.map((o) => o.period)])].sort().reverse();
  const shown = objectives.filter((o) => periodFilter === '' || o.period === periodFilter);

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const progress = Number(form.progress);
    if (form.scope === '') next.scope = 'Escolhe a equipa ou o consultor.';
    if (form.title.trim() === '' || form.title.trim().length > 140) next.title = 'Título obrigatório (máx. 140 caracteres).';
    if (!PERIOD_RE.test(form.period)) next.period = 'Usa 2026, 2026-H1 ou 2026-H2.';
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) next.progress = 'Entre 0 e 100.';
    else if (form.status === 'achieved' && progress !== 100) next.progress = 'Um objetivo atingido tem 100 %.';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Corrige os campos assinalados.');

    const [kind, id] = form.scope.split(':');
    setSaving(true);
    try {
      await api.saveObjective(
        {
          consultantId: kind === 'c' ? Number(id) : null,
          teamId: kind === 't' ? Number(id) : null,
          title: form.title.trim(),
          period: form.period,
          status: form.status,
          progressPct: progress,
          dueDate: form.dueDate === '' ? null : form.dueDate,
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

  function edit(o: Objective) {
    setEditingId(o.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      scope: o.teamId !== null ? `t:${o.teamId}` : `c:${o.consultantId}`,
      title: o.title,
      period: o.period,
      status: o.status,
      progress: String(o.progressPct),
      dueDate: o.dueDate ?? '',
    });
  }

  if (teams.length === 0)
    return (
      <section aria-labelledby="ob-title">
        <h2 id="ob-title">Objetivos</h2>
        <p className="empty">Cria primeiro uma equipa (separador Equipas).</p>
      </section>
    );

  return (
    <section aria-labelledby="ob-title">
      <h2 id="ob-title">Objetivos</h2>
      <p className="banner">
        Os objetivos ficam só na base de dados local. O que vai para o Claude são apenas agregados por equipa
        (contagens e progresso médio), nunca o texto nem o consultor.
      </p>

      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'Novo objetivo' : 'Editar objetivo'}</h3>
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>}
        <Field label="Âmbito" error={errors.scope}>
          {(c) => (
            <select {...c} name="scope" value={form.scope} onChange={(e) => set('scope', e.target.value)}>
              <option value="">Escolher…</option>
              <optgroup label="Equipa">
                {teams.map((t) => <option key={`t${t.id}`} value={`t:${t.id}`}>{t.name}</option>)}
              </optgroup>
              <optgroup label="Consultor">
                {consultants.filter((p) => p.status === 'active').map((p) => (
                  <option key={`c${p.id}`} value={`c:${p.id}`}>{p.code} ({teamName.get(p.teamId) ?? '—'})</option>
                ))}
              </optgroup>
            </select>
          )}
        </Field>
        <Field label="Objetivo" error={errors.title}>
          {(c) => <input {...c} name="title" type="text" autoComplete="off" value={form.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="Período" hint="2026, 2026-H1 ou 2026-H2" error={errors.period}>
          {(c) => <input {...c} name="period" type="text" autoComplete="off" value={form.period} onChange={(e) => set('period', e.target.value)} />}
        </Field>
        <Field label="Estado">
          {(c) => (
            <select {...c} name="status" value={form.status} onChange={(e) => set('status', e.target.value as ObjectiveStatus)}>
              {OBJECTIVE_STATUSES.map((s) => <option key={s} value={s}>{OBJECTIVE_STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Progresso (%)" error={errors.progress}>
          {(c) => <input {...c} name="progress" type="text" inputMode="numeric" autoComplete="off" value={form.progress} onChange={(e) => set('progress', e.target.value)} />}
        </Field>
        <Field label="Data limite" hint="Opcional">
          {(c) => <input {...c} name="dueDate" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar objetivo' : 'Guardar alterações'}
          </button>
          {editingId !== undefined && <button type="button" onClick={reset}>Cancelar edição</button>}
        </div>
      </form>

      <div className="field">
        <label htmlFor="ob-period">Período</label>
        <select id="ob-period" value={periodFilter} onChange={(e) => onFilter(e.target.value)}>
          <option value="">Todos</option>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Sem objetivos para este filtro.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Objetivos</caption>
            <thead>
              <tr>
                <th scope="col">Âmbito</th>
                <th scope="col">Objetivo</th>
                <th scope="col">Período</th>
                <th scope="col">Estado</th>
                <th scope="col" className="num">Progresso</th>
                <th scope="col">Data limite</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const overdue = o.dueDate !== null && o.dueDate < today && o.status !== 'achieved' && o.status !== 'missed';
                const scope = o.teamId !== null ? `Equipa ${teamName.get(o.teamId) ?? '—'}` : (personById.get(o.consultantId ?? 0)?.code ?? '—');
                return (
                  <tr key={o.id} className={o.status === 'achieved' || o.status === 'missed' ? 'muted' : undefined}>
                    <th scope="row">{scope}</th>
                    <td>{o.title}</td>
                    <td>{o.period}</td>
                    <td>{OBJECTIVE_STATUS_LABEL[o.status]}{o.status === 'at_risk' && <span className="flag"> ▲</span>}</td>
                    <td className="num">{o.progressPct} %</td>
                    <td>{o.dueDate ?? '—'}{overdue && <span className="flag"> ▲ em atraso</span>}</td>
                    <td className="row-actions">
                      <button type="button" className="link" onClick={() => edit(o)} aria-label={`Editar ${o.title}`}>Editar</button>
                      <ConfirmDelete
                        label={o.title}
                        onConfirm={async () => {
                          try {
                            await api.deleteObjective(o.id);
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
    </section>
  );
}
