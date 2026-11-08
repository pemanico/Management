import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { csvCell } from './csv.ts';
import { businessDate } from '../shared/dates.ts';

async function setup() {
  const db = openDb(':memory:');
  const server = createApp(db);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() };
  };
  return { call, close: () => server.close() };
}

test('fluxo equipa + consultores + resumo (inteiros, sem float)', async () => {
  const { call, close } = await setup();
  const team = await call('/api/teams', 'POST', {
    name: 'Equipa Alfa', budgetCents: 100_000_00, actualCents: 95_000_00, plannedHeadcount: 3,
  });
  assert.equal(team.status, 201);
  const teamId = (team.data as { id: number }).id;

  const c1 = await call('/api/consultants', 'POST', {
    code: 'C001', teamId, profile: 'Data Engineer', seniority: 'senior',
    costRateCentsPerDay: 400_00, billRateCentsPerDay: 600_00, contractEnd: null, status: 'active',
  });
  assert.equal(c1.status, 201);
  await call('/api/consultants', 'POST', {
    code: 'C002', teamId, profile: 'QA', seniority: 'pleno',
    costRateCentsPerDay: 300_00, billRateCentsPerDay: null, contractEnd: '2999-01-01', status: 'active',
  });

  const s = (await call('/api/summary')).data as any;
  const t = s.teams[0];
  assert.equal(t.utilisationBp, 9500);
  assert.equal(t.activeHeadcount, 2);
  assert.equal(t.headcountGap, 1);
  assert.equal(t.marginBp, 3333); // (600-400)/600
  const types = s.alerts.map((a: any) => a.type);
  assert.ok(types.includes('budget_over_90'));
  assert.ok(types.includes('vacancies'));
  assert.ok(types.includes('missing_bill_rate'));
  close();
});

test('validação e erros genéricos', async () => {
  const { call, close } = await setup();
  assert.equal((await call('/api/teams', 'POST', { name: '', budgetCents: 1.5 })).status, 400);
  assert.equal(
    (await call('/api/consultants', 'POST', {
      code: 'João Silva', teamId: 1, profile: 'x', seniority: 'senior',
      costRateCentsPerDay: 1, billRateCentsPerDay: null, contractEnd: null, status: 'active',
    })).status,
    400,
  );
  assert.equal((await call('/api/nada')).status, 404);
  close();
});

test('equipa com consultores não pode ser apagada', async () => {
  const { call, close } = await setup();
  const t = (await call('/api/teams', 'POST', { name: 'B', budgetCents: 0, actualCents: 0, plannedHeadcount: 0 })).data as { id: number };
  await call('/api/consultants', 'POST', {
    code: 'C9', teamId: t.id, profile: 'x', seniority: 'junior',
    costRateCentsPerDay: 1, billRateCentsPerDay: null, contractEnd: null, status: 'active',
  });
  assert.equal((await call(`/api/teams/${t.id}`, 'DELETE')).status, 409);
  close();
});

test('CSV injection é neutralizado', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('normal'), 'normal');
});

test('skills matrix: gaps, validação e cobertura', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 1, actualCents: 0, plannedHeadcount: 2 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      costRateCentsPerDay: 1, billRateCentsPerDay: 2, contractEnd: null, status: 'active',
    })).data as { id: number }).id;
  const c1 = await mk('C1');
  const c2 = await mk('C2');
  const skill = (await call('/api/skills', 'POST', { name: 'PySpark', category: 'Dados' })).data as { id: number };
  assert.equal((await call('/api/skills', 'POST', { name: 'PySpark' })).status, 409);

  await call('/api/requirements', 'PUT', { teamId: team.id, skillId: skill.id, requiredLevel: 3, minPeople: 2 });

  // validada sem evidência é rejeitada
  const today = businessDate();
  const bad = { consultantId: c1, skillId: skill.id, level: 3, validated: true, evidence: null, assessedAt: today };
  assert.equal((await call('/api/ratings', 'PUT', bad)).status, 400);
  // data futura é rejeitada
  assert.equal((await call('/api/ratings', 'PUT', { ...bad, validated: false, assessedAt: '2999-01-01' })).status, 400);

  await call('/api/ratings', 'PUT', { ...bad, evidence: 'Pipeline EMIR em produção' });
  let s = (await call('/api/summary')).data as any;
  assert.equal(s.skills.coverage[0].qualified, 1);
  assert.equal(s.skills.coverage[0].gap, 1);
  assert.ok(s.alerts.some((a: any) => a.type === 'skill_gap'));

  // upsert: o 2.º consultor autoavaliado cobre a vaga, mas fica "não validado"
  await call('/api/ratings', 'PUT', { consultantId: c2, skillId: skill.id, level: 4, validated: false, evidence: null, assessedAt: today });
  s = (await call('/api/summary')).data as any;
  assert.equal(s.skills.coverage[0].gap, 0);
  assert.equal(s.skills.coverage[0].qualifiedValidated, 1);
  assert.ok(s.alerts.some((a: any) => a.type === 'skill_unvalidated'));
  assert.equal(s.skills.validatedRatioBp, 5000);

  // atualizar a mesma célula não duplica
  await call('/api/ratings', 'PUT', { consultantId: c2, skillId: skill.id, level: 2, validated: false, evidence: null, assessedAt: today });
  assert.equal(((await call('/api/ratings')).data as any[]).length, 2);

  // apagar competência apaga avaliações e requisitos
  await call(`/api/skills/${skill.id}`, 'DELETE');
  assert.deepEqual((await call('/api/ratings')).data, []);
  assert.deepEqual((await call('/api/requirements')).data, []);
  close();
});

