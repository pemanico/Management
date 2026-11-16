import { businessDate } from '../shared/dates.ts';
import {
  CONSULTANT_KINDS,
  type ConsultantKind,
  EVALUATION_STATUSES,
  OBJECTIVE_STATUSES,
  PERIOD_RE,
  PRIORITIES,
  PROJECT_STATUSES,
  SENIORITIES,
  STATUSES,
  TRAINING_KINDS,
  TRAINING_STATUSES,
  type ConsultantInput,
  type EvaluationInput,
  type EvaluationStatus,
  type ObjectiveInput,
  type ObjectiveStatus,
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
  type DepartmentInput,
  type ProfileInput,
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

/** Headcount em FTE: número ≥ 0 com no máximo 2 casas decimais (ex.: 2.5). */
function fteIn(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000) return null;
  const c = Math.round(v * 100);
  return Math.abs(v * 100 - c) < 1e-6 ? c / 100 : null;
}

export function parseTeam(body: unknown): Result<TeamInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const name = text(body.name, 80);
  const budgetCents = intIn(body.budgetCents, 0, MAX_CENTS);
  const actualCents = intIn(body.actualCents, 0, MAX_CENTS);
  const plannedInternalHeadcount = fteIn(body.plannedInternalHeadcount);
  const plannedExternalHeadcount = fteIn(body.plannedExternalHeadcount);
  if (name === null) return { ok: false, error: 'Invalid team name (1–80 characters).' };
  if (budgetCents === null) return { ok: false, error: 'Invalid budget.' };
  if (actualCents === null) return { ok: false, error: 'Invalid actual spend.' };
  if (plannedInternalHeadcount === null) return { ok: false, error: 'Invalid budgeted internal headcount.' };
  if (plannedExternalHeadcount === null) return { ok: false, error: 'Invalid budgeted external headcount.' };
  const departmentId = isBlank(body.departmentId) ? null : intIn(body.departmentId, 1, Number.MAX_SAFE_INTEGER);
  if (departmentId === null && !isBlank(body.departmentId)) return { ok: false, error: 'Invalid department.' };
  return {
    ok: true,
    value: { name, departmentId, budgetCents, actualCents, plannedInternalHeadcount, plannedExternalHeadcount },
  };
}

// Campo opcional vazio: null, undefined ou string vazia.
const isBlank = (v: unknown) => v === null || v === undefined || v === '';

export function parseProfile(body: unknown): Result<ProfileInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const name = text(body.name, 60);
  if (name === null) return { ok: false, error: 'Invalid profile name (1–60 characters).' };
  return { ok: true, value: { name } };
}

export function parseDepartment(body: unknown): Result<DepartmentInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const name = text(body.name, 80);
  if (name === null) return { ok: false, error: 'Invalid department name (1–80 characters).' };
  return { ok: true, value: { name } };
}

