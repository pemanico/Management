import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { csvCell } from './csv.ts';
import { businessDate } from '../shared/dates.ts';
import type { ConsultantInput } from '../shared/types.ts';

async function setup() {
  const db = openDb(':memory:');
  // Perfis usados nos testes (a lista é obrigatória para os consultores).
  for (const name of ['Data Engineer', 'QA', 'x', 'Manager']) db.createProfile({ name });
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
    name: 'Equipa Alfa', budgetCents: 100_000_00, actualCents: 95_000_00, plannedInternalHeadcount: 0, plannedExternalHeadcount: 3,
  });
  assert.equal(team.status, 201);
  const teamId = (team.data as { id: number }).id;

  const c1 = await call('/api/consultants', 'POST', {
    code: 'C001', teamId, profile: 'Data Engineer', seniority: 'senior',
    kind: 'external', costRateCentsPerDay: 400_00, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
  });
  assert.equal(c1.status, 201);
  await call('/api/consultants', 'POST', {
    code: 'C002', teamId, profile: 'QA', seniority: 'pleno',
    kind: 'external', costRateCentsPerDay: 300_00, supplier: 'Fornecedor A', contractEnd: '2999-01-01', status: 'active',
  });

  const s = (await call('/api/summary')).data as any;
  const t = s.teams[0];
  assert.equal(t.utilisationBp, 9500);
  assert.equal(t.activeHeadcount, 2);
  assert.equal(t.headcountGap, 1);
  const types = s.alerts.map((a: any) => a.type);
  assert.ok(types.includes('budget_over_90'));
  assert.ok(types.includes('vacancies'));
  close();
});

test('validação e erros genéricos', async () => {
  const { call, close } = await setup();
  assert.equal((await call('/api/teams', 'POST', { name: '', budgetCents: 1.5 })).status, 400);
  assert.equal(
    (await call('/api/consultants', 'POST', {
      code: 'João Silva', teamId: 1, profile: 'x', seniority: 'senior',
      kind: 'external', costRateCentsPerDay: 1, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
    })).status,
    400,
  );
  assert.equal((await call('/api/nada')).status, 404);
  close();
});