test('unidade só com budget em headcount: sem alertas de dinheiro', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'H', budgetCents: 0, actualCents: 0, plannedHeadcount: 3 })).data as { id: number };
  await call('/api/projects', 'POST', {
    name: 'P', teamId: team.id, status: 'active', startDate: null, endDate: null, budgetCents: 80_000_00,
    priority: 'high', plannedHeadcount: 0,
  });
  const s = (await call('/api/summary')).data as any;
  const types = s.alerts.map((a: any) => a.type);
  assert.ok(!types.includes('budget_over_90'));
  assert.ok(!types.includes('projects_exceed_budget'));
  assert.ok(types.includes('vacancies')); // o budget em headcount continua a alertar
  assert.equal(s.teams[0].utilisationBp, null);
  close();
});

test('projetos e alocações: HC, sobre-alocação, bench e cascade', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedHeadcount: 3 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      costRateCentsPerDay: 1, billRateCentsPerDay: 2, contractEnd: null, status: 'active',
    })).data as { id: number }).id;
  const c1 = await mk('C1');
  const c2 = await mk('C2');
  await mk('C3'); // fica no bench

  // prioridade e HC inválidos são rejeitados
  const base = { name: 'Migração', teamId: team.id, status: 'at_risk', startDate: '2026-01-01', endDate: '2026-02-01', budgetCents: 0 };
  assert.equal((await call('/api/projects', 'POST', { ...base, priority: 'urgente', plannedHeadcount: 2 })).status, 400);
  assert.equal((await call('/api/projects', 'POST', { ...base, priority: 'high', plannedHeadcount: -1 })).status, 400);
  const pa = (await call('/api/projects', 'POST', { ...base, priority: 'high', plannedHeadcount: 2 })).data as { id: number };
  const pb = (await call('/api/projects', 'POST', { ...base, name: 'Outro', status: 'active', endDate: null, priority: 'low', plannedHeadcount: 0 })).data as { id: number };

  // alocação inválida
  assert.equal((await call('/api/allocations', 'PUT', { projectId: pa.id, consultantId: c1, allocationPct: 0 })).status, 400);
  assert.equal((await call('/api/allocations', 'PUT', { projectId: pa.id, consultantId: c1, allocationPct: 101 })).status, 400);
  assert.equal((await call('/api/allocations', 'PUT', { projectId: 999, consultantId: c1, allocationPct: 50 })).status, 409);

  await call('/api/allocations', 'PUT', { projectId: pa.id, consultantId: c1, allocationPct: 80 });
  await call('/api/allocations', 'PUT', { projectId: pb.id, consultantId: c1, allocationPct: 50 }); // c1 = 130%
  await call('/api/allocations', 'PUT', { projectId: pa.id, consultantId: c2, allocationPct: 40 });
  await call('/api/allocations', 'PUT', { projectId: pa.id, consultantId: c2, allocationPct: 50 }); // upsert, não duplica
  assert.equal(((await call('/api/allocations')).data as any[]).length, 3);

  const s = (await call('/api/summary')).data as any;
  const types = s.alerts.map((a: any) => a.type);
  for (const t of ['project_at_risk', 'project_overdue', 'project_understaffed', 'consultant_overallocated', 'consultant_unallocated'])
    assert.ok(types.includes(t), t);
  const proj = s.projects.find((p: any) => p.projectId === pa.id);
  assert.equal(proj.allocatedPct, 130); // 80 + 50
  assert.equal(proj.gapPct, 70); // precisa 200, tem 130
  assert.equal(proj.allocatedPeople, 2);
  assert.equal(s.allocations.find((a: any) => a.code === 'C1').allocatedPct, 130);
  assert.equal(s.teams[0].overallocatedPeople, 1);
  assert.equal(s.teams[0].unallocatedPeople, 1);

  // projeto concluído deixa de consumir a alocação
  await call(`/api/projects/${pb.id}`, 'PUT', { ...base, name: 'Outro', status: 'done', endDate: null, priority: 'low', plannedHeadcount: 0 });
  const s2 = (await call('/api/summary')).data as any;
  assert.equal(s2.allocations.find((a: any) => a.code === 'C1').allocatedPct, 80);

  // apagar projeto apaga as alocações
  await call(`/api/projects/${pa.id}`, 'DELETE');
  assert.equal(((await call('/api/allocations')).data as any[]).length, 1);
  close();
});

