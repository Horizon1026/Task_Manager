import test from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, localMinuteDay, millisecondsUntilNextMinute } from '../src/dateCalendar';

test('local timeline position uses the current local minute', () => {
  const first = new Date(2026, 8, 16, 12, 34, 59);
  const next = new Date(2026, 8, 16, 12, 35, 0);
  assert.equal(localMinuteDay(first), dayNumber('2026-09-16') + (12 * 60 + 34) / 1440);
  assert.ok(Math.abs(localMinuteDay(next) - localMinuteDay(first) - 1 / 1440) < 1e-9);
  assert.equal(millisecondsUntilNextMinute(first.getTime()), 1010);
  assert.ok(Math.abs(localMinuteDay(new Date(2026, 8, 17, 0, 0)) - localMinuteDay(new Date(2026, 8, 16, 23, 59)) - 1 / 1440) < 1e-9);
});
