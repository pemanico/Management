import { DatabaseSync } from 'node:sqlite';
import type {
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
  Task,
  TaskInput,
  Team,
  TeamInput,
} from '../shared/types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 0),
  actual_cents INTEGER NOT NULL CHECK (actual_cents >= 0),
  planned_headcount INTEGER NOT NULL CHECK (planned_headcount >= 0),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  profile TEXT NOT NULL,
  seniority TEXT NOT NULL,
  cost_rate_cents_per_day INTEGER NOT NULL CHECK (cost_rate_cents_per_day >= 0),
  bill_rate_cents_per_day INTEGER CHECK (bill_rate_cents_per_day IS NULL OR bill_rate_cents_per_day >= 0),
  contract_end TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE (team_id, name)
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id INTEGER REFERENCES consultants(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  due_date TEXT,
  estimate_hours INTEGER CHECK (estimate_hours IS NULL OR estimate_hours >= 0),
  updated_at TEXT NOT NULL
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

const REQ_SELECT = `SELECT team_id AS teamId, skill_id AS skillId, required_level AS requiredLevel,
  min_people AS minPeople, updated_at AS updatedAt FROM requirements`;

type RatingRow = Omit<Rating, 'validated'> & { validated: number };
const toRating = (r: RatingRow): Rating => ({ ...r, validated: r.validated === 1 });

const PROJECT_SELECT = `SELECT id, name, team_id AS teamId, status, start_date AS startDate,
  end_date AS endDate, budget_cents AS budgetCents, updated_at AS updatedAt FROM projects`;

const TASK_SELECT = `SELECT id, project_id AS projectId, title, assignee_id AS assigneeId, status,
  priority, due_date AS dueDate, estimate_hours AS estimateHours, updated_at AS updatedAt FROM tasks`;

const TEAM_SELECT = `SELECT id, name, budget_cents AS budgetCents, actual_cents AS actualCents,
  planned_headcount AS plannedHeadcount, updated_at AS updatedAt FROM teams`;

const CONSULTANT_SELECT = `SELECT id, code, team_id AS teamId, profile, seniority,
  cost_rate_cents_per_day AS costRateCentsPerDay, bill_rate_cents_per_day AS billRateCentsPerDay,
  contract_end AS contractEnd, status, updated_at AS updatedAt FROM consultants`;

export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const now = () => new Date().toISOString();

  return {
    close: () => db.close(),

    listTeams: () => db.prepare(`${TEAM_SELECT} ORDER BY name`).all() as Team[],
    getTeam: (id: number) => db.prepare(`${TEAM_SELECT} WHERE id = ?`).get(id) as Team | undefined,
    createTeam: (t: TeamInput) => {
      const r = db
        .prepare(
          'INSERT INTO teams (name, budget_cents, actual_cents, planned_headcount, updated_at) VALUES (?,?,?,?,?)',
        )
        .run(t.name, t.budgetCents, t.actualCents, t.plannedHeadcount, now());
      return Number(r.lastInsertRowid);
    },
    updateTeam: (id: number, t: TeamInput) =>
      Number(
        db
          .prepare(
            'UPDATE teams SET name=?, budget_cents=?, actual_cents=?, planned_headcount=?, updated_at=? WHERE id=?',
          )
          .run(t.name, t.budgetCents, t.actualCents, t.plannedHeadcount, now(), id).changes,
      ),
    deleteTeam: (id: number) => Number(db.prepare('DELETE FROM teams WHERE id=?').run(id).changes),

    listConsultants: () =>
      db.prepare(`${CONSULTANT_SELECT} ORDER BY code`).all() as Consultant[],
    getConsultant: (id: number) =>
      db.prepare(`${CONSULTANT_SELECT} WHERE id = ?`).get(id) as Consultant | undefined,
    createConsultant: (c: ConsultantInput) => {
      const r = db
        .prepare(
          `INSERT INTO consultants (code, team_id, profile, seniority, cost_rate_cents_per_day,
           bill_rate_cents_per_day, contract_end, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          c.code,
          c.teamId,
          c.profile,
          c.seniority,
          c.costRateCentsPerDay,
          c.billRateCentsPerDay,
          c.contractEnd,
          c.status,
          now(),
        );
      return Number(r.lastInsertRowid);
    },
    updateConsultant: (id: number, c: ConsultantInput) =>
      Number(
        db
          .prepare(
            `UPDATE consultants SET code=?, team_id=?, profile=?, seniority=?, cost_rate_cents_per_day=?,
             bill_rate_cents_per_day=?, contract_end=?, status=?, updated_at=? WHERE id=?`,
          )
          .run(
            c.code,
            c.teamId,
            c.profile,
            c.seniority,
            c.costRateCentsPerDay,
            c.billRateCentsPerDay,
            c.contractEnd,
            c.status,
            now(),
            id,
          ).changes,
      ),
    deleteConsultant: (id: number) =>
      Number(db.prepare('DELETE FROM consultants WHERE id=?').run(id).changes),

    listProjects: () => db.prepare(`${PROJECT_SELECT} ORDER BY name`).all() as Project[],
    getProject: (id: number) =>
      db.prepare(`${PROJECT_SELECT} WHERE id = ?`).get(id) as Project | undefined,
    createProject: (p: ProjectInput) => {
      const r = db
        .prepare(
          `INSERT INTO projects (name, team_id, status, start_date, end_date, budget_cents, updated_at)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(p.name, p.teamId, p.status, p.startDate, p.endDate, p.budgetCents, now());
      return Number(r.lastInsertRowid);
    },
    updateProject: (id: number, p: ProjectInput) =>
      Number(
        db
          .prepare(
            `UPDATE projects SET name=?, team_id=?, status=?, start_date=?, end_date=?, budget_cents=?,
             updated_at=? WHERE id=?`,
          )
          .run(p.name, p.teamId, p.status, p.startDate, p.endDate, p.budgetCents, now(), id).changes,
      ),
    deleteProject: (id: number) =>
      Number(db.prepare('DELETE FROM projects WHERE id=?').run(id).changes),

    listTasks: () => db.prepare(`${TASK_SELECT} ORDER BY id`).all() as Task[],
    getTask: (id: number) => db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as Task | undefined,
    createTask: (t: TaskInput) => {
      const r = db
        .prepare(
          `INSERT INTO tasks (project_id, title, assignee_id, status, priority, due_date, estimate_hours, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(t.projectId, t.title, t.assigneeId, t.status, t.priority, t.dueDate, t.estimateHours, now());
      return Number(r.lastInsertRowid);
    },
    updateTask: (id: number, t: TaskInput) =>
      Number(
        db
          .prepare(
            `UPDATE tasks SET project_id=?, title=?, assignee_id=?, status=?, priority=?, due_date=?,
             estimate_hours=?, updated_at=? WHERE id=?`,
          )
          .run(t.projectId, t.title, t.assigneeId, t.status, t.priority, t.dueDate, t.estimateHours, now(), id)
          .changes,
      ),
    deleteTask: (id: number) => Number(db.prepare('DELETE FROM tasks WHERE id=?').run(id).changes),

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
