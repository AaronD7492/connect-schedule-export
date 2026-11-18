/**
 * Live-page diagnostic (Sprint 2, MT-01).
 *
 * Checks, on the real Agent Schedule page, everything the tool depends on:
 * that the schedule can be reached (including inside shadow roots), that the
 * activity descriptions match the expected pattern, and that Next week /
 * Previous week can be clicked and detected.
 *
 * Run it either way:
 *   - Computer: open the browser console (F12) on the schedule page and paste this file.
 *   - Phone or computer: use the "Diagnostics" bookmarklet from the install page.
 *
 * It only reads the page and clicks Next week then Previous week once.
 * Results are shown in a box on the page; nothing is sent anywhere.
 * Copy the results text and send it back to the developer.
 */
(async () => {
  const lines = [];
  const log = (ok, label, detail = '') => lines.push(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ': ' + detail : ''}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DESCRIPTION = /^Activity\s+(.*?)\s*\(type: ([A-Z_]+)\) starts at (.+?), \w+ and ends at (.+?), \w+$/;
  const ID = /^(.*)-activity(\d+)$/;

  // Collect the document plus any open shadow roots.
  const roots = [document];
  const closedHosts = [];
  const walk = (root, depth) => {
    if (depth > 4) return;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        walk(el.shadowRoot, depth + 1);
      } else if (el.tagName.includes('-') && el.childElementCount === 0) {
        closedHosts.push(el.tagName.toLowerCase());
      }
    }
  };
  walk(document, 0);
  const findAll = (sel) => {
    for (const r of roots) {
      const hits = r.querySelectorAll(sel);
      if (hits.length) return { hits: [...hits], inShadow: r !== document };
    }
    return { hits: [], inShadow: false };
  };
  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  log(null, 'Page title', document.title);
  log(null, 'Browser', navigator.userAgent);
  log(null, 'Open shadow roots found', String(roots.length - 1));
  const bm = document.querySelector('bm-scheduling');
  log(null, 'bm-scheduling element', bm ? (bm.shadowRoot ? 'has an open shadow root' : 'no shadow root (content is in the main page)') : 'not found');
  if (closedHosts.length) log(null, 'Empty custom elements (possible closed shadow roots)', [...new Set(closedHosts)].slice(0, 5).join(', '));

  const toolbar = findAll('[data-testid="agent-schedule-toolbar"]');
  log(toolbar.hits.length > 0, 'Schedule toolbar found', toolbar.inShadow ? 'inside a shadow root' : 'in the main page');

  const range = () => text(findAll('[data-testid="agent-schedule-week-date-range-picker"]').hits[0]);
  const startRange = range();
  log(!!startRange, 'Week date range', startRange || 'not found');

  const days = findAll('[data-testid="agent-calendar-day"]').hits;
  log(days.length === 7, 'Days in the week', String(days.length));

  const bodies = findAll('[data-testid="activity-body"]').hits;
  log(bodies.length > 0, 'Activities found', String(bodies.length));
  let matched = 0;
  let withId = 0;
  const types = new Set();
  for (const body of bodies) {
    const description = (body.getAttribute('aria-label') || body.getAttribute('aria-description') || '').replace(/\s+/g, ' ').trim();
    const m = DESCRIPTION.exec(description);
    if (m) {
      matched += 1;
      types.add(`${m[1] || '(blank)'} [${m[2]}]`);
    }
    if (ID.test(body.closest('[id*="-activity"]')?.id ?? '')) withId += 1;
  }
  log(bodies.length > 0 && matched === bodies.length, 'Descriptions matching the pattern', `${matched} of ${bodies.length}`);
  log(bodies.length > 0 && withId === bodies.length, 'Activities with a timestamp ID', `${withId} of ${bodies.length}`);
  log(null, 'Activity types this week', [...types].join('; ') || 'none');
  if (bodies[0]) log(null, 'Sample description', bodies[0].getAttribute('aria-label') || '');

  // Navigation test: Next week, wait, then Previous week.
  const waitForChange = async (before) => {
    const start = Date.now();
    while (Date.now() - start < 10000) {
      await sleep(100);
      const now = range();
      if (now && now !== before) return { changed: true, ms: Date.now() - start, now };
    }
    return { changed: false, ms: 10000, now: range() };
  };
  const nextBtn = findAll('[data-testid="agent-schedule-week-next"]').hits[0];
  const prevBtn = findAll('[data-testid="agent-schedule-week-previous"]').hits[0];
  log(!!nextBtn && !!prevBtn, 'Next / Previous week buttons found');
  if (nextBtn && prevBtn && startRange) {
    nextBtn.click();
    const fwd = await waitForChange(startRange);
    log(fwd.changed, 'Next week loaded', fwd.changed ? `${fwd.now} after ${fwd.ms} ms` : 'no change within 10 s');
    if (fwd.changed) {
      await sleep(500);
      const nextBodies = findAll('[data-testid="activity-body"]').hits.length;
      log(null, 'Activities in next week', String(nextBodies));
      prevBtn.click();
      const back = await waitForChange(fwd.now);
      log(back.changed && back.now === startRange, 'Returned to the starting week', back.now);
    }
  }

  // Show results on the page.
  const report = lines.join('\n');
  console.log(report);
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;inset:5% 5% auto 5%;max-height:85vh;z-index:2147483647;background:#fff;color:#000;border:2px solid #0972d3;border-radius:12px;padding:12px;font:14px/1.4 monospace;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.3)';
  const heading = document.createElement('strong');
  heading.textContent = 'Connect schedule export: diagnostics';
  const area = document.createElement('textarea');
  area.value = report;
  area.readOnly = true;
  area.style.cssText = 'width:100%;height:50vh;font:12px/1.4 monospace;box-sizing:border-box';
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px';
  const copy = document.createElement('button');
  copy.textContent = 'Copy results';
  copy.style.cssText = 'min-height:44px;flex:1';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(report);
      copy.textContent = 'Copied';
    } catch {
      area.select();
      copy.textContent = 'Select all, then copy';
    }
  };
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.style.cssText = 'min-height:44px;flex:1';
  close.onclick = () => box.remove();
  buttons.append(copy, close);
  box.append(heading, area, buttons);
  document.body.appendChild(box);
})();
