/**
 * Saves the agent's choices in this browser's local storage.
 * Only settings are stored: never schedule data or anything from Connect.
 * If storage is blocked (e.g. private browsing), defaults are used.
 */

const STORAGE_KEY = 'connect-schedule-export.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  remindersOn: false,
  reminderMinutes: 15,
  renames: Object.freeze({}),
  excludedNames: Object.freeze([]),
  scope: 'all',
});

export const SCOPES = Object.freeze(['all', 'current']);

export function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const minutes = Math.round(Number(value.reminderMinutes));
  const renames = {};
  if (value.renames && typeof value.renames === 'object') {
    for (const [from, to] of Object.entries(value.renames)) {
      if (typeof to === 'string' && to.trim()) renames[from] = to.trim().slice(0, 100);
    }
  }
  return {
    remindersOn: value.remindersOn === true,
    reminderMinutes: Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 15,
    renames,
    excludedNames: Array.isArray(value.excludedNames)
      ? value.excludedNames.filter((n) => typeof n === 'string' && n.trim())
      : [],
    scope: SCOPES.includes(value.scope) ? value.scope : 'all',
  };
}

/** Returns localStorage if it can actually be written, otherwise null. */
export function safeStorage(view = globalThis) {
  try {
    const storage = view.localStorage;
    const probe = '__connect_schedule_export_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** @returns {{ settings: ReturnType<typeof normalizeSettings>, persisted: boolean }} */
export function loadSettings(storage = safeStorage()) {
  if (!storage) return { settings: normalizeSettings(DEFAULT_SETTINGS), persisted: false };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { settings: normalizeSettings(raw ? JSON.parse(raw) : DEFAULT_SETTINGS), persisted: true };
  } catch {
    return { settings: normalizeSettings(DEFAULT_SETTINGS), persisted: true };
  }
}

/** @returns {boolean} true if saved */
export function saveSettings(settings, storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
