import { useRef, useState, type FormEvent } from 'react';
import {
  EVALUATION_STATUSES,
  PERIOD_RE,
  type Consultant,
  type Evaluation,
  type EvaluationStatus,
  type Objective,
  type Team,
} from '../../shared/types.ts';
import { businessDate } from '../../shared/dates.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';
import { OBJECTIVE_STATUS_LABEL } from './ObjectivesView.tsx';

type Props = {
  teams: Team[];
  consultants: Consultant[];
  objectives: Objective[];
  evaluations: Evaluation[];
  onChanged: () => Promise<void>;
};

const STATUS_LABEL: Record<EvaluationStatus, string> = { draft: 'Rascunho', final: 'Final' };
const RATING_LABEL: Record<number, string> = { 1: '1 – Abaixo do esperado', 2: '2 – Parcialmente', 3: '3 – Cumpre', 4: '4 – Excede' };

type Form = { consultantId: string; period: string; rating: string; summary: string; status: EvaluationStatus; evaluatedAt: string };
type Errors = Partial<Record<keyof Form, string>>;

export function EvaluationsView({ teams, consultants, objectives, evaluations, onChanged }: Props) {
  const today = businessDate();
  const year = today.slice(0, 4);
  const empty: Form = { consultantId: '', period: year, rating: '3', summary: '', status: 'draft', evaluatedAt: today };
  const [form, setForm] = useState<Form>(empty);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const personById = new Map(consultants.map((c) => [c.id, c]));
  const active = consultants.filter((c) => c.status === 'active');
  const evalOf = (cid: number, period: string) => evaluations.find((e) => e.consultantId === cid && e.period === period);
  const formCid = form.consultantId === '' ? null : Number(form.consultantId);
  const relatedObjectives =
    formCid === null || !PERIOD_RE.test(form.period)
      ? []
      : objectives.filter((o) => o.consultantId === formCid && (o.period === form.period || form.period.startsWith(o.period) || o.period.startsWith(form.period)));

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
  function startFor(cid: number) {
    const existing = evalOf(cid, year);
    if (existing) return edit(existing);
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
    setForm({ ...empty, consultantId: String(cid) });
    queueMicrotask(() => summaryRef.current?.focus());
  }
  function edit(ev: Evaluation) {
    setEditingId(ev.id);
    setErrors({});
    setFormError(undefined);
    setForm({
      consultantId: String(ev.consultantId),
      period: ev.period,
      rating: String(ev.rating),
      summary: ev.summary,
      status: ev.status,
      evaluatedAt: ev.evaluatedAt,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (form.consultantId === '') next.consultantId = 'Escolhe o consultor.';
    if (!PERIOD_RE.test(form.period)) next.period = 'Usa 2026, 2026-H1 ou 2026-H2.';
    if (form.summary.length > 500) next.summary = 'Máximo 500 caracteres.';
    if (form.status === 'final' && form.summary.trim() === '') next.summary = 'Uma avaliação final precisa de resumo com a evidência.';
    if (form.evaluatedAt === '' || form.evaluatedAt > today) next.evaluatedAt = 'Data inválida (não pode ser futura).';
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return fail('Corrige os campos assinalados.');
    setSaving(true);
    try {
      await api.saveEvaluation(
        {
          consultantId: Number(form.consultantId),
          period: form.period,
          rating: Number(form.rating),
          summary: form.summary.trim(),
          status: form.status,
          evaluatedAt: form.evaluatedAt,
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

  if (consultants.length === 0)
    return (
      <section aria-labelledby="ev-title">
        <h2 id="ev-title">Avaliações</h2>
        <p className="empty">Precisas de consultores (separador Consultores).</p>
      </section>
    );

  return (
    <section aria-labelledby="ev-title">
      <h2 id="ev-title">Avaliações</h2>
      <p className="banner">
        A classificação e o resumo são decisão tua e ficam só na base de dados local. A app e o Claude nunca propõem nem
        calculam notas; ao Claude vão apenas contagens (finais, rascunhos, em falta).
      </p>

      <h3>Ciclo {year}</h3>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Estado das avaliações do ano corrente por consultor ativo</caption>
          <thead>
            <tr>
              <th scope="col">Consultor</th>
              <th scope="col">Equipa</th>
              <th scope="col" className="num">Objetivos (atingidos / total)</th>
              <th scope="col">Avaliação {year}</th>
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {active.map((c) => {
              const mine = objectives.filter((o) => o.consultantId === c.id && o.period.startsWith(year));
              const ev = evalOf(c.id, year);
              return (
                <tr key={c.id}>
                  <th scope="row">{c.code}</th>
                  <td>{teamName.get(c.teamId) ?? '—'}</td>
                  <td className="num">{mine.filter((o) => o.status === 'achieved').length} / {mine.length}</td>
                  <td>{ev ? STATUS_LABEL[ev.status] : <span className="flag">▲ por fazer</span>}</td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => startFor(c.id)} aria-label={`${ev ? 'Abrir' : 'Iniciar'} avaliação de ${c.code}`}>
                      {ev ? 'Abrir' : 'Iniciar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'Nova avaliação' : 'Editar avaliação'}</h3>
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">{formError}</p>}
        <Field label="Consultor" error={errors.consultantId}>
          {(c) => (
            <select {...c} name="consultant" value={form.consultantId} disabled={editingId !== undefined} onChange={(e) => set('consultantId', e.target.value)}>
              <option value="">Escolher…</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.code} ({teamName.get(p.teamId) ?? '—'})</option>)}
            </select>
          )}
        </Field>
        <Field label="Período" hint="2026, 2026-H1 ou 2026-H2" error={errors.period}>
          {(c) => <input {...c} name="period" type="text" autoComplete="off" value={form.period} onChange={(e) => set('period', e.target.value)} />}
        </Field>
        {relatedObjectives.length > 0 && (
          <div className="field">
            <p><strong>Objetivos deste consultor neste período</strong></p>
            <ul>
              {relatedObjectives.map((o) => (
                <li key={o.id}>{o.title}: {OBJECTIVE_STATUS_LABEL[o.status]}, {o.progressPct} %</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Classificação (decisão tua)">
          {(c) => (
            <select {...c} name="rating" value={form.rating} onChange={(e) => set('rating', e.target.value)}>
              {[1, 2, 3, 4].map((r) => <option key={r} value={r}>{RATING_LABEL[r]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Resumo e evidência" hint="Obrigatório numa avaliação final. Máx. 500 caracteres." error={errors.summary}>
          {(c) => <textarea {...c} ref={summaryRef} name="summary" rows={4} maxLength={600} value={form.summary} onChange={(e) => set('summary', e.target.value)} />}
        </Field>
        <Field label="Estado">
          {(c) => (
            <select {...c} name="status" value={form.status} onChange={(e) => set('status', e.target.value as EvaluationStatus)}>
              {EVALUATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Data da avaliação" error={errors.evaluatedAt}>
          {(c) => <input {...c} name="evaluatedAt" type="date" max={today} value={form.evaluatedAt} onChange={(e) => set('evaluatedAt', e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar avaliação' : 'Guardar alterações'}
          </button>
          {editingId !== undefined && <button type="button" onClick={reset}>Cancelar edição</button>}
        </div>
      </form>

      {evaluations.length === 0 ? (
        <p className="empty">Ainda não há avaliações registadas.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Avaliações registadas</caption>
            <thead>
              <tr>
                <th scope="col">Consultor</th>
                <th scope="col">Período</th>
                <th scope="col">Classificação</th>
                <th scope="col">Estado</th>
                <th scope="col">Data</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((ev) => {
                const code = personById.get(ev.consultantId)?.code ?? '—';
                return (
                  <tr key={ev.id} className={ev.status === 'draft' ? 'muted' : undefined}>
                    <th scope="row">{code}</th>
                    <td>{ev.period}</td>
                    <td>{RATING_LABEL[ev.rating]}</td>
                    <td>{STATUS_LABEL[ev.status]}</td>
                    <td>{ev.evaluatedAt}</td>
                    <td className="row-actions">
                      <button type="button" className="link" onClick={() => edit(ev)} aria-label={`Editar avaliação de ${code} ${ev.period}`}>Editar</button>
                      <ConfirmDelete
                        label={`avaliação de ${code} ${ev.period}`}
                        onConfirm={async () => {
                          try {
                            await api.deleteEvaluation(ev.id);
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
