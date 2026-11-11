# The Gate at Harrowmere

A small text game about an NPC who cannot be talked round. Sergeant Vale guards
a castle gate under one absolute order: nobody passes without a valid pass. You
type whatever you want to try, and he judges it.

## Play

Open `index.html` in a browser. There is nothing to install or build.

Type freely, or use the suggested actions under the story. Things worth trying:
showing your pass, throwing the smoke pot, offering the resin, shouting that the
castle is on fire, asking Vale what makes a pass valid, watching the gate, and
going down to the lower town.

## How Vale decides

Vale asks one question of every situation: is there a valid pass in front of
him? A valid pass has the steward's seal, this week's countersign, and a
matching entry in his gate ledger.

Nothing else you do changes that answer. It changes other things instead:

| Attempt | What happens |
|---|---|
| Fake pass | He checks it properly, names the flaw, keeps the pass, and grows suspicious |
| Smoke | He cannot check passes he cannot see, so he drops the portcullis |
| Barter | Refused, and he points you to the steward, who issues passes |
| "The castle is on fire" | He rings the bell for the garrison and still keeps you out |

Suspicion builds with each trick and eases a little when you leave the gate.
At four marks he calls the watch and the evening ends.

There are two ways through, and both satisfy his rule: earn a real pass from
the steward, or assemble a forgery good enough to survive all three checks.

## Files

- `game.js` holds the rules and all of Vale's judgement. It has no DOM code and
  runs in the browser or Node.
- `index.html` is the page: the gate scene, the story log, and the sidebar.
- `test.js` covers the four classic bypass attempts, arrest, and both winning
  routes. Run it with `node test.js`.

Player input is matched by keyword, not by a language model, so the game runs
offline and Vale's verdicts are the same every time.
