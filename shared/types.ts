// Tipos partilhados entre servidor e cliente.
// Todos os montantes são inteiros em cêntimos de EUR (nunca float).

export const SENIORITIES = ['junior', 'pleno', 'senior', 'lead'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const STATUSES = ['active', 'inactive'] as const;
export type Status = (typeof STATUSES)[number];

export const PROJECT_STATUSES = ['planned', 'active', 'at_risk', 'on_hold', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type TeamInput = {
  name: string;
  budgetCents: number;
  actualCents: number;
  plannedHeadcount: number;
};

export type Team = TeamInput & { id: number; updatedAt: string };

export type ConsultantInput = {
  code: string; // código pseudónimo (ex.: C001), nunca o nome real
  teamId: number;
  profile: string;
  seniority: Seniority;
  costRateCentsPerDay: number;
  billRateCentsPerDay: number | null;
  contractEnd: string | null; // YYYY-MM-DD
  status: Status;
};

export type Consultant = ConsultantInput & { id: number; updatedAt: string };

export type ProjectInput = {
  name: string;
  teamId: number;
  status: ProjectStatus;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  budgetCents: number; // opcional: 0 = sem budget em dinheiro
  priority: Priority;
  plannedHeadcount: number; // HC de que o projeto precisa (0 = não definido)
};

export type Project = ProjectInput & { id: number; updatedAt: string };

export type AllocationInput = {
  projectId: number;
  consultantId: number;
  allocationPct: number; // 1–100: % do tempo do consultor neste projeto
};

export type Allocation = AllocationInput & { updatedAt: string };

export const SKILL_LEVELS = [0, 1, 2, 3, 4] as const;
export const SKILL_LEVEL_LABEL = [
  '0 · Sem conhecimento',
  '1 · Básico',
  '2 · Autónomo',
  '3 · Avançado',
  '4 · Referência / mentor',
] as const;

export type SkillInput = { name: string; category: string | null };
export type Skill = SkillInput & { id: number; updatedAt: string };

export type RatingInput = {
  consultantId: number;
  skillId: number;
  level: number; // 0–4
  validated: boolean; // validado pelo manager com evidência; false = autoavaliação
  evidence: string | null;
  assessedAt: string; // YYYY-MM-DD
};
export type Rating = RatingInput & { updatedAt: string };

export type RequirementInput = {
  teamId: number;
  skillId: number;
  requiredLevel: number; // 1–4
  minPeople: number; // nº mínimo de pessoas ativas com nível >= requiredLevel
};
export type Requirement = RequirementInput & { updatedAt: string };

export type Alert = {
  type:
    | 'budget_over_90'
    | 'vacancies'
    | 'over_headcount'
    | 'contract_expiring'
    | 'missing_bill_rate'
    | 'stale_data'
    | 'project_at_risk'
    | 'project_overdue'
    | 'projects_exceed_budget'
    | 'project_understaffed'
    | 'consultant_overallocated'
    | 'consultant_unallocated'
    | 'skill_gap'
    | 'skill_unvalidated'
    | 'skill_assessment_old';
  scope: string;
  message: string;
};

export type TeamSummary = {
  teamId: number;
  name: string;
  budgetCents: number;
  actualCents: number;
  remainingCents: number;
  utilisationBp: number | null; // pontos base (10000 = 100%)
  plannedHeadcount: number;
  activeHeadcount: number;
  headcountGap: number; // planeado - ativo
  avgCostRateCentsPerDay: number | null;
  avgBillRateCentsPerDay: number | null;
  marginBp: number | null;
  contractsExpiring90d: number;
  openProjects: number;
  unallocatedPeople: number; // ativos com 0% alocado
  overallocatedPeople: number; // ativos com mais de 100% alocado
  skillGaps: number;
};

export type ProjectSummary = {
  projectId: number;
  name: string;
  teamName: string;
  status: ProjectStatus;
  priority: Priority;
  endDate: string | null;
  budgetCents: number;
  plannedHeadcount: number;
  allocatedPeople: number;
  allocatedPct: number; // soma das alocações (100 = 1 FTE)
  gapPct: number; // max(0, plannedHeadcount*100 - allocatedPct)
};

export type ConsultantAllocation = {
  code: string;
  teamName: string;
  allocatedPct: number;
  projectCount: number;
};

export type SkillCoverage = {
  teamName: string;
  skill: string;
  requiredLevel: number;
  minPeople: number;
  qualified: number; // ativos com nível >= requiredLevel
  qualifiedValidated: number; // desses, com avaliação validada
  gap: number; // max(0, minPeople - qualified)
};

export type Summary = {
  generatedAt: string;
  currency: 'EUR';
  totals: {
    budgetCents: number;
    actualCents: number;
    plannedHeadcount: number;
    activeHeadcount: number;
    openProjects: number;
  };
  teams: TeamSummary[];
  projects: ProjectSummary[];
  allocations: ConsultantAllocation[];
  skills: {
    skillCount: number;
    ratingCount: number;
    validatedRatioBp: number | null;
    coverage: SkillCoverage[];
  };
  alerts: Alert[];
};
