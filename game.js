/*
 * The Gate at Harrowmere — game engine.
 *
 * Pure logic, no DOM. Works in the browser (window.Gate) and in Node (require).
 *
 * The design rule: Sergeant Vale asks one question of every situation —
 * "is there a valid pass in front of me?" Player actions change his suspicion,
 * the hour, and the world, but never the answer to that question. How hard he
 * looks depends on how wary he is; what he looks for never changes.
 *
 * Text may carry inline tags the page colours: [[i:item]] [[c:clue]] [[d:danger]].
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_SUSPICION = 6;      // at 6 the gate is locked down for the night
  var DUSK_END = 12;          // the evening bell
  var EVENING_END = 26;       // full dark
  var NIGHT_END = 42;         // the gate is barred until morning
  var WORD = 'Ashfall';
  var TIERS = ['low', 'medium', 'high'];

  function createState() {
    return {
      place: 'gate',          // gate | town | steward | tavern | scrivener
      time: 0,
      suspicion: 0,
      sealedTurns: 0,         // portcullis is down (smoke) while > 0
      coins: 3,
      resin: true,
      resinTapped: false,
      smoke: 1,
      pass: { kind: 'forged', paper: 'rag', seal: 'intact', word: false, business: 'wool' },
      entry: null,            // name in the gate ledger: null | 'pending' | 'arrived'
      pending: null,          // a question Vale is waiting on
      knows: { checks: false, seal: false, wordNeeded: false, word: false, ledger: false,
               bell: false, watermark: false, coinHeron: false, question: false },
      tried: {},
      turns: 0,
      over: null              // won-legit | won-forged | arrested | lockdown | barred
    };
  }

  function intro() {
    return [
      { who: 'narr', text: 'Dusk at Castle Harrowmere. The gate stands open, and in it stands Sergeant Brannoch Vale, who has let no one through without a pass in nineteen years.' },
      { who: 'narr', text: 'You carry [[i:a pass]] a man in the lower town swore was good, [[i:a smoke pot]], [[i:a vial of dragon\u2019s-blood resin]], and [[i:three coins]]. You need to be inside the walls before the gate is barred for the night.' },
      { who: 'vale', text: 'Pass.' },
      { who: 'sys', text: 'Type anything you want to try. Select an item in the margin to inspect it.' }
    ];
  }

  // ---------- small helpers ----------

  function has(text, re) { return re.test(text); }
  function count(s, key) { s.tried[key] = (s.tried[key] || 0) + 1; return s.tried[key]; }
  function out() { return { lines: [], verdict: null, fx: [] }; }
  function say(r, who, text) { r.lines.push({ who: who, text: text }); return r; }
  function fx(r, name) { if (r.fx.indexOf(name) < 0) r.fx.push(name); }
  function plain(text) { return String(text).replace(/\[\[[icd]:([^\]]*)\]\]/g, '$1'); }

  function phase(s) { return s.time < DUSK_END ? 'dusk' : s.time < EVENING_END ? 'evening' : 'night'; }
  function tierIndex(s) { return s.suspicion >= 4 ? 2 : s.suspicion >= 2 ? 1 : 0; }
  function tier(s) { return TIERS[tierIndex(s)]; }
  // How hard Vale looks: his suspicion, and after dark never less than "medium".
  function wariness(s) { return Math.max(tierIndex(s), phase(s) === 'night' ? 1 : 0); }

  // ---------- time ----------

  function tick(s, r, n) {
    if (s.over || n <= 0) return;
    var before = phase(s);
    s.time += n;
    var after = phase(s);
    if (before !== after) {
      if (before === 'dusk') {
        fx(r, 'bell');
        say(r, 'narr', s.place === 'gate'
          ? 'The evening bell rolls down from the keep. A runner comes puffing up the hill with the day\u2019s ledger, and Vale chains it to the wall beside him.'
          : 'The evening bell rolls down from the keep. Up the hill the day\u2019s ledger is changing hands, and the steward has gone to his supper.');
      }
      if (after === 'night') {
        say(r, 'narr', s.place === 'gate'
          ? 'Full dark. Torches are lit along the wall, and Vale turns up the lantern.'
          : 'Full dark. Shutters close along the street. A night runner jogs past toward the hill with the last slips for the gate.');
        if (s.place === 'gate') say(r, 'vale', 'After dark I look at everything twice.');
      }
      if (s.entry === 'pending') s.entry = 'arrived';
    }
    if (s.time >= NIGHT_END) {
      s.over = 'barred';
      r.verdict = 'barred';
      fx(r, 'slam');
      say(r, 'narr', 'Midnight. Up on the hill the portcullis comes down for the last time and the bar drops behind it.');
      say(r, 'sys', '[[d:The gate is barred until morning.]] You ran out of night. Start again to try another way.');
    }
  }

  // ---------- suspicion ----------

  function suspect(s, r, n) {
    if (s.over) return;
    var before = tierIndex(s);
    if (before === 2) return lockdown(s, r);
    s.suspicion = Math.min(MAX_SUSPICION, s.suspicion + n);
    if (s.suspicion >= MAX_SUSPICION) return lockdown(s, r);
    var after = tierIndex(s);
    if (after > before) {
      fx(r, 'bad');
      if (after === 1) {
        say(r, 'narr', 'Vale pulls the ledger closer and looks at you properly for the first time. [[d:He is wary now]]: he will check twice, and he will ask questions.');
      } else {
        say(r, 'narr', 'The halberd comes down level with your chest. [[d:Vale is done talking.]] One more trick and he shuts the gate for the night.');
      }
    }
  }

  function lockdown(s, r) {
    s.over = 'lockdown';
    s.suspicion = MAX_SUSPICION;
    r.verdict = 'lockdown';
    fx(r, 'slam');
    say(r, 'narr', 'Vale does not answer. He kicks the windlass pin, and the portcullis comes down between you with a crash that empties the rooks out of the gatehouse.');
    say(r, 'vale', 'Gate\u2019s shut till morning, on my authority. You can explain yourself to the captain at dawn, if you\u2019re fool enough to still be here.');
    say(r, 'sys', '[[d:Locked down.]] The gate will not open again tonight. Start again to try another way.');
  }

  function arrest(s, r) {
    s.over = 'arrested';
    s.suspicion = MAX_SUSPICION;
    r.verdict = 'arrested';
    fx(r, 'slam');
    say(r, 'narr', 'Vale puts the horn to his lips. Boots answer from the guardhouse before the note has died, and a hand closes on your collar.');
    say(r, 'vale', 'That\u2019s enough of you for one evening. The captain can have the rest.');
    say(r, 'sys', '[[d:Arrested.]] The gate never opened. Start again to try another way.');
  }

  // ---------- travel ----------

  var PLACES = {
    gate: /\b(gate|castle|vale|guard|sergeant|hill)\b/,
    steward: /\b(steward|office|clerk)\b/,
    tavern: /\b(tavern|inn|alehouse|heron)\b/,
    scrivener: /\b(scrivener|forger|alley|stall)\b/,
    town: /\b(town|market|street|outside)\b/
  };
  var GO = /\b(go|walk|head|visit|leave|return|travel|find|back|enter)\b/;

  function destination(text, needVerb) {
    if (needVerb && !has(text, GO)) return null;
    var order = ['steward', 'tavern', 'scrivener', 'gate', 'town'];
    for (var i = 0; i < order.length; i++) if (has(text, PLACES[order[i]])) return order[i];
    if (/\b(leave|walk away|go away)\b/.test(text)) return 'town';
    return null;
  }

  function arrive(s, r, place) {
    var from = s.place;
    s.place = place;
    if (from === 'gate') {
      s.sealedTurns = 0;
      s.pending = null;
      if (s.suspicion > 0) {
        s.suspicion -= 1;
        say(r, 'narr', 'You walk down the hill. Behind you Vale\u2019s attention drifts back to the road; out of sight, you are a little less on his mind.');
      } else {
        say(r, 'narr', 'You walk down the hill to the lower town.');
      }
      tick(s, r, 2);
    } else if (place === 'gate') {
      say(r, 'narr', 'You climb the hill.');
      tick(s, r, 2);
    }
    if (s.over) return;
    var ph = phase(s);

    if (place === 'steward' && ph === 'night') {
      s.place = 'town';
      say(r, 'narr', 'The steward\u2019s office is shuttered and dark. Nobody will write anything into any ledger before morning.');
      return;
    }
    if (place === 'town') {
      say(r, 'narr', 'The lower town. The steward\u2019s office stands by the fish market, the Drowned Heron tavern is filling with off-duty guards, and a scrivener keeps a stall in the alley behind it. The gate is back up the hill.');
    } else if (place === 'steward') {
      if (ph === 'dusk') {
        say(r, 'narr', 'The steward\u2019s office. A clerk copies names into the gate ledger that goes up the hill at the evening bell. Through the inner door the steward is weighing something on brass scales.');
        say(r, 'clerk', 'Passes are issued to those with business the steward cares to hear. State yours.');
      } else {
        say(r, 'narr', 'The steward\u2019s office. The inner room is dark; the steward has gone to supper. The clerk is alone with a candle and a stack of late slips for the night runner.');
        say(r, 'clerk', 'No passes till morning. If that\u2019s what you came for, you came late.');
      }
    } else if (place === 'tavern') {
      say(r, 'narr', (ph === 'dusk'
        ? 'The Drowned Heron. Three guards off the day watch sit with empty cups, complaining about the week\u2019s duties.'
        : 'The Drowned Heron, loud now. The day watch is three cups in and complaining at full voice.') +
        ' A peddler has spread his pack across the corner table.');
    } else if (place === 'scrivener') {
      say(r, 'narr', 'A stall the width of a door. The scrivener has ink to the elbows and does not ask what you want a pass for.');
      say(r, 'scrivener', 'A coin for a sheet of market rag, two for laid paper out of the steward\u2019s own stock. A coin to add a line to a sheet you\u2019ve got. I write. I don\u2019t do wax.');
    } else if (place === 'gate') {
      var t = tierIndex(s);
      say(r, 'narr', t === 2 ? 'The gate again. Vale has not moved, and neither has the point of the halberd.' : 'The gate again. Vale has not moved.');
      say(r, 'vale', t === 2 ? 'Pass. Nothing else.' : t === 1 ? 'You. Pass, or keep walking.' : 'Pass.');
    }
  }

  // ---------- the gate: reading a pass ----------

  function presentPass(s, r) {
    var p = s.pass;
    if (!p) {
      r.verdict = 'denied';
      say(r, 'narr', 'You pat your coat. You have no pass to show.');
      say(r, 'vale', 'Then we\u2019ve nothing to discuss.');
      return;
    }
    var w = wariness(s);
    s.knows.checks = true;
    say(r, 'narr', w === 2
      ? 'Vale takes the pass left-handed. The halberd stays where it is.'
      : 'You hand the pass over. Vale tilts it to the lantern and takes his time.');

    // 1. The seal.
    if (p.kind !== 'real' && p.seal !== 'cracked') {
      if (p.seal === 'intact') {
        s.knows.seal = true;
        say(r, 'vale', 'Good hand. But the steward\u2019s heron has a [[c:cracked left wing]], has had since the die was dropped in spring. This bird is in fine health.');
      } else if (p.seal === 'blob') {
        say(r, 'vale', 'A thumb of red wax with no bird in it. The steward seals with a heron, not with his thumb.');
      } else {
        say(r, 'vale', 'There\u2019s no seal on this at all. You\u2019ve brought me a letter.');
      }
      return confiscate(s, r);
    }
    // 2. The countersign.
    if (p.kind !== 'real' && !p.word) {
      s.knows.wordNeeded = true;
      say(r, 'vale', 'Wing\u2019s cracked. Someone\u2019s been paying attention. But [[c:a word goes under the seal]], changed every week, and this has a blank where the word should be.');
      return confiscate(s, r);
    }
    // 3. The ledger.
    s.knows.ledger = true;
    say(r, 'narr', w >= 1
      ? 'He goes down the gate ledger once with his thumb, then again from the bottom.'
      : 'He runs a thumb down the gate ledger.');
    if (s.entry !== 'arrived') {
      if (phase(s) === 'dusk') {
        s.knows.bell = true;
        r.verdict = 'denied';
        say(r, 'vale', 'Seal\u2019s right. Word\u2019s right. Name\u2019s not in my book. Today\u2019s names [[c:come up the hill at the evening bell]], so that proves nothing yet. Stand over there and wait for it.');
        say(r, 'narr', 'He hands the pass back.');
        return;
      }
      say(r, 'vale', 'Seal\u2019s right. Word\u2019s right. And the bell has rung, the book is here, and the steward wrote out a pass for a name he never entered in it. He doesn\u2019t forget. So he didn\u2019t write this.');
      return confiscate(s, r);
    }
    // 4. Wary: the paper itself.
    if (w >= 1 && p.kind !== 'real' && p.paper !== 'laid') {
      s.knows.watermark = true;
      say(r, 'narr', 'Then he does something new: he holds the sheet flat against the lantern glass and looks through it.');
      say(r, 'vale', 'Name\u2019s in the book, I\u2019ll grant. But the steward writes on laid paper with [[c:a heron in the weave]]. This is market rag. Somebody has friends in the office and none at the paper mill.');
      return confiscate(s, r);
    }
    // 5. Wary: a testing question.
    if (w >= 1) {
      s.pending = { type: 'business' };
      s.knows.question = true;
      say(r, 'vale', w === 2
        ? 'Everything\u2019s in order, which I don\u2019t trust. The pass states your business within. Say it. Now.'
        : 'All in order on the page. One thing more. The pass states your business within. Tell me what it is, without looking.');
      return;
    }
    say(r, 'vale', p.kind === 'real'
      ? 'Heron\u2019s wing is cracked. Countersign\u2019s right. Name\u2019s in the ledger. Go on, then.'
      : 'Wing\u2019s cracked. Word\u2019s right. Name\u2019s in the book. That\u2019s a pass.');
    win(s, r);
  }

  function answer(s, text, r) {
    var p = s.pass;
    s.pending = null;
    var right = p.kind === 'real' ? /apothecar|resin|dragon/ : /wool|weaver|fleece/;
    if (has(text, right)) {
      say(r, 'vale', p.kind === 'real'
        ? 'Resin for the apothecary. As written. I don\u2019t like you, but that isn\u2019t one of the things I check.'
        : 'Wool for the weavers. As written.');
      return win(s, r);
    }
    if (p.kind === 'real') {
      r.verdict = 'denied';
      say(r, 'vale', 'That\u2019s not what the steward wrote. A man who doesn\u2019t know his own business has borrowed someone else\u2019s pass. Take it and come back when you can tell me.');
      say(r, 'narr', 'He hands the pass back.');
      return suspect(s, r, 1);
    }
    say(r, 'vale', 'That\u2019s not what it says. The page is perfect and the bearer has never read it.');
    confiscate(s, r);
  }

  function confiscate(s, r) {
    s.pass = null;
    r.verdict = 'denied';
    fx(r, 'bad');
    say(r, 'narr', 'He folds the pass into his belt.');
    suspect(s, r, 2);
    if (!s.over) say(r, 'vale', 'I\u2019m keeping this. Bring me another like it and you\u2019ll meet the watch-captain.');
  }

  function win(s, r) {
    var how = s.pass.kind === 'real' ? 'won-legit' : 'won-forged';
    s.over = how;
    r.verdict = 'passed';
    fx(r, 'good');
    say(r, 'narr', 'Vale steps aside. It is the first time you have seen him move his feet.');
    say(r, 'sys', how === 'won-legit'
      ? 'You are through the gate with a real pass, honestly got. Vale never bent. You met his rule instead of fighting it.'
      : 'You are through the gate on a forgery good enough to be a pass. Vale never bent. His order was about passes, and you beat the checking, not the man.');
  }

  // ---------- the gate: everything else ----------

  function gate(s, text, r) {
    var question = /\?|\b(what|how|where|why|which|who|tell me|explain|ask)\b/.test(text);
    var passWord = /\b(pass|papers|forgery|writ|document)\b/.test(text);
    var high = tierIndex(s) === 2;

    var dest = destination(text, true);
    if (dest && dest !== 'gate') return arrive(s, r, dest);

    if (has(text, /\b(attack|stab|kill|fight|punch|hit|sword|knife|dagger|strike|shove|tackle|threaten)\b/)) {
      say(r, 'narr', 'You go for him. He has been waiting nineteen years for someone to be that stupid, and he is faster than he looks.');
      return arrest(s, r);
    }

    if (has(text, /\b(smoke|distract|distraction|diversion|fog)\b/)) {
      if (s.smoke < 1) { say(r, 'narr', 'You have no smoke pot left to throw.'); return; }
      s.smoke -= 1;
      r.verdict = 'denied';
      fx(r, 'slam');
      say(r, 'narr', 'The pot bursts in the gateway and the arch fills with grey. You start forward \u2014 and iron screams. One kick to the windlass pin, and the portcullis comes down a hand\u2019s width from your boots.');
      if (!high) {
        s.sealedTurns = 3;
        say(r, 'vale', 'Gate\u2019s shut. Gate stays shut until I can see every pair of hands on this road. Whoever threw that, I\u2019d start walking.');
        say(r, 'sys', 'He cannot check passes he cannot see, so nobody passes. The gate is sealed until the smoke clears.');
      }
      return suspect(s, r, 2);
    }

    if (s.sealedTurns > 0) {
      s.sealedTurns -= 1;
      var waiting = has(text, /\b(wait|watch|observe|linger|stand)\b/);
      // Tricks tried through the bars still count against you.
      var trick = !waiting && has(text, /\b(fire|burning|ablaze|flames?|bribe|barter|resin|gold|coins?|money|offer|sneak|slip|climb|run|dash|rush|scale|squeeze|crawl)\b/);
      if (!trick) {
        if (!waiting) { r.verdict = 'denied'; say(r, 'vale', 'Gate\u2019s shut. Nothing you say to me through these bars opens it.'); }
        if (s.sealedTurns === 0) {
          say(r, 'narr', 'The smoke thins. Chains rattle and the portcullis climbs back into the arch.');
          say(r, 'vale', 'Right. One at a time. Pass.');
        } else if (waiting) {
          say(r, 'narr', 'You wait. Smoke still hangs in the arch, and Vale is a shape behind the bars, counting hands.');
        }
        return;
      }
    }

    if (has(text, /\b(wait|bell|pass the time|rest)\b/) && !has(text, /\bfire\b/)) return waitHere(s, r);

    if (has(text, /\blet (me|us) (pass|through|in|by)\b/)) return plead(s, r);

    if (passWord && question) return explainChecks(s, r);

    if (has(text, /\b(fire|burning|ablaze|flames?|burns?|alight)\b/)) {
      var n = count(s, 'fire');
      r.verdict = 'denied';
      if (n === 1 && !high) {
        say(r, 'narr', 'Vale glances up at a clear sky over the keep, then back at you.');
        say(r, 'vale', 'Odd fire. No smoke, no bell, and the only one who\u2019s noticed is a stranger on the wrong side of the wall.');
        say(r, 'narr', 'He hauls the bell-rope twice anyway.');
        say(r, 'vale', 'There. If it burns, the garrison\u2019s roused and they have buckets. If it doesn\u2019t, the captain will want to know why you said it did. Either way, you\u2019re not going in. Fire is a reason to come out.');
      } else if (!high) {
        say(r, 'vale', 'It wasn\u2019t burning the last time you said so either.');
      }
      return suspect(s, r, 2);
    }

    var bribe = /\b(bribe|barter|trade|resin|gold|coins?|money|pay|gift|goods|sell|wages|purse)\b/.test(text) ||
      (/\boffer\b/.test(text) && !passWord);
    var show = /\b(show|present|hand|give|flash|produce|use|try|wave)\b/.test(text);

    if (passWord && (show || !bribe)) return presentPass(s, r);

    if (bribe) {
      var b = count(s, 'bribe');
      r.verdict = 'denied';
      fx(r, 'bad');
      if (high) {
        say(r, 'vale', 'And now a bribe.');
      } else if (b === 1) {
        say(r, 'narr', s.resin
          ? 'You unwrap [[i:the resin]]. He looks at it long enough to show he knows exactly what it is.'
          : 'You show him what you have. He does not look at it for long.');
        say(r, 'vale', 'That\u2019d buy my daughter a dowry and me a rope. Put it away.');
        say(r, 'vale', 'If you\u2019ve goods like that, you\u2019ve business the steward would hear. Office by the fish market, ' +
          (phase(s) === 'dusk' ? '[[c:open until the evening bell]].' : '[[c:shut since the evening bell]], so that\u2019s tomorrow\u2019s errand.') +
          ' He issues passes. I only read them.');
      } else {
        say(r, 'vale', 'I told you the price. It\u2019s a pass. It hasn\u2019t gone up and it hasn\u2019t come down.');
      }
      return suspect(s, r, 1);
    }

    if (has(text, /\b(sneak|slip|climb|run|dash|rush|creep|wall|scale|dodge|squeeze|crawl|jump|hide)\b/)) {
      r.verdict = 'denied';
      say(r, 'narr', 'You move. So does the butt of his halberd, which arrives across the gateway at the height of your chest and stays there.');
      if (!high) say(r, 'vale', 'The arch is nine feet wide and I\u2019ve stood in it since before you could walk. Try the pass instead.');
      return suspect(s, r, 1);
    }

    if (has(text, /\b(king|queen|lord|lady|noble|messenger|captain|orders?|command|urgent|duke|inspector|friend|cousin|sick|dying|healer|please|beg|important|know who)\b/)) {
      return plead(s, r);
    }

    if (has(text, /\b(watch|observe|look|study|linger|stand)\b/)) return watch(s, r);

    if (has(text, /\b(seal|countersign|ledger|check|checks|rules?|valid)\b/) || (question && !passWord)) {
      return explainChecks(s, r);
    }

    if (has(text, /\b(talk|hello|greet|hail|name|evening|chat|daughter)\b/)) return chat(s, r);

    r.verdict = 'denied';
    var shrug = [
      'Whatever that was, it wasn\u2019t a pass.',
      'I\u2019ve seen cleverer, and I\u2019ve seen stranger. Neither got in.',
      'You can do that all night. The gate won\u2019t mind and nor will I.'
    ];
    say(r, 'vale', high ? 'Pass. Or go.' : shrug[count(s, 'other') % shrug.length]);
  }

  function watch(s, r) {
    var w = count(s, 'watch');
    if (w === 1) {
      s.knows.seal = true;
      s.knows.checks = true;
      say(r, 'narr', 'You stand off and watch. A wool merchant comes up with a cart. Vale takes her pass, tilts it to the lantern, murmurs a word you cannot catch, and runs a thumb down a ledger chained to the wall.');
      say(r, 'narr', 'As the pass comes back you see the seal clearly: a heron in red wax, [[c:its left wing split by a crack]]. The cart rolls through.');
    } else {
      say(r, 'narr', 'A carter, then a priest. Each time: the seal to the light, a word under his breath, the thumb down the ledger. He never skips one.');
    }
  }

  function waitHere(s, r) {
    var ph = phase(s);
    if (s.place === 'gate' && !s.knows.seal) watch(s, r);
    if (ph === 'dusk') {
      say(r, 'narr', 'You find a place out of the way and let the light go.');
      tick(s, r, DUSK_END - s.time);
    } else {
      say(r, 'narr', ph === 'evening' ? 'You wait. The sky goes from blue to black.' : 'You wait. The night gets older.');
      tick(s, r, ph === 'evening' ? Math.min(4, EVENING_END - s.time) : 4);
    }
  }

  function plead(s, r) {
    var n = count(s, 'plead');
    r.verdict = 'denied';
    if (tierIndex(s) === 2) return suspect(s, r, 1);
    if (n === 1) {
      say(r, 'vale', 'Then whoever sent you will have given you a pass, because everyone who matters knows about me. No pass, and I have to wonder who you really are.');
    } else {
      say(r, 'vale', 'A better story is still a story. I don\u2019t read stories. I read passes.');
      suspect(s, r, 1);
    }
  }

  function explainChecks(s, r) {
    var t = tierIndex(s);
    if (t === 2) { say(r, 'vale', 'I\u2019m done explaining. Pass, or go.'); return; }
    s.knows.checks = true;
    if (t === 1) {
      say(r, 'vale', 'Seal, countersign, ledger. You\u2019ve had all the conversation you\u2019re getting.');
      return;
    }
    s.knows.bell = true;
    say(r, 'vale', 'No secret to it. [[c:The steward\u2019s seal in red wax. This week\u2019s countersign under it. And your name in my ledger]], which comes up from his office at the evening bell. All three, or you stay out.');
    say(r, 'vale', 'I tell everyone that. Knowing it has never yet got anyone in. The steward\u2019s office is by the fish market, if you want one made honestly. He shuts at the bell.');
  }

  function chat(s, r) {
    var t = tierIndex(s);
    if (t === 2) { say(r, 'vale', 'No.'); return; }
    if (t === 1) { say(r, 'vale', 'We\u2019re past pleasantries, you and I.'); return; }
    var lines = [
      'Sergeant Vale. Nineteen years on this arch. I\u2019m told I\u2019m poor company. Pass?',
      'A word for nothing, since you\u2019re civil: [[c:after dark I look at everything twice]], paper and bearer both. Come by daylight if your pass is thin.',
      'My daughter says I\u2019d ask the king for his pass. I would. He has one. It\u2019s a very nice one.'
    ];
    var n = count(s, 'chat');
    if (n === 2) s.knows.question = true;
    say(r, 'vale', lines[(n - 1) % lines.length]);
  }

  // ---------- the lower town ----------

  function town(s, text, r) {
    var dest = destination(text, false);
    if (dest && dest !== 'town') return arrive(s, r, dest);
    say(r, 'narr', 'You are in the lower town. You could visit the steward\u2019s office, the tavern, or the scrivener, or go back up to the gate.');
  }

  function steward(s, text, r) {
    var ph = phase(s);
    if (has(text, /\b(bribe|ledger|book|slip|quietly|name)\b/) || (/\bclerk\b/.test(text) && /\b(offer|give|pay|resin|coins?)\b/.test(text))) {
      if (s.entry) {
        say(r, 'clerk', 'It\u2019s done. Don\u2019t stand near my desk.');
      } else if (s.resin) {
        s.resin = false;
        s.entry = 'pending';
        fx(r, 'good');
        say(r, 'narr', 'You set [[i:the vial]] where only the clerk can see it and say what you want. He is quiet for a long moment. Then the vial is gone, and his pen adds one line.');
        say(r, 'clerk', ph === 'dusk'
          ? 'Your name goes up the hill with the rest [[c:at the evening bell]], and not a minute before. I never saw you. A name in the book isn\u2019t a pass, mind. That\u2019s your problem.'
          : 'Tonight\u2019s book has gone. This goes up as a late slip with the night runner: [[c:it reaches Vale at full dark]], and not before. Show your face early and you hang us both.');
      } else if (/\b(coins?|pay|money)\b/.test(text)) {
        fx(r, 'bad');
        say(r, 'clerk', 'Coin? I\u2019ve a pension to lose. Come back with something worth losing it for.');
      } else {
        say(r, 'clerk', 'The ledger is the steward\u2019s. I only hold the pen.');
      }
      return;
    }
    if (has(text, /\b(pass|steward|audience|resin|trade|offer|request|business|petition|sell|goods|show|ask)\b/)) {
      if (s.pass && s.pass.kind === 'real') {
        say(r, 'clerk', 'You have your pass. The gate is up the hill.');
      } else if (ph !== 'dusk') {
        say(r, 'clerk', 'The steward is at supper and sees no one after the bell. Passes are a daylight matter.');
      } else if (s.resin) {
        s.resin = false;
        s.pass = { kind: 'real', paper: 'laid', seal: 'cracked', word: true, business: 'resin' };
        s.entry = 'pending';
        s.knows.checks = true;
        s.knows.bell = true;
        fx(r, 'good');
        say(r, 'narr', 'The word \u201cresin\u201d gets you through the inner door. The steward holds [[i:the vial]] to the window, weighs it, and names a tariff that happens to be the whole vial.');
        say(r, 'steward', 'The castle apothecary has wanted this since midsummer. You have business within the walls. Clerk \u2014 a trade pass: resin, for the apothecary. Enter the name.');
        say(r, 'narr', 'Red wax, a heron with a cracked left wing, a word written under it. Your name goes into the ledger that [[c:climbs the hill at the evening bell]].');
      } else {
        say(r, 'clerk', 'The steward sees people with business. You\u2019ve described a wish, not a business. Good day.');
      }
      return;
    }
    var dest = destination(text, false);
    if (dest && dest !== 'steward') return arrive(s, r, dest);
    say(r, 'clerk', 'State your business, or make room for someone who has some.');
  }

  function tavern(s, text, r) {
    if (has(text, /\b(peddler|sell|trade|pack|pot|smoke)\b/)) {
      if (s.smoke > 0 && has(text, /\b(sell|pot|smoke|yes|deal)\b/)) {
        s.smoke = 0;
        s.coins += 2;
        fx(r, 'good');
        say(r, 'narr', 'The peddler turns [[i:the smoke pot]] over, sniffs the fuse, and counts [[i:two coins]] onto the table.');
        say(r, 'peddler', 'Beekeepers pay well for these. A pleasure.');
      } else if (s.smoke > 0) {
        say(r, 'peddler', 'I buy more than I sell. That pot on your belt: two coins for it, and I don\u2019t ask what it was for.');
      } else {
        say(r, 'peddler', 'You\u2019ve nothing left I want, friend.');
      }
      return;
    }
    if (has(text, /\b(buy|drinks?|ale|round|pay)\b/)) {
      if (s.knows.word) {
        say(r, 'narr', 'The guards would take the ale, but you already have what they had to give: \u201c' + WORD + '\u201d.');
      } else if (s.coins < 1) {
        say(r, 'narr', 'You have no coin for a round. You could still sit and listen, if you have the time.');
      } else {
        s.coins -= 1;
        learnWord(s, r, 'A coin buys a round, and a round buys you a seat at the edge of the complaining.');
      }
      return;
    }
    if (has(text, /\b(listen|eavesdrop|rumou?rs?|overhear|sit|guards?|countersign|word|talk|ask|join)\b/)) {
      var n = count(s, 'listen');
      tick(s, r, 2);
      if (s.over) return;
      if (n === 1) {
        s.knows.watermark = true;
        s.knows.question = true;
        say(r, 'narr', 'You nurse nothing in a corner and listen. It takes a while to get past the weather.');
        say(r, 'tavern', '\u2026when Vale\u2019s got his back up he holds the sheet to the lantern. Steward\u2019s paper has [[c:a heron in the weave]]. Then he asks your business, and God help you if it isn\u2019t [[c:what the pass says]].');
      } else if (!s.knows.word) {
        learnWord(s, r, 'You sit through another long stretch of grievances.');
      } else {
        say(r, 'narr', 'Dice, wages, a sergeant nobody likes. Nothing new.');
      }
      return;
    }
    var dest = destination(text, false);
    if (dest && dest !== 'tavern') return arrive(s, r, dest);
    say(r, 'narr', 'The guards drink and grumble. A round would loosen them quickly; listening is free but slow. The peddler watches your belt.');
  }

  function learnWord(s, r, lead) {
    s.knows.word = true;
    s.knows.wordNeeded = true;
    say(r, 'narr', lead);
    say(r, 'tavern', '\u2026and old Vale sent the miller\u2019s boy back down the hill because the lad wrote \u201cAshfell\u201d. \u201c' + WORD + ',\u201d he says, \u201cwith an A, or it\u2019s no word at all.\u201d Over one letter!');
    say(r, 'narr', 'This week\u2019s countersign is [[c:\u201c' + WORD + '\u201d]].');
  }

  function scrivener(s, text, r) {
    var addLine = has(text, /\b(add|countersign|word|line|amend|fix)\b/);
    if (has(text, /\b(forge|forgery|pass|make|copy|commission|buy|pay|draw|write|new|sheet|coin|paper|laid|rag|add|countersign|word|line|amend|fix)\b/)) {
      if (s.pass && s.pass.kind === 'real') {
        say(r, 'scrivener', 'You\u2019re holding the real thing. Go and use it before I\u2019m tempted to copy it.');
        return;
      }
      if (addLine && s.pass && !has(text, /\b(new|sheet|laid|rag|commission)\b/)) {
        if (!s.knows.word) { say(r, 'scrivener', 'Add what? You don\u2019t know the word. The guards drink at the Heron; start there.'); return; }
        if (s.pass.word) { say(r, 'scrivener', 'It\u2019s already on there.'); return; }
        if (s.coins < 1) { say(r, 'scrivener', 'A coin a line, and you\u2019ve no coin.'); return; }
        s.coins -= 1;
        s.pass.word = true;
        say(r, 'narr', 'He takes your sheet, matches the hand in four strokes, and writes [[c:\u201c' + WORD + '\u201d]] where the blank was.');
        say(r, 'scrivener', 'The seal\u2019s your affair. I don\u2019t do wax.');
        return;
      }
      var laid = has(text, /\b(laid|fine|best|steward|stock|watermark|good|two)\b/);
      var cost = laid ? 2 : 1;
      if (s.coins < cost) {
        say(r, 'scrivener', laid ? 'Laid paper is two coins, and you\u2019re short.' : 'A coin a sheet, and you\u2019ve no coin.');
        return;
      }
      s.coins -= cost;
      s.pass = { kind: 'forged', paper: laid ? 'laid' : 'rag', seal: 'none', word: s.knows.word, business: 'wool' };
      say(r, 'narr', 'You tell him everything you know about a true pass. He works without looking up.');
      say(r, 'scrivener',
        (laid ? 'Laid paper, heron in the weave, lifted from the office itself.' : 'Market rag. It\u2019ll pass a glance, not a lantern.') + ' ' +
        (s.knows.word ? '\u201c' + WORD + '\u201d where the word goes.' : 'A blank where the word goes; I don\u2019t know it and nor do you.') + ' ' +
        'Business: wool, for the castle weavers. Learn it. [[c:It wants a seal]], and I don\u2019t do wax, and no paper of mine writes you into anyone\u2019s ledger.');
      return;
    }
    var dest = destination(text, false);
    if (dest && dest !== 'scrivener') return arrive(s, r, dest);
    say(r, 'scrivener', 'A coin for rag, two for laid, a coin to add a line. Tell me what the real one looks like.');
  }

  // ---------- items: inspect and combine ----------

  var SEALS = {
    none: 'None. Bare paper where the wax should be.',
    blob: 'A thumb of red wax with no device pressed into it.',
    intact: 'Red wax, a heron with both wings whole.',
    cracked: 'Red wax, a heron with a cracked left wing.'
  };

  function itemId(text) {
    if (/\b(pass|forgery|paper|sheet|writ)\b/.test(text)) return 'pass';
    if (/\b(coins?|penn(y|ies)|money|purse)\b/.test(text)) return 'coins';
    if (/\b(resin|vial|dragon)\b/.test(text)) return 'resin';
    if (/\b(smoke|pot)\b/.test(text)) return 'smoke';
    return null;
  }

  function items(s) {
    var list = [];
    if (s.pass) list.push({ id: 'pass', name: passName(s.pass) });
    if (s.smoke > 0) list.push({ id: 'smoke', name: 'Smoke pot' });
    if (s.resin) list.push({ id: 'resin', name: s.resinTapped ? 'Dragon\u2019s-blood resin, a little used' : 'Dragon\u2019s-blood resin' });
    if (s.coins > 0) list.push({ id: 'coins', name: s.coins === 1 ? '1 coin' : s.coins + ' coins' });
    return list;
  }

  function passName(p) {
    return p.kind === 'real' ? 'Steward\u2019s trade pass' : 'Forged pass';
  }

  // Looking closely is free, and can teach you things.
  function inspect(s, id) {
    var p = s.pass, atGate = s.place === 'gate' && !s.over;
    if (id === 'pass' && p) {
      var real = p.kind === 'real';
      s.knows.business = true;
      return {
        id: 'pass', name: passName(p), pass: p,
        lines: [real
          ? 'The steward\u2019s own work, still smelling of wax. Everything Vale looks for is here; all it needs is the ledger to agree with it.'
          : 'It looked better in the alley where you bought it. Held close, it tells you exactly how far it will get.'],
        facts: [
          ['Paper', p.paper === 'laid' ? 'Laid paper. Against the light: chain-lines and a heron in the weave.' : 'Market rag, soft and greyish. Nothing in the weave.'],
          ['Seal', SEALS[p.seal]],
          ['Countersign', p.word ? '\u201c' + WORD + '\u201d, written under the seal.' : 'A blank line under the seal.'],
          ['Business', p.business === 'resin' ? 'Dragon\u2019s-blood resin, for the castle apothecary.' : 'Wool, for the castle weavers.']
        ],
        actions: [].concat(
          !real && s.resin ? [{ label: 'Seal it with the resin', command: 'apply the resin to the pass' }] : [],
          atGate ? [{ label: 'Show it to Vale', command: 'show my pass' }] : [])
      };
    }
    if (id === 'coins' && s.coins > 0) {
      s.knows.coinHeron = true;
      return {
        id: 'coins', name: s.coins === 1 ? 'One Harrowmere penny' : s.coins + ' Harrowmere pennies',
        lines: ['Thin silver, clipped at the edges. Each is struck with the steward\u2019s heron, wings spread and whole.',
                'It is the same bird as on his seal, and [[c:small enough to press into soft wax]].'],
        facts: [['Worth', 'A round of ale, a sheet of rag paper, or a line of a scrivener\u2019s time.']],
        actions: []
      };
    }
    if (id === 'resin' && s.resin) {
      return {
        id: 'resin', name: 'Dragon\u2019s-blood resin',
        lines: ['A stoppered vial of deep red resin, worth a year of a sergeant\u2019s wages. Apothecaries want it badly.',
                'It softens in a warm hand and [[c:sets hard and glossy, like sealing wax]].' + (s.resinTapped ? ' A few drops are missing. Nobody weighing it would notice.' : '')],
        facts: [['Worth', 'More than anything else you own. Vale will not touch it.']],
        actions: [].concat(
          p && p.kind !== 'real' ? [{ label: 'Seal the pass with it', command: 'apply the resin to the pass' }] : [],
          atGate ? [{ label: 'Offer it to Vale', command: 'offer the resin' }] : [])
      };
    }
    if (id === 'smoke' && s.smoke > 0) {
      return {
        id: 'smoke', name: 'Smoke pot',
        lines: ['A clay pot packed with pitch and damp straw, with a fuse. Beekeepers use them. So do people who want not to be seen for a moment.'],
        facts: [['Worth', 'Two coins to the right peddler.']],
        actions: [].concat(
          atGate ? [{ label: 'Throw it into the gateway', command: 'throw the smoke pot' }] : [],
          s.place === 'tavern' ? [{ label: 'Sell it to the peddler', command: 'sell the smoke pot' }] : [])
      };
    }
    return null;
  }

  function combine(s, r) {
    var p = s.pass;
    if (!s.resin) { say(r, 'narr', 'You have no resin left to seal anything with.'); return; }
    if (!p) { say(r, 'narr', 'You have no pass to put a seal on.'); return; }
    if (p.kind === 'real') { say(r, 'narr', 'You are not going to improve on the steward\u2019s own wax.'); return; }
    s.resinTapped = true;
    if (s.coins < 1) {
      p.seal = 'blob';
      say(r, 'narr', 'You warm [[i:the resin]] in your fist and thumb a few drops onto the sheet. It sets red and glossy, and blank: you have nothing to press a device into it with.');
    } else {
      p.seal = s.knows.seal ? 'cracked' : 'intact';
      say(r, 'narr', 'You warm [[i:the resin]] in your fist, let a few drops fall where a seal belongs, and press [[i:a coin]] into it, heron side down. It lifts away clean: a red heron, bright as the real thing.');
      say(r, 'narr', s.knows.seal
        ? 'Before it sets, you draw a knife-point across the left wing. [[c:The seal now shows a heron with a cracked wing.]]'
        : 'Both wings whole, exactly as on the coin. You know of no reason it should be otherwise.');
    }
    if (s.place === 'gate') {
      fx(r, 'bad');
      say(r, 'vale', 'I can see you. Sealing your own pass, at my gate, in my lantern light.');
      suspect(s, r, 2);
    }
  }

  // ---------- entry point ----------

  function act(s, input) {
    var r = out();
    var text = String(input || '').toLowerCase().trim();
    if (s.over) { say(r, 'sys', 'The night is over. Start again to try another way.'); return r; }
    if (!text) return r;

    if (/^(help|hint|hints|\?)$/.test(text)) {
      say(r, 'sys', 'Try anything: show your pass, throw the smoke pot, offer the resin, shout that the castle is on fire, ask Vale what makes a pass valid, watch the gate, wait for the bell, inspect an item, apply the resin to the pass, or go down to the town (steward, tavern, scrivener).');
      return r;
    }
    if (/^(i|inv|inventory|items)$/.test(text)) {
      say(r, 'sys', 'You carry: ' + items(s).map(function (i) { return '[[i:' + i.name.toLowerCase() + ']]'; }).join(', ') + '.');
      return r;
    }
    var look = /^(inspect|examine|look at|study|read|check)\b/.test(text) ? itemId(text) : null;
    if (look) {
      var info = inspect(s, look);
      if (info) {
        info.lines.forEach(function (l) { say(r, 'narr', l); });
        info.facts.forEach(function (f) { say(r, 'sys', f[0] + ': ' + f[1]); });
      } else say(r, 'narr', 'You are not carrying that.');
      return r;
    }

    s.turns += 1;
    tick(s, r, 1);
    if (s.over) return r;

    if (s.place === 'gate' && s.pending) { answer(s, text, r); return r; }

    if (/\b(apply|use|combine|press|drip|melt|seal|stamp|put)\b/.test(text) && /\b(resin|wax)\b/.test(text) && /\b(pass|paper|sheet|forgery|seal|it)\b/.test(text)) {
      combine(s, r);
      return r;
    }
    if (s.place !== 'gate' && /\b(wait|rest|pass the time)\b/.test(text)) { waitHere(s, r); return r; }

    if (s.place === 'gate') gate(s, text, r);
    else if (s.place === 'town') town(s, text, r);
    else if (s.place === 'steward') steward(s, text, r);
    else if (s.place === 'tavern') tavern(s, text, r);
    else if (s.place === 'scrivener') scrivener(s, text, r);
    return r;
  }

  // ---------- views for the page ----------

  function knowledge(s) {
    var k = [], n = s.knows;
    if (n.checks) k.push('A valid pass needs the seal, the countersign, and a ledger entry.');
    if (n.seal) k.push('The steward\u2019s heron seal has a cracked left wing.');
    if (n.coinHeron) k.push('Your coins carry the same heron, small enough to press into wax.');
    if (n.word) k.push('This week\u2019s countersign is \u201c' + WORD + '\u201d.');
    else if (n.wordNeeded) k.push('A word goes under the seal. You don\u2019t know it yet.');
    if (s.entry === 'arrived') k.push('Your name is in Vale\u2019s ledger.');
    else if (s.entry === 'pending') k.push('Your name is written down, but has not reached the gate yet.');
    else if (n.ledger) k.push('Vale checks every name against his ledger.');
    if (n.bell && s.entry !== 'arrived') k.push('The day\u2019s ledger reaches the gate at the evening bell.');
    if (n.watermark) k.push('When wary, Vale checks the paper for a heron watermark.');
    if (n.question) k.push('When wary, Vale asks your business. It must match the pass.');
    return k;
  }

  var PLACE_NAMES = {
    gate: 'The castle gate', town: 'The lower town', steward: 'The steward\u2019s office',
    tavern: 'The Drowned Heron', scrivener: 'The scrivener\u2019s stall'
  };
  var PHASE_NAMES = { dusk: 'Dusk', evening: 'Evening bell', night: 'Night' };
  var MOODS = {
    low: 'At ease. He will talk, and even advise.',
    medium: 'Wary. He checks twice and asks questions.',
    high: 'Weapon drawn. One more trick shuts the gate.'
  };

  function suggestions(s) {
    if (s.over) return [];
    var ph = phase(s), wait = ph === 'dusk' ? ['Wait for the bell'] : ['Wait a while'];
    switch (s.place) {
      case 'gate':
        if (s.pending) return ['Wool, for the castle weavers', 'Resin, for the castle apothecary', 'I am only visiting'];
        if (tierIndex(s) === 2) return ['Show my pass', 'Go to the town'];
        return ['Show my pass', 'Ask what makes a pass valid', 'Watch the gate', 'Talk to Vale', 'Offer the resin',
          'Throw the smoke pot', 'Shout that the castle is on fire'].concat(wait, ['Go to the town']);
      case 'town': return ['Visit the steward\u2019s office', 'Go to the tavern', 'Find the scrivener', 'Return to the gate'];
      case 'steward': return (ph === 'dusk' ? ['Offer the resin to the steward for a pass'] : [])
        .concat(['Bribe the clerk to add my name to the ledger', 'Go to the tavern', 'Find the scrivener', 'Return to the gate']);
      case 'tavern': return ['Buy the guards a round', 'Listen to the rumours', 'Sell the smoke pot to the peddler', 'Find the scrivener', 'Return to the gate'];
      case 'scrivener': return ['Commission a pass on rag paper', 'Commission a pass on laid paper', 'Add the countersign to my pass',
        'Apply the resin to the pass', 'Go to the tavern', 'Return to the gate'];
    }
    return [];
  }

  function view(s) {
    var won = s.over === 'won-legit' || s.over === 'won-forged';
    var shut = s.over === 'arrested' || s.over === 'lockdown' || s.over === 'barred' || s.sealedTurns > 0;
    return {
      place: s.place, placeName: PLACE_NAMES[s.place],
      phase: phase(s), phaseName: PHASE_NAMES[phase(s)],
      hour: Math.min(1, s.time / NIGHT_END),
      gate: won ? 'passed' : shut ? 'shut' : 'open',
      smoke: s.sealedTurns > 0,
      suspicion: s.suspicion, tier: tier(s), mood: MOODS[tier(s)],
      wary: wariness(s) >= 1,
      over: s.over
    };
  }

  return {
    MAX_SUSPICION: MAX_SUSPICION, DUSK_END: DUSK_END, EVENING_END: EVENING_END, NIGHT_END: NIGHT_END,
    createState: createState, intro: intro, act: act,
    items: items, inspect: inspect, knowledge: knowledge, suggestions: suggestions, view: view,
    phase: phase, tier: tier, plain: plain
  };
});
