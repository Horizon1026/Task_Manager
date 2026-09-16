import assert from 'node:assert/strict';
import test from 'node:test';
import { filterOptions } from '../src/selectSearch';

const options = [
  { value: 'task-discovery', label: '12. 需求梳理' },
  { value: 'task-design', label: '13. UI 设计' },
  { value: 'task-chongqing', label: '14. 重庆交付' },
];
test('select search matches Chinese, pinyin, initials, UID and order without changing options', () => {
  const before = structuredClone(options);
  for (const query of ['需求', '梳理', 'xuqiushuli', 'xu qiu', 'XQSL', ' xq ', 'task-discovery', '12']) {
    assert.deepEqual(filterOptions(options, query), [options[0]], query);
  }
  assert.deepEqual(filterOptions(options, 'ui'), [options[1]]);
  assert.deepEqual(filterOptions(options, 'TASK-DESIGN'), [options[1]]);
  assert.deepEqual(options, before);
});
test('select search handles polyphones, aliases, blank queries, and no matches', () => {
  for (const query of ['chongqing', 'zhongqing', 'cq']) assert.deepEqual(filterOptions(options, query), [options[2]], query);
  assert.deepEqual(filterOptions(options, '  '), options);
  assert.deepEqual(filterOptions(options, 'nonexistent'), []);
  assert.deepEqual(filterOptions([], 'x'), []);
  assert.equal(filterOptions([{ value: 'x', label: '交付', keywords: ['产品发布'] }], 'cpfb').length, 1);
});