test('equipa com consultores não pode ser apagada', async () => {
  const { call, close } = await setup();
  const t = (await call('/api/teams', 'POST', { name: 'B', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 0 })).data as { id: number };
  await call('/api/consultants', 'POST', {
    code: 'C9', teamId: t.id, profile: 'x', seniority: 'junior',
    kind: 'external', costRateCentsPerDay: 1, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
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
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 1, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 2 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      kind: 'external', costRateCentsPerDay: 1, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
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
  const team = (await call('/api/teams', 'POST', { name: 'H', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 3 })).data as { id: number };
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
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 3 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      kind: 'external', costRateCentsPerDay: 1, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
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
  // headcount antigo (um só número) passa a budget de externos, coerente com os consultores migrados como externos
  const t = db.listTeams()[0]!;
  assert.deepEqual([t.plannedHeadcount, t.plannedInternalHeadcount, t.plannedExternalHeadcount], [2, 0, 2]);
  db.close();
});

test('formação: fecha gaps, alerta quando não fecha e quando está em atraso', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 3 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      kind: 'external', costRateCentsPerDay: 1, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
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

test('objetivos e avaliações: validação, agregados e sem dados individuais no resumo', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 2 })).data as { id: number };
  const mk = async (code: string) =>
    ((await call('/api/consultants', 'POST', {
      code, teamId: team.id, profile: 'x', seniority: 'pleno',
      kind: 'external', costRateCentsPerDay: 1, supplier: 'Fornecedor A', contractEnd: null, status: 'active',
    })).data as { id: number }).id;
  const c1 = await mk('C1');
  const c2 = await mk('C2');
  const year = businessDate().slice(0, 4);
  const obj = { teamId: null, title: 'Entregar EMIR', period: year, status: 'on_track', progressPct: 40, dueDate: null };

  // objetivo: exatamente um âmbito; período e coerência
  assert.equal((await call('/api/objectives', 'POST', { ...obj, consultantId: c1, teamId: team.id })).status, 400);
  assert.equal((await call('/api/objectives', 'POST', { ...obj, consultantId: null })).status, 400);
  assert.equal((await call('/api/objectives', 'POST', { ...obj, consultantId: c1, period: '26' })).status, 400);
  assert.equal((await call('/api/objectives', 'POST', { ...obj, consultantId: c1, status: 'achieved', progressPct: 60 })).status, 400);

  await call('/api/objectives', 'POST', { ...obj, consultantId: c1 });
  await call('/api/objectives', 'POST', { ...obj, consultantId: c1, title: 'Atrasado', status: 'at_risk', progressPct: 10, dueDate: '2020-01-01' });
  await call('/api/objectives', 'POST', { ...obj, consultantId: null, teamId: team.id, title: 'Equipa', status: 'achieved', progressPct: 100 });

  let s = (await call('/api/summary')).data as any;
  assert.equal(s.objectives.total, 3);
  assert.equal(s.objectives.achieved, 1);
  assert.equal(s.objectives.atRisk, 1);
  assert.equal(s.objectives.overdue, 1);
  assert.equal(s.objectives.avgProgressBp, 5000); // (40+10+100)/3 = 50 %
  const types = s.alerts.map((a: any) => a.type);
  for (const t of ['objective_at_risk', 'objective_overdue', 'consultant_without_objectives'])
    assert.ok(types.includes(t), t); // C2 não tem objetivos

  // avaliação final exige resumo; classificação 1–4; data não futura; único por período
  const ev = { consultantId: c1, period: year, rating: 3, summary: 'Entregou EMIR dentro do prazo', status: 'final', evaluatedAt: businessDate() };
  assert.equal((await call('/api/evaluations', 'POST', { ...ev, summary: '' })).status, 400);
  assert.equal((await call('/api/evaluations', 'POST', { ...ev, rating: 5 })).status, 400);
  assert.equal((await call('/api/evaluations', 'POST', { ...ev, evaluatedAt: '2999-01-01' })).status, 400);
  const created = await call('/api/evaluations', 'POST', ev);
  assert.equal(created.status, 201);
  assert.equal((await call('/api/evaluations', 'POST', ev)).status, 409);
  // rascunho pode ter resumo vazio
  assert.equal((await call('/api/evaluations', 'POST', { ...ev, consultantId: c2, status: 'draft', summary: '' })).status, 201);

  s = (await call('/api/summary')).data as any;
  assert.equal(s.evaluations.finalCount, 1);
  assert.equal(s.evaluations.draftCount, 1);
  assert.equal(s.evaluations.missingCount, 1); // C2 só tem rascunho

  // PRIVACIDADE: o resumo (que vai para o Claude) não contém notas nem textos individuais
  const raw = JSON.stringify(s);
  assert.ok(!raw.includes('Entregou EMIR dentro do prazo'));
  assert.ok(!raw.includes('"rating"'));
  assert.ok(!raw.includes('Atrasado'));
  assert.ok(!raw.includes('C1') || !raw.includes('Entregar EMIR'));

  // apagar consultor apaga objetivos e avaliações dele
  await call(`/api/consultants/${c1}`, 'DELETE');
  assert.equal(((await call('/api/evaluations')).data as any[]).length, 1);
  assert.equal(((await call('/api/objectives')).data as any[]).length, 1); // só o da equipa
  close();
});

