// Run with: node test.js
const assert = require('node:assert/strict');
const Gate = require('./game.js');

function play(steps, s = Gate.createState()) {
  let last;
  for (const step of steps) last = Gate.act(s, step);
  return { s, last };
}
const text = (r) => Gate.plain(r.lines.map((l) => l.text).join(' '));
const won = (s) => String(s.over).startsWith('won');
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }

// ---- the four classic attempts ----

test('fake pass is caught on the seal, confiscated, and teaches the seal', () => {
  const { s, last } = play(['Show my pass']);
  assert.equal(last.verdict, 'denied');
  assert.match(text(last), /cracked left wing/);
  assert.equal(s.pass, null);
  assert.equal(s.suspicion, 2);
  assert.equal(Gate.tier(s), 'medium');
  assert.equal(s.knows.seal, true);
});

test('smoke drops the portcullis instead of opening a way through', () => {
  const { s, last } = play(['Throw the smoke pot']);
  assert.equal(last.verdict, 'denied');
  assert.ok(last.fx.includes('slam'));
  assert.equal(Gate.view(s).gate, 'shut');
  assert.equal(Gate.view(s).smoke, true);
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

test('no free-text attempt opens the gate', () => {
  const tries = ['I am the king', 'let me through please', 'sneak past him', 'climb the wall',
    'tell him his daughter is ill', 'do a little dance', 'what is your name?', 'offer 3 coins'];
  for (const t of tries) assert.ok(!won(play([t]).s), t);
});

// ---- suspicion tiers ----

test('low suspicion: Vale talks and gives hints', () => {
  const { last } = play(['Talk to Vale', 'Talk to Vale']);
  assert.match(text(last), /after dark I look at everything twice/);
});

test('medium suspicion: Vale stops giving hints', () => {
  const { s, last } = play(['Shout that the castle is on fire', 'Talk to Vale']);
  assert.equal(Gate.tier(s), 'medium');
  assert.match(text(last), /past pleasantries/);
});

test('high suspicion: weapon drawn, options restricted', () => {
  const { s, last } = play(['Shout that the castle is on fire', 'Throw the smoke pot']);
  assert.equal(Gate.tier(s), 'high');
  assert.match(text(last), /halberd comes down level/);
  assert.deepEqual(Gate.suggestions(Object.assign(s, { sealedTurns: 0 })), ['Show my pass', 'Go to the town']);
});

test('high suspicion: one more trick locks the gate down', () => {
  const { s, last } = play(['Shout that the castle is on fire', 'Throw the smoke pot', 'offer the resin']);
  assert.equal(s.over, 'lockdown');
  assert.equal(last.verdict, 'lockdown');
});

test('attacking Vale ends in arrest', () => {
  assert.equal(play(['attack the guard']).s.over, 'arrested');
});

test('leaving the gate eases suspicion by one', () => {
  const { s } = play(['Offer the resin', 'Go to the town']);
  assert.equal(s.suspicion, 0);
});

// ---- time ----

test('time moves from dusk to the evening bell to night, then the gate is barred', () => {
  const s = Gate.createState();
  assert.equal(Gate.phase(s), 'dusk');
  const bell = Gate.act(s, 'Wait for the bell');
  assert.equal(Gate.phase(s), 'evening');
  assert.ok(bell.fx.includes('bell'));
  while (Gate.phase(s) === 'evening') Gate.act(s, 'wait a while');
  assert.equal(Gate.phase(s), 'night');
  let guard = 0;
  while (!s.over && guard++ < 20) Gate.act(s, 'wait a while');
  assert.equal(s.over, 'barred');
});

test('the steward only issues passes before the bell; the office shuts at night', () => {
  const s = Object.assign(Gate.createState(), { place: 'steward', time: Gate.DUSK_END });
  Gate.act(s, 'Offer the resin to the steward for a pass');
  assert.equal(s.pass.kind, 'forged');
  assert.equal(s.resin, true);
  const t = Object.assign(Gate.createState(), { place: 'town', time: Gate.EVENING_END });
  const r = Gate.act(t, 'Visit the steward’s office');
  assert.match(text(r), /shuttered/);
  assert.equal(t.place, 'town');
});

// ---- items ----

test('inspecting is free and reveals pass details and clues', () => {
  const s = Gate.createState();
  const pass = Gate.inspect(s, 'pass');
  assert.deepEqual(pass.facts.map((f) => f[0]), ['Paper', 'Seal', 'Countersign', 'Business']);
  assert.match(pass.facts[1][1], /both wings whole/);
  assert.match(pass.facts[3][1], /Wool/);
  Gate.inspect(s, 'coins');
  assert.equal(s.knows.coinHeron, true);
  const typed = Gate.act(s, 'inspect the resin');
  assert.match(text(typed), /sealing wax/);
  assert.equal(s.time, 0);
});

test('resin + pass presses a coin heron; the crack appears only if you know of it', () => {
  const a = Object.assign(Gate.createState(), { place: 'town' });
  a.pass.seal = 'none';
  Gate.act(a, 'apply the resin to the pass');
  assert.equal(a.pass.seal, 'intact');
  assert.equal(a.resin, true, 'a few drops do not use up the vial');
  const b = Object.assign(Gate.createState(), { place: 'town' });
  b.knows.seal = true;
  Gate.act(b, 'apply the resin to the pass');
  assert.equal(b.pass.seal, 'cracked');
});

test('sealing a pass in front of Vale is noticed', () => {
  const { s } = play(['apply the resin to the pass']);
  assert.equal(s.suspicion, 2);
});

test('the peddler buys the smoke pot', () => {
  const s = Object.assign(Gate.createState(), { place: 'tavern' });
  Gate.act(s, 'Sell the smoke pot to the peddler');
  assert.equal(s.coins, 5);
  assert.equal(s.smoke, 0);
});

test('listening in the tavern is free but slow; a round is quick', () => {
  const a = Object.assign(Gate.createState(), { place: 'tavern' });
  play(['Listen to the rumours', 'Listen to the rumours'], a);
  assert.equal(a.knows.word, true);
  assert.equal(a.coins, 3);
  const b = Object.assign(Gate.createState(), { place: 'tavern' });
  Gate.act(b, 'Buy the guards a round');
  assert.equal(b.knows.word, true);
  assert.equal(b.coins, 2);
  assert.ok(a.time > b.time);
});

// ---- ways through ----

const HONEST = ['Go to the town', 'Visit the steward’s office', 'Offer the resin to the steward for a pass', 'Return to the gate'];

test('honest route: a real pass is refused until the ledger arrives, then accepted', () => {
  const { s, last } = play([...HONEST, 'Show my pass']);
  assert.equal(Gate.phase(s), 'dusk');
  assert.match(text(last), /wait for it/);
  assert.equal(s.suspicion, 0);
  assert.equal(s.pass.kind, 'real');
  const end = play(['Wait for the bell', 'Show my pass'], s);
  assert.equal(s.over, 'won-legit');
  assert.equal(end.last.verdict, 'passed');
});

const FORGER = ['Watch the gate', 'Go to the town', 'Go to the tavern', 'Buy the guards a round',
  'Find the scrivener', 'Add the countersign to my pass', 'Apply the resin to the pass',
  'Visit the steward’s office', 'Bribe the clerk to add my name to the ledger', 'Return to the gate'];

test('forger route: seal, word and ledger make a forgery a pass at low suspicion', () => {
  const { s, last } = play([...FORGER, 'Show my pass']);
  assert.equal(Gate.phase(s), 'evening');
  assert.equal(s.over, 'won-forged');
  assert.equal(last.verdict, 'passed');
});

test('forger route: without the ledger entry the forgery is caught after the bell', () => {
  const steps = FORGER.filter((x) => !/clerk|steward/.test(x));
  const { s, last } = play([...steps, 'Wait for the bell', 'Show my pass']);
  assert.match(text(last), /never entered in it/);
  assert.equal(s.pass, null);
});

test('a wary Vale catches rag paper that an easy Vale lets through', () => {
  const { s } = play(FORGER);
  s.suspicion = 2;
  const r = Gate.act(s, 'Show my pass');
  assert.match(text(r), /market rag/);
  assert.equal(s.pass, null);
});

test('a wary Vale asks your business, and the answer must match the pass', () => {
  const setup = () => {
    const { s } = play(FORGER);
    s.pass.paper = 'laid';
    s.suspicion = 2;
    const q = Gate.act(s, 'Show my pass');
    assert.match(text(q), /Tell me what it is/);
    assert.deepEqual(Gate.suggestions(s).length, 3);
    return s;
  };
  const wrong = setup();
  Gate.act(wrong, 'I am only visiting');
  assert.equal(wrong.pass, null);
  assert.ok(!won(wrong));
  const right = setup();
  Gate.act(right, 'Wool, for the castle weavers');
  assert.equal(right.over, 'won-forged');
});

test('after dark Vale is wary even of an honest bearer', () => {
  const { s } = play(HONEST);
  s.time = Gate.EVENING_END;
  s.entry = 'arrived';
  const q = Gate.act(s, 'Show my pass');
  assert.match(text(q), /Tell me what it is/);
  Gate.act(s, 'Resin, for the castle apothecary');
  assert.equal(s.over, 'won-legit');
});

test('suggested actions are all understood where they are offered', () => {
  for (const place of ['gate', 'town', 'steward', 'tavern', 'scrivener']) {
    for (const sug of Gate.suggestions(Object.assign(Gate.createState(), { place }))) {
      const s = Object.assign(Gate.createState(), { place });
      const r = Gate.act(s, sug);
      assert.ok(r.lines.length > 0, place + ': ' + sug);
      assert.doesNotMatch(text(r), /wasn’t a pass\.|State your business, or|The peddler watches your belt|You could visit|Tell me what the real one/, place + ': ' + sug);
    }
  }
});

console.log('\n' + n + ' tests passed');
