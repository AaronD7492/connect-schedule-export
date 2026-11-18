import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createPageReader } from '../src/adapters/pageReader.js';
import { collectSchedule, prepareExport } from '../src/core/collector.js';
import { createRegistry } from '../src/core/registry.js';
import { buildCalendar } from '../src/core/icsBuilder.js';

const fixtureHtml = readFileSync(new URL('./fixtures/week-2026-11-15.html', import.meta.url), 'utf8');
const loadFixture = (html = fixtureHtml) => new JSDOM(html).window.document;

test('PT-01 reads 19 records from the Nov 15 fixture, 2 of them Not Scheduled', () => {
  const reader = createPageReader(loadFixture());
  assert.equal(reader.isSchedulePage(), true);
  assert.equal(reader.rangeText(), 'November 15, 2026 — November 21, 2026');
  assert.equal(reader.timeZoneText(), 'US/Eastern GMT -05:00');

  const week = reader.readWeek();
  assert.equal(week.days.length, 7);
  assert.deepEqual(week.days.map((d) => d.notScheduled), [false, false, false, false, false, true, true]);
  const records = week.days.flatMap((d) => d.records);
  assert.equal(records.length, 19);
  assert.equal(records.filter((r) => r.description.includes('NOT_SCHEDULED')).length, 2);
  assert.match(records[0].elementId, /^00000000-0000-4000-8000-000000000001-activity1794743100$/);
  assert.equal(records[0].paidText, 'Paid: Yes');
});

test('UT-01 all fixture activities parse and match the screenshot', () => {
  const reader = createPageReader(loadFixture());
  const plan = prepareExport([reader.readWeek()], createRegistry());
  assert.equal(plan.unreadable.length, 0);
  assert.equal(plan.kept.length, 17);
  assert.equal(plan.skipped.size, 0);
  const first = plan.kept[0];
  assert.equal(first.name, 'On Queue');
  assert.equal(first.startUtc.toISOString(), '2026-11-15T11:45:00.000Z'); // 6:45 AM Eastern
  assert.equal(first.endUtc.toISOString(), '2026-11-15T15:45:00.000Z'); // 10:45 AM Eastern
  const tuesdayProject = plan.kept.find((a) => a.name === 'Project' && a.startLocal.day === 17);
  assert.equal(tuesdayProject.endUtc.toISOString(), '2026-11-17T22:00:00.000Z'); // 5:00 PM Eastern
  // Nov 17 10:30 AM block shows no Type/Paid lines on the page.
  const noPaid = plan.kept.find((a) => a.startLocal.day === 17 && a.startLocal.hour === 10);
  assert.equal(noPaid.paid, null);
});

test('PT-02 full export across the fixture plus two empty weeks gives 17 events', async () => {
  const reader = createPageReader(loadFixture());
  const fixtureWeek = reader.readWeek();
  const empty = { range: 'empty', days: Array(7).fill({ label: 'Not scheduled', notScheduled: true, records: [] }) };
  const weeks = [fixtureWeek, empty, empty];
  let index = 0;
  const result = await collectSchedule({
    reader: { readWeek: () => weeks[index] },
    navigator: {
      next: async () => (++index, true),
      back: async (steps) => ((index -= steps), index === 0),
    },
  });
  assert.equal(result.weeks.length, 3);
  assert.equal(index, 0);
  const plan = prepareExport(result.weeks, createRegistry());
  const { eventCount, text } = buildCalendar(plan.kept, { now: new Date('2026-11-18T21:00:00Z') });
  assert.equal(eventCount, 17);
  assert.equal(text.match(/BEGIN:VEVENT/g).length, 17);
});

test('PT-03 a page with the activity markup removed is reported as changed', () => {
  const doc = loadFixture();
  for (const el of doc.querySelectorAll('[data-testid="activity-body"]')) el.remove();
  for (const el of doc.querySelectorAll('[data-testid="agent-calendar-day"]')) el.setAttribute('aria-label', 'Monday');
  const plan = prepareExport([createPageReader(doc).readWeek()], createRegistry());
  assert.equal(plan.layoutChanged, true);
});

test('finds the schedule inside an open shadow root', () => {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>');
  const doc = dom.window.document;
  const shadow = doc.getElementById('host').attachShadow({ mode: 'open' });
  shadow.innerHTML = loadFixture().body.innerHTML;
  const reader = createPageReader(doc);
  assert.equal(reader.isSchedulePage(), true);
  assert.equal(reader.readWeek().days.length, 7);
});

test('not the schedule page', () => {
  const reader = createPageReader(new JSDOM('<p>hello</p>').window.document);
  assert.equal(reader.isSchedulePage(), false);
});