test('internos não guardam rate; externos exigem rate; médias só de externos', async () => {
  const { call, close } = await setup();
  const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 3 })).data as { id: number };
  const base = { teamId: team.id, profile: 'x', seniority: 'pleno', contractEnd: null, status: 'active' };
  // interno: rate enviada é ignorada
  const int = await call('/api/consultants', 'POST', { ...base, code: 'I1', kind: 'internal', costRateCentsPerDay: 999_00, supplier: 'Fornecedor A'});
  assert.equal(int.status, 201);
  assert.equal((int.data as any).costRateCentsPerDay, 0);
  assert.equal((int.data as any).supplier, null);
  // externo sem rate é recusado; tipo é obrigatório
  assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'E0', kind: 'external', costRateCentsPerDay: 0, supplier: 'Fornecedor A'})).status, 400);
  assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'E0', costRateCentsPerDay: 10, supplier: 'Fornecedor A'})).status, 400);
  await call('/api/consultants', 'POST', { ...base, code: 'E1', kind: 'external', costRateCentsPerDay: 400_00, supplier: 'Fornecedor A'});
  await call('/api/consultants', 'POST', { ...base, code: 'E2', kind: 'external', costRateCentsPerDay: 500_00, supplier: 'Fornecedor A'});
  const s = (await call('/api/summary')).data as any;
  assert.equal(s.totals.internalHeadcount, 1);
  assert.equal(s.totals.externalHeadcount, 2);
  assert.equal(s.teams[0].activeHeadcount, 3); // internos contam para o headcount
  assert.equal(s.teams[0].avgCostRateCentsPerDay, 450_00); // interno não baixa a média
  assert.ok(!s.alerts.some((a: any) => a.type === 'missing_cost_rate'));
  const csv = (await call('/api/export?kind=consultants')).data as string;
  assert.ok(/I1;T;;x;pleno;internal;;;/.test(csv));
  close();
});

test('headcount por tipo, fornecedores e custo de externos', async () => {
  const { call, close } = await setup();
  try {
    // total bate certo (3 = 3) mas a composição não: 2 internos + 1 externo orçamentados, 0 internos + 3 externos reais
    const team = (await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 2, plannedExternalHeadcount: 1 })).data as any;
    assert.equal(team.plannedHeadcount, 3);
    const base = { teamId: team.id, profile: 'x', seniority: 'pleno', kind: 'external', contractEnd: null, status: 'active' };
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'E0', costRateCentsPerDay: 10 })).status, 400); // sem fornecedor
    await call('/api/consultants', 'POST', { ...base, code: 'E1', costRateCentsPerDay: 400_00, supplier: 'Acme' });
    await call('/api/consultants', 'POST', { ...base, code: 'E2', costRateCentsPerDay: 600_00, supplier: 'acme', contractEnd: businessDate() });
    await call('/api/consultants', 'POST', { ...base, code: 'E3', costRateCentsPerDay: 500_00, supplier: 'Beta' });
    let s = (await call('/api/summary')).data as any;
    assert.equal(s.teams[0].headcountGap, 0);
    const msgs = s.alerts.filter((a: any) => a.type === 'vacancies' || a.type === 'over_headcount').map((a: any) => a.message);
    assert.ok(msgs.some((m: string) => m.includes('2 open internal position(s)')));
    assert.ok(msgs.some((m: string) => m.includes('2 external over budget')));
    assert.equal(s.suppliers.length, 2); // Acme/acme agrupados
    assert.deepEqual(
      { ...s.suppliers[0] },
      { supplier: 'Acme', activeHeadcount: 2, shareBp: 6667, avgCostRateCentsPerDay: 500_00, monthlyCostCents: 20_000_00, annualCostCents: 220_000_00, contractsExpiring90d: 1, teams: ['T'] },
    );
    assert.equal(s.teams[0].externalMonthlyCostCents, 30_000_00); // (400+600+500) x 20
    assert.equal(s.totals.externalAnnualCostCents, 330_000_00); // x 11 meses
    assert.ok(!JSON.stringify(s).includes('billRate') && !JSON.stringify(s).includes('marginBp'));
  } finally {
    close();
  }
});

