import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEffectiveDependencyGraph } from '../src/effectiveDependencies';
import { project, task } from './fixtures';

test('parallel mode keeps only persisted dependencies', () => {
  const value = project([task('a'), task('b', { dependencies: ['a'] }), task('c')]);
  const graph = buildEffectiveDependencyGraph(value);
  assert.deepEqual(graph.edges, [{ from: 'a', to: 'b', kind: 'explicit' }]);
});

test('scheduler resource edges combine without mutating persisted dependencies', () => {
  const value = project([
    task('a', { assignee: '甲' }), task('group', { assignee: '甲' }),
    task('child', { assignee: '甲', parent_uid: 'group' }), task('b', { assignee: '乙' }), task('c', { assignee: '甲' }),
  ]);
  value.project.assignees = ['甲', '乙']; value.project.allow_assignee_parallel_tasks = false;
  const before = structuredClone(value.tasks);
  assert.deepEqual(buildEffectiveDependencyGraph(value, [
    { from: 'a', to: 'child', kind: 'assignee' },
    { from: 'child', to: 'c', kind: 'assignee' },
  ]).edges, [
    { from: 'a', to: 'child', kind: 'assignee' },
    { from: 'child', to: 'c', kind: 'assignee' },
  ]);
  assert.deepEqual(value.tasks, before);
});

test('explicit dependency wins over a duplicate resource edge and invalid composed graphs are rejected', () => {
  const value = project([task('a'), task('b', { dependencies: ['a'] })]);
  assert.deepEqual(buildEffectiveDependencyGraph(value, [{ from: 'a', to: 'b', kind: 'assignee' }]).edges, [{ from: 'a', to: 'b', kind: 'explicit' }]);
  assert.throws(() => buildEffectiveDependencyGraph(value, [{ from: 'b', to: 'a', kind: 'assignee' }]), /有效依赖形成循环/);
});