test('migração: base antiga sem prioridade/HC nos projetos continua a abrir', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const path = join(mkdtempSync(join(tmpdir(), 'um-')), 'old.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, budget_cents INTEGER NOT NULL,
    actual_cents INTEGER NOT NULL, planned_headcount INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, team_id INTEGER NOT NULL REFERENCES teams(id),
    status TEXT NOT NULL, start_date TEXT, end_date TEXT, budget_cents INTEGER NOT NULL, updated_at TEXT NOT NULL, UNIQUE (team_id, name));
    INSERT INTO teams VALUES (1,'A',0,0,2,'2026-01-01T00:00:00Z');
    INSERT INTO projects VALUES (1,'P',1,'active',NULL,NULL,0,'2026-01-01T00:00:00Z');`);
  old.close();
  const db = openDb(path);
  const p = db.listProjects()[0]!;
  assert.equal(p.priority, 'medium');
  assert.equal(p.plannedHeadcount, 0);
  db.close();
});

test('formação: fecha gaps, alerta quando não fecha e quando está em atraso', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedHeadcount: 3 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      costRateCentsPerDay: 1, billRateCentsPerDay: 2, contractEnd: null, status: 'active',
    })).data as { id: number }).id;
  const [c1, c2, c3] = [await mk('C1'), await mk('C2'), await mk('C3')];
  const skill = (await call('/api/skills', 'POST', { name: 'EMIR', category: null })).data as { id: number };
  const today = businessDate();
  // C1 já é nível 3; exige-se 3 em 3 pessoas -> gap 2
  await call('/api/ratings', 'PUT', { consultantId: c1, skillId: skill.id, level: 3, validated: true, evidence: 'Reporting EMIR', assessedAt: today });
  await call('/api/requirements', 'PUT', { teamId: team.id, skillId: skill.id, requiredLevel: 3, minPeople: 3 });

  const tr = { skillId: skill.id, kind: 'course', title: 'Curso EMIR', status: 'planned', dueDate: null, costCents: 0 };
  // validação
  assert.equal((await call('/api/trainings', 'POST', { ...tr, consultantId: c2, targetLevel: 5 })).status, 400);
  assert.equal((await call('/api/trainings', 'POST', { ...tr, consultantId: c2, targetLevel: 3, kind: 'yoga' })).status, 400);
  assert.equal((await call('/api/trainings', 'POST', { ...tr, consultantId: 999, targetLevel: 3 })).status, 409);

  let s = (await call('/api/summary')).data as any;
  assert.equal(s.skills.coverage[0].gap, 2);
  assert.equal(s.skills.coverage[0].gapAfterTraining, 2);
  assert.ok(s.alerts.some((a: any) => a.type === 'training_gap_uncovered'));

  // uma formação que chega ao nível exigido fecha 1 dos 2; uma que fica aquém não conta
  await call('/api/trainings', 'POST', { ...tr, consultantId: c2, targetLevel: 3 });
  const short = (await call('/api/trainings', 'POST', { ...tr, consultantId: c3, targetLevel: 2, title: 'Intro EMIR' })).data as { id: number };
  s = (await call('/api/summary')).data as any;
  assert.equal(s.skills.coverage[0].inTraining, 1);
  assert.equal(s.skills.coverage[0].gapAfterTraining, 1);
  assert.ok(s.alerts.some((a: any) => a.type === 'training_gap_uncovered'));

  // subir o alvo do C3 para 3 fecha o gap planeado: deixa de haver alerta "não coberto"
  await call(`/api/trainings/${short.id}`, 'PUT', { ...tr, consultantId: c3, targetLevel: 3, title: 'Intro EMIR' });
  s = (await call('/api/summary')).data as any;
  assert.equal(s.skills.coverage[0].gapAfterTraining, 0);
  assert.ok(!s.alerts.some((a: any) => a.type === 'training_gap_uncovered'));
  assert.equal(s.training.openCount, 2);

  // em atraso; concluída/cancelada deixa de contar como em aberto
  await call(`/api/trainings/${short.id}`, 'PUT', { ...tr, consultantId: c3, targetLevel: 3, title: 'Intro EMIR', dueDate: '2020-01-01', costCents: 150_00 });
  s = (await call('/api/summary')).data as any;
  assert.ok(s.alerts.some((a: any) => a.type === 'training_overdue'));
  assert.equal(s.training.overdueCount, 1);
  assert.equal(s.training.openCostCents, 150_00);
  await call(`/api/trainings/${short.id}`, 'PUT', { ...tr, consultantId: c3, targetLevel: 3, title: 'Intro EMIR', status: 'done', dueDate: '2020-01-01' });
  s = (await call('/api/summary')).data as any;
  assert.equal(s.training.overdueCount, 0);
  assert.equal(s.training.openCount, 1);

  // apagar competência apaga as formações
  await call(`/api/skills/${skill.id}`, 'DELETE');
  assert.deepEqual((await call('/api/trainings')).data, []);
  close();
});
