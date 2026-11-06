// "Data de negócio" = dia civil em Lisboa (não UTC). Timestamps de auditoria continuam em ISO UTC.
export const BUSINESS_TZ = 'Europe/Lisbon';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD no fuso de negócio. */
export function businessDate(instant: Date = new Date()): string {
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
