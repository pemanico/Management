import type {
  Allocation,
  AllocationInput,
  Consultant,
  ConsultantInput,
  Evaluation,
  EvaluationInput,
  Objective,
  ObjectiveInput,
  Project,
  ProjectInput,
  Rating,
  RatingInput,
  Requirement,
  RequirementInput,
  Skill,
  SkillInput,
  Summary,
  Team,
  TeamInput,
  Training,
  TrainingInput,
} from '../shared/types.ts';

export class ApiError extends Error {}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Não foi possível contactar o servidor local. Está a correr (npm run server)?');
  }
  const ct = res.headers.get('content-type') ?? '';
  const data: unknown = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Ocorreu um erro. Tenta novamente.';
    throw new ApiError(msg);
  }
  return data as T;
}

export const api = {
  summary: () => request<Summary>('/summary'),
  teams: () => request<Team[]>('/teams'),
  consultants: () => request<Consultant[]>('/consultants'),
  saveTeam: (input: TeamInput, id?: number) =>
    id === undefined ? request<Team>('/teams', 'POST', input) : request<Team>(`/teams/${id}`, 'PUT', input),
  deleteTeam: (id: number) => request<{ ok: true }>(`/teams/${id}`, 'DELETE'),
  saveConsultant: (input: ConsultantInput, id?: number) =>
    id === undefined
      ? request<Consultant>('/consultants', 'POST', input)
      : request<Consultant>(`/consultants/${id}`, 'PUT', input),
  deleteConsultant: (id: number) => request<{ ok: true }>(`/consultants/${id}`, 'DELETE'),
  projects: () => request<Project[]>('/projects'),
  allocations: () => request<Allocation[]>('/allocations'),
  saveProject: (input: ProjectInput, id?: number) =>
    id === undefined
      ? request<Project>('/projects', 'POST', input)
      : request<Project>(`/projects/${id}`, 'PUT', input),
  deleteProject: (id: number) => request<{ ok: true }>(`/projects/${id}`, 'DELETE'),
  saveAllocation: (input: AllocationInput) => request<Allocation>('/allocations', 'PUT', input),
  deleteAllocation: (projectId: number, consultantId: number) =>
    request<{ ok: true }>(`/allocations/${projectId}/${consultantId}`, 'DELETE'),
  skills: () => request<Skill[]>('/skills'),
  ratings: () => request<Rating[]>('/ratings'),
  requirements: () => request<Requirement[]>('/requirements'),
  trainings: () => request<Training[]>('/trainings'),
  saveTraining: (input: TrainingInput, id?: number) =>
    id === undefined
      ? request<Training>('/trainings', 'POST', input)
      : request<Training>(`/trainings/${id}`, 'PUT', input),
  deleteTraining: (id: number) => request<{ ok: true }>(`/trainings/${id}`, 'DELETE'),
  objectives: () => request<Objective[]>('/objectives'),
  saveObjective: (input: ObjectiveInput, id?: number) =>
    id === undefined
      ? request<Objective>('/objectives', 'POST', input)
      : request<Objective>(`/objectives/${id}`, 'PUT', input),
  deleteObjective: (id: number) => request<{ ok: true }>(`/objectives/${id}`, 'DELETE'),
  evaluations: () => request<Evaluation[]>('/evaluations'),
  saveEvaluation: (input: EvaluationInput, id?: number) =>
    id === undefined
      ? request<Evaluation>('/evaluations', 'POST', input)
      : request<Evaluation>(`/evaluations/${id}`, 'PUT', input),
  deleteEvaluation: (id: number) => request<{ ok: true }>(`/evaluations/${id}`, 'DELETE'),
  saveSkill: (input: SkillInput, id?: number) =>
    id === undefined ? request<Skill>('/skills', 'POST', input) : request<Skill>(`/skills/${id}`, 'PUT', input),
  deleteSkill: (id: number) => request<{ ok: true }>(`/skills/${id}`, 'DELETE'),
  saveRating: (input: RatingInput) => request<Rating>('/ratings', 'PUT', input),
  deleteRating: (consultantId: number, skillId: number) =>
    request<{ ok: true }>(`/ratings/${consultantId}/${skillId}`, 'DELETE'),
  saveRequirement: (input: RequirementInput) => request<Requirement>('/requirements', 'PUT', input),
  deleteRequirement: (teamId: number, skillId: number) =>
    request<{ ok: true }>(`/requirements/${teamId}/${skillId}`, 'DELETE'),
};
