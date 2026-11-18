/**
 * Page adapter: moves the schedule one week forward or back and waits until
 * the new week has finished loading.
 *
 * "Loaded" means the date range text has changed and the rendered activities
 * have stayed the same for `quietMs`. Gives up after `timeoutMs`, retrying once.
 */

import { SELECTORS } from './pageReader.js';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {ReturnType<import('./pageReader.js').createPageReader>} reader
 * @param {{ timeoutMs?: number, quietMs?: number, pollMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number }} [options]
 */
export function createWeekNavigator(reader, options = {}) {
  const {
    timeoutMs = 10000,
    quietMs = 300,
    pollMs = 100,
    sleep = defaultSleep,
    now = () => Date.now(),
  } = options;

  async function waitForNewWeek(previousRange) {
    const deadline = now() + timeoutMs;
    let lastSignature = null;
    let stableSince = 0;
    while (now() < deadline) {
      await sleep(pollMs);
      const range = reader.rangeText();
      if (!range || range === previousRange) continue;
      const signature = reader.signature();
      if (signature !== lastSignature) {
        lastSignature = signature;
        stableSince = now();
      } else if (now() - stableSince >= quietMs) {
        return true;
      }
    }
    return false;
  }

  async function step(selector) {
    const before = reader.rangeText();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // On the retry, a slow first click may have landed after all; don't click twice.
      if (attempt === 1 && reader.rangeText() !== before) return waitForNewWeek(before);
      const button = reader.query(selector);
      if (!button) return false;
      button.click();
      if (await waitForNewWeek(before)) return true;
    }
    return false;
  }

  const next = () => step(SELECTORS.next);
  const previous = () => step(SELECTORS.previous);

  return Object.freeze({
    next,
    previous,
    /** Go back `steps` weeks. Returns false if any step fails. */
    async back(steps) {
      for (let i = 0; i < steps; i += 1) {
        if (!(await previous())) return false;
      }
      return true;
    },
  });
}
