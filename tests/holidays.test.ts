import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadYear } from '../server/holidays';
test('calendar fetch validates year, rejects unpublished empty data, and falls back after network failure', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const payload = { year: 2026, papers: ['https://example.test/notice'], days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }] };
  let calls = 0;
  globalThis.fetch = async () => { calls++; if (calls === 1) throw new Error('offline'); return new Response(JSON.stringify(payload)); };
  const value = await downloadYear(2026); assert.equal(calls, 2); assert.equal(value.days[0].isOffDay, true);
  globalThis.fetch = async () => new Response(JSON.stringify({ year: 2027, papers: [], days: [] }));
  await assert.rejects(downloadYear(2027), /未取得/);
  await assert.rejects(downloadYear(2026), /年份不匹配/);
});
