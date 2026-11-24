/**
 * Entry point: checks the page, runs the week loop, shows the summary,
 * lets the agent change settings, and downloads the .ics file.
 */

import { createRegistry } from './core/registry.js';
import { collectSchedule } from './core/collector.js';
import { summarizeExport, MESSAGES } from './core/summary.js';
import { createPageReader } from './adapters/pageReader.js';
import { createWeekNavigator } from './adapters/weekNavigator.js';
import { downloadText } from './adapters/download.js';
import { loadSettings, saveSettings } from './adapters/settings.js';
import { createPanel } from './ui/panel.js';

/* global __VERSION__ */
// Set by the build script (e.g. "0.1.0" or "0.1.0-dev.abc1234"); "local" when run unbuilt in tests.
export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'local';
export { MESSAGES };

/** Weeks read when the scope is "this week only". */
const CURRENT_WEEK_ONLY = 1;

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

    let { settings, persisted } = loadSettings();
    const registry = createRegistry();
    const navigator = createWeekNavigator(reader);
    const readAllWeeks = settings.scope !== 'current';

    panel.showReading(`Reading ${reader.rangeText() || 'this week'}…`, cancel);
    const result = await collectSchedule({
      reader,
      navigator,
      maxWeeks: readAllWeeks ? undefined : CURRENT_WEEK_ONLY,
      isCancelled: () => cancelled,
      onProgress: ({ weeksRead, range }) =>
        panel.showReading(`Read ${weeksRead} week${weeksRead === 1 ? '' : 's'} (latest: ${range})…`, cancel),
    });

    if (result.stopReason === 'cancelled') {
      panel.close();
      return;
    }

    const typeNames = registry.entries().map((entry) => entry.name);

    const openSettings = () =>
      panel.showSettings({
        typeNames,
        settings,
        canSave: persisted,
        onBack: showSummary,
        onSave: (next) => {
          settings = next;
          persisted = saveSettings(next);
          showSummary();
        },
      });

    function showSummary() {
      const summary = summarizeExport(result, registry, settings, { persisted, readAllWeeks });
      if (summary.status === 'layout-changed') {
        panel.showMessage("Can't read the schedule", summary.message);
      } else if (summary.status === 'nothing') {
        panel.showMessage('Nothing to export', summary.message, { onSettings: openSettings });
      } else {
        panel.showReady({
          ...summary,
          onDownload: () => downloadText(summary.text, summary.filename, { doc }),
          onSettings: openSettings,
        });
      }
    }

    showSummary();
  } catch (error) {
    panel.showMessage('Something went wrong', `No file was made. (${error?.message ?? error})`);
  }
  // The running flag is cleared when the agent closes the panel (onClose).
}
