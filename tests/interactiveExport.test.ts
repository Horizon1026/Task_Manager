import assert from 'node:assert/strict';
import test from 'node:test';
import { createInteractiveGanttHtml, interactiveExportFilename } from '../src/interactiveExport';
import { project, task } from './fixtures';

test('interactive export is one self-contained HTML document with project schedules and viewer controls', () => {
  const value = project([
    task('before', { name: '需求 <梳理>', duration_days: 1 }),
    task('after', { name: '实现', dependencies: ['before'], labels: ['开发'] }), task('release', { name: '发布' }),
  ]);
  value.project.allow_assignee_parallel_tasks = false;
  value.project.name = '演示 </script><script>alert(1)</script>';
  const html = createInteractiveGanttHtml(value, {
    scale: 'week', filter: { labels: ['开发'], mode: 'or' }, draft: true,
    exportedAt: new Date('2026-09-18T01:02:03.000Z'),
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /TaskManager 交互式甘特图/);
  assert.match(html, /type="application\/json"/);
  assert.match(html, /data-scale="week"/);
  assert.match(html, /dependencies/);
  assert.match(html, /"kind":"assignee"/);
  assert.match(html, /<line class="edge-arrowhead"[^>]+marker-end="url\(#arrow\)"/);
  assert.match(html, /"start":/);
  assert.match(html, /包含未保存草稿/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<(?:link|script)[^>]+(?:href|src)=/);
});

test('interactive export filename removes forbidden path characters', () => {
  assert.equal(interactiveExportFilename(' A/B:*项目? ', new Date(2026, 8, 18)), 'A_B__项目__甘特图_2026-09-18.html');
});
