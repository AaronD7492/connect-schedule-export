import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createPageReader } from '../src/adapters/pageReader.js';
import { createRegistry } from '../src/core/registry.js';
import { summarizeExport, MESSAGES, clockTime, shortDate } from '../src/core/summary.js';
import { normalizeSettings } from '../src/adapters/settings.js';

const html = readFileSync(new URL('./fixtures/week-2026-11-15.html', import.meta.url), 'utf8');
const fixtureWeek = createPageReader(new JSDOM(html).window.document).readWeek();
const emptyWeek = { range: 'empty', days: Array(7).fill({ label: 'Not scheduled', notScheduled: true, records: [] }) };
const now = new Date('2026-11-24T18:00:00Z');
const registry = createRegistry();
const defaults = normalizeSettings({});
const result = (weeks, stopReason = 'end-of-schedule', restored = true) => ({ weeks, stopReason, restored });

test('ready view for the fixture with default settings', () => {
  const s = summarizeExport(result([fixtureWeek, emptyWeek, emptyWeek]), registry, defaults, { now });
  assert.equal(s.status, 'ready');
  assert.equal(s.eventCount, 17);
  assert.equal(s.heading, 'Done: 3 weeks read');
  assert.deepEqual(s.lines, ['Sun Nov 15 to Thu Nov 19, 2026', '17 events ready']);
  assert.equal(s.filename, 'work-schedule_2026-11-15_to_2026-11-19.ics');
  assert.equal(s.preview[0], 'Sun Nov 15 · On Queue · 6:45 AM to 10:45 AM');
  assert.equal(s.moreCount, 14);
  assert.deepEqual(s.notes, []);
});

test('REQ-FUNC-0013 excluding Meal removes those events and says so', () => {
  const settings = normalizeSettings({ excludedNames: ['Meal'] });
  const s = summarizeExport(result([fixtureWeek]), registry, settings, { now });
  assert.equal(s.eventCount, 12); // 17 events minus 5 meals
  assert.ok(!s.text.includes('SUMMARY:Meal'));
  assert.ok(s.lines.includes('Left out by you: Meal'));
  assert.ok(s.preview.every((line) => !line.includes('Meal')));
});

test('REQ-FUNC-0010 renames show in the preview and the file', () => {
  const settings = normalizeSettings({ renames: { 'On Queue': 'Work' } });
  const s = summarizeExport(result([fixtureWeek]), registry, settings, { now });
  assert.equal(s.preview[0], 'Sun Nov 15 · Work · 6:45 AM to 10:45 AM');
  assert.ok(s.text.includes('SUMMARY:Work'));
});

test('REQ-FUNC-0009 reminders on adds alarms and a summary line', () => {
  const settings = normalizeSettings({ remindersOn: true, reminderMinutes: 10 });
  const s = summarizeExport(result([fixtureWeek]), registry, settings, { now });
  assert.equal(s.text.match(/TRIGGER:-PT10M/g).length, 17);
  assert.ok(s.lines.includes('Reminders 10 min before'));
});

test('REQ-FUNC-0012 this week only uses just the first week', () => {
  const nextWeek = structuredClone(fixtureWeek); // same activities, so duplicates are dropped either way
  const settings = normalizeSettings({ scope: 'current' });
  const s = summarizeExport(result([fixtureWeek, nextWeek, emptyWeek], 'end-of-schedule'), registry, settings, { now });
  assert.equal(s.heading, 'Done: this week only');
  assert.equal(s.eventCount, 17);
});

test('switching to all weeks after a this-week-only read asks to run again', () => {
  const s = summarizeExport(result([fixtureWeek], 'week-limit'), registry, defaults, { now, readAllWeeks: false });
  assert.ok(s.notes.includes(MESSAGES.readAgain));
  assert.ok(!s.notes.some((n) => n.includes('safety limit')));
});

test('excluding every type gives the nothing-to-export message', () => {
  const settings = normalizeSettings({ excludedNames: ['On Queue', 'On Queue - In Office', 'Meal', 'Project'] });
  const s = summarizeExport(result([fixtureWeek]), registry, settings, { now });
  assert.equal(s.status, 'nothing');
});

test('notes for a failed week, an unrestored page and blocked storage', () => {
  const s = summarizeExport(result([fixtureWeek], 'week-load-failed', false), registry, defaults, { now, persisted: false });
  assert.ok(s.notes[0].startsWith("A week didn't load"));
  assert.ok(s.notes.includes(MESSAGES.restoreFailed));
  assert.ok(s.notes.includes(MESSAGES.storageOff));
});

test('layout change is reported', () => {
  assert.equal(summarizeExport(result([]), registry, defaults, { now }).status, 'layout-changed');
});

test('time and date formatting', () => {
  const t = (hour, minute) => ({ year: 2026, month: 11, day: 15, hour, minute, wallMs: Date.UTC(2026, 10, 15, hour, minute) });
  assert.equal(clockTime(t(0, 5)), '12:05 AM');
  assert.equal(clockTime(t(12, 0)), '12:00 PM');
  assert.equal(clockTime(t(17, 30)), '5:30 PM');
  assert.equal(shortDate(t(9, 0)), 'Sun Nov 15');
});
