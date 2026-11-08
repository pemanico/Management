import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Db } from './db.ts';
import { buildSummary } from './summary.ts';
import { centsToDecimal, toCsv } from './csv.ts';
import {
  parseAllocation,
  parseConsultant,
  parseProject,
  parseRating,
  parseRequirement,
  parseSkill,
  parseTeam,
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
    throw new HttpError(415, 'Content-Type deve ser application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Pedido demasiado grande.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function parseId(s: string | undefined): number {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Não encontrado.');
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
      if (!ALLOWED_HOSTS.has(host)) throw new HttpError(403, 'Host não permitido.');

      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean); // ['api', 'teams', '1']
      const method = req.method ?? 'GET';
      if (parts[0] !== 'api') throw new HttpError(404, 'Não encontrado.');
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
          ),
        );
      }

      if (resource === 'export' && method === 'GET') {
        const kind = url.searchParams.get('kind');
        if (kind === 'teams') {
          const csv = toCsv(
            ['id', 'equipa', 'budget_eur', 'gasto_eur', 'headcount_planeado', 'atualizado_em'],
            db.listTeams().map((t) => [
              t.id,
              t.name,
              centsToDecimal(t.budgetCents),
              centsToDecimal(t.actualCents),
              t.plannedHeadcount,
              t.updatedAt,
            ]),
          );
          return send(res, 200, csv, 'text/csv');
        }
        if (kind === 'consultants') {
          const teams = new Map(db.listTeams().map((t) => [t.id, t.name]));
          const csv = toCsv(
            ['codigo', 'equipa', 'perfil', 'senioridade', 'rate_paga_dia_eur', 'rate_faturada_dia_eur', 'fim_contrato', 'estado', 'atualizado_em'],
            db.listConsultants().map((c) => [
              c.code,
              teams.get(c.teamId) ?? '',
              c.profile,
              c.seniority,
              centsToDecimal(c.costRateCentsPerDay),
              centsToDecimal(c.billRateCentsPerDay),
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
        throw new HttpError(400, 'kind inválido.');
      }

      if (resource === 'teams') {
        if (!idPart && method === 'GET') return send(res, 200, db.listTeams());
        if (!idPart && method === 'POST') {
          const p = parseTeam(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            return send(res, 201, db.getTeam(db.createTeam(p.value)));
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'Já existe uma equipa com esse nome.');
            throw e;
          }
        }
        if (idPart && method === 'PUT') {
          const id = parseId(idPart);
          const p = parseTeam(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
          try {
            if (db.updateTeam(id, p.value) === 0) throw new HttpError(404, 'Equipa não encontrada.');
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'Já existe uma equipa com esse nome.');
            throw e;
          }
          return send(res, 200, db.getTeam(id));
        }
        if (idPart && method === 'DELETE') {
          try {
            if (db.deleteTeam(parseId(idPart)) === 0) throw new HttpError(404, 'Equipa não encontrada.');
          } catch (e) {
            if (isConstraint(e)) throw new HttpError(409, 'A equipa tem consultores ou projetos; remove-os ou muda-os de equipa primeiro.');
            throw e;
          }
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'consultants') {
        const saveGuard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'Código já existe ou equipa inválida.');
          throw e;
        };
        if (!idPart && method === 'GET') return send(res, 200, db.listConsultants());
        if (!idPart && method === 'POST') {
          const p = parseConsultant(await readJson(req));
          if (!p.ok) throw new HttpError(400, p.error);
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
          try {
            if (db.updateConsultant(id, p.value) === 0)
              throw new HttpError(404, 'Consultor não encontrado.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return saveGuard(e);
          }
          return send(res, 200, db.getConsultant(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteConsultant(parseId(idPart)) === 0)
            throw new HttpError(404, 'Consultor não encontrado.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'projects') {
        const guard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'Já existe um projeto com esse nome nesta equipa, ou a equipa é inválida.');
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
            if (db.updateProject(id, p.value) === 0) throw new HttpError(404, 'Projeto não encontrado.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getProject(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteProject(parseId(idPart)) === 0) throw new HttpError(404, 'Projeto não encontrado.');
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
            if (isConstraint(e)) throw new HttpError(409, 'Projeto ou consultor inválidos.');
            throw e;
          }
          return send(res, 200, db.getAllocation(p.value.projectId, p.value.consultantId));
        }
        if (idPart && idPart2 && method === 'DELETE') {
          if (db.deleteAllocation(parseId(idPart), parseId(idPart2)) === 0)
            throw new HttpError(404, 'Alocação não encontrada.');
          return send(res, 200, { ok: true });
        }
      }

      if (resource === 'skills') {
        const guard = (e: unknown): never => {
          if (isConstraint(e)) throw new HttpError(409, 'Já existe uma competência com esse nome.');
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
            if (db.updateSkill(id, p.value) === 0) throw new HttpError(404, 'Competência não encontrada.');
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return guard(e);
          }
          return send(res, 200, db.getSkill(id));
        }
        if (idPart && method === 'DELETE') {
          if (db.deleteSkill(parseId(idPart)) === 0) throw new HttpError(404, 'Competência não encontrada.');
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
            if (isConstraint(e)) throw new HttpError(409, 'Consultor ou competência inválidos.');
            throw e;
          }
          return send(res, 200, db.getRating(p.value.consultantId, p.value.skillId));
        }
        if (idPart && idPart2 && method === 'DELETE') {
          if (db.deleteRating(parseId(idPart), parseId(idPart2)) === 0)
            throw new HttpError(404, 'Avaliação não encontrada.');
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
            if (isConstraint(e)) throw new HttpError(409, 'Equipa ou competência inválidas.');
            throw e;
          }
          return send(res, 200, db.getRequirement(p.value.teamId, p.value.skillId));
        }
        if (idPart && idPart2 && method === 'DELETE') {
          if (db.deleteRequirement(parseId(idPart), parseId(idPart2)) === 0)
            throw new HttpError(404, 'Requisito não encontrado.');
          return send(res, 200, { ok: true });
        }
      }

      throw new HttpError(404, 'Não encontrado.');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error('Erro interno:', e instanceof Error ? e.name : 'desconhecido');
      return send(res, 500, { error: 'Erro interno. Tenta novamente.' });
    }
  });
}
