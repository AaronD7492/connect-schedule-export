/**
 * Entry point: checks the page, runs the week loop, shows the summary,
 * and downloads the .ics file when the agent taps Download.
 */

import { createRegistry } from './core/registry.js';
import { collectSchedule, prepareExport } from './core/collector.js';
import { buildCalendar, summaryFor } from './core/icsBuilder.js';
import { createPageReader } from './adapters/pageReader.js';
import { createWeekNavigator } from './adapters/weekNavigator.js';
import { downloadText } from './adapters/download.js';
import { loadSettings } from './adapters/settings.js';
import { createPanel } from './ui/panel.js';

/* global __VERSION__ */
// Set by the build script (e.g. "0.1.0" or "0.1.0-dev.abc1234"); "local" when run unbuilt in tests.
export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'local';

export const MESSAGES = Object.freeze({
  wrongPage: 'Open your Agent Schedule page in Amazon Connect, then tap the bookmark again.',
  layoutChanged: "Your schedule page has changed and can't be read. No file was made.",
  nothingToExport: 'No work activities were found from this week onward.',
  restoreFailed: "The page couldn't return to the week you started on. Your schedule itself is not affected.",
  storageOff: "Settings can't be saved in this browser (private browsing?). Defaults were used.",
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** LocalTime -> "2026-11-15" */
export function isoDate(t) {
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}

/** LocalTime -> "Sun Nov 15" */
export function shortDate(t) {
  const weekday = WEEKDAYS[new Date(t.wallMs).getUTCDay()];
  return `${weekday} ${MONTHS[t.month - 1]} ${t.day}`;
}

/** LocalTime -> "6:45 AM" */
export function clockTime(t) {
  const suffix = t.hour >= 12 ? 'PM' : 'AM';
  const hour = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${hour}:${pad(t.minute)} ${suffix}`;
}

export function fileNameFor(kept) {
  const first = kept[0].startLocal;
  const last = kept[kept.length - 1].endLocal;
  return `work-schedule_${isoDate(first)}_to_${isoDate(last)}.ics`;
}

export function previewLine(activity, renames) {
  return `${shortDate(activity.startLocal)} · ${summaryFor(activity, renames)} · ${clockTime(activity.startLocal)} to ${clockTime(activity.endLocal)}`;
}

/** @param {Document} doc */
export async function run(doc = document) {
  const view = doc.defaultView ?? globalThis;
  if (view.__connectScheduleExportRunning) return;
  view.__connectScheduleExportRunning = true;

  let cancelled = false;
  const panel = createPanel(doc, {
    version: VERSION,
    onClose: () => {
      cancelled = true;
      view.__connectScheduleExportRunning = false;
    },
  });
  const cancel = () => {
    cancelled = true;
  };

  try {
    const reader = createPageReader(doc);
    if (!reader.isSchedulePage()) {
      panel.showMessage('Wrong page', MESSAGES.wrongPage);
      return;
    }

    const { settings, persisted } = loadSettings();
    const registry = createRegistry();
    const navigator = createWeekNavigator(reader);

    panel.showReading(`Reading ${reader.rangeText() || 'this week'}…`, cancel);
    const result = await collectSchedule({
      reader,
      navigator,
      isCancelled: () => cancelled,
      onProgress: ({ weeksRead, range }) =>
        panel.showReading(`Read ${weeksRead} week${weeksRead === 1 ? '' : 's'} (latest: ${range})…`, cancel),
    });

    if (result.stopReason === 'cancelled') {
      panel.close();
      return;
    }

    const plan = prepareExport(result.weeks, registry);
    if (plan.layoutChanged) {
      panel.showMessage("Can't read the schedule", MESSAGES.layoutChanged);
      return;
    }

    const notes = [];
    if (result.stopReason === 'week-load-failed') {
      notes.push(`A week didn't load, so the file covers the ${result.weeks.length} week(s) read so far.`);
    }
    if (result.stopReason === 'week-limit') notes.push(`Stopped at the ${result.weeks.length}-week safety limit.`);
    if (plan.unreadable.length) notes.push(`${plan.unreadable.length} activity(ies) couldn't be read and were left out.`);
    if (!result.restored) notes.push(MESSAGES.restoreFailed);
    if (!persisted) notes.push(MESSAGES.storageOff);

    const { text, eventCount } = buildCalendar(plan.kept, settings);
    if (eventCount === 0) {
      panel.showMessage('Nothing to export', MESSAGES.nothingToExport);
      return;
    }

    const excluded = new Set(settings.excludedNames.map((n) => n.trim().toLowerCase()));
    const exported = plan.kept.filter((a) => !excluded.has(a.name.trim().toLowerCase()));
    const filename = fileNameFor(exported.length ? exported : plan.kept);
    const first = (exported[0] ?? plan.kept[0]).startLocal;
    const last = (exported.at(-1) ?? plan.kept.at(-1)).endLocal;

    panel.showReady({
      heading: `Done: ${result.weeks.length} week${result.weeks.length === 1 ? '' : 's'} read`,
      lines: [`${shortDate(first)} to ${shortDate(last)}, ${last.year}`, `${eventCount} events ready`],
      skipped: [...plan.skipped.entries()],
      notes,
      preview: exported.slice(0, 3).map((a) => previewLine(a, settings.renames)),
      moreCount: Math.max(0, eventCount - 3),
      onDownload: () => downloadText(text, filename, { doc }),
    });
  } catch (error) {
    panel.showMessage('Something went wrong', `No file was made. (${error?.message ?? error})`);
  }
  // The running flag is cleared when the agent closes the panel (onClose).
}
