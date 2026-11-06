import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centsToInput, parseEuroToCents } from './money.ts';
import { businessDate } from '../shared/dates.ts';

test('parseEuroToCents aceita formato PT e converte sem float', () => {
  assert.equal(parseEuroToCents('1.234,56'), 123_456);
  assert.equal(parseEuroToCents('1234,5'), 123_450);
  assert.equal(parseEuroToCents('0'), 0);
  assert.equal(parseEuroToCents('  10 '), 1_000);
  assert.equal(parseEuroToCents('0,07'), 7);
});

test('parseEuroToCents rejeita formatos ambíguos ou inválidos', () => {
  for (const bad of ['1234.56', '1.23', '1,234', '', '-5', 'abc', '1.234.56', '12,', '1e3'])
    assert.equal(parseEuroToCents(bad), null, bad);
});

test('centsToInput faz o caminho inverso', () => {
  assert.equal(centsToInput(5), '0,05');
  assert.equal(centsToInput(123_456), '1234,56');
  assert.equal(parseEuroToCents(centsToInput(99_999)), 99_999);
});

test('businessDate usa o dia civil de Lisboa, não UTC', () => {
  assert.equal(businessDate(new Date('2026-07-01T23:30:00Z')), '2026-07-02'); // verão: UTC+1
  assert.equal(businessDate(new Date('2026-01-01T23:30:00Z')), '2026-01-01'); // inverno: UTC+0
});
