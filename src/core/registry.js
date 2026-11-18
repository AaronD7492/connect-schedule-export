/**
 * Activity type registry.
 *
 * Lists the activity types that count as work and become calendar events.
 * Any other type (Paid Absent, Unpaid Absent, vacation, ...) is treated as
 * time not worked and skipped.
 *
 * Open/closed: support a new type by adding an entry here (or passing extra
 * entries to createRegistry). No parsing or export code needs to change.
 */

/** @typedef {{ name: string }} RegistryEntry */

/** @type {ReadonlyArray<RegistryEntry>} */
export const DEFAULT_WORK_TYPES = Object.freeze([
  { name: 'On Queue' },
  { name: 'On Queue - In Office' },
  { name: 'Meal' },
  { name: 'Project' },
]);

export const NOT_SCHEDULED = 'NOT_SCHEDULED';

const key = (name) => String(name).trim().toLowerCase();

/**
 * @param {ReadonlyArray<RegistryEntry>} [entries]
 */
export function createRegistry(entries = DEFAULT_WORK_TYPES) {
  const byKey = new Map(entries.map((entry) => [key(entry.name), Object.freeze({ ...entry })]));

  return Object.freeze({
    /** True if activities with this name count as work. */
    isWork(name) {
      return byKey.has(key(name));
    },
    /** All registered entries, in order. */
    entries() {
      return [...byKey.values()];
    },
    /** A new registry with extra entries added (this one is unchanged). */
    extend(extraEntries) {
      return createRegistry([...byKey.values(), ...extraEntries]);
    },
  });
}

/**
 * Split parsed activities into kept (work) and skipped (counted by name).
 * Not Scheduled blocks are dropped silently; they are never "skipped types".
 *
 * @param {Array<{name: string, type: string}>} activities
 * @param {ReturnType<typeof createRegistry>} registry
 */
export function partitionActivities(activities, registry) {
  const kept = [];
  const skipped = new Map();
  for (const activity of activities) {
    if (activity.type === NOT_SCHEDULED) continue;
    if (registry.isWork(activity.name)) {
      kept.push(activity);
    } else {
      const label = activity.name || '(no name)';
      skipped.set(label, (skipped.get(label) ?? 0) + 1);
    }
  }
  return { kept, skipped };
}
