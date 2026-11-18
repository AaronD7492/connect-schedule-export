/**
 * Page adapter: the only code (with weekNavigator) that knows the layout of
 * the Amazon Connect Agent Schedule page. If Amazon changes the page, fix it here.
 *
 * Relies on test IDs and screen-reader text, never on styling classes.
 * Searches the main document and any open shadow roots.
 */

export const SELECTORS = Object.freeze({
  toolbar: '[data-testid="agent-schedule-toolbar"]',
  header: '[data-testid="schedule-header"]',
  range: '[data-testid="agent-schedule-week-date-range-picker"]',
  next: '[data-testid="agent-schedule-week-next"]',
  previous: '[data-testid="agent-schedule-week-previous"]',
  day: '[data-testid="agent-calendar-day"]',
  activity: '[data-testid="activity-body"]',
  activityHolder: '[id*="-activity"]',
});

const NOT_SCHEDULED_LABEL = /not scheduled\s*$/i;
const PAID_TEXT = /Paid:\s*(Yes|No)/i;
const MAX_SHADOW_DEPTH = 4;

/** @param {Document} doc */
export function createPageReader(doc) {
  let roots = null;

  function findRoots() {
    const found = [doc];
    const walk = (root, depth) => {
      if (depth > MAX_SHADOW_DEPTH) return;
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          found.push(el.shadowRoot);
          walk(el.shadowRoot, depth + 1);
        }
      }
    };
    walk(doc, 0);
    return found;
  }

  function queryAll(selector) {
    roots ??= findRoots();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      for (const root of roots) {
        const hits = root.querySelectorAll(selector);
        if (hits.length) return [...hits];
      }
      roots = findRoots(); // page may have re-rendered; look again once
    }
    return [];
  }

  const query = (selector) => queryAll(selector)[0] ?? null;
  const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

  function readRecord(body) {
    const holder = body.closest(SELECTORS.activityHolder);
    const paid = PAID_TEXT.exec(body.textContent ?? '');
    return {
      elementId: holder?.id ?? '',
      description: clean(body.getAttribute('aria-label') || body.getAttribute('aria-description')),
      paidText: paid ? paid[0] : null,
    };
  }

  const rangeText = () => clean(query(SELECTORS.range)?.textContent);

  return Object.freeze({
    query,
    rangeText,
    isSchedulePage() {
      return query(SELECTORS.toolbar) !== null;
    },
    timeZoneText() {
      return clean(query(SELECTORS.header)?.querySelector('p')?.textContent);
    },
    /** Cheap fingerprint of the rendered activities, used to tell when a week has finished loading. */
    signature() {
      const bodies = queryAll(SELECTORS.activity);
      const first = bodies[0]?.closest(SELECTORS.activityHolder)?.id ?? '';
      return `${bodies.length}|${first}`;
    },
    readWeek() {
      return {
        range: rangeText(),
        days: queryAll(SELECTORS.day).map((day) => {
          const label = clean(day.getAttribute('aria-label'));
          return {
            label,
            notScheduled: NOT_SCHEDULED_LABEL.test(label),
            records: [...day.querySelectorAll(SELECTORS.activity)].map(readRecord),
          };
        }),
      };
    },
  });
}
