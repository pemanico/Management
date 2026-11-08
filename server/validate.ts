import { businessDate } from '../shared/dates.ts';
import {
  PRIORITIES,
  PROJECT_STATUSES,
  SENIORITIES,
  STATUSES,
  TRAINING_KINDS,
  TRAINING_STATUSES,
  type ConsultantInput,
  type Priority,
  type ProjectInput,
  type ProjectStatus,
  type RatingInput,
  type RequirementInput,
  type SkillInput,
  type Seniority,
  type Status,
  type AllocationInput,
  type TeamInput,
  type TrainingInput,
  type TrainingKind,
  type TrainingStatus,
} from '../shared/types.ts';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_CENTS = 10_000_000_000_00; // 10 mil milhões de EUR, limite de sanidade

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function parseTeam(body: unknown): Result<TeamInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const name = text(body.name, 80);
  const budgetCents = intIn(body.budgetCents, 0, MAX_CENTS);
  const actualCents = intIn(body.actualCents, 0, MAX_CENTS);
  const plannedHeadcount = intIn(body.plannedHeadcount, 0, 10_000);
  if (name === null) return { ok: false, error: 'Nome da equipa inválido (1–80 caracteres).' };
  if (budgetCents === null) return { ok: false, error: 'Budget inválido.' };
  if (actualCents === null) return { ok: false, error: 'Gasto real inválido.' };
  if (plannedHeadcount === null) return { ok: false, error: 'Headcount planeado inválido.' };
  return { ok: true, value: { name, budgetCents, actualCents, plannedHeadcount } };
}

export function parseConsultant(body: unknown): Result<ConsultantInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(code))
    return { ok: false, error: 'Código inválido: usa um código (ex.: C001), 1–20 caracteres, sem espaços.' };
  const teamId = intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER);
  if (teamId === null) return { ok: false, error: 'Equipa inválida.' };
  const profile = text(body.profile, 60);
  if (profile === null) return { ok: false, error: 'Perfil inválido (1–60 caracteres).' };
  if (!SENIORITIES.includes(body.seniority as Seniority))
    return { ok: false, error: 'Senioridade inválida.' };
  if (!STATUSES.includes(body.status as Status)) return { ok: false, error: 'Estado inválido.' };
  const cost = intIn(body.costRateCentsPerDay, 0, MAX_CENTS);
  if (cost === null) return { ok: false, error: 'Rate paga inválida.' };
  let bill: number | null = null;
  if (body.billRateCentsPerDay !== null && body.billRateCentsPerDay !== undefined) {
    bill = intIn(body.billRateCentsPerDay, 0, MAX_CENTS);
    if (bill === null) return { ok: false, error: 'Rate faturada inválida.' };
  }
  let contractEnd: string | null = null;
  if (body.contractEnd !== null && body.contractEnd !== undefined && body.contractEnd !== '') {
    if (typeof body.contractEnd !== 'string' || !isIsoDate(body.contractEnd))
      return { ok: false, error: 'Data de fim de contrato inválida.' };
    contractEnd = body.contractEnd;
  }
  return {
    ok: true,
    value: {
      code,
      teamId,
      profile,
      seniority: body.seniority as Seniority,
      costRateCentsPerDay: cost,
      billRateCentsPerDay: bill,
      contractEnd,
      status: body.status as Status,
    },
  };
}

function optDate(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || !isIsoDate(v)) return { ok: false };
  return { ok: true, value: v };
}

export function parseProject(body: unknown): Result<ProjectInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const name = text(body.name, 100);
  if (name === null) return { ok: false, error: 'Nome do projeto inválido (1–100 caracteres).' };
  const teamId = intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER);
  if (teamId === null) return { ok: false, error: 'Equipa inválida.' };
  if (!PROJECT_STATUSES.includes(body.status as ProjectStatus))
    return { ok: false, error: 'Estado do projeto inválido.' };
  const start = optDate(body.startDate);
  const end = optDate(body.endDate);
  if (!start.ok) return { ok: false, error: 'Data de início inválida.' };
  if (!end.ok) return { ok: false, error: 'Data de fim inválida.' };
  if (start.value !== null && end.value !== null && end.value < start.value)
    return { ok: false, error: 'A data de fim não pode ser anterior à de início.' };
  const budgetCents = intIn(body.budgetCents, 0, MAX_CENTS);
  if (budgetCents === null) return { ok: false, error: 'Budget do projeto inválido.' };
  if (!PRIORITIES.includes(body.priority as Priority)) return { ok: false, error: 'Prioridade inválida.' };
  const plannedHeadcount = intIn(body.plannedHeadcount, 0, 10_000);
  if (plannedHeadcount === null) return { ok: false, error: 'Headcount do projeto inválido.' };
  return {
    ok: true,
    value: {
      name,
      teamId,
      status: body.status as ProjectStatus,
      startDate: start.value,
      endDate: end.value,
      budgetCents,
      priority: body.priority as Priority,
      plannedHeadcount,
    },
  };
}

