/**
 * The export panel drawn over the schedule page.
 * Lives in its own shadow root so page styles can't change it and its styles
 * can't break the page. All text is set with textContent (never innerHTML).
 */

const STYLES = `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483647;
  display: flex; align-items: flex-end; justify-content: center;
  font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #16191f; }
@media (min-width: 600px) { .backdrop { align-items: center; } }
.card { background: #fff; width: 100%; max-width: 420px; max-height: 90vh; overflow: auto; box-sizing: border-box;
  border-radius: 16px 16px 0 0; padding: 20px 20px 12px; box-shadow: 0 -2px 16px rgba(0,0,0,.2); }
@media (min-width: 600px) { .card { border-radius: 16px; } }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 8px; }
h2 { font-size: 19px; margin: 0; flex: 1; }
h3 { font-size: 16px; margin: 20px 0 4px; }
.close, .back { min-width: 44px; min-height: 44px; border: 0; background: none; font-size: 26px; color: #545b64; cursor: pointer; padding: 0; }
.back { display: none; text-align: left; }
.back.shown { display: inline-block; }
p { margin: 6px 0; }
.muted { color: #545b64; }
.error { color: #d91515; font-size: 15px; }
.box { background: #f2f3f3; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
.box strong { display: block; font-size: 15px; }
ul { list-style: none; padding: 0; margin: 8px 0; }
li { padding: 8px 0; border-bottom: 1px solid #e9ebed; font-size: 15px; }
.actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
button.primary, button.secondary { min-height: 48px; border-radius: 10px; font-size: 17px; font-weight: 600; cursor: pointer; }
button.primary { background: #0972d3; color: #fff; border: 0; }
button.secondary { background: #fff; color: #0972d3; border: 1px solid #0972d3; }
button.link { min-height: 44px; border: 0; background: none; color: #0972d3; font-size: 16px; cursor: pointer; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; }
.row label { flex: 1; }
.type-row { display: grid; grid-template-columns: 28px 1fr 130px; align-items: center; gap: 8px; min-height: 48px; }
input[type=checkbox] { width: 22px; height: 22px; margin: 0; accent-color: #0972d3; }
input[type=number], input[type=text] { font-size: 16px; min-height: 40px; padding: 4px 8px; border: 1px solid #8d99a8;
  border-radius: 6px; box-sizing: border-box; width: 100%; }
input[type=number] { width: 88px; }
input:disabled { background: #f2f3f3; color: #8d99a8; }
fieldset { border: 0; padding: 0; margin: 0; }
.radio { display: flex; align-items: center; gap: 10px; min-height: 44px; }
.radio input { width: 20px; height: 20px; margin: 0; accent-color: #0972d3; }
.spinner { width: 28px; height: 28px; border: 3px solid #d1d5db; border-top-color: #0972d3; border-radius: 50%;
  animation: spin 0.9s linear infinite; margin: 12px 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.version { text-align: center; font-size: 12px; color: #8d99a8; margin-top: 12px; }
`;

let idCounter = 0;

/**
 * @param {Document} doc
 * @param {{ version: string, onClose?: () => void }} options
 */
