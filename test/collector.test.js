import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSchedule, isEmptyDay, prepareExport } from '../src/core/collector.js';
import { createRegistry } from '../src/core/registry.js';

const notScheduledDay = { label: 'x Not scheduled', notScheduled: true, records: [] };
const workDay = { label: 'x', notScheduled: false, records: [{ description: 'Activity On Queue (type: PRODUCTIVE) ...' }] };
const absentDay = { label: 'x', notScheduled: false, records: [{ description: 'Activity Paid Absent (type: NON_PRODUCTIVE) ...' }] };

const week = (range, days) => ({ range, days });
const emptyWeek = (range) => week(range, Array(7).fill(notScheduledDay));

/** Fake page: a list of weeks and a cursor moved by the fake navigator. */
function fakePage(weeks) {
  let index = 0;
  const reader = { readWeek: () => weeks[index] };
  const navigator = {
    moves: [],
    async next() {
      if (index + 1 >= weeks.length) return false;
      index += 1;
      this.moves.push('next');
      return true;
    },
    async back(steps) {
      index -= steps;
      this.moves.push(`back ${steps}`);
      return index === 0;
    },
  };
  return { reader, navigator, position: () => index };
}

test('isEmptyDay: labelled, no records, or only Not Scheduled blocks', () => {
  assert.equal(isEmptyDay(notScheduledDay), true);
  assert.equal(isEmptyDay({ notScheduled: false, records: [] }), true);
  assert.equal(isEmptyDay({ notScheduled: false, records: [{ description: 'Activity  (type: NOT_SCHEDULED) starts' }] }), true);
  assert.equal(isEmptyDay(workDay), false);
  assert.equal(isEmptyDay(absentDay), false);
});

test('UT-12 stops after exactly 14 empty days and returns to the start week', async () => {
  const weeks = [
    week('w1', [workDay, workDay, workDay, workDay, workDay, notScheduledDay, notScheduledDay]),
    week('w2', [notScheduledDay, notScheduledDay, notScheduledDay, notScheduledDay, notScheduledDay, notScheduledDay, notScheduledDay]),
    week('w3', [notScheduledDay, notScheduledDay, notScheduledDay, notScheduledDay, notScheduledDay, workDay, notScheduledDay]),
    emptyWeek('w4'),
    emptyWeek('w5'),
    emptyWeek('w6'),
  ];
  const page = fakePage(weeks);
  const result = await collectSchedule({ reader: page.reader, navigator: page.navigator });
  // w1 ends with 2 empty, w2 adds 7 (9), w3 has a work day on day 6 (reset, then 1), w4 7 (8), w5 7 (15 >= 14).
  assert.deepEqual(result.weeks.map((w) => w.range), ['w1', 'w2', 'w3', 'w4', 'w5']);
  assert.equal(result.stopReason, 'end-of-schedule');
  assert.equal(result.restored, true);
  assert.equal(page.position(), 0);
});

test('UT-12 a two-week vacation of Paid Absent does not stop the export', async () => {
  const vacation = Array(7).fill(absentDay);
  const page = fakePage([week('w1', vacation), week('w2', vacation), week('w3', Array(7).fill(workDay)), emptyWeek('w4'), emptyWeek('w5')]);
  const result = await collectSchedule({ reader: page.reader, navigator: page.navigator });
  assert.equal(result.weeks.length, 5);
});

test('a week that fails to load stops with what was read', async () => {
  const page = fakePage([week('w1', Array(7).fill(workDay))]);
  const result = await collectSchedule({ reader: page.reader, navigator: page.navigator });
  assert.equal(result.stopReason, 'week-load-failed');
  assert.equal(result.weeks.length, 1);
});

test('safety limit stops the loop', async () => {
  const page = fakePage(Array(40).fill(week('w', Array(7).fill(workDay))));
  const result = await collectSchedule({ reader: page.reader, navigator: page.navigator, maxWeeks: 26 });
  assert.equal(result.stopReason, 'week-limit');
  assert.equal(result.weeks.length, 26);
  assert.equal(page.position(), 0);
});

test('cancel stops before the next week and still returns to the start', async () => {
  let cancelled = false;
  const page = fakePage([week('w1', Array(7).fill(workDay)), week('w2', Array(7).fill(workDay)), week('w3', Array(7).fill(workDay))]);
  const result = await collectSchedule({
    reader: page.reader,
    navigator: page.navigator,
    onProgress: ({ weeksRead }) => {
      if (weeksRead === 2) cancelled = true;
    },
    isCancelled: () => cancelled,
  });
  assert.equal(result.stopReason, 'cancelled');
  assert.equal(page.position(), 0);
});

test('prepareExport flags a changed layout', () => {
  const registry = createRegistry();
  assert.equal(prepareExport([], registry).layoutChanged, true);
  assert.equal(prepareExport([week('w', [{ notScheduled: false, records: [] }])], registry).layoutChanged, true);
  assert.equal(
    prepareExport([week('w', [{ notScheduled: false, records: [{ elementId: 'x', description: 'garbage' }] }])], registry).layoutChanged,
    true,
  );
  assert.equal(prepareExport([emptyWeek('w')], registry).layoutChanged, false);
});
