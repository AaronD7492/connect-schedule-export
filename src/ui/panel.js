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
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
h2 { font-size: 19px; margin: 0; }
.close { min-width: 44px; min-height: 44px; border: 0; background: none; font-size: 26px; color: #545b64; cursor: pointer; }
p { margin: 6px 0; }
.muted { color: #545b64; }
.box { background: #f2f3f3; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
.box strong { display: block; font-size: 15px; }
ul { list-style: none; padding: 0; margin: 8px 0; }
li { padding: 8px 0; border-bottom: 1px solid #e9ebed; font-size: 15px; }
.actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
button.primary, button.secondary { min-height: 48px; border-radius: 10px; font-size: 17px; font-weight: 600; cursor: pointer; }
button.primary { background: #0972d3; color: #fff; border: 0; }
button.secondary { background: #fff; color: #0972d3; border: 1px solid #0972d3; }
.spinner { width: 28px; height: 28px; border: 3px solid #d1d5db; border-top-color: #0972d3; border-radius: 50%;
  animation: spin 0.9s linear infinite; margin: 12px 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.version { text-align: center; font-size: 12px; color: #8d99a8; margin-top: 12px; }
`;

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
  const title = el('h2', '', 'Export schedule');
  const closeButton = el('button', 'close', '×');
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.addEventListener('click', () => close());
  head.append(title, closeButton);

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

  function render(...children) {
    body.replaceChildren(...children);
  }

  function close() {
    host.remove();
    onClose();
  }

  return Object.freeze({
    close,

    showReading(message, onCancel) {
      const actions = el('div', 'actions');
      actions.append(button('Cancel', 'secondary', onCancel));
      const status = el('p', '', message);
      status.setAttribute('aria-live', 'polite');
      render(el('div', 'spinner'), status, actions);
    },

    /**
     * @param {{ heading: string, lines: string[], skipped: Array<[string, number]>, notes: string[],
     *           preview: string[], moreCount: number, onDownload: () => void }} view
     */
    showReady({ heading, lines, skipped, notes, preview, moreCount, onDownload }) {
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
      actions.append(button('Download .ics', 'primary', onDownload), button('Close', 'secondary', close));
      parts.push(actions);
      render(...parts);
    },

    showMessage(heading, message) {
      const actions = el('div', 'actions');
      actions.append(button('Close', 'secondary', close));
      render(el('p', '', heading), el('p', 'muted', message), actions);
    },
  });
}