export function createPanel(doc, { version, onClose = () => {} }) {
  const host = doc.createElement('div');
  host.setAttribute('data-connect-schedule-export', '');
  const root = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = STYLES;
  const backdrop = el('div', 'backdrop');
  const card = el('div', 'card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Export schedule');

  const head = el('div', 'head');
  const backButton = el('button', 'back', '‹');
  backButton.type = 'button';
  backButton.setAttribute('aria-label', 'Back');
  let backHandler = null;
  backButton.addEventListener('click', () => backHandler?.());
  const title = el('h2', '', 'Export schedule');
  const closeButton = el('button', 'close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.addEventListener('click', () => close());
  head.append(backButton, title, closeButton);

  const body = el('div', 'body');
  const footer = el('div', 'version', `connect-schedule-export v${version}`);
  card.append(head, body, footer);
  backdrop.append(card);
  root.append(style, backdrop);
  doc.body.appendChild(host);

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, kind, handler) {
    const b = el('button', kind, label);
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
  }

  function uid(prefix) {
    idCounter += 1;
    return `cse-${prefix}-${idCounter}`;
  }

  function render(heading, onBack, ...children) {
    title.textContent = heading;
    backHandler = onBack;
    backButton.classList.toggle('shown', Boolean(onBack));
    body.replaceChildren(...children);
  }

  function close() {
    host.remove();
    onClose();
  }

  return Object.freeze({
    close,
    /** For tests: the panel's shadow root. */
    root,

    showReading(message, onCancel) {
      const actions = el('div', 'actions');
      actions.append(button('Cancel', 'secondary', onCancel));
      const status = el('p', '', message);
      status.setAttribute('aria-live', 'polite');
      render('Export schedule', null, el('div', 'spinner'), status, actions);
    },

    /**
     * @param {{ heading: string, lines: string[], skipped: Array<[string, number]>, notes: string[],
     *           preview: string[], moreCount: number, onDownload: () => void, onSettings?: () => void }} view
     */
    showReady({ heading, lines, skipped, notes, preview, moreCount, onDownload, onSettings }) {
      const parts = [el('p', '', heading), ...lines.map((line) => el('p', 'muted', line))];
      if (skipped.length) {
        const box = el('div', 'box');
        box.append(el('strong', '', 'Skipped (not counted as work)'));
        for (const [name, count] of skipped) box.append(el('div', 'muted', `${name} (${count})`));
        parts.push(box);
      }
      for (const note of notes) parts.push(el('p', 'muted', note));
      if (preview.length) {
        const list = el('ul');
        for (const item of preview) list.append(el('li', '', item));
        parts.push(list);
        if (moreCount > 0) parts.push(el('p', 'muted', `${moreCount} more`));
      }
      const actions = el('div', 'actions');
      actions.append(button('Download .ics', 'primary', onDownload));
      if (onSettings) actions.append(button('Settings', 'link', onSettings));
      parts.push(actions);
      render('Export schedule', null, ...parts);
    },

    showMessage(heading, message, { onSettings } = {}) {
      const actions = el('div', 'actions');
      if (onSettings) actions.append(button('Settings', 'secondary', onSettings));
      actions.append(button('Close', 'secondary', close));
      render('Export schedule', null, el('p', '', heading), el('p', 'muted', message), actions);
    },

    /**
     * @param {{ typeNames: string[], settings: object, canSave: boolean,
     *           onSave: (settings: object) => void, onBack: () => void }} options
     */
    showSettings({ typeNames, settings, canSave, onSave, onBack }) {
      const parts = [];

      // Reminders
      const remindersId = uid('reminders');
      const reminderRow = el('div', 'row');
      const reminderLabel = el('label', '', 'Reminders');
      reminderLabel.htmlFor = remindersId;
      const reminders = el('input');
      reminders.type = 'checkbox';
      reminders.id = remindersId;
      reminders.setAttribute('role', 'switch');
      reminders.checked = settings.remindersOn;
      reminderRow.append(reminderLabel, reminders);

      const minutesId = uid('minutes');
      const minutesRow = el('div', 'row');
      const minutesLabel = el('label', 'muted', 'Minutes before');
      minutesLabel.htmlFor = minutesId;
      const minutes = el('input');
      minutes.type = 'number';
      minutes.id = minutesId;
      minutes.min = '0';
      minutes.max = '1440';
      minutes.step = '1';
      minutes.inputMode = 'numeric';
      minutes.value = String(settings.reminderMinutes);
      minutes.disabled = !settings.remindersOn;
      reminders.addEventListener('change', () => {
        minutes.disabled = !reminders.checked;
      });
      minutesRow.append(minutesLabel, minutes);
      const minutesError = el('p', 'error');
      minutesError.setAttribute('role', 'alert');
      parts.push(reminderRow, minutesRow, minutesError);

      // Weeks to export
      parts.push(el('h3', '', 'Weeks to export'));
      const scopeSet = el('fieldset');
      const scopeName = uid('scope');
      const scopeInputs = [
        ['all', 'All published weeks'],
        ['current', 'This week only'],
      ].map(([value, label]) => {
        const wrap = el('label', 'radio');
        const input = el('input');
        input.type = 'radio';
        input.name = scopeName;
        input.value = value;
        input.checked = settings.scope === value;
        wrap.append(input, doc.createTextNode(label));
        scopeSet.append(wrap);
        return input;
      });
      parts.push(scopeSet);

      // Event names
      parts.push(el('h3', '', 'Event names'), el('p', 'muted', 'Untick a type to leave it out. Leave a name blank to keep the Connect name.'));
      const excluded = new Set(settings.excludedNames.map((n) => n.toLowerCase()));
      const typeInputs = typeNames.map((name) => {
        const row = el('div', 'type-row');
        const include = el('input');
        include.type = 'checkbox';
        include.checked = !excluded.has(name.toLowerCase());
        include.setAttribute('aria-label', `Include ${name}`);
        const label = el('span', '', name);
        const rename = el('input');
        rename.type = 'text';
        rename.maxLength = 100;
        rename.placeholder = name;
        rename.value = settings.renames[name] ?? '';
        rename.setAttribute('aria-label', `Calendar name for ${name}`);
        row.append(include, label, rename);
        parts.push(row);
        return { name, include, rename };
      });

      if (!canSave) parts.push(el('p', 'muted', 'This browser blocks saving, so these settings apply to this export only.'));

      const actions = el('div', 'actions');
      actions.append(
        button('Save', 'primary', () => {
          const value = Number(minutes.value);
          if (reminders.checked && (!Number.isInteger(value) || value < 0 || value > 1440)) {
            minutesError.textContent = 'Enter whole minutes from 0 to 1440.';
            minutes.focus();
            return;
          }
          minutesError.textContent = '';
          const renames = {};
          const excludedNames = [];
          for (const { name, include, rename } of typeInputs) {
            if (rename.value.trim()) renames[name] = rename.value.trim();
            if (!include.checked) excludedNames.push(name);
          }
          onSave({
            remindersOn: reminders.checked,
            reminderMinutes: reminders.checked ? value : settings.reminderMinutes,
            renames,
            excludedNames,
            scope: scopeInputs.find((input) => input.checked)?.value ?? 'all',
          });
        }),
      );
      parts.push(actions);
      render('Settings', onBack, ...parts);
    },
  });
}
