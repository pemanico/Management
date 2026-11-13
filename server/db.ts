import { DatabaseSync } from 'node:sqlite';
import type {
  Allocation,
  Evaluation,
  EvaluationInput,
  Objective,
  ObjectiveInput,
  AllocationInput,
  Consultant,
  Rating,
  RatingInput,
  Requirement,
  RequirementInput,
  Skill,
  SkillInput,
  ConsultantInput,
  Project,
  ProjectInput,
  Team,
  TeamInput,
  Training,
  TrainingInput,
} from '../shared/types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 0),
  actual_cents INTEGER NOT NULL CHECK (actual_cents >= 0),
  planned_headcount INTEGER NOT NULL CHECK (planned_headcount >= 0),
  planned_external_headcount INTEGER NOT NULL DEFAULT 0 CHECK (planned_external_headcount >= 0),
  planned_internal_c INTEGER NOT NULL DEFAULT 0 CHECK (planned_internal_c >= 0),
  planned_external_c INTEGER NOT NULL DEFAULT 0 CHECK (planned_external_c >= 0),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  profile TEXT NOT NULL,
  seniority TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'external',
  supplier TEXT,
  cost_rate_cents_per_day INTEGER NOT NULL CHECK (cost_rate_cents_per_day >= 0),
  bill_rate_cents_per_day INTEGER CHECK (bill_rate_cents_per_day IS NULL OR bill_rate_cents_per_day >= 0),
  contract_end TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultant_teams (
  consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  pct INTEGER NOT NULL CHECK (pct BETWEEN 1 AND 99),
  PRIMARY KEY (consultant_id, team_id)
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 0),
  priority TEXT NOT NULL DEFAULT 'medium',
  planned_headcount INTEGER NOT NULL DEFAULT 0 CHECK (planned_headcount >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE (team_id, name)
);
CREATE TABLE IF NOT EXISTS allocations (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  allocation_pct INTEGER NOT NULL CHECK (allocation_pct BETWEEN 1 AND 100),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, consultant_id)
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ratings (
  consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 4),
  validated INTEGER NOT NULL CHECK (validated IN (0, 1)),
  evidence TEXT,
  assessed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (consultant_id, skill_id)
);
CREATE TABLE IF NOT EXISTS objectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultant_id INTEGER REFERENCES consultants(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL CHECK (progress_pct BETWEEN 0 AND 100),
  due_date TEXT,
  updated_at TEXT NOT NULL,
  CHECK ((consultant_id IS NULL) <> (team_id IS NULL))
);
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (consultant_id, period)
);
CREATE TABLE IF NOT EXISTS trainings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  target_level INTEGER NOT NULL CHECK (target_level BETWEEN 1 AND 4),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requirements (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 4),
  min_people INTEGER NOT NULL CHECK (min_people >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, skill_id)
);
`;

const SKILL_SELECT = `SELECT id, name, category, updated_at AS updatedAt FROM skills`;

const RATING_SELECT = `SELECT consultant_id AS consultantId, skill_id AS skillId, level, validated,
  evidence, assessed_at AS assessedAt, updated_at AS updatedAt FROM ratings`;

const OBJECTIVE_SELECT = `SELECT id, consultant_id AS consultantId, team_id AS teamId, title, period, status,
  progress_pct AS progressPct, due_date AS dueDate, updated_at AS updatedAt FROM objectives`;

const EVALUATION_SELECT = `SELECT id, consultant_id AS consultantId, period, rating, summary, status,
  evaluated_at AS evaluatedAt, updated_at AS updatedAt FROM evaluations`;

const TRAINING_SELECT = `SELECT id, consultant_id AS consultantId, skill_id AS skillId,
  target_level AS targetLevel, kind, title, status, due_date AS dueDate, cost_cents AS costCents,
  updated_at AS updatedAt FROM trainings`;

const REQ_SELECT = `SELECT team_id AS teamId, skill_id AS skillId, required_level AS requiredLevel,
  min_people AS minPeople, updated_at AS updatedAt FROM requirements`;

type RatingRow = Omit<Rating, 'validated'> & { validated: number };
const toRating = (r: RatingRow): Rating => ({ ...r, validated: r.validated === 1 });

const PROJECT_SELECT = `SELECT id, name, team_id AS teamId, status, start_date AS startDate,
  end_date AS endDate, budget_cents AS budgetCents, priority,
  planned_headcount AS plannedHeadcount, updated_at AS updatedAt FROM projects`;

const ALLOCATION_SELECT = `SELECT project_id AS projectId, consultant_id AS consultantId,
  allocation_pct AS allocationPct, updated_at AS updatedAt FROM allocations`;

const TEAM_SELECT = `SELECT id, name, budget_cents AS budgetCents, actual_cents AS actualCents,
  (planned_internal_c + planned_external_c) / 100.0 AS plannedHeadcount,
  planned_internal_c / 100.0 AS plannedInternalHeadcount,
  planned_external_c / 100.0 AS plannedExternalHeadcount, updated_at AS updatedAt FROM teams`;

const CONSULTANT_SELECT = `SELECT id, code, team_id AS teamId, profile, seniority,
  kind, cost_rate_cents_per_day AS costRateCentsPerDay, supplier,
  contract_end AS contractEnd, status, updated_at AS updatedAt FROM consultants`;

export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Migração: bases criadas antes de existirem prioridade e HC por projeto.
  // Bases antigas: todos os consultores tinham rate, por isso passam a 'external'.
  const consultantCols = (db.prepare('PRAGMA table_info(consultants)').all() as { name: string }[]).map((c) => c.name);
  if (!consultantCols.includes('kind'))
    db.exec("ALTER TABLE consultants ADD COLUMN kind TEXT NOT NULL DEFAULT 'external'");
  if (!consultantCols.includes('supplier')) db.exec('ALTER TABLE consultants ADD COLUMN supplier TEXT');
  // Bases antigas: o headcount era um só número e todos os consultores migraram como externos,
  // por isso o budget existente passa a ser de externos (coerente; corrige-se em Equipas).
  const teamCols = (db.prepare('PRAGMA table_info(teams)').all() as { name: string }[]).map((c) => c.name);
  if (!teamCols.includes('planned_external_headcount')) {
    db.exec('ALTER TABLE teams ADD COLUMN planned_external_headcount INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE teams SET planned_external_headcount = planned_headcount');
  }
  // Headcount orçamentado passa a centésimos de FTE (colunas *_c); as colunas antigas ficam só por compatibilidade.
  const teamCols2 = (db.prepare('PRAGMA table_info(teams)').all() as { name: string }[]).map((c) => c.name);
  if (!teamCols2.includes('planned_internal_c')) {
    db.exec('ALTER TABLE teams ADD COLUMN planned_internal_c INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE teams ADD COLUMN planned_external_c INTEGER NOT NULL DEFAULT 0');
    db.exec(`UPDATE teams SET planned_internal_c = (planned_headcount - planned_external_headcount) * 100,
             planned_external_c = planned_external_headcount * 100`);
  }
  const projectCols = (db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map((c) => c.name);
  if (!projectCols.includes('priority'))
    db.exec("ALTER TABLE projects ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  if (!projectCols.includes('planned_headcount'))
    db.exec('ALTER TABLE projects ADD COLUMN planned_headcount INTEGER NOT NULL DEFAULT 0');
  const now = () => new Date().toISOString();
  // [total arredondado, externos arredondado (colunas antigas), internos em centésimos, externos em centésimos]
  const hc = (t: TeamInput) => {
    const i = Math.round(t.plannedInternalHeadcount * 100);
    const e = Math.round(t.plannedExternalHeadcount * 100);
    return [Math.round((i + e) / 100), Math.round(e / 100), i, e] as const;
  };
  type Row = Omit<Consultant, 'extraTeams'>;
  const withShares = (rows: Row[]): Consultant[] => {
    const shares = db
      .prepare('SELECT consultant_id AS consultantId, team_id AS teamId, pct FROM consultant_teams ORDER BY team_id')
      .all() as { consultantId: number; teamId: number; pct: number }[];
    return rows.map((r) => ({
      ...r,
      extraTeams: shares.filter((x) => x.consultantId === r.id).map(({ teamId, pct }) => ({ teamId, pct })),
    }));
  };
  const setShares = (id: number, c: ConsultantInput) => {
    db.prepare('DELETE FROM consultant_teams WHERE consultant_id = ?').run(id);
    const ins = db.prepare('INSERT INTO consultant_teams (consultant_id, team_id, pct) VALUES (?,?,?)');
    for (const x of c.extraTeams) ins.run(id, x.teamId, x.pct);
  };
  // Consultor + repartição gravados juntos ou nada.
  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    close: () => db.close(),

    listTeams: () => db.prepare(`${TEAM_SELECT} ORDER BY name`).all() as Team[],
    getTeam: (id: number) => db.prepare(`${TEAM_SELECT} WHERE id = ?`).get(id) as Team | undefined,
    createTeam: (t: TeamInput) => {
      const r = db
        .prepare(
          'INSERT INTO teams (name, budget_cents, actual_cents, planned_headcount, planned_external_headcount, planned_internal_c, planned_external_c, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(t.name, t.budgetCents, t.actualCents, ...hc(t), now());
      return Number(r.lastInsertRowid);
    },
    updateTeam: (id: number, t: TeamInput) =>
      Number(
        db
          .prepare(
            'UPDATE teams SET name=?, budget_cents=?, actual_cents=?, planned_headcount=?, planned_external_headcount=?, planned_internal_c=?, planned_external_c=?, updated_at=? WHERE id=?',
          )
          .run(t.name, t.budgetCents, t.actualCents, ...hc(t), now(), id).changes,
      ),
    deleteTeam: (id: number) => Number(db.prepare('DELETE FROM teams WHERE id=?').run(id).changes),

    listConsultants: () => withShares(db.prepare(`${CONSULTANT_SELECT} ORDER BY code`).all() as Row[]),
    getConsultant: (id: number) =>
      withShares(db.prepare(`${CONSULTANT_SELECT} WHERE id = ?`).all(id) as Row[])[0],
    createConsultant: (c: ConsultantInput) => tx(() => {
      const r = db
        .prepare(
          `INSERT INTO consultants (code, team_id, profile, seniority, kind, cost_rate_cents_per_day,
           supplier, contract_end, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          c.code,
          c.teamId,
          c.profile,
          c.seniority,
          c.kind,
          c.costRateCentsPerDay,
          c.supplier,
          c.contractEnd,
          c.status,
          now(),
        );
      const id = Number(r.lastInsertRowid);
      setShares(id, c);
      return id;
    }),
    updateConsultant: (id: number, c: ConsultantInput) => tx(() => {
      const changes = Number(
        db
          .prepare(
            `UPDATE consultants SET code=?, team_id=?, profile=?, seniority=?, kind=?, cost_rate_cents_per_day=?,
             supplier=?, contract_end=?, status=?, updated_at=? WHERE id=?`,
          )
          .run(
            c.code,
            c.teamId,
            c.profile,
            c.seniority,
            c.kind,
            c.costRateCentsPerDay,
            c.supplier,
            c.contractEnd,
            c.status,
            now(),
            id,
          ).changes,
      );
      if (changes > 0) setShares(id, c);
      return changes;
    }),
    deleteConsultant: (id: number) =>
      Number(db.prepare('DELETE FROM consultants WHERE id=?').run(id).changes),

    listProjects: () => db.prepare(`${PROJECT_SELECT} ORDER BY name`).all() as Project[],
    getProject: (id: number) =>
      db.prepare(`${PROJECT_SELECT} WHERE id = ?`).get(id) as Project | undefined,
    createProject: (p: ProjectInput) => {
      const r = db
        .prepare(
          `INSERT INTO projects (name, team_id, status, start_date, end_date, budget_cents, priority,
           planned_headcount, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(p.name, p.teamId, p.status, p.startDate, p.endDate, p.budgetCents, p.priority, p.plannedHeadcount, now());
      return Number(r.lastInsertRowid);
    },
    updateProject: (id: number, p: ProjectInput) =>
      Number(
        db
          .prepare(
            `UPDATE projects SET name=?, team_id=?, status=?, start_date=?, end_date=?, budget_cents=?,
             priority=?, planned_headcount=?, updated_at=? WHERE id=?`,
          )
          .run(p.name, p.teamId, p.status, p.startDate, p.endDate, p.budgetCents, p.priority, p.plannedHeadcount, now(), id)
          .changes,
      ),
    deleteProject: (id: number) =>
      Number(db.prepare('DELETE FROM projects WHERE id=?').run(id).changes),

    listAllocations: () =>
      db.prepare(`${ALLOCATION_SELECT} ORDER BY project_id, consultant_id`).all() as Allocation[],
    getAllocation: (projectId: number, consultantId: number) =>
      db
        .prepare(`${ALLOCATION_SELECT} WHERE project_id = ? AND consultant_id = ?`)
        .get(projectId, consultantId) as Allocation | undefined,
    upsertAllocation: (a: AllocationInput) => {
      db.prepare(
        `INSERT INTO allocations (project_id, consultant_id, allocation_pct, updated_at) VALUES (?,?,?,?)
         ON CONFLICT (project_id, consultant_id) DO UPDATE SET allocation_pct=excluded.allocation_pct,
           updated_at=excluded.updated_at`,
      ).run(a.projectId, a.consultantId, a.allocationPct, now());
    },
    deleteAllocation: (projectId: number, consultantId: number) =>
      Number(
        db.prepare('DELETE FROM allocations WHERE project_id=? AND consultant_id=?').run(projectId, consultantId)
          .changes,
      ),

    listSkills: () => db.prepare(`${SKILL_SELECT} ORDER BY name`).all() as Skill[],
    getSkill: (id: number) => db.prepare(`${SKILL_SELECT} WHERE id = ?`).get(id) as Skill | undefined,
    createSkill: (k: SkillInput) =>
      Number(
        db
          .prepare('INSERT INTO skills (name, category, updated_at) VALUES (?,?,?)')
          .run(k.name, k.category, now()).lastInsertRowid,
      ),
    updateSkill: (id: number, k: SkillInput) =>
      Number(
        db
          .prepare('UPDATE skills SET name=?, category=?, updated_at=? WHERE id=?')
          .run(k.name, k.category, now(), id).changes,
      ),
    deleteSkill: (id: number) => Number(db.prepare('DELETE FROM skills WHERE id=?').run(id).changes),

    listRatings: () =>
      (db.prepare(`${RATING_SELECT} ORDER BY consultant_id, skill_id`).all() as RatingRow[]).map(toRating),
    getRating: (consultantId: number, skillId: number) => {
      const r = db
        .prepare(`${RATING_SELECT} WHERE consultant_id = ? AND skill_id = ?`)
        .get(consultantId, skillId) as RatingRow | undefined;
      return r === undefined ? undefined : toRating(r);
    },
    upsertRating: (r: RatingInput) => {
      db.prepare(
        `INSERT INTO ratings (consultant_id, skill_id, level, validated, evidence, assessed_at, updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (consultant_id, skill_id) DO UPDATE SET level=excluded.level,
           validated=excluded.validated, evidence=excluded.evidence, assessed_at=excluded.assessed_at,
           updated_at=excluded.updated_at`,
      ).run(r.consultantId, r.skillId, r.level, r.validated ? 1 : 0, r.evidence, r.assessedAt, now());
    },
    deleteRating: (consultantId: number, skillId: number) =>
      Number(
        db.prepare('DELETE FROM ratings WHERE consultant_id=? AND skill_id=?').run(consultantId, skillId)
          .changes,
      ),

    listObjectives: () => db.prepare(`${OBJECTIVE_SELECT} ORDER BY period DESC, id`).all() as Objective[],
    getObjective: (id: number) =>
      db.prepare(`${OBJECTIVE_SELECT} WHERE id = ?`).get(id) as Objective | undefined,
    createObjective: (o: ObjectiveInput) =>
      Number(
        db
          .prepare(
            `INSERT INTO objectives (consultant_id, team_id, title, period, status, progress_pct, due_date, updated_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(o.consultantId, o.teamId, o.title, o.period, o.status, o.progressPct, o.dueDate, now()).lastInsertRowid,
      ),
    updateObjective: (id: number, o: ObjectiveInput) =>
      Number(
        db
          .prepare(
            `UPDATE objectives SET consultant_id=?, team_id=?, title=?, period=?, status=?, progress_pct=?,
             due_date=?, updated_at=? WHERE id=?`,
          )
          .run(o.consultantId, o.teamId, o.title, o.period, o.status, o.progressPct, o.dueDate, now(), id).changes,
      ),
    deleteObjective: (id: number) => Number(db.prepare('DELETE FROM objectives WHERE id=?').run(id).changes),

    listEvaluations: () => db.prepare(`${EVALUATION_SELECT} ORDER BY period DESC, id`).all() as Evaluation[],
    getEvaluation: (id: number) =>
      db.prepare(`${EVALUATION_SELECT} WHERE id = ?`).get(id) as Evaluation | undefined,
    createEvaluation: (e: EvaluationInput) =>
      Number(
        db
          .prepare(
            `INSERT INTO evaluations (consultant_id, period, rating, summary, status, evaluated_at, updated_at)
             VALUES (?,?,?,?,?,?,?)`,
          )
          .run(e.consultantId, e.period, e.rating, e.summary, e.status, e.evaluatedAt, now()).lastInsertRowid,
      ),
    updateEvaluation: (id: number, e: EvaluationInput) =>
      Number(
        db
          .prepare(
            `UPDATE evaluations SET consultant_id=?, period=?, rating=?, summary=?, status=?, evaluated_at=?,
             updated_at=? WHERE id=?`,
          )
          .run(e.consultantId, e.period, e.rating, e.summary, e.status, e.evaluatedAt, now(), id).changes,
      ),
    deleteEvaluation: (id: number) => Number(db.prepare('DELETE FROM evaluations WHERE id=?').run(id).changes),

    listTrainings: () => db.prepare(`${TRAINING_SELECT} ORDER BY id`).all() as Training[],
    getTraining: (id: number) =>
      db.prepare(`${TRAINING_SELECT} WHERE id = ?`).get(id) as Training | undefined,
    createTraining: (t: TrainingInput) =>
      Number(
        db
          .prepare(
            `INSERT INTO trainings (consultant_id, skill_id, target_level, kind, title, status, due_date,
             cost_cents, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .run(t.consultantId, t.skillId, t.targetLevel, t.kind, t.title, t.status, t.dueDate, t.costCents, now())
          .lastInsertRowid,
      ),
    updateTraining: (id: number, t: TrainingInput) =>
      Number(
        db
          .prepare(
            `UPDATE trainings SET consultant_id=?, skill_id=?, target_level=?, kind=?, title=?, status=?,
             due_date=?, cost_cents=?, updated_at=? WHERE id=?`,
          )
          .run(t.consultantId, t.skillId, t.targetLevel, t.kind, t.title, t.status, t.dueDate, t.costCents, now(), id)
          .changes,
      ),
    deleteTraining: (id: number) => Number(db.prepare('DELETE FROM trainings WHERE id=?').run(id).changes),

    listRequirements: () =>
      db.prepare(`${REQ_SELECT} ORDER BY team_id, skill_id`).all() as Requirement[],
    getRequirement: (teamId: number, skillId: number) =>
      db.prepare(`${REQ_SELECT} WHERE team_id = ? AND skill_id = ?`).get(teamId, skillId) as
        | Requirement
        | undefined,
    upsertRequirement: (r: RequirementInput) => {
      db.prepare(
        `INSERT INTO requirements (team_id, skill_id, required_level, min_people, updated_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT (team_id, skill_id) DO UPDATE SET required_level=excluded.required_level,
           min_people=excluded.min_people, updated_at=excluded.updated_at`,
      ).run(r.teamId, r.skillId, r.requiredLevel, r.minPeople, now());
    },
    deleteRequirement: (teamId: number, skillId: number) =>
      Number(
        db.prepare('DELETE FROM requirements WHERE team_id=? AND skill_id=?').run(teamId, skillId).changes,
      ),
  };
}

export type Db = ReturnType<typeof openDb>;