test('pessoas repartidas por equipas: headcount e custo em frações, sem dupla contagem', async () => {
  const { call, close } = await setup();
  try {
    const mkTeam = async (name: string, i: number, e: number) =>
      ((await call('/api/teams', 'POST', { name, budgetCents: 0, actualCents: 0, plannedInternalHeadcount: i, plannedExternalHeadcount: e })).data as any).id as number;
    assert.equal((await call('/api/teams', 'POST', { name: 'X', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0.255, plannedExternalHeadcount: 0 })).status, 400);
    const a = await mkTeam('A', 0.5, 1.5);
    const b = await mkTeam('B', 0.5, 0.5);
    const base = { profile: 'x', seniority: 'lead', contractEnd: null, status: 'active' };
    const ext = { ...base, kind: 'external', supplier: 'Acme' };
    // validações da repartição
    const bad = (extraTeams: unknown) => call('/api/consultants', 'POST', { ...base, code: 'BAD', kind: 'internal', teamId: a, extraTeams });
    assert.equal((await bad([{ teamId: a, pct: 50 }])).status, 400); // repete a principal
    assert.equal((await bad([{ teamId: b, pct: 100 }])).status, 400);
    assert.equal((await bad([{ teamId: b, pct: 50 }, { teamId: b, pct: 10 }])).status, 400);
    assert.equal((await bad([{ teamId: 9999, pct: 50 }])).status, 409); // equipa inexistente: nada fica gravado
    assert.equal(((await call('/api/consultants')).data as any[]).length, 0);

    // manager interno 50/50; gestor de projeto externo 50/50 a 400/dia; externo só de A a 300/dia
    const mgr = await call('/api/consultants', 'POST', { ...base, code: 'M1', kind: 'internal', teamId: a, extraTeams: [{ teamId: b, pct: 50 }] });
    assert.deepEqual((mgr.data as any).extraTeams, [{ teamId: b, pct: 50 }]);
    await call('/api/consultants', 'POST', { ...ext, code: 'PM1', teamId: a, costRateCentsPerDay: 400_00, extraTeams: [{ teamId: b, pct: 50 }] });
    await call('/api/consultants', 'POST', { ...ext, code: 'E1', teamId: a, costRateCentsPerDay: 300_00 });

    let s = (await call('/api/summary')).data as any;
    const [ta, tb] = s.teams;
    assert.deepEqual([ta.internalHeadcount, ta.externalHeadcount, ta.activeHeadcount, ta.headcountGap], [0.5, 1.5, 2, 0]);
    assert.deepEqual([tb.internalHeadcount, tb.externalHeadcount, tb.sharedIn, tb.headcountGap], [0.5, 0.5, 2, 0]);
    assert.equal(ta.externalMonthlyCostCents, 10_000_00); // (300 + 400/2) x 20
    assert.equal(tb.externalMonthlyCostCents, 4_000_00); // 400/2 x 20
    assert.deepEqual([s.totals.activeHeadcount, s.totals.sharedPeople, s.totals.plannedHeadcount], [3, 2, 3]); // 3 pessoas, não 5
    assert.equal(s.totals.externalMonthlyCostCents, 14_000_00);
    assert.ok(!s.alerts.some((x: any) => x.type === 'vacancies' || x.type === 'over_headcount'));

    // apagar a equipa B devolve as frações à equipa principal
    assert.equal((await call(`/api/teams/${b}`, 'DELETE')).status, 200);
    s = (await call('/api/summary')).data as any;
    assert.deepEqual([s.teams[0].internalHeadcount, s.teams[0].externalHeadcount], [1, 2]);
    assert.ok(s.alerts.some((x: any) => x.message.includes('0,5 internal over budget')));
  } finally {
    close();
  }
});