export function parseConsultant(body: unknown): Result<ConsultantInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(code))
    return { ok: false, error: 'Invalid code: use a code (e.g. C001), 1–20 characters, no spaces.' };
  // Ou equipa (e outras equipas em fração) ou departamento (manager): nunca os dois.
  const ofDepartment = !isBlank(body.departmentId);
  let teamId: number | null = null;
  let departmentId: number | null = null;
  if (ofDepartment) {
    departmentId = intIn(body.departmentId, 1, Number.MAX_SAFE_INTEGER);
    if (departmentId === null) return { ok: false, error: 'Invalid department.' };
    if (!isBlank(body.teamId)) return { ok: false, error: 'Choose a team or a department, not both.' };
    if (Array.isArray(body.extraTeams) && body.extraTeams.length > 0)
      return { ok: false, error: 'A department member counts across all its teams and cannot have other teams.' };
  } else {
    teamId = intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER);
    if (teamId === null) return { ok: false, error: 'Choose a team or a department.' };
  }
  const profile = text(body.profile, 60);
  if (profile === null) return { ok: false, error: 'Invalid profile (1–60 characters).' };
  if (!SENIORITIES.includes(body.seniority as Seniority))
    return { ok: false, error: 'Invalid seniority.' };
  if (!STATUSES.includes(body.status as Status)) return { ok: false, error: 'Invalid status.' };
  if (!CONSULTANT_KINDS.includes(body.kind as ConsultantKind))
    return { ok: false, error: 'Invalid type: internal or external.' };
  const external = body.kind === 'external';
  // Internos: a app não guarda rate nem salário, mesmo que venham no pedido.
  let cost: number | null = 0;
  if (external) {
    cost = intIn(body.costRateCentsPerDay, 1, MAX_CENTS);
    if (cost === null) return { ok: false, error: 'An external consultant needs a rate above zero.' };
  }
  let supplier: string | null = null;
  if (external) {
    supplier = text(body.supplier, 60);
    if (supplier === null) return { ok: false, error: 'An external consultant needs a supplier (1–60 characters).' };
  }
  // Outras equipas (opcional): frações 1–99, sem repetir nem incluir a principal; a principal fica com o resto (≥ 1 %).
  const extraTeams: { teamId: number; pct: number }[] = [];
  if (body.extraTeams !== undefined && body.extraTeams !== null) {
    if (!Array.isArray(body.extraTeams) || body.extraTeams.length > 50)
      return { ok: false, error: 'Invalid team split.' };
    for (const x of body.extraTeams as unknown[]) {
      if (!isRecord(x)) return { ok: false, error: 'Invalid team split.' };
      const tid = intIn(x.teamId, 1, Number.MAX_SAFE_INTEGER);
      const pct = intIn(x.pct, 1, 99);
      if (tid === null || pct === null) return { ok: false, error: 'Each additional team needs a percentage from 1 to 99.' };
      if (tid === teamId) return { ok: false, error: 'The main team cannot also be listed in the other teams.' };
      if (extraTeams.some((e) => e.teamId === tid)) return { ok: false, error: 'A team is repeated in the split.' };
      extraTeams.push({ teamId: tid, pct });
    }
    if (extraTeams.reduce((a, e) => a + e.pct, 0) > 99)
      return { ok: false, error: 'The other teams add up to 100 % or more: the main team must keep at least 1 %.' };
  }
  let contractEnd: string | null = null;
  if (body.contractEnd !== null && body.contractEnd !== undefined && body.contractEnd !== '') {
    if (typeof body.contractEnd !== 'string' || !isIsoDate(body.contractEnd))
      return { ok: false, error: 'Invalid contract end date.' };
    contractEnd = body.contractEnd;
  }
  return {
    ok: true,
    value: {
      code,
      teamId,
      departmentId,
      extraTeams,
      profile,
      seniority: body.seniority as Seniority,
      kind: body.kind as ConsultantKind,
      costRateCentsPerDay: cost,
      supplier,
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
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const name = text(body.name, 100);
  if (name === null) return { ok: false, error: 'Invalid project name (1–100 characters).' };
  const description = isBlank(body.description) ? null : text(body.description, 500);
  if (description === null && !isBlank(body.description))
    return { ok: false, error: 'Invalid description (max. 500 characters).' };
  const teamId = intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER);
  if (teamId === null) return { ok: false, error: 'Invalid team.' };
  if (!PROJECT_STATUSES.includes(body.status as ProjectStatus))
    return { ok: false, error: 'Invalid project status.' };
  const start = optDate(body.startDate);
  const end = optDate(body.endDate);
  if (!start.ok) return { ok: false, error: 'Invalid start date.' };
  if (!end.ok) return { ok: false, error: 'Invalid end date.' };
  if (start.value !== null && end.value !== null && end.value < start.value)
    return { ok: false, error: 'The end date cannot be before the start date.' };
  const budgetCents = intIn(body.budgetCents, 0, MAX_CENTS);
  if (budgetCents === null) return { ok: false, error: 'Invalid project budget.' };
  if (!PRIORITIES.includes(body.priority as Priority)) return { ok: false, error: 'Invalid priority.' };
  const plannedHeadcount = intIn(body.plannedHeadcount, 0, 10_000);
  if (plannedHeadcount === null) return { ok: false, error: 'Invalid project headcount.' };
  return {
    ok: true,
    value: {
      name,
      description,
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
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const projectId = intIn(body.projectId, 1, Number.MAX_SAFE_INTEGER);
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  if (projectId === null) return { ok: false, error: 'Invalid project.' };
  if (consultantId === null) return { ok: false, error: 'Invalid consultant.' };
  const allocationPct = intIn(body.allocationPct, 1, 100);
  if (allocationPct === null) return { ok: false, error: 'Invalid allocation (1–100 %).' };
  return { ok: true, value: { projectId, consultantId, allocationPct } };
}

export function parseSkill(body: unknown): Result<SkillInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const name = text(body.name, 60);
  if (name === null) return { ok: false, error: 'Invalid skill name (1–60 characters).' };
  let category: string | null = null;
  if (body.category !== null && body.category !== undefined && body.category !== '') {
    category = text(body.category, 40);
    if (category === null) return { ok: false, error: 'Invalid category (max. 40 characters).' };
  }
  return { ok: true, value: { name, category } };
}

export function parseRating(body: unknown, today = businessDate()): Result<RatingInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  const skillId = intIn(body.skillId, 1, Number.MAX_SAFE_INTEGER);
  if (consultantId === null) return { ok: false, error: 'Invalid consultant.' };
  if (skillId === null) return { ok: false, error: 'Invalid skill.' };
  const level = intIn(body.level, 0, 4);
  if (level === null) return { ok: false, error: 'Invalid level (0–4).' };
  if (typeof body.validated !== 'boolean') return { ok: false, error: 'Say whether the assessment is validated.' };
  let evidence: string | null = null;
  if (body.evidence !== null && body.evidence !== undefined && body.evidence !== '') {
    evidence = text(body.evidence, 200);
    if (evidence === null) return { ok: false, error: 'Invalid evidence (max. 200 characters).' };
  }
  if (body.validated && evidence === null)
    return { ok: false, error: 'A validated assessment needs evidence (project, certification, delivery).' };
  if (typeof body.assessedAt !== 'string' || !isIsoDate(body.assessedAt))
    return { ok: false, error: 'Invalid date.' };
  if (body.assessedAt > today) return { ok: false, error: 'The date cannot be in the future.' };
  return {
    ok: true,
    value: { consultantId, skillId, level, validated: body.validated, evidence, assessedAt: body.assessedAt },
  };
}

