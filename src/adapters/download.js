/**
 * Hands the generated file to the browser. Nothing is uploaded anywhere.
 * iPhone Safari saves it to Downloads; tapping it there opens Calendar.
 */
export function downloadText(content, filename, { doc = document, mimeType = 'text/calendar;charset=utf-8' } = {}) {
  const view = doc.defaultView ?? globalThis;
  const blob = new view.Blob([content], { type: mimeType });
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.appendChild(link);
  link.click();
  view.setTimeout(() => {
    view.URL.revokeObjectURL(url);
    link.remove();
  }, 60000);
}