test('departamento: manager conta por igual em todas as equipas do departamento', async () => {
  const { call, close } = await setup();
  try {
    const mkTeam = async (name: string, deptId: number | null) =>
      ((await call('/api/teams', 'POST', { name, departmentId: deptId, budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 1, plannedExternalHeadcount: 0 })).data as any).id as number;
    const dep = (await call('/api/departments', 'POST', { name: 'Direção Dados' })).data as any;
    assert.equal(dep.name, 'Direção Dados');
    const a = await mkTeam('A', dep.id);
    await mkTeam('B', dep.id);
    const c = await mkTeam('C', dep.id);
    const solo = await mkTeam('Solo', null);
    const base: Omit<ConsultantInput, 'code' | 'teamId' | 'departmentId'> = { profile: 'Manager', seniority: 'lead', kind: 'internal', supplier: null, costRateCentsPerDay: 0, contractEnd: null, status: 'active', extraTeams: [] };

    // validações: equipa e departamento não se misturam; departamento tem de existir e ter equipas
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'M0', teamId: a, departmentId: dep.id })).status, 400);
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'M0', teamId: null, departmentId: 9999 })).status, 400);
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'M0', teamId: null, departmentId: dep.id, extraTeams: [{ teamId: solo, pct: 10 }] })).status, 400);
    const empty = (await call('/api/departments', 'POST', { name: 'Vazio' })).data as any;
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'M0', teamId: null, departmentId: empty.id })).status, 400);
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'M0', teamId: null, departmentId: null })).status, 400);

    const m = await call('/api/consultants', 'POST', { ...base, code: 'M1', teamId: null, departmentId: dep.id });
    assert.equal(m.status, 201);
    assert.equal((m.data as any).teamId, null);
    assert.equal((m.data as any).departmentId, dep.id);

    // 1 pessoa dividida por 3 equipas: 34 / 33 / 33 (sobra para as primeiras por id), soma sempre 1
    const s = (await call('/api/summary')).data as any;
    const byName = Object.fromEntries(s.teams.map((t: any) => [t.name, t]));
    assert.deepEqual([byName.A.internalHeadcount, byName.B.internalHeadcount, byName.C.internalHeadcount], [0.34, 0.33, 0.33]);
    assert.equal(byName.Solo.internalHeadcount, 0);
    assert.equal(s.totals.activeHeadcount, 1);
    assert.equal(s.totals.sharedPeople, 1);
    assert.equal(byName.A.sharedIn, 1);
    assert.ok(s.alerts.some((x: any) => x.type === 'vacancies' && x.scope === 'A')); // planeado 1 interno, têm 0,34

    // não se apaga um departamento com equipas
    assert.equal((await call(`/api/departments/${dep.id}`, 'DELETE')).status, 409);
    assert.equal((await call(`/api/teams/${c}`, 'PUT', { name: 'C', departmentId: null, budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 1, plannedExternalHeadcount: 0 })).status, 200);
    // com C fora do departamento, o manager passa a 1/2 em A e B (a equipa solta não entra)
    const s2 = (await call('/api/summary')).data as any;
    const byName2 = Object.fromEntries(s2.teams.map((t: any) => [t.name, t]));
    assert.deepEqual([byName2.A.internalHeadcount, byName2.B.internalHeadcount, byName2.C.internalHeadcount], [0.5, 0.5, 0]);
    assert.equal((await call(`/api/departments/${dep.id}`, 'PUT', { name: 'Direção Dados e IA' })).status, 200);
  } finally {
    close();
  }
});

