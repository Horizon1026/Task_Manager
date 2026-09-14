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
