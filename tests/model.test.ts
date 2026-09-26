import assert from 'node:assert/strict';
import test from 'node:test';
import { statuses, validateProject } from '../src/model';
import { statusColorsByTheme } from '../src/theme';
import { project } from './fixtures';

test('theme palettes cover every task status and legacy YAML colors are removed', () => {
  for (const status of statuses) {
    assert.ok(statusColorsByTheme.light[status].fill);
    assert.ok(statusColorsByTheme.dark[status].fill);
    assert.notEqual(statusColorsByTheme.light[status].fill, statusColorsByTheme.dark[status].fill);
  }
  const legacy = JSON.parse(JSON.stringify(project()));
  legacy.project.status_colors = { '进行中': { fill: '#123456' } };
  assert.equal('status_colors' in validateProject(legacy).project, false);
  legacy.project.unexpected = true;
  assert.throws(() => validateProject(legacy), /Unrecognized key/);
});

test('project theme defaults to light and accepts only supported YAML values', () => {
  const legacy = JSON.parse(JSON.stringify(project()));
  delete legacy.project.theme;
  assert.equal(validateProject(legacy).project.theme, 'light');
  legacy.project.theme = 'dark';
  assert.equal(validateProject(legacy).project.theme, 'dark');
  legacy.project.theme = 'blue';
  assert.throws(() => validateProject(legacy), /project.theme/);
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

test('legacy projects allow assignee parallelism by default and duplicate assignees are rejected', () => {
  const legacy = JSON.parse(JSON.stringify(project()));
  delete legacy.project.allow_assignee_parallel_tasks;
  assert.equal(validateProject(legacy).project.allow_assignee_parallel_tasks, true);
  legacy.project.assignees = ['未指定', '未指定'];
  assert.throws(() => validateProject(legacy), /不能包含重复名称/);
});
