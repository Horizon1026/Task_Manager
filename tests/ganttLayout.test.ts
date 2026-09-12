import test from 'node:test';
import assert from 'node:assert/strict';
import { ganttTreeLayout } from '../src/ganttLayout';
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
