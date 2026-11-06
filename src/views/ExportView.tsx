import { useState } from 'react';
import type { Summary } from '../../shared/types.ts';
import { MASTER_PROMPT } from '../prompt.ts';

export function ExportView({ summary }: { summary: Summary }) {
  const [status, setStatus] = useState('');
  const payload = MASTER_PROMPT + JSON.stringify(summary, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setStatus('Copiado. Cola no Claude.');
    } catch {
      setStatus('Não foi possível copiar automaticamente. Seleciona o texto e copia manualmente.');
    }
  }

  return (
    <section aria-labelledby="exp-title">
      <h2 id="exp-title">Exportar para o Claude</h2>
      <p>
        Prompt mestre + resumo atual da unidade. Os consultores aparecem só como códigos agregados por equipa; confirma
        com o teu compliance antes de colar dados reais numa ferramenta de IA externa.
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={copy}>Copiar prompt + dados</button>
        <a className="button" href="/api/export?kind=teams" download="equipas.csv">Descarregar equipas (CSV)</a>
        <a className="button" href="/api/export?kind=consultants" download="consultores.csv">Descarregar consultores (CSV)</a>
        <a className="button" href="/api/export?kind=projects" download="projetos.csv">Descarregar projetos (CSV)</a>
        <a className="button" href="/api/export?kind=tasks" download="tarefas.csv">Descarregar tarefas (CSV)</a>
        <a className="button" href="/api/export?kind=ratings" download="competencias.csv">Descarregar skill matrix (CSV)</a>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      <label htmlFor="payload" className="sr-only">Prompt e dados</label>
      <textarea id="payload" readOnly rows={18} value={payload} />
    </section>
  );
}