test('migração: base com consultores de team_id obrigatório é recriada sem perder dados', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const path = join(mkdtempSync(join(tmpdir(), 'um-')), 'old-consultants.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, budget_cents INTEGER NOT NULL,
    actual_cents INTEGER NOT NULL, planned_headcount INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE consultants (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    profile TEXT NOT NULL, seniority TEXT NOT NULL, cost_rate_cents_per_day INTEGER NOT NULL, bill_rate_cents_per_day INTEGER,
    contract_end TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO teams VALUES (1,'Equipa A',0,0,2,'2026-01-01T00:00:00Z');
    INSERT INTO consultants (id, code, team_id, profile, seniority, cost_rate_cents_per_day, status, updated_at)
      VALUES (7,'C007',1,'QA','pleno',30000,'active','2026-01-01T00:00:00Z');`);
  old.close();
  const db = openDb(path);
  const c = db.getConsultant(7)!;
  assert.equal(c.code, 'C007');
  assert.equal(c.teamId, 1);
  assert.equal(c.departmentId, null);
  assert.equal(c.kind, 'external'); // migrado como antes
  // a nova forma aceita um manager de departamento e continua a recusar pessoas sem nada
  const d = db.createDepartment({ name: 'Direção' });
  db.createTeam({ name: 'Equipa B', departmentId: d, budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 0 });
  const base: Omit<ConsultantInput, 'code' | 'teamId' | 'departmentId'> = { profile: 'Manager', seniority: 'lead', kind: 'internal', supplier: null, costRateCentsPerDay: 0, contractEnd: null, status: 'active', extraTeams: [] };
  const mgr = db.createConsultant({ ...base, code: 'M1', teamId: null, departmentId: d });
  assert.ok(mgr > 7);
  assert.throws(() => db.createConsultant({ ...base, code: 'M2', teamId: null, departmentId: null }));
  assert.throws(() => db.createConsultant({ ...base, code: 'M3', teamId: 1, departmentId: d }));
  // as chaves estrangeiras continuam ativas depois da migração
  assert.throws(() => db.createConsultant({ ...base, code: 'M4', teamId: 999, departmentId: null }));
  db.close();
});

test('perfis: lista única, consultores só escolhem da lista, renomear propaga, apagar só se não estiver em uso', async () => {
  const { call, close } = await setup();
  try {
    const profiles = (await call('/api/profiles')).data as any[];
    assert.ok(profiles.some((p) => p.name === 'Big Data Trainee'));
    assert.ok(profiles.some((p) => p.name === 'Big Data Manager'));
    const pleno = profiles.find((p) => p.name === 'Big Data Mid-level');
    const t = ((await call('/api/teams', 'POST', { name: 'T', budgetCents: 0, actualCents: 0, plannedInternalHeadcount: 0, plannedExternalHeadcount: 0 })).data as any).id;
    const base = { teamId: t, extraTeams: [], seniority: 'pleno', kind: 'internal', supplier: null, costRateCentsPerDay: 0, contractEnd: null, status: 'active' };
    // perfil fora da lista é recusado; de dentro da lista é aceite
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'C1', profile: 'Engenheiro qualquer' })).status, 400);
    assert.equal((await call('/api/consultants', 'POST', { ...base, code: 'C1', profile: 'Big Data Mid-level' })).status, 201);
    // renomear o perfil atualiza quem o usa
    assert.equal((await call(`/api/profiles/${pleno.id}`, 'PUT', { name: 'Big Data Mid-Senior' })).status, 200);
    assert.equal(((await call('/api/consultants')).data as any[])[0].profile, 'Big Data Mid-Senior');
    // não se apaga um perfil em uso
    const renamed = ((await call('/api/profiles')).data as any[]).find((p) => p.name === 'Big Data Mid-Senior');
    assert.equal((await call(`/api/profiles/${renamed.id}`, 'DELETE')).status, 409);
    const trainee = profiles.find((p) => p.name === 'Big Data Trainee');
    assert.equal((await call(`/api/profiles/${trainee.id}`, 'DELETE')).status, 200);
    // nomes repetidos são recusados
    assert.equal((await call('/api/profiles', 'POST', { name: 'Big Data Manager' })).status, 409);
  } finally {
    close();
  }
});

test('migração: perfis em texto livre passam a constar da lista (nada fica inválido)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const path = join(mkdtempSync(join(tmpdir(), 'um-')), 'old-profiles.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, budget_cents INTEGER NOT NULL,
    actual_cents INTEGER NOT NULL, planned_headcount INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE consultants (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, team_id INTEGER NOT NULL REFERENCES teams(id),
    profile TEXT NOT NULL, seniority TEXT NOT NULL, cost_rate_cents_per_day INTEGER NOT NULL, bill_rate_cents_per_day INTEGER,
    contract_end TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO teams VALUES (1,'A',0,0,0,'2026-01-01T00:00:00Z');
    INSERT INTO consultants (id, code, team_id, profile, seniority, cost_rate_cents_per_day, status, updated_at)
      VALUES (1,'C001',1,'Data Engineer','pleno',0,'active','2026-01-01T00:00:00Z');`);
  old.close();
  const db = openDb(path);
  const names = db.listProfiles().map((p) => p.name);
  assert.ok(names.includes('Data Engineer'));
  assert.ok(names.includes('Big Data Manager'));
  assert.equal(db.getConsultant(1)!.profile, 'Data Engineer');
  db.close();
});
