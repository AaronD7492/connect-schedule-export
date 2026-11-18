import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, partitionActivities } from '../src/core/registry.js';

const a = (name, type = 'PRODUCTIVE') => ({ name, type });

test('UT-06 keeps work types and counts skipped types by name', () => {
  const registry = createRegistry();
  const { kept, skipped } = partitionActivities(
    [a('On Queue'), a('Meal', 'NON_PRODUCTIVE'), a('Project', 'NON_PRODUCTIVE'), a('Paid Absent'), a('Paid Absent'), a('Training'), a('', 'NOT_SCHEDULED')],
    registry,
  );
  assert.deepEqual(kept.map((x) => x.name), ['On Queue', 'Meal', 'Project']);
  assert.deepEqual([...skipped.entries()], [['Paid Absent', 2], ['Training', 1]]);
});

test('UT-07 a new type is supported by adding an entry, without editing other code', () => {
  const base = createRegistry();
  const extended = base.extend([{ name: 'Training' }]);
  assert.equal(base.isWork('Training'), false);
  assert.equal(extended.isWork('Training'), true);
  assert.equal(extended.isWork('On Queue'), true);
});

test('matching ignores case and surrounding spaces', () => {
  const registry = createRegistry();
  assert.equal(registry.isWork('  on queue - in office '), true);
});
