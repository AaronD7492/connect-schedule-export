/**
 * Turns what was read plus the agent's settings into everything the panel
 * shows and the file to download. Pure logic, so settings changes can rebuild
 * the file without reading the page again, and it is tested in Node.
 */

import { prepareExport } from './collector.js';
import { buildCalendar, summaryFor } from './icsBuilder.js';

export const MESSAGES = Object.freeze({
  wrongPage: 'Open your Agent Schedule page in Amazon Connect, then tap the bookmark again.',
  layoutChanged: "Your schedule page has changed and can't be read. No file was made.",
  nothingToExport: 'No work activities were found to export. Check Settings if you left any types out.',
  restoreFailed: "The page couldn't return to the week you started on. Your schedule itself is not affected.",
  storageOff: "Settings can't be saved in this browser (private browsing?). Defaults were used.",
  readAgain: 'Only this week was read. Run the export again to read all weeks.',
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** LocalTime -> "2026-11-15" */
export function isoDate(t) {
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}

/** LocalTime -> "Sun Nov 15" */
export function shortDate(t) {
  return `${WEEKDAYS[new Date(t.wallMs).getUTCDay()]} ${MONTHS[t.month - 1]} ${t.day}`;
}

/** LocalTime -> "6:45 AM" */
export function clockTime(t) {
  const suffix = t.hour >= 12 ? 'PM' : 'AM';
  const hour = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${hour}:${pad(t.minute)} ${suffix}`;
}

export function fileNameFor(activities) {
  const first = activities[0].startLocal;
  const last = activities[activities.length - 1].endLocal;
  return `work-schedule_${isoDate(first)}_to_${isoDate(last)}.ics`;
}

export function previewLine(activity, renames) {
  return `${shortDate(activity.startLocal)} · ${summaryFor(activity, renames)} · ${clockTime(activity.startLocal)} to ${clockTime(activity.endLocal)}`;
}

/**
 * @param {{ weeks: Array<object>, stopReason: string, restored: boolean }} result from collectSchedule
 * @param {ReturnType<import('./registry.js').createRegistry>} registry
 * @param {{ remindersOn: boolean, reminderMinutes: number, renames: Record<string,string>,
 *           excludedNames: string[], scope: 'all' | 'current' }} settings
 * @param {{ persisted?: boolean, readAllWeeks?: boolean, now?: Date }} [context]
 *   readAllWeeks: false when only the current week was read (scope was "current" at the start).
 */
export function summarizeExport(result, registry, settings, context = {}) {
  const { persisted = true, readAllWeeks = true, now = new Date() } = context;
  const currentOnly = settings.scope === 'current';
  const weeks = currentOnly ? result.weeks.slice(0, 1) : result.weeks;

  const plan = prepareExport(weeks, registry);
  if (plan.layoutChanged) return { status: 'layout-changed', message: MESSAGES.layoutChanged };

  const { text, eventCount } = buildCalendar(plan.kept, { ...settings, now });
  const excluded = new Set(settings.excludedNames.map((n) => n.trim().toLowerCase()));
  const exported = plan.kept.filter((a) => !excluded.has(a.name.trim().toLowerCase()));
  if (eventCount === 0 || exported.length === 0) return { status: 'nothing', message: MESSAGES.nothingToExport };

  const notes = [];
  if (!currentOnly) {
    if (!readAllWeeks) notes.push(MESSAGES.readAgain);
    if (result.stopReason === 'week-load-failed') {
      notes.push(`A week didn't load, so the file covers the ${plural(result.weeks.length, 'week')} read so far.`);
    }
    if (result.stopReason === 'week-limit' && readAllWeeks) {
      notes.push(`Stopped at the ${result.weeks.length}-week safety limit.`);
    }
  }
  if (plan.unreadable.length) notes.push(`${plural(plan.unreadable.length, 'activity')} couldn't be read and were left out.`);
  if (!result.restored) notes.push(MESSAGES.restoreFailed);
  if (!persisted) notes.push(MESSAGES.storageOff);

  const left = settings.excludedNames.filter((n) => plan.kept.some((a) => a.name.toLowerCase() === n.toLowerCase()));
  const first = exported[0].startLocal;
  const last = exported[exported.length - 1].endLocal;
  const lines = [`${shortDate(first)} to ${shortDate(last)}, ${last.year}`, `${plural(eventCount, 'event')} ready`];
  if (settings.remindersOn) lines.push(`Reminders ${settings.reminderMinutes} min before`);
  if (left.length) lines.push(`Left out by you: ${left.join(', ')}`);

  return {
    status: 'ready',
    text,
    eventCount,
    filename: fileNameFor(exported),
    heading: currentOnly ? 'Done: this week only' : `Done: ${plural(weeks.length, 'week')} read`,
    lines,
    skipped: [...plan.skipped.entries()],
    notes,
    preview: exported.slice(0, 3).map((a) => previewLine(a, settings.renames)),
    moreCount: Math.max(0, eventCount - 3),
  };
}
