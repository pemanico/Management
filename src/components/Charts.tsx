import type { ReactNode } from 'react';

// Gráficos simples em HTML/CSS (sem dependências): barras horizontais com marcador de objetivo e barra de estados.
// As cores vêm de variáveis CSS (--series-a/b e --status-*), validadas para claro e escuro.

export type Series = 'a' | 'b';
export type BarSegment = { series: Series; value: number; name: string; text: string };
export type BarRow = {
  label: string;
  segments: BarSegment[];
  target?: number; // marcador vertical (ex.: orçamentado, mínimo)
  targetText?: string;
  valueText: ReactNode; // valor escrito à direita: a leitura nunca depende só da cor
};

type BarChartProps = {
  title: string;
  note?: string;
  legend?: { series: Series; name: string }[]; // só com 2 séries; com uma, o título chega
  targetName?: string;
  rows: BarRow[];
  empty: string;
};

export function BarChart({ title, note, legend, targetName, rows, empty }: BarChartProps) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.target ?? 0, r.segments.reduce((a, s) => a + s.value, 0))));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <figure className="card chart">
      <figcaption>
        <h3>{title}</h3>
        {note && <p className="muted-text">{note}</p>}
      </figcaption>
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <>
          {(legend || targetName) && (
            <ul className="legend">
              {legend?.map((l) => (
                <li key={l.series}>
                  <span className={`swatch series-${l.series}`} aria-hidden="true" />
                  {l.name}
                </li>
              ))}
              {targetName && (
                <li>
                  <span className="swatch-tick" aria-hidden="true" />
                  {targetName}
                </li>
              )}
            </ul>
          )}
          <ul className="bars">
            {rows.map((r) => (
              <li key={r.label} className="bar-row">
                <span className="bar-label">{r.label}</span>
                <span className="track" aria-hidden="true">
                  {r.segments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <span key={s.series} className={`seg series-${s.series}`} style={{ width: pct(s.value) }} title={`${r.label} · ${s.name}: ${s.text}`} />
                    ))}
                  {r.target !== undefined && r.target > 0 && (
                    <span className="tick" style={{ left: pct(r.target) }} title={`${r.label} · ${targetName ?? ''}: ${r.targetText ?? r.target}`} />
                  )}
                </span>
                <span className="bar-value">{r.valueText}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}

export type Status = 'good' | 'info' | 'neutral' | 'warning' | 'critical';
const STATUS_ICON: Record<Status, string> = { good: '✓', info: '●', neutral: '○', warning: '▲', critical: '✕' };

/** Uma barra dividida por estados, com legenda que repete ícone, nome e contagem (nunca só cor). */
export function StatusBar({ title, segments, empty }: { title: string; segments: { status: Status; name: string; value: number }[]; empty: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <figure className="card chart">
      <figcaption>
        <h3>{title}</h3>
      </figcaption>
      {total === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <>
          <span className="track status-track" aria-hidden="true">
            {segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <span key={s.name} className={`seg status-${s.status}`} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.name}: ${s.value}`} />
              ))}
          </span>
          <ul className="legend status-legend">
            {segments.map((s) => (
              <li key={s.name}>
                <span className={`status-icon status-${s.status}`} aria-hidden="true">{STATUS_ICON[s.status]}</span>
                {s.name} <strong>{s.value}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
