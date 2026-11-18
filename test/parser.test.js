import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecord, parseLocalTime, typeLabel } from '../src/core/parser.js';

const record = (description, elementId = '00000000-0000-4000-8000-000000000001-activity1794757500', paidText = null) => ({
  elementId,
  description,
  paidText,
});

test('UT-02 keeps names with dashes, and reads type, times and paid', () => {
  const r = parseRecord(
    record(
      'Activity On Queue - In Office (type: PRODUCTIVE) starts at Nov 16, 2026, 10:00 AM, Monday and ends at Nov 16, 2026, 2:00 PM, Monday',
      'abc-def-activity1794841200',
      'Paid: Yes',
    ),
  );
  assert.equal(r.ok, true);
  assert.equal(r.activity.name, 'On Queue - In Office');
  assert.equal(r.activity.id, 'abc-def');
  assert.equal(r.activity.type, 'PRODUCTIVE');
  assert.equal(r.activity.paid, true);
  assert.equal(r.activity.startUtc.toISOString(), '2026-11-16T15:00:00.000Z');
  assert.equal(r.activity.endUtc.toISOString(), '2026-11-16T19:00:00.000Z');
});

test('start comes from the timestamp, end from the duration', () => {
  const r = parseRecord(
    record(
      'Activity Meal (type: NON_PRODUCTIVE) starts at Nov 15, 2026, 10:45 AM, Sunday and ends at Nov 15, 2026, 11:15 AM, Sunday',
    ),
  );
  assert.equal(r.activity.startUtc.toISOString(), '2026-11-15T15:45:00.000Z');
  assert.equal(r.activity.endUtc.toISOString(), '2026-11-15T16:15:00.000Z');
  assert.equal(r.activity.paid, null);
});

test('UT-03 activity crossing midnight is 4 hours long and ends the next day', () => {
  // Made-up overnight shift: 10:00 PM Nov 20 (03:00Z Nov 21) to 2:00 AM Nov 21, Eastern.
  const r = parseRecord(
    record(
      'Activity On Queue (type: PRODUCTIVE) starts at Nov 20, 2026, 10:00 PM, Friday and ends at Nov 21, 2026, 2:00 AM, Saturday',
      'x-activity1795230000',
    ),
  );
  assert.equal(r.ok, true);
  assert.equal(r.activity.endUtc - r.activity.startUtc, 4 * 3600 * 1000);
  assert.equal(r.activity.endUtc.toISOString(), '2026-11-21T07:00:00.000Z');
});

test('UT-04 daylight-saving day: times stay correct when the activity does not span 2 AM', () => {
  // Nov 1, 2026 is the fall-back day in US/Eastern (EST, UTC-5, after 2 AM).
  // 9:00 AM EST = 14:00Z = 1793541600.
  const r = parseRecord(
    record(
      'Activity On Queue (type: PRODUCTIVE) starts at Nov 1, 2026, 9:00 AM, Sunday and ends at Nov 1, 2026, 1:00 PM, Sunday',
      'x-activity1793541600',
    ),
  );
  assert.equal(r.activity.startUtc.toISOString(), '2026-11-01T14:00:00.000Z');
  assert.equal(r.activity.endUtc.toISOString(), '2026-11-01T18:00:00.000Z');
});

test('UT-05 a description that does not match is reported, not thrown', () => {
  const r = parseRecord(record('Something completely different'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'description-pattern');
});

test('working activity without a timestamp ID is unreadable', () => {
  const r = parseRecord(
    record(
      'Activity Meal (type: NON_PRODUCTIVE) starts at Nov 15, 2026, 10:45 AM, Sunday and ends at Nov 15, 2026, 11:15 AM, Sunday',
      'no-timestamp-here',
    ),
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'element-id');
});

test('Not Scheduled blocks parse without needing a timestamp', () => {
  const r = parseRecord(
    record(
      'Activity (type: NOT_SCHEDULED) starts at Nov 21, 2026, 12:00 AM, Saturday and ends at Nov 21, 2026, 11:59 PM, Saturday',
      'activity-ZUVxM1Vz5MDLw8EPf9WbO-activity1795237200',
    ),
  );
  assert.equal(r.ok, true);
  assert.equal(r.activity.type, 'NOT_SCHEDULED');
  assert.equal(r.activity.name, '');
});

test('parseLocalTime handles 12 AM and 12 PM', () => {
  assert.equal(parseLocalTime('Nov 21, 2026, 12:00 AM').hour, 0);
  assert.equal(parseLocalTime('Nov 21, 2026, 12:30 PM').hour, 12);
  assert.equal(parseLocalTime('Nov 21, 2026, 11:59 PM').hour, 23);
  assert.equal(parseLocalTime('not a time'), null);
});

test('typeLabel matches how Connect shows types', () => {
  assert.equal(typeLabel('PRODUCTIVE'), 'Productive');
  assert.equal(typeLabel('NON_PRODUCTIVE'), 'Non-Productive');
});
