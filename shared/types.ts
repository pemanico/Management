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

export const CONSULTANT_KINDS = ['internal', 'external'] as const;
export type ConsultantKind = (typeof CONSULTANT_KINDS)[number];

export type ConsultantInput = {
  code: string; // código pseudónimo (ex.: C001), nunca o nome real
  teamId: number;
  profile: string;
  seniority: Seniority;
  kind: ConsultantKind; // interno (sem rate nem salário registados) ou externo (com rate)
  costRateCentsPerDay: number; // só externos; 0 nos internos = não aplicável
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

export const TRAINING_KINDS = ['course', 'certification', 'mentoring', 'on_the_job'] as const;
export type TrainingKind = (typeof TRAINING_KINDS)[number];

export const TRAINING_STATUSES = ['planned', 'in_progress', 'done', 'cancelled'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export type TrainingInput = {
  consultantId: number;
  skillId: number;
  targetLevel: number; // 1–4: nível que a formação deve levar o consultor a atingir
  kind: TrainingKind;
  title: string;
  status: TrainingStatus;
  dueDate: string | null; // YYYY-MM-DD
  costCents: number; // opcional: 0 = sem custo definido
};

export type Training = TrainingInput & { id: number; updatedAt: string };

export const OBJECTIVE_STATUSES = ['not_started', 'on_track', 'at_risk', 'achieved', 'missed'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const EVALUATION_STATUSES = ['draft', 'final'] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

/** Períodos: 'YYYY', 'YYYY-H1' ou 'YYYY-H2'. */
export const PERIOD_RE = /^\d{4}(-H[12])?$/;

export type ObjectiveInput = {
  consultantId: number | null; // exatamente um de consultantId / teamId
  teamId: number | null;
  title: string;
  period: string;
  status: ObjectiveStatus;
  progressPct: number; // 0–100
  dueDate: string | null; // YYYY-MM-DD
};
export type Objective = ObjectiveInput & { id: number; updatedAt: string };

export type EvaluationInput = {
  consultantId: number;
  period: string;
  rating: number; // 1–4, atribuído SEMPRE por uma pessoa (a app nunca o calcula)
  summary: string; // evidência e justificação (obrigatória se final)
  status: EvaluationStatus;
  evaluatedAt: string; // YYYY-MM-DD
};
export type Evaluation = EvaluationInput & { id: number; updatedAt: string };

export type Alert = {
  type:
    | 'budget_over_90'
    | 'vacancies'
    | 'over_headcount'
    | 'contract_expiring'
    | 'missing_cost_rate'
    | 'stale_data'
    | 'project_at_risk'
    | 'project_overdue'
    | 'projects_exceed_budget'
    | 'project_understaffed'
    | 'consultant_overallocated'
    | 'consultant_unallocated'
    | 'skill_gap'
    | 'skill_unvalidated'
    | 'skill_assessment_old'
    | 'training_overdue'
    | 'training_gap_uncovered'
    | 'objective_at_risk'
    | 'objective_overdue'
    | 'consultant_without_objectives'
    | 'evaluation_pending';
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
  internalHeadcount: number;
  externalHeadcount: number;
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
  inTraining: number; // não qualificados com formação planeada/em curso que atinge o nível exigido
  gapAfterTraining: number; // max(0, gap - inTraining)
};

export type Summary = {
  generatedAt: string;
  currency: 'EUR';
  totals: {
    budgetCents: number;
    actualCents: number;
    plannedHeadcount: number;
    activeHeadcount: number;
    internalHeadcount: number;
    externalHeadcount: number;
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
  // Só agregados: nunca expõe objetivos nem notas individuais.
  objectives: {
    year: string;
    total: number;
    achieved: number;
    onTrack: number;
    atRisk: number;
    missed: number;
    notStarted: number;
    overdue: number;
    avgProgressBp: number | null;
    byTeam: { teamName: string; total: number; achieved: number; atRisk: number; overdue: number; avgProgressBp: number | null }[];
  };
  evaluations: { year: string; finalCount: number; draftCount: number; missingCount: number };
  training: {
    openCount: number; // planeadas + em curso
    overdueCount: number;
    openCostCents: number; // 0 = sem custos definidos
  };
  alerts: Alert[];
};
