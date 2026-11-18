import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, escapeText, foldLine } from '../src/core/icsBuilder.js';

const meal = {
  id: 'bdcc308b-e1cd-4a16-9a58-a8bfcd87c7f3',
  name: 'Meal',
  type: 'NON_PRODUCTIVE',
  startUtc: new Date('2026-11-15T15:45:00Z'),
  endUtc: new Date('2026-11-15T16:15:00Z'),
  paid: null,
};
const now = new Date('2026-11-18T21:00:00Z');

test('UT-08 sample event matches the design document byte for byte', () => {
  const { text, eventCount } = buildCalendar([meal], { remindersOn: true, reminderMinutes: 15, now });
  const expected =
    [
      'BEGIN:VCALENDAR',
      'PRODID:-//connect-schedule-export//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Work schedule',
      'BEGIN:VEVENT',
      'UID:bdcc308b-e1cd-4a16-9a58-a8bfcd87c7f3@connect-schedule-export',
      'DTSTAMP:20261118T210000Z',
      'DTSTART:20261115T154500Z',
      'DTEND:20261115T161500Z',
      'SUMMARY:Meal',
      'DESCRIPTION:Type: Non-Productive',
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Meal',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n';
  assert.equal(text, expected);
  assert.equal(eventCount, 1);
});

test('UT-09 long text is folded at 75 bytes and special characters are escaped', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'SUMMARY:' + 'x'.repeat(200);
  const folded = foldLine(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  // Multi-byte characters are never split.
  const accents = 'SUMMARY:' + 'é'.repeat(60);
  for (const line of foldLine(accents).split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});

test('UT-10 reminders off by default; on adds a VALARM with the chosen minutes', () => {
  assert.ok(!buildCalendar([meal], { now }).text.includes('VALARM'));
  assert.ok(buildCalendar([meal], { now, remindersOn: true, reminderMinutes: 30 }).text.includes('TRIGGER:-PT30M'));
});

test('UT-11 renamed and excluded types', () => {
  const onQueue = { ...meal, id: 'q1', name: 'On Queue - In Office', type: 'PRODUCTIVE', paid: true };
  const { text, eventCount } = buildCalendar([meal, onQueue], {
    now,
    renames: { 'On Queue - In Office': 'Work (Office)' },
    excludedNames: ['meal'],
  });
  assert.equal(eventCount, 1);
  assert.ok(text.includes('SUMMARY:Work (Office)'));
  assert.ok(text.includes('DESCRIPTION:Type: Productive\\nPaid: Yes'));
  assert.ok(!text.includes('SUMMARY:Meal'));
});

test('zero-length events are never written', () => {
  const zero = { ...meal, endUtc: meal.startUtc };
  assert.equal(buildCalendar([zero], { now }).eventCount, 0);
});