export function parseRequirement(body: unknown): Result<RequirementInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const teamId = intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER);
  const skillId = intIn(body.skillId, 1, Number.MAX_SAFE_INTEGER);
  if (teamId === null) return { ok: false, error: 'Invalid team.' };
  if (skillId === null) return { ok: false, error: 'Invalid skill.' };
  const requiredLevel = intIn(body.requiredLevel, 1, 4);
  if (requiredLevel === null) return { ok: false, error: 'Invalid required level (1–4).' };
  const minPeople = intIn(body.minPeople, 1, 1000);
  if (minPeople === null) return { ok: false, error: 'Invalid minimum people (≥ 1).' };
  return { ok: true, value: { teamId, skillId, requiredLevel, minPeople } };
}

export function parseTraining(body: unknown): Result<TrainingInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  const skillId = intIn(body.skillId, 1, Number.MAX_SAFE_INTEGER);
  if (consultantId === null) return { ok: false, error: 'Invalid consultant.' };
  if (skillId === null) return { ok: false, error: 'Invalid skill.' };
  const targetLevel = intIn(body.targetLevel, 1, 4);
  if (targetLevel === null) return { ok: false, error: 'Invalid target level (1–4).' };
  if (!TRAINING_KINDS.includes(body.kind as TrainingKind)) return { ok: false, error: 'Invalid training type.' };
  const title = text(body.title, 100);
  if (title === null) return { ok: false, error: 'Invalid title (1–100 characters).' };
  if (!TRAINING_STATUSES.includes(body.status as TrainingStatus))
    return { ok: false, error: 'Invalid training status.' };
  const due = optDate(body.dueDate);
  if (!due.ok) return { ok: false, error: 'Invalid due date.' };
  const costCents = intIn(body.costCents ?? 0, 0, MAX_CENTS);
  if (costCents === null) return { ok: false, error: 'Invalid cost.' };
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

