'use strict';

// Moving a row in the priority list. A plugin may only write its own number, and peers that
// share a number are ordered by id, so some slots cannot be reached at all — but a click
// must never sit there doing nothing, which is what a reader reports as "the list is broken".

const { describe, it, assert } = require('../harness');
const { rankedLinkers, precedenceForIndex, currentIndex, STEP } = require('../../precedence');

const IDS = ['code-linker', 'glossary-linker', 'heading-linker', 'reference-linker'];

const appWith = (values) => {
  const plugins = {};
  IDS.forEach((id, i) => {
    plugins[id] = { api: { linker: { apiVersion: 1, id, displayName: id, precedence: values[i] } } };
  });
  return { plugins: { plugins } };
};

const order = (app) => rankedLinkers(app).map((p) => p.id);

// One click of an arrow, returning where the row ended up.
function click(values, id, dir) {
  const app = appWith(values);
  const self = app.plugins.plugins[id].api.linker;
  const from = currentIndex(app, self);
  const before = order(app);
  const peers = IDS.filter((x) => x !== id).map((x) => app.plugins.plugins[x].api.linker.precedence);
  self.precedence = precedenceForIndex(app, self, from + dir);
  const after = order(app);
  return {
    from,
    to: after.indexOf(id),
    target: from + dir,
    before,
    after,
    peersUntouched: IDS.filter((x) => x !== id)
      .every((x, i) => app.plugins.plugins[x].api.linker.precedence === peers[i]),
  };
}

const LAYOUTS = [
  [20, 10, 20, 10], // the shipped defaults
  [10, 10, 10, 10], // every plugin on the same number
  [20, 20, 20, 10],
  [20, 10, 10, 10],
  [30, 20, 10, 0],  // fully separated
  [15, 10, 10, 10],
  [0, 0, 5, 5],
];

describe('precedenceForIndex', () => {
  it('never leaves a click doing nothing, whatever the layout', () => {
    // The reported symptom: with several plugins sharing a precedence, the midpoint between
    // two equal neighbours is that same number, so the id tiebreak put the row straight back
    // where it started and the arrow appeared dead.
    for (const values of LAYOUTS) {
      for (const id of IDS) {
        for (const dir of [-1, 1]) {
          const at = currentIndex(appWith(values), appWith(values).plugins.plugins[id].api.linker);
          if (at + dir < 0 || at + dir >= IDS.length) continue; // the arrow is disabled there
          const r = click(values, id, dir);
          assert.notStrictEqual(r.to, r.from,
            `${JSON.stringify(values)} ${id} ${dir < 0 ? 'up' : 'down'} went nowhere: ${r.before.join(' > ')}`);
        }
      }
    }
  });

  it('never moves a row the way it was not asked to go', () => {
    for (const values of LAYOUTS) {
      for (const id of IDS) {
        for (const dir of [-1, 1]) {
          const at = currentIndex(appWith(values), appWith(values).plugins.plugins[id].api.linker);
          if (at + dir < 0 || at + dir >= IDS.length) continue;
          const r = click(values, id, dir);
          assert.strictEqual(Math.sign(r.to - r.from), dir,
            `${JSON.stringify(values)} ${id} asked ${dir < 0 ? 'up' : 'down'} but went ${r.from} -> ${r.to}`);
        }
      }
    }
  });

  it('lands exactly where asked when the peers leave room for it', () => {
    // Distinct numbers all round, and the numbers the four plugins actually ship with —
    // where the pairs tie, so landing right depends on reading the id tiebreak the same way
    // the order itself does. Every slot here is reachable, so nothing may overshoot.
    for (const values of [[30, 20, 10, 0], [20, 10, 20, 10]]) {
      for (const id of IDS) {
        for (const dir of [-1, 1]) {
          const at = currentIndex(appWith(values), appWith(values).plugins.plugins[id].api.linker);
          if (at + dir < 0 || at + dir >= IDS.length) continue;
          const r = click(values, id, dir);
          assert.strictEqual(r.to, r.target,
            `${JSON.stringify(values)} ${id} ${dir < 0 ? 'up' : 'down'} asked ${r.target}, landed ${r.to}`);
        }
      }
    }
  });

  it('moves the smallest distance the peers allow when the slot is unreachable', () => {
    // Three peers on one number: this row can only sit above all of them or below all of
    // them, and one click should not skip further than that.
    const r = click([20, 20, 20, 10], 'code-linker', 1);
    assert.strictEqual(r.from, 0);
    assert.strictEqual(r.to, 2, 'jumped past the nearest slot it could actually occupy');
  });

  it('writes only its own number', () => {
    for (const values of LAYOUTS) {
      const r = click(values, 'heading-linker', 1);
      assert.ok(r.peersUntouched, 'changed a peer’s setting, which is not ours to write');
    }
  });

  it('leaves a gap rather than joining a tie when both would land right', () => {
    // Joining a tie is what builds the runs that make later clicks unreachable, so a value
    // with room around it wins when either would do.
    // Index 1 is reachable two ways here: join the 30, or take the gap between 30 and 20.
    // Only the gap leaves the next click somewhere to land.
    const app = appWith([30, 20, 10, 0]);
    const self = app.plugins.plugins['heading-linker'].api.linker; // 10, at index 2
    const moved = precedenceForIndex(app, self, 1);
    assert.strictEqual(moved, 25, `expected the gap between 30 and 20, got ${moved}`);
  });

  it('stays put when there is nobody to be ranked against', () => {
    const solo = { plugins: { plugins: { 'heading-linker': { api: { linker: { apiVersion: 1, id: 'heading-linker', precedence: 20 } } } } } };
    const self = solo.plugins.plugins['heading-linker'].api.linker;
    assert.strictEqual(precedenceForIndex(solo, self, 1), 20);
  });
});
