import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPanel } from '../src/ui/panel.js';
import { normalizeSettings } from '../src/adapters/settings.js';

const TYPES = ['On Queue', 'On Queue - In Office', 'Meal', 'Project'];

function openSettings(settings = normalizeSettings({})) {
  const doc = new JSDOM('<body></body>').window.document;
  const panel = createPanel(doc, { version: 'test' });
  const saved = [];
  let backs = 0;
  panel.showSettings({ typeNames: TYPES, settings, canSave: true, onSave: (s) => saved.push(s), onBack: () => (backs += 1) });
  const $ = (sel) => panel.root.querySelector(sel);
  const $$ = (sel) => [...panel.root.querySelectorAll(sel)];
  const save = () => $$('button').find((b) => b.textContent === 'Save').click();
  return { panel, $, $$, save, saved, backs: () => backs };
}

test('settings screen shows current values, minutes disabled while reminders are off', () => {
  const { $, $$ } = openSettings();
  assert.equal($('h2').textContent, 'Settings');
  assert.equal($('input[role=switch]').checked, false);
  assert.equal($('input[type=number]').disabled, true);
  assert.equal($('input[type=number]').value, '15');
  assert.equal($$('input[type=radio]').find((r) => r.checked).value, 'all');
  assert.equal($$('.type-row').length, 4);
});

test('saving collects reminders, scope, renames and exclusions', () => {
  const { $, $$, save, saved } = openSettings();
  const toggle = $('input[role=switch]');
  toggle.checked = true;
  toggle.dispatchEvent(new toggle.ownerDocument.defaultView.Event('change'));
  assert.equal($('input[type=number]').disabled, false);
  $('input[type=number]').value = '20';
  $$('input[type=radio]').find((r) => r.value === 'current').checked = true;
  const rows = $$('.type-row');
  rows[0].querySelector('input[type=text]').value = '  Work  ';
  rows[2].querySelector('input[type=checkbox]').checked = false;
  save();
  assert.deepEqual(saved, [
    { remindersOn: true, reminderMinutes: 20, renames: { 'On Queue': 'Work' }, excludedNames: ['Meal'], scope: 'current' },
  ]);
});

test('invalid minutes are rejected with a message', () => {
  const { $, save, saved } = openSettings(normalizeSettings({ remindersOn: true }));
  $('input[type=number]').value = '2000';
  save();
  assert.equal(saved.length, 0);
  assert.match($('.error').textContent, /0 to 1440/);
});

test('back button returns without saving', () => {
  const { $, saved, backs } = openSettings();
  $('.back').click();
  assert.equal(backs(), 1);
  assert.equal(saved.length, 0);
});

test('ready view has Download and Settings; names come from page text safely', () => {
  const doc = new JSDOM('<body></body>').window.document;
  const panel = createPanel(doc, { version: 'test' });
  let downloads = 0;
  let settings = 0;
  panel.showReady({
    heading: 'Done',
    lines: [],
    skipped: [['<img src=x onerror=alert(1)>', 1]],
    notes: [],
    preview: [],
    moreCount: 0,
    onDownload: () => (downloads += 1),
    onSettings: () => (settings += 1),
  });
  const buttons = [...panel.root.querySelectorAll('button')];
  buttons.find((b) => b.textContent === 'Download .ics').click();
  buttons.find((b) => b.textContent === 'Settings').click();
  assert.equal(downloads, 1);
  assert.equal(settings, 1);
  assert.equal(panel.root.querySelector('img'), null); // rendered as text, not HTML
});
