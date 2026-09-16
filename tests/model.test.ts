import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultStatusColors, validateProject } from '../src/model';
import { project } from './fixtures';

test('status colors are YAML-configurable, validated, and defaulted for legacy projects', () => {
  const legacy = JSON.parse(JSON.stringify(project()));
  delete legacy.project.status_colors;
  assert.deepEqual(validateProject(legacy).project.status_colors, defaultStatusColors);

  const configured = JSON.parse(JSON.stringify(project()));
  configured.project.status_colors['进行中'] = { fill: '#123456', border: '#234567', text: '#345678' };
  assert.deepEqual(validateProject(configured).project.status_colors['进行中'], configured.project.status_colors['进行中']);
  configured.project.status_colors['进行中'].fill = 'red';
  assert.throws(() => validateProject(configured), /#RRGGBB/);
});

test('task assignees must be selected from the project assignee list', () => {
  const configured = JSON.parse(JSON.stringify(project()));
  configured.project.assignees = ['小林']; configured.tasks[0].assignee = '小林';
  assert.equal(validateProject(configured).tasks[0].assignee, '小林');
  configured.tasks[0].assignee = '名单外成员';
  assert.throws(() => validateProject(configured), /不在项目名单/);
});

test('collapse_children defaults to false for legacy tasks', () => {
  const legacy = JSON.parse(JSON.stringify(project()));
  delete legacy.tasks[0].collapse_children;
  assert.equal(validateProject(legacy).tasks[0].collapse_children, false);
});
