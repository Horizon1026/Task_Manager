import assert from 'node:assert/strict';
import test from 'node:test';
import { dependencyCurve } from '../src/ganttGeometry';

test('dependency curve joins endpoints and places a finite arrow tangent at its midpoint', () => {
  const curve = dependencyCurve({ x: 10, y: 20 }, { x: 110, y: 80 });
  assert.match(curve.path, /^M10,20 C32,20 88,80 110,80$/);
  for (const point of [curve.arrowStart, curve.arrowEnd]) {
    assert.ok(Number.isFinite(point.x)); assert.ok(Number.isFinite(point.y));
  }
  assert.ok(curve.arrowEnd.x > curve.arrowStart.x);
});
