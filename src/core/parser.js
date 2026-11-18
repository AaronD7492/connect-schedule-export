/**
 * Turns a raw activity record read from the page into an Activity.
 *
 * A raw record is { elementId, description, paidText }:
 *   elementId   "<activity id>-activity<unix start seconds>"
 *   description "Activity Meal (type: NON_PRODUCTIVE) starts at Nov 15, 2026, 10:45 AM, Sunday
 *                and ends at Nov 15, 2026, 11:15 AM, Sunday"
 *   paidText    "Paid: Yes" | "Paid: No" | null
 *
 * Start time comes from the Unix timestamp in the element ID (exact, no time zone).
 * End time = start + (local end - local start), so no time zone conversion is needed.
 */

import { NOT_SCHEDULED } from './registry.js';

export const DESCRIPTION_PATTERN =
  /^Activity\s+(.*?)\s*\(type: ([A-Z_]+)\) starts at (.+?), \w+ and ends at (.+?), \w+$/;
export const ELEMENT_ID_PATTERN = /^(.*)-activity(\d+)$/;
const LOCAL_TIME_PATTERN = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) ([AP]M)$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @typedef {{ year: number, month: number, day: number, hour: number, minute: number, wallMs: number }} LocalTime
 * wallMs: the clock time as if it were UTC. Only used to measure durations.
 */

/** @returns {LocalTime | null} */
export function parseLocalTime(text) {
  const m = LOCAL_TIME_PATTERN.exec(String(text).trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  if (month === 0) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = Number(m[4]) % 12;
  if (m[6] === 'PM') hour += 12;
  const minute = Number(m[5]);
  return { year, month, day, hour, minute, wallMs: Date.UTC(year, month - 1, day, hour, minute) };
}

/** "PRODUCTIVE" -> "Productive", "NON_PRODUCTIVE" -> "Non-Productive" */
export function typeLabel(type) {
  return String(type)
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join('-');
}

function parsePaid(paidText) {
  if (!paidText) return null;
  const m = /Paid:\s*(Yes|No)/i.exec(paidText);
  if (!m) return null;
  return m[1].toLowerCase() === 'yes';
}

/**
 * @typedef {{
 *   id: string | null, name: string, type: string,
 *   startUtc: Date | null, endUtc: Date | null,
 *   startLocal: LocalTime, endLocal: LocalTime, paid: boolean | null
 * }} Activity
 *
 * @returns {{ ok: true, activity: Activity } | { ok: false, reason: string, record: object }}
 */
export function parseRecord(record) {
  const description = String(record?.description ?? '').replace(/\s+/g, ' ').trim();
  const d = DESCRIPTION_PATTERN.exec(description);
  if (!d) return { ok: false, reason: 'description-pattern', record };

  const [, rawName, type, startText, endText] = d;
  const startLocal = parseLocalTime(startText);
  const endLocal = parseLocalTime(endText);
  if (!startLocal || !endLocal) return { ok: false, reason: 'time-format', record };

  const durationMs = endLocal.wallMs - startLocal.wallMs;
  if (durationMs < 0) return { ok: false, reason: 'end-before-start', record };

  const idMatch = ELEMENT_ID_PATTERN.exec(String(record?.elementId ?? ''));
  const name = rawName.trim();

  if (type === NOT_SCHEDULED) {
    // Never exported; only used for the stop rule. No timestamp needed.
    return {
      ok: true,
      activity: { id: null, name, type, startUtc: null, endUtc: null, startLocal, endLocal, paid: null },
    };
  }

  if (!idMatch) return { ok: false, reason: 'element-id', record };
  const startMs = Number(idMatch[2]) * 1000;

  return {
    ok: true,
    activity: {
      id: idMatch[1],
      name,
      type,
      startUtc: new Date(startMs),
      endUtc: new Date(startMs + durationMs),
      startLocal,
      endLocal,
      paid: parsePaid(record.paidText),
    },
  };
}