export function parseObjective(body: unknown): Result<ObjectiveInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const hasC = body.consultantId !== null && body.consultantId !== undefined;
  const hasT = body.teamId !== null && body.teamId !== undefined;
  if (hasC === hasT) return { ok: false, error: 'Choose a consultant OR a team for the objective.' };
  const consultantId = hasC ? intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER) : null;
  const teamId = hasT ? intIn(body.teamId, 1, Number.MAX_SAFE_INTEGER) : null;
  if (hasC && consultantId === null) return { ok: false, error: 'Invalid consultant.' };
  if (hasT && teamId === null) return { ok: false, error: 'Invalid team.' };
  const title = text(body.title, 140);
  if (title === null) return { ok: false, error: 'Invalid objective title (1–140 characters).' };
  if (typeof body.period !== 'string' || !PERIOD_RE.test(body.period))
    return { ok: false, error: 'Invalid period. Use 2026, 2026-H1 or 2026-H2.' };
  if (!OBJECTIVE_STATUSES.includes(body.status as ObjectiveStatus))
    return { ok: false, error: 'Invalid objective status.' };
  const progressPct = intIn(body.progressPct, 0, 100);
  if (progressPct === null) return { ok: false, error: 'Invalid progress (0–100 %).' };
  if (body.status === 'achieved' && progressPct !== 100)
    return { ok: false, error: 'An achieved objective must be at 100 % progress.' };
  const due = optDate(body.dueDate);
  if (!due.ok) return { ok: false, error: 'Invalid due date.' };
  return {
    ok: true,
    value: {
      consultantId,
      teamId,
      title,
      period: body.period,
      status: body.status as ObjectiveStatus,
      progressPct,
      dueDate: due.value,
    },
  };
}

export function parseEvaluation(body: unknown, today = businessDate()): Result<EvaluationInput> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid request.' };
  const consultantId = intIn(body.consultantId, 1, Number.MAX_SAFE_INTEGER);
  if (consultantId === null) return { ok: false, error: 'Invalid consultant.' };
  if (typeof body.period !== 'string' || !PERIOD_RE.test(body.period))
    return { ok: false, error: 'Invalid period. Use 2026, 2026-H1 or 2026-H2.' };
  const rating = intIn(body.rating, 1, 4);
  if (rating === null) return { ok: false, error: 'Invalid rating (1–4).' };
  if (!EVALUATION_STATUSES.includes(body.status as EvaluationStatus))
    return { ok: false, error: 'Invalid evaluation status.' };
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (summary.length > 500) return { ok: false, error: 'Summary too long (max. 500 characters).' };
  if (body.status === 'final' && summary === '')
    return { ok: false, error: 'A final evaluation needs a summary with the supporting evidence.' };
  if (typeof body.evaluatedAt !== 'string' || !isIsoDate(body.evaluatedAt))
    return { ok: false, error: 'Invalid date.' };
  if (body.evaluatedAt > today) return { ok: false, error: 'The date cannot be in the future.' };
  return {
    ok: true,
    value: { consultantId, period: body.period, rating, summary, status: body.status as EvaluationStatus, evaluatedAt: body.evaluatedAt },
  };
}
