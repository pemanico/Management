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

test('projetos e tarefas: alertas, carga e cascade', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 50_000_00, actualCents: 0, plannedHeadcount: 1 })).data as { id: number };
  const cons = (await call('/api/consultants', 'POST', {
    code: 'C1', teamId: team.id, profile: 'x', seniority: 'pleno',
    costRateCentsPerDay: 1, billRateCentsPerDay: 2, contractEnd: null, status: 'active',
  })).data as { id: number };

  // fim antes de início é rejeitado
  assert.equal((await call('/api/projects', 'POST', {
    name: 'P', teamId: team.id, status: 'active', startDate: '2026-05-01', endDate: '2026-04-01', budgetCents: 0,
  })).status, 400);

  const proj = (await call('/api/projects', 'POST', {
    name: 'Migração', teamId: team.id, status: 'at_risk', startDate: '2026-01-01', endDate: '2026-02-01', budgetCents: 60_000_00,
  })).data as { id: number };
  const base = { projectId: proj.id, priority: 'high', estimateHours: 8 };
  await call('/api/tasks', 'POST', { ...base, title: 'A', assigneeId: cons.id, status: 'doing', dueDate: '2026-01-10' });
  await call('/api/tasks', 'POST', { ...base, title: 'B', assigneeId: null, status: 'blocked', dueDate: null });
  await call('/api/tasks', 'POST', { ...base, title: 'C', assigneeId: cons.id, status: 'done', dueDate: null });

  const s = (await call('/api/summary')).data as any;
  const types = s.alerts.map((a: any) => a.type);
  for (const t of ['project_at_risk', 'project_overdue', 'projects_exceed_budget', 'tasks_overdue', 'tasks_blocked', 'tasks_unassigned'])
    assert.ok(types.includes(t), t);
  assert.equal(s.projects[0].progressBp, 3333);
  assert.equal(s.projects[0].openEstimateHours, 16);
  assert.deepEqual(s.workload[0], { code: 'C1', teamName: 'T', openTasks: 1, overdueTasks: 1, openEstimateHours: 8 });

  // equipa com projetos não se apaga; apagar projeto leva as tarefas
  assert.equal((await call(`/api/teams/${team.id}`, 'DELETE')).status, 409);
  assert.equal((await call(`/api/projects/${proj.id}`, 'DELETE')).status, 200);
  assert.deepEqual((await call('/api/tasks')).data, []);
  // apagar consultor desassocia (não apaga) tarefas
  close();
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
  });
  const s = (await call('/api/summary')).data as any;
  const types = s.alerts.map((a: any) => a.type);
  assert.ok(!types.includes('budget_over_90'));
  assert.ok(!types.includes('projects_exceed_budget'));
  assert.ok(types.includes('vacancies')); // o budget em headcount continua a alertar
  assert.equal(s.teams[0].utilisationBp, null);
  close();
});
