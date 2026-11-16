import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Db } from './db.ts';
import { buildSummary } from './summary.ts';
import { centsToDecimal, toCsv } from './csv.ts';
import {
  parseAllocation,
  parseConsultant,
  parseDepartment,
  parseProfile,
  parseEvaluation,
  parseObjective,
  parseProject,
  parseRating,
  parseRequirement,
  parseSkill,
  parseTeam,
  parseTraining,
} from './validate.ts';

const MAX_BODY = 64 * 1024;
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json'))
    throw new HttpError(415, 'Content-Type must be application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

function parseId(s: string | undefined): number {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Not found.');
  return n;
}

function isConstraint(e: unknown): boolean {
  return e instanceof Error && /constraint/i.test(e.message);
}

export function createApp(db: Db): Server {
  return createServer(async (req, res) => {
    try {
      // Defesa contra DNS rebinding: só aceita Host local.
      const host = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (!ALLOWED_HOSTS.has(host)) throw new HttpError(403, 'Host not allowed.');

      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean); // ['api', 'teams', '1']
      const method = req.method ?? 'GET';
      if (parts[0] !== 'api') throw new HttpError(404, 'Not found.');
      const [, resource, idPart, idPart2] = parts;

      if (resource === 'summary' && method === 'GET') {
        return send(
          res,
          200,
          buildSummary(
            db.listTeams(),
            db.listConsultants(),
            db.listProjects(),
            db.listAllocations(),
            db.listSkills(),
            db.listRatings(),
            db.listRequirements(),
            db.listTrainings(),
            db.listObjectives(),
            db.listEvaluations(),
            new Date(),
            db.listDepartments(),
          ),
        );
      }

      if (resource === 'export' && method === 'GET') {
        const kind = url.searchParams.get('kind');
        if (kind === 'teams') {
          const csv = toCsv(
            ['id', 'equipa', 'budget_eur', 'gasto_eur', 'hc_orcamentado_internos', 'hc_orcamentado_externos', 'atualizado_em'],
            db.listTeams().map((t) => [
              t.id,
              t.name,
              centsToDecimal(t.budgetCents),
              centsToDecimal(t.actualCents),
              String(t.plannedInternalHeadcount).replace('.', ','),
              String(t.plannedExternalHeadcount).replace('.', ','),
              t.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'consultants') {
          const teams = new Map(db.listTeams().map((t) => [t.id, t.name]));
          const depts = new Map(db.listDepartments().map((d) => [d.id, d.name]));
          const csv = toCsv(
            ['codigo', 'equipa_principal', 'outras_equipas', 'perfil', 'senioridade', 'tipo', 'fornecedor', 'rate_dia_eur', 'fim_contrato', 'estado', 'atualizado_em'],
            db.listConsultants().map((c) => [
              c.code,
              c.teamId !== null ? (teams.get(c.teamId) ?? '') : `Departamento ${depts.get(c.departmentId ?? 0) ?? ''}`,
              c.extraTeams.map((x) => `${teams.get(x.teamId) ?? ''} ${x.pct}%`).join(' | '),
              c.profile,
              c.seniority,
              c.kind,
              c.supplier,
              c.kind === 'external' ? centsToDecimal(c.costRateCentsPerDay) : null,
              c.contractEnd,
              c.status,
              c.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'projects') {
          const teams = new Map(db.listTeams().map((t) => [t.id, t.name]));
          const csv = toCsv(
            ['id', 'projeto', 'equipa', 'estado', 'prioridade', 'hc_necessario', 'inicio', 'fim', 'budget_eur', 'atualizado_em'],
            db.listProjects().map((p) => [
              p.id,
              p.name,
              teams.get(p.teamId) ?? '',
              p.status,
              p.priority,
              p.plannedHeadcount,
              p.startDate,
              p.endDate,
              centsToDecimal(p.budgetCents),
              p.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'allocations') {
          const projects = new Map(db.listProjects().map((p) => [p.id, p.name]));
          const people = new Map(db.listConsultants().map((c) => [c.id, c.code]));
          const csv = toCsv(
            ['projeto', 'consultor', 'alocacao_pct', 'atualizado_em'],
            db.listAllocations().map((a) => [
              projects.get(a.projectId) ?? '',
              people.get(a.consultantId) ?? '',
              a.allocationPct,
              a.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'objectives') {
          const people = new Map(db.listConsultants().map((c) => [c.id, c.code]));
          const teams = new Map(db.listTeams().map((t) => [t.id, t.name]));
          const csv = toCsv(
            ['ambito', 'responsavel', 'titulo', 'periodo', 'estado', 'progresso_pct', 'data_limite', 'atualizado_em'],
            db.listObjectives().map((o) => [
              o.teamId !== null ? 'equipa' : 'consultor',
              o.teamId !== null ? (teams.get(o.teamId) ?? '') : (people.get(o.consultantId ?? 0) ?? ''),
              o.title,
              o.period,
              o.status,
              o.progressPct,
              o.dueDate,
              o.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'evaluations') {
          const people = new Map(db.listConsultants().map((c) => [c.id, c.code]));
          const csv = toCsv(
            ['consultor', 'periodo', 'classificacao', 'estado', 'avaliada_em', 'resumo', 'atualizado_em'],
            db.listEvaluations().map((e) => [
              people.get(e.consultantId) ?? '',
              e.period,
              e.rating,
              e.status,
              e.evaluatedAt,
              e.summary,
              e.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'trainings') {
          const skills = new Map(db.listSkills().map((k) => [k.id, k.name]));
          const people = new Map(db.listConsultants().map((c) => [c.id, c.code]));
          const csv = toCsv(
            ['consultor', 'competencia', 'nivel_alvo', 'tipo', 'titulo', 'estado', 'data_limite', 'custo_eur', 'atualizado_em'],
            db.listTrainings().map((t) => [
              people.get(t.consultantId) ?? '',
              skills.get(t.skillId) ?? '',
              t.targetLevel,
              t.kind,
              t.title,
              t.status,
              t.dueDate,
              centsToDecimal(t.costCents),
              t.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'ratings') {
          const skills = new Map(db.listSkills().map((k) => [k.id, k.name]));
          const people = new Map(db.listConsultants().map((c) => [c.id, c.code]));
          const csv = toCsv(
            ['consultor', 'competencia', 'nivel', 'validada', 'evidencia', 'avaliada_em'],
            db.listRatings().map((r) => [
              people.get(r.consultantId) ?? '',
              skills.get(r.skillId) ?? '',
              r.level,
              r.validated ? 'sim' : 'nao',
              r.evidence,
              r.assessedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        throw new HttpError(400, 'Invalid kind.');
      }

      if (resource === 'profiles') {
        if (!idPart && method === 'GET') return send(res, 200, db.listProfiles());
        if (!idPart && method === 'POST') {
          const p = parseProfile(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getProfile(db.createProfile(p.value)));
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'A profile with that name already exists.');
            throw e;
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseProfile(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          const current = db.getProfile(id);
          if (!current) throw new HttpError(404, 'Profile not found.');
          try {
            db.renameProfile(id, p.value);
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'A profile with that name already exists.');
            throw e;
          }
          return send(res, 200, db.getProfile(id));
        }
        if (idPart && method === 'DELETE') {
          const id = parseId(idPart);
          const current = db.getProfile(id);
          if (!current) throw new HttpError(404, 'Profile not found.');
          if (db.profileInUse(current.name))
            throw new HttpError(409, 'Some consultants use this profile; move them to another profile first.');
          db.deleteProfile(id);
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'departments') {
        if (!idPart && method === 'GET') return send(res, 200, db.listDepartments());
        if (!idPart && method === 'POST') {
          const p = parseDepartment(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getDepartment(db.createDepartment(p.value)));
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'A department with that name already exists.');
            throw e;
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseDepartment(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateDepartment(id, p.value) === 0) throw new HttpError(404, 'Department not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            if (isConstraint(e)) throw new HttpError(409, 'A department with that name already exists.');
            throw e;
          }
          return send(res, 200, db.getDepartment(id));
        }
        if (idPart && method === 'DELETE') {
          try {
            if (db.deleteDepartment(parseId(idPart)) === 0) throw new HttpError(404, 'Department not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            if (isConstraint(e)) throw new HttpError(409, 'The department has teams or people; move them first.');
            throw e;
          }
          return send(res, 200, { ok: true });
        }
      }

      // Perfil tem de vir da lista (página Perfis): todos com o mesmo nome, sem variantes escritas à mão.
      const checkProfile = (name: string) => {
        if (!db.listProfiles().some((p) => p.name === name))
          throw new HttpError(400, 'Profile not in the list: choose one from the list or create it on the Profiles page.');
      };

      // Departamento tem de existir e ter pelo menos uma equipa (senão a pessoa não conta em nenhuma).
      const checkDepartment = (departmentId: number | null, needsTeams: boolean) => {
        if (departmentId === null) return;
        if (!db.getDepartment(departmentId)) throw new HttpError(400, 'Department does not exist.');
        if (needsTeams && !db.listTeams().some((t) => t.departmentId === departmentId))
          throw new HttpError(400, 'The department has no teams yet: assign teams to it first.');
      };

      if (resource === 'teams') {
        if (!idPart && method === 'GET') return send(res, 200, db.listTeams());
        if (!idPart && method === 'POST') {
          const p = parseTeam(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          checkDepartment(p.value.departmentId, false);
          try {
            return send(res, 201, db.getTeam(db.createTeam(p.value)));
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'A team with that name already exists.');
            throw e;
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseTeam(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          checkDepartment(p.value.departmentId, false);
          try {
            if (db.updateTeam(id, p.value) === 0) throw new HttpError(404, 'Team not found.');
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'A team with that name already exists.');
            throw e;
          }
          return send(res, 200, db.getTeam(id));
        }
        if (idPart && method === 'DELETE') {
          try {
            if (db.deleteTeam(parseId(idPart)) === 0) throw new HttpError(404, 'Team not found.');
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'The team has consultants or projects; remove them or move them to another team first.');
            throw e;
          }
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'consultants') {
        const saveGuard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'The code already exists or the team is invalid.');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listConsultants());
        if (!idPart && method === 'POST') {
          const p = parseConsultant(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          checkDepartment(p.value.departmentId, true);
          checkProfile(p.value.profile);
          try {
            return send(res, 201, db.getConsultant(db.createConsultant(p.value)));
          } catch (e) {
            return saveGuard(e);
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseConsultant(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          checkDepartment(p.value.departmentId, true);
          checkProfile(p.value.profile);
          try {
            if (db.updateConsultant(id, p.value) === 0)
              throw new HttpError(404, 'Consultant not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return saveGuard(e);
          }
          return send(res, 200, db.getConsultant(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteConsultant(parseId(idPart)) === 0)
            throw new HttpError(404, 'Consultant not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'projects') {
        const guard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'A project with that name already exists in this team, or the team is invalid.');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listProjects());
        if (!idPart && method === 'POST') {
          const p = parseProject(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getProject(db.createProject(p.value)));
          } catch (e) {
            return guard(e);
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseProject(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateProject(id, p.value) === 0) throw new HttpError(404, 'Project not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getProject(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteProject(parseId(idPart)) === 0) throw new HttpError(404, 'Project not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'allocations') {
        if (!idPart && method === 'GET') return send(res, 200, db.listAllocations());
        // PUT /api/allocations = criar ou atualizar (upsert)
        if (!idPart && method === 'PUT') {
          const p = parseAllocation(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            db.upsertAllocation(p.value);
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'Invalid project or consultant.');
            throw e;
          }
          return send(res, 200, db.getAllocation(p.value.projectId, p.value.consultantId));
        }
        if (idPart && idPart2 && method === 'DELETE') {
          if (db.deleteAllocation(parseId(idPart), parseId(idPart2)) === 0)
            throw new HttpError(404, 'Allocation not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'skills') {
        const guard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'A skill with that name already exists.');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listSkills());
        if (!idPart && method === 'POST') {
          const p = parseSkill(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getSkill(db.createSkill(p.value)));
          } catch (e) {
            return guard(e);
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseSkill(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateSkill(id, p.value) === 0) throw new HttpError(404, 'Skill not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getSkill(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteSkill(parseId(idPart)) === 0) throw new HttpError(404, 'Skill not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'objectives') {
        const guard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'Invalid consultant or team.');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listObjectives());
        if (!idPart && method === 'POST') {
          const p = parseObjective(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getObjective(db.createObjective(p.value)));
          } catch (e) {
            return guard(e);
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseObjective(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateObjective(id, p.value) === 0) throw new HttpError(404, 'Objective not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getObjective(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteObjective(parseId(idPart)) === 0) throw new HttpError(404, 'Objective not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'evaluations') {
        const guard = (e: unknown): never => {
          if (isConstraint(e))
            throw new HttpError(409, 'An evaluation for this consultant and period already exists (or the consultant is invalid).');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listEvaluations());
        if (!idPart && method === 'POST') {
          const p = parseEvaluation(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getEvaluation(db.createEvaluation(p.value)));
          } catch (e) {
            return guard(e);
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseEvaluation(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateEvaluation(id, p.value) === 0) throw new HttpError(404, 'Not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getEvaluation(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteEvaluation(parseId(idPart)) === 0) throw new HttpError(404, 'Not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'trainings') {
        const guard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'Invalid consultant or skill.');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listTrainings());
        if (!idPart && method === 'POST') {
          const p = parseTraining(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getTraining(db.createTraining(p.value)));
          } catch (e) {
            return guard(e);
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseTraining(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateTraining(id, p.value) === 0) throw new HttpError(404, 'Training not found.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getTraining(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteTraining(parseId(idPart)) === 0) throw new HttpError(404, 'Training not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'ratings') {
        if (!idPart && method === 'GET') return send(res, 200, db.listRatings());
        // PUT /api/ratings = criar ou atualizar (upsert)
        if (!idPart && method === 'PUT') {
          const p = parseRating(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            db.upsertRating(p.value);
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'Invalid consultant or skill.');
            throw e;
          }
          return send(res, 200, db.getRating(p.value.consultantId, p.value.skillId));
        }
        if (idPart && idPart2 && method === 'DELETE') {
          if (db.deleteRating(parseId(idPart), parseId(idPart2)) === 0)
            throw new HttpError(404, 'Not found.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'requirements') {
        if (!idPart && method === 'GET') return send(res, 200, db.listRequirements());
        if (!idPart && method === 'PUT') {
          const p = parseRequirement(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            db.upsertRequirement(p.value);
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'Invalid team or skill.');
            throw e;
          }
          return send(res, 200, db.getRequirement(p.value.teamId, p.value.skillId));
        }
        if (idPart && idPart2 && method === 'DELETE') {
          if (db.deleteRequirement(parseId(idPart), parseId(idPart2)) === 0)
            throw new HttpError(404, 'Requirement not found.');
          return send(res, 200, { ok: true });
        }
      }

      throw new HttpError(404, 'Not found.');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error('Internal error:', e instanceof Error ? e.name : 'unknown');
      return send(res, 500, { error: 'Internal error. Try again.' });
    }
  });
}
