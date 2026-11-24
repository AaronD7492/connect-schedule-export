import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, normalizeSettings, DEFAULT_SETTINGS } from '../src/adapters/settings.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

test('defaults: reminders off, 15 minutes, all weeks', () => {
  const s = normalizeSettings(DEFAULT_SETTINGS);
  assert.deepEqual(s, { remindersOn: false, reminderMinutes: 15, renames: {}, excludedNames: [], scope: 'all' });
});

test('save then load round-trips', () => {
  const storage = memoryStorage();
  const wanted = { remindersOn: true, reminderMinutes: 30, renames: { Meal: 'Lunch' }, excludedNames: ['Project'], scope: 'current' };
  assert.equal(saveSettings(wanted, storage), true);
  assert.deepEqual(loadSettings(storage), { settings: wanted, persisted: true });
});

test('bad stored values fall back safely', () => {
  const s = normalizeSettings({ remindersOn: 'yes', reminderMinutes: 5000, renames: { Meal: '   ', X: 3 }, excludedNames: 'Meal', scope: 'forever' });
  assert.deepEqual(s, { remindersOn: false, reminderMinutes: 15, renames: {}, excludedNames: [], scope: 'all' });
});

test('corrupt JSON in storage gives defaults', () => {
  const storage = memoryStorage();
  storage.setItem('connect-schedule-export.settings.v1', '{not json');
  assert.equal(loadSettings(storage).settings.scope, 'all');
});

test('no storage (private browsing) gives defaults and persisted=false', () => {
  const { settings, persisted } = loadSettings(null);
  assert.equal(persisted, false);
  assert.equal(settings.remindersOn, false);
  assert.equal(saveSettings(settings, null), false);
});
