import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyFocus, displayDependencyEdges, ganttTreeLayout } from '../src/ganttLayout';
import { project, task } from './fixtures';

test('tree Gantt layout nests child rectangles inside each parent rectangle', () => {
  const value = ganttTreeLayout(project([
    task('parent'), task('child-a', { parent_uid: 'parent' }),
    task('nested', { parent_uid: 'child-a' }), task('child-b', { parent_uid: 'parent' }), task('root'),
  ]));
  const byUid = new Map(value.items.map(item => [item.task.uid, item]));
  const parent = byUid.get('parent')!, childA = byUid.get('child-a')!, nested = byUid.get('nested')!, childB = byUid.get('child-b')!, root = byUid.get('root')!;
  assert.equal(parent.depth, 0); assert.equal(childA.depth, 1); assert.equal(nested.depth, 2);
  assert.ok(parent.top < childA.top && parent.top + parent.height > childB.top + childB.height);
  assert.ok(childA.top < nested.top && childA.top + childA.height > nested.top + nested.height);
  assert.equal(value.height, root.top + root.height);
});

test('collapsed parents hide every descendant and retain a single row', () => {
  const value = ganttTreeLayout(project([
    task('parent', { collapse_children: true }), task('child', { parent_uid: 'parent' }),
    task('nested', { parent_uid: 'child' }), task('root'),
  ]));
  assert.deepEqual(value.items.map(item => item.task.uid), ['parent', 'root']);
  assert.equal(value.items[0].height, 42);
});

test('dependency display projects hidden endpoints, removes internal loops and deduplicates edges', () => {
  const p = project([
    task('left', { collapse_children: true }),
    task('left-a', { parent_uid: 'left' }),
    task('left-b', { parent_uid: 'left', dependencies: ['left-a'] }),
    task('right', { collapse_children: true }),
    task('right-a', { parent_uid: 'right', dependencies: ['left-a'] }),
    task('right-b', { parent_uid: 'right', dependencies: ['left-b'] }),
    task('external', { dependencies: ['left-a'] }),
  ]);
  assert.deepEqual(displayDependencyEdges(p, new Set(['left', 'right', 'external'])), [
    { from: 'left', to: 'right' },
    { from: 'left', to: 'external' },
  ]);
});

test('dependency focus keeps one-hop neighbors and structural ancestors, and rolls up a parent subtree', () => {
  const p = project([
    task('before'), task('group'), task('inside-a', { parent_uid: 'group', dependencies: ['before'] }),
    task('inside-b', { parent_uid: 'group', dependencies: ['inside-a'] }),
    task('after', { dependencies: ['inside-b'] }), task('far', { dependencies: ['after'] }), task('unrelated'),
  ]);
  const leaf = dependencyFocus(p, 'after');
  assert.deepEqual([...leaf.coreUids], ['after', 'inside-b', 'far']);
  assert.deepEqual([...leaf.visibleUids], ['after', 'inside-b', 'far', 'group']);
  const parent = dependencyFocus(p, 'group');
  assert.deepEqual([...parent.coreUids], ['group', 'before', 'after']);
  assert.deepEqual([...parent.visibleUids], ['group', 'before', 'after']);
  assert.deepEqual([...parent.memberUids].sort(), ['group', 'inside-a', 'inside-b']);
});
