/**
 * Runs the week loop and turns what was read into an export plan.
 * Works only through the `reader` and `navigator` interfaces, so it has no
 * browser code and is tested in Node with fakes.
 */

import { parseRecord } from './parser.js';
import { partitionActivities } from './registry.js';

const NOT_SCHEDULED_TEXT = '(type: NOT_SCHEDULED)';

/**
 * A day is empty only if it is labelled "Not scheduled", has no activities,
 * or has only Not Scheduled blocks. Any other activity, even a skipped type
 * such as Paid Absent, makes the day non-empty, so a vacation never ends the
 * export early.
 *
 * @param {{ notScheduled: boolean, records: Array<{ description: string }> }} day
 */
export function isEmptyDay(day) {
  if (day.notScheduled) return true;
  if (day.records.length === 0) return true;
  return day.records.every((r) => String(r.description).includes(NOT_SCHEDULED_TEXT));
}

/**
 * @param {{
 *   reader: { readWeek(): { range: string, days: Array<object> } },
 *   navigator: { next(): Promise<boolean>, back(steps: number): Promise<boolean> },
 *   emptyDayLimit?: number, maxWeeks?: number,
 *   onProgress?: (p: { weeksRead: number, range: string, recordsRead: number }) => void,
 *   isCancelled?: () => boolean,
 * }} options
 * @returns {Promise<{ weeks: Array<object>, stopReason: string, restored: boolean }>}
 */
export async function collectSchedule({
  reader,
  navigator,
  emptyDayLimit = 14,
  maxWeeks = 26,
  onProgress = () => {},
  isCancelled = () => false,
}) {
  const weeks = [];
  let emptyStreak = 0;
  let stepsForward = 0;
  let recordsRead = 0;
  let stopReason = 'end-of-schedule';
  let restored = true;

  try {
    for (;;) {
      if (isCancelled()) {
        stopReason = 'cancelled';
        break;
      }
      const week = reader.readWeek();
      weeks.push(week);
      for (const day of week.days) {
        emptyStreak = isEmptyDay(day) ? emptyStreak + 1 : 0;
        recordsRead += day.records.length;
      }
      onProgress({ weeksRead: weeks.length, range: week.range, recordsRead });

      if (emptyStreak >= emptyDayLimit) {
        stopReason = 'end-of-schedule';
        break;
      }
      if (weeks.length >= maxWeeks) {
        stopReason = 'week-limit';
        break;
      }
      if (isCancelled()) {
        stopReason = 'cancelled';
        break;
      }
      const moved = await navigator.next();
      if (!moved) {
        stopReason = 'week-load-failed';
        break;
      }
      stepsForward += 1;
    }
  } finally {
    restored = stepsForward === 0 ? true : await navigator.back(stepsForward);
  }

  return { weeks, stopReason, restored };
}

/**
 * Parse every record, drop duplicates, and split into kept and skipped.
 * Also reports whether the page looks unreadable (layout changed).
 *
 * @param {Array<{ days: Array<{ notScheduled: boolean, records: Array<object> }> }>} weeks
 * @param {ReturnType<import('./registry.js').createRegistry>} registry
 */
export function prepareExport(weeks, registry) {
  let totalDays = 0;
  let notScheduledDays = 0;
  let totalRecords = 0;
  const activities = [];
  const unreadable = [];
  const seen = new Set();

  for (const week of weeks) {
    for (const day of week.days) {
      totalDays += 1;
      if (day.notScheduled) notScheduledDays += 1;
      for (const record of day.records) {
        totalRecords += 1;
        const result = parseRecord(record);
        if (!result.ok) {
          unreadable.push(result);
          continue;
        }
        const { activity } = result;
        const dedupeKey = activity.id ?? `${activity.type}|${activity.startLocal.wallMs}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        activities.push(activity);
      }
    }
  }

  const readable = totalRecords - unreadable.length;
  const layoutChanged =
    totalDays === 0 ||
    (totalRecords > 0 && readable === 0) ||
    (totalRecords === 0 && notScheduledDays < totalDays);

  const { kept, skipped } = partitionActivities(activities, registry);
  kept.sort((a, b) => a.startUtc - b.startUtc);

  return { kept, skipped, unreadable, layoutChanged, totalDays, totalRecords };
}
