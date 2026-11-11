// Run with: node test.js
const assert = require('node:assert/strict');
const Gate = require('./game.js');

function play(steps, s = Gate.createState()) {
  let last;
  for (const step of steps) last = Gate.act(s, step);
  return { s, last };
}
const text = (r) => r.lines.map((l) => l.text).join(' ');
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }

test('fake pass is caught on the seal, confiscated, and teaches the seal', () => {
  const { s, last } = play(['Show my pass']);
  assert.equal(last.verdict, 'denied');
  assert.match(text(last), /cracked left wing/);
  assert.equal(s.pass, null);
  assert.equal(s.suspicion, 2);
  assert.equal(s.knows.seal, true);
  assert.equal(s.over, null);
});

test('smoke drops the portcullis instead of opening a way through', () => {
  const { s, last } = play(['Throw the smoke pot']);
  assert.equal(last.verdict, 'denied');
  assert.ok(s.sealedTurns > 0);
  assert.equal(s.smoke, 0);
  const shut = Gate.act(s, 'show my pass');
  assert.match(text(shut), /Gate’s shut/);
  assert.ok(s.pass, 'a sealed gate does not even examine the pass');
});

test('bartering is refused and points to the steward', () => {
  const { s, last } = play(['Offer the resin']);
  assert.equal(last.verdict, 'denied');
  assert.match(text(last), /steward/);
  assert.equal(s.resin, true);
  assert.equal(s.suspicion, 1);
});

test('the fire claim rings the bell but does not open the gate', () => {
  const { s, last } = play(['Shout that the castle is on fire']);
  assert.equal(last.verdict, 'denied');
  assert.match(text(last), /bell-rope/);
  assert.equal(s.suspicion, 2);
  assert.equal(s.over, null);
});

test('stacking tricks gets you arrested', () => {
  const { s, last } = play(['Show my pass', 'The castle is on fire!']);
  assert.equal(s.over, 'arrested');
  assert.equal(last.verdict, 'arrested');
});

test('attacking Vale ends the evening', () => {
  assert.equal(play(['attack the guard']).s.over, 'arrested');
});

test('no free-text attempt opens the gate', () => {
  const tries = ['I am the king', 'let me through please', 'sneak past him', 'climb the wall',
    'tell him his daughter is ill', 'do a little dance', 'what is your name?', 'offer 3 coins'];
  for (const t of tries) {
    const { s } = play([t]);
    assert.ok(!String(s.over).startsWith('won'), t);
  }
});

test('honest route: resin to the steward buys a real pass', () => {
  const { s, last } = play(['Go to the town', 'Visit the steward’s office',
    'Offer the resin to the steward for a pass', 'Return to the gate', 'Show my pass']);
  assert.equal(s.over, 'won-legit');
  assert.equal(last.verdict, 'passed');
});

test('forger route: each failed check names the next thing missing', () => {
  const s = Gate.createState();
  play(['Watch the gate', 'Go to the town', 'Find the scrivener', 'Commission a forged pass', 'Return to the gate'], s);
  assert.deepEqual(s.pass, { kind: 'forged', seal: true, countersign: false });
  const r = Gate.act(s, 'Show my pass');
  assert.match(text(r), /blank where the word should be/);
  assert.equal(s.knows.countersignNeeded, true);
});

test('forger route: seal + countersign still fails without the ledger', () => {
  const { s, last } = play(['Watch the gate', 'Go to the town', 'Go to the tavern', 'Buy the guards a round',
    'Find the scrivener', 'Commission a forged pass', 'Return to the gate', 'Show my pass']);
  assert.match(text(last), /never entered in my book/);
  assert.equal(s.over, null);
});

test('forger route: a forgery that passes all three checks is a pass', () => {
  const { s, last } = play(['Ask what makes a pass valid', 'Watch the gate', 'Go to the town',
    'Go to the tavern', 'Buy the guards a round',
    'Visit the steward’s office', 'Bribe the clerk to add my name to the ledger',
    'Find the scrivener', 'Commission a forged pass', 'Return to the gate', 'Show my pass']);
  assert.equal(s.over, 'won-forged');
  assert.equal(last.verdict, 'passed');
});

test('suggested actions are all understood where they are offered', () => {
  for (const place of ['gate', 'town', 'steward', 'tavern', 'scrivener']) {
    for (const sug of Gate.suggestions(Object.assign(Gate.createState(), { place }))) {
      const s = Object.assign(Gate.createState(), { place });
      const r = Gate.act(s, sug);
      assert.ok(r.lines.length > 0, place + ': ' + sug);
      assert.doesNotMatch(text(r), /wasn’t a pass\.|State your business with|A round might loosen|You could visit/, place + ': ' + sug);
    }
  }
});

console.log('\n' + n + ' tests passed');
