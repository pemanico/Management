// CSV com proteção contra CSV injection (células a começar por = + - @ ou tab/CR).
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

// Cêntimos -> "1234,56" sem passar por float.
export function centsToDecimal(cents: number | null): string | null {
  if (cents === null) return null;
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
