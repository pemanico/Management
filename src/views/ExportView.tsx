import { useState } from 'react';
import type { Summary } from '../../shared/types.ts';
import { MASTER_PROMPT } from '../prompt.ts';

export function ExportView({ summary }: { summary: Summary }) {
  const [status, setStatus] = useState('');
  const payload = MASTER_PROMPT + JSON.stringify(summary, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setStatus('Copied. Paste it into Claude.');
    } catch {
      setStatus('Could not copy automatically. Select the text and copy it manually.');
    }
  }

  return (
    <section aria-labelledby="exp-title">
      <h2 id="exp-title">Export to Claude</h2>
      <p>
        Master prompt + current unit summary. Consultants only appear as codes aggregated by team; check with your
        compliance team before pasting real data into an external AI tool.
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={copy}>Copy prompt + data</button>
        <a className="button" href="/api/export?kind=teams" download="equipas.csv">Download teams (CSV)</a>
        <a className="button" href="/api/export?kind=consultants" download="consultores.csv">Download consultants (CSV)</a>
        <a className="button" href="/api/export?kind=projects" download="projetos.csv">Download projects (CSV)</a>
        <a className="button" href="/api/export?kind=allocations" download="alocacoes.csv">Download allocations (CSV)</a>
        <a className="button" href="/api/export?kind=trainings" download="formacao.csv">Download training (CSV)</a>
        <a className="button" href="/api/export?kind=objectives" download="objetivos.csv">Download objectives (CSV, local)</a>
        <a className="button" href="/api/export?kind=evaluations" download="avaliacoes.csv">Download evaluations (CSV, local)</a>
        <a className="button" href="/api/export?kind=ratings" download="competencias.csv">Download skill matrix (CSV)</a>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      <label htmlFor="payload" className="sr-only">Prompt and data</label>
      <textarea id="payload" readOnly rows={18} value={payload} />
    </section>
  );
}
