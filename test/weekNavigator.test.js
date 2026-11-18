import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeekNavigator } from '../src/adapters/weekNavigator.js';

/** A fake reader whose week changes `delayPolls` polls after a click. */
function fakeReader({ delayPolls = 2, failClicks = 0 } = {}) {
  let week = 0;
  let pending = null;
  let clicks = 0;
  const button = (dir) => ({
    click() {
      clicks += 1;
      if (clicks <= failClicks) return; // simulate a click that never loads
      pending = { target: week + dir, polls: delayPolls };
    },
  });
  const tick = () => {
    if (pending && --pending.polls <= 0) {
      week = pending.target;
      pending = null;
    }
  };
  return {
    clicks: () => clicks,
    week: () => week,
    query: (sel) => (sel.includes('next') ? button(1) : button(-1)),
    rangeText: () => (tick(), `week ${week}`),
    signature: () => `sig ${week}`,
  };
}

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

test('next waits for the range to change and the page to settle', async () => {
  const reader = fakeReader();
  const clock = fakeClock();
  const nav = createWeekNavigator(reader, clock);
  assert.equal(await nav.next(), true);
  assert.equal(reader.week(), 1);
  assert.equal(await nav.back(1), true);
  assert.equal(reader.week(), 0);
});

test('retries once after a click that does not load', async () => {
  const reader = fakeReader({ failClicks: 1 });
  const nav = createWeekNavigator(reader, fakeClock());
  assert.equal(await nav.next(), true);
  assert.equal(reader.clicks(), 2);
  assert.equal(reader.week(), 1);
});

test('gives up after two failed clicks', async () => {
  const reader = fakeReader({ failClicks: 5 });
  const nav = createWeekNavigator(reader, fakeClock());
  assert.equal(await nav.next(), false);
  assert.equal(reader.clicks(), 2);
});
