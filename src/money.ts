// Montantes: sempre inteiros em cêntimos. Formatação é só apresentação.

const PLAIN = /^\d{1,12}(,\d{1,2})?$/;
const GROUPED = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;

/** "1.234,56" ou "1234,5" -> cêntimos. Devolve null se o formato for ambíguo/inválido (ex.: "1234.56"). */
export function parseEuroToCents(input: string): number | null {
  const t = input.trim();
  if (!PLAIN.test(t) && !GROUPED.test(t)) return null;
  const [int = '0', dec = ''] = t.replace(/\./g, '').split(',');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

/** cêntimos -> "1234,56" (para preencher inputs de edição). */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

/** Só apresentação. */
export function formatCents(cents: number | null): string {
  return cents === null ? '—' : eur.format(cents / 100);
}

const pctFmt = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatBp(bp: number | null): string {
  return bp === null ? '—' : `${pctFmt.format(bp / 100)} %`;
}
