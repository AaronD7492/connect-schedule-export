/**
 * Builds an iCalendar (RFC 5545) file from kept activities.
 * All times are written in UTC; event UIDs come from the Connect activity ID,
 * so re-importing a newer export updates events instead of duplicating them.
 */

import { typeLabel } from './parser.js';

const CRLF = '\r\n';
const UID_DOMAIN = 'connect-schedule-export';
const encoder = new TextEncoder();

/** Escape TEXT values: backslash, semicolon, comma, new line. */
export function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line so no physical line exceeds 75 octets (UTF-8 safe). */
export function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 75) {
      parts.push(current);
      current = ' ' + ch; // continuation lines start with one space
      bytes = 1 + size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join(CRLF);
}

/** Date -> 20261115T154500Z */
export function formatUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function clampMinutes(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 15;
  return Math.min(1440, Math.max(0, n));
}

/** The calendar title for an activity, after any user rename. */
export function summaryFor(activity, renames = {}) {
  const renamed = renames[activity.name];
  return typeof renamed === 'string' && renamed.trim() ? renamed.trim() : activity.name;
}

/**
 * @param {Array<import('./parser.js').Activity>} activities kept activities
 * @param {{
 *   remindersOn?: boolean, reminderMinutes?: number,
 *   renames?: Record<string, string>, excludedNames?: string[],
 *   now?: Date, calendarName?: string
 * }} [options]
 * @returns {{ text: string, eventCount: number }}
 */
export function buildCalendar(activities, options = {}) {
  const {
    remindersOn = false,
    reminderMinutes = 15,
    renames = {},
    excludedNames = [],
    now = new Date(),
    calendarName = 'Work schedule',
  } = options;

  const excluded = new Set(excludedNames.map((n) => n.trim().toLowerCase()));
  const minutes = clampMinutes(reminderMinutes);
  const stamp = formatUtc(now);

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//connect-schedule-export//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  let eventCount = 0;
  for (const activity of activities) {
    if (excluded.has(activity.name.trim().toLowerCase())) continue;
    if (!activity.id || !activity.startUtc || !activity.endUtc) continue;
    if (activity.endUtc <= activity.startUtc) continue; // never write zero-length events

    const summary = summaryFor(activity, renames);
    let description = `Type: ${typeLabel(activity.type)}`;
    if (activity.paid !== null && activity.paid !== undefined) {
      description += `\nPaid: ${activity.paid ? 'Yes' : 'No'}`;
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${activity.id}@${UID_DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(activity.startUtc)}`,
      `DTEND:${formatUtc(activity.endUtc)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      'TRANSP:OPAQUE',
    );
    if (remindersOn) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(summary)}`,
        `TRIGGER:-PT${minutes}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
    eventCount += 1;
  }

  lines.push('END:VCALENDAR');
  return { text: lines.map(foldLine).join(CRLF) + CRLF, eventCount };
}
