// Equipa de uma pessoa ou projeto para mostrar em tabelas. Quem é de um departamento (manager) não tem equipa.
export function teamLabel(x: { teamId: number | null; departmentId?: number | null }, teamName: Map<number, string>): string {
  if (x.teamId !== null) return teamName.get(x.teamId) ?? '—';
  return x.departmentId !== undefined && x.departmentId !== null ? 'Department' : '—';
}