export function parseAllocation(body: unknown): Result<AllocationInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const projectId = intIn(body.projectId, 1, Number.MAX_SAFE_INTEGER);
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  if (projectId === null) return { ok: false, error: 'Projeto inválido.' };
  if (consultantId === null) return { ok: false, error: 'Consultor inválido.' };
  const allocationPct = intIn(body.allocationPct, 1, 100);
  if (allocationPct === null) return { ok: false, error: 'Alocação inválida (1–100 %).' };
  return { ok: true, value: { projectId, consultantId, allocationPct } };
}

export function parseSkill(body: unknown): Result<SkillInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const name = text(body.name, 60);
  if (name === null) return { ok: false, error: 'Nome da competência inválido (1–60 caracteres).' };
  let category: string | null = null;
  if (body.category !== null && body.category !== undefined && body.category !== '') {
    category = text(body.category, 40);
    if (category === null) return { ok: false, error: 'Categoria inválida (máx. 40 caracteres).' };
  }
  return { ok: true, value: { name, category } };
}

export function parseRating(body: unknown, today = businessDate()): Result<RatingInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  const skillId = intIn(body.skillId, 1, Number.MAX_SAFE_INTEGER);
  if (consultantId === null) return { ok: false, error: 'Consultor inválido.' };
  if (skillId === null) return { ok: false, error: 'Competência inválida.' };
  const level = intIn(body.level, 0, 4);
  if (level === null) return { ok: false, error: 'Nível inválido (0–4).' };
  if (typeof body.validated !== 'boolean') return { ok: false, error: 'Indica se a avaliação está validada.' };
  let evidence: string | null = null;
  if (body.evidence !== null && body.evidence !== undefined && body.evidence !== '') {
    evidence = text(body.evidence, 200);
    if (evidence === null) return { ok: false, error: 'Evidência inválida (máx. 200 caracteres).' };
  }
  if (body.validated && evidence === null)
    return { ok: false, error: 'Uma avaliação validada precisa de evidência (projeto, certificação, entrega).' };
  if (typeof body.assessedAt !== 'string' || !isIsoDate(body.assessedAt))
    return { ok: false, error: 'Data da avaliação inválida.' };
  if (body.assessedAt > today) return { ok: false, error: 'A data da avaliação não pode ser futura.' };
  return {
    ok: true,
    value: { consultantId, skillId, level, validated: body.validated, evidence, assessedAt: body.assessedAt },
  };
}

export function parseRequirement(body: unknown): Result<RequirementInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const teamId = intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER);
  const skillId = intIn(body.skillId, 1, Number.MAX_SAFE_INTEGER);
  if (teamId === null) return { ok: false, error: 'Equipa inválida.' };
  if (skillId === null) return { ok: false, error: 'Competência inválida.' };
  const requiredLevel = intIn(body.requiredLevel, 1, 4);
  if (requiredLevel === null) return { ok: false, error: 'Nível exigido inválido (1–4).' };
  const minPeople = intIn(body.minPeople, 1, 1000);
  if (minPeople === null) return { ok: false, error: 'Mínimo de pessoas inválido (≥ 1).' };
  return { ok: true, value: { teamId, skillId, requiredLevel, minPeople } };
}

export function parseTraining(body: unknown): Result<TrainingInput> {
  if (!isRecord(body)) return { ok: false, error: 'Pedido inválido.' };
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  const skillId = intIn(body.skillId, 1, Number.MAX_SAFE_INTEGER);
  if (consultantId === null) return { ok: false, error: 'Consultor inválido.' };
  if (skillId === null) return { ok: false, error: 'Competência inválida.' };
  const targetLevel = intIn(body.targetLevel, 1, 4);
  if (targetLevel === null) return { ok: false, error: 'Nível alvo inválido (1–4).' };
  if (!TRAINING_KINDS.includes(body.kind as TrainingKind)) return { ok: false, error: 'Tipo de formação inválido.' };
  const title = text(body.title, 100);
  if (title === null) return { ok: false, error: 'Título inválido (1–100 caracteres).' };
  if (!TRAINING_STATUSES.includes(body.status as TrainingStatus))
    return { ok: false, error: 'Estado da formação inválido.' };
  const due = optDate(body.dueDate);
  if (!due.ok) return { ok: false, error: 'Data limite inválida.' };
  const costCents = intIn(body.costCents ?? 0, 0, MAX_CENTS);
  if (costCents === null) return { ok: false, error: 'Custo inválido.' };
  return {
    ok: true,
    value: {
      consultantId,
      skillId,
      targetLevel,
      kind: body.kind as TrainingKind,
      title,
      status: body.status as TrainingStatus,
      dueDate: due.value,
      costCents,
    },
  };
}
