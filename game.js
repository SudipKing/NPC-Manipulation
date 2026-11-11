/*
 * The Gate at Harrowmere — game engine.
 *
 * Pure logic, no DOM. Works in the browser (window.Gate) and in Node (require).
 *
 * The design rule: Sergeant Vale asks one question of every situation —
 * "is there a valid pass in front of me?" Player actions can change his
 * suspicion, the gate, and the world, but never the answer to that question.
 * The only ways through are a pass that survives all three of his checks.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ARREST_AT = 4;
  var COUNTERSIGN = 'Ashfall';

  function createState() {
    return {
      place: 'gate', // gate | town | steward | tavern | scrivener
      suspicion: 0,
      sealedTurns: 0, // portcullis is down while > 0
      coins: 3,
      resin: true,
      smoke: 1,
      pass: { kind: 'forged', seal: false, countersign: false },
      ledger: false, // is the player's name in the gate ledger?
      knows: { checks: false, seal: false, countersignNeeded: false, countersign: false, ledger: false },
      tried: {},
      turns: 0,
      over: null // null | 'won-legit' | 'won-forged' | 'arrested'
    };
  }

  function intro() {
    return [
      { who: 'narr', text: 'Dusk at Castle Harrowmere. The gate stands open, and in it stands Sergeant Brannoch Vale, who has let no one through without a pass in nineteen years.' },
      { who: 'narr', text: 'You carry a pass a man in the lower town swore was good, a smoke pot, a vial of dragon’s-blood resin, and three coins. You need to be inside the walls.' },
      { who: 'vale', text: 'Pass.' },
      { who: 'sys', text: 'Type anything you want to try. Vale will judge it.' }
    ];
  }

  // ---------- helpers ----------

  function has(text, re) { return re.test(text); }
  function count(s, key) { s.tried[key] = (s.tried[key] || 0) + 1; return s.tried[key]; }

  function out() { return { lines: [], verdict: null }; }
  function say(r, who, text) { r.lines.push({ who: who, text: text }); return r; }

  function suspect(s, r, n) {
    s.suspicion = Math.min(ARREST_AT, s.suspicion + n);
    if (s.suspicion >= ARREST_AT) arrest(s, r);
  }

  function arrest(s, r) {
    s.over = 'arrested';
    r.verdict = 'arrested';
    say(r, 'narr', 'Vale puts the horn to his lips. Boots answer from the guardhouse before the note has died, and a hand closes on your collar.');
    say(r, 'vale', 'That’s enough of you for one evening. The captain can have the rest.');
    say(r, 'sys', 'Arrested. The gate never opened. Start again to try another way.');
  }

  var PLACES = {
    gate: /\b(gate|castle|vale|guard|sergeant|hill)\b/,
    steward: /\b(steward|office|clerk)\b/,
    tavern: /\b(tavern|inn|alehouse)\b/,
    scrivener: /\b(scrivener|forger|alley)\b/,
    town: /\b(town|market|street|outside)\b/
  };
  var GO = /\b(go|walk|head|visit|leave|return|travel|find|see|back|enter)\b/;

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
    if (from === 'gate' && place !== 'gate') {
      s.sealedTurns = 0;
      if (s.suspicion > 0) {
        s.suspicion -= 1;
        say(r, 'narr', 'You walk down the hill. Behind you Vale’s attention drifts back to the road; out of sight, you are a little less on his mind.');
      } else {
        say(r, 'narr', 'You walk down the hill to the lower town.');
      }
    }
    if (place === 'town') {
      say(r, 'narr', 'The lower town. The steward’s office stands by the fish market, the Drowned Heron tavern is filling with off-duty guards, and a scrivener keeps a stall in the alley behind it. The gate is back up the hill.');
    } else if (place === 'steward') {
      say(r, 'narr', 'The steward’s office. A clerk copies names into the gate ledger that goes up the hill each evening. Through the inner door the steward is weighing something on brass scales.');
      say(r, 'clerk', 'Passes are issued to those with business the steward cares to hear. State yours.');
    } else if (place === 'tavern') {
      say(r, 'narr', 'The Drowned Heron. Three guards off the day watch sit with empty cups, complaining about the week’s duties.');
    } else if (place === 'scrivener') {
      say(r, 'narr', 'A stall the width of a door. The scrivener has ink to the elbows and does not ask what you want a pass for.');
      say(r, 'scrivener', 'A coin a sheet. I draw what you can describe. I can’t draw what you haven’t seen.');
    } else if (place === 'gate') {
      say(r, 'narr', 'The gate again. Vale has not moved.');
      say(r, 'vale', s.suspicion >= 2 ? 'You. Pass, or keep walking.' : 'Pass.');
    }
  }

  // ---------- the gate ----------

  function presentPass(s, r) {
    var p = s.pass;
    if (!p) {
      say(r, 'narr', 'You pat your coat. You have no pass to show.');
      say(r, 'vale', 'Then we’ve nothing to discuss.');
      r.verdict = 'denied';
      return;
    }
    say(r, 'narr', 'You hand the pass over. Vale tilts it to the lantern and takes his time.');
    s.knows.checks = true;

    if (p.kind === 'real') {
      say(r, 'vale', s.suspicion >= 2
        ? 'Heron’s wing is cracked. Countersign’s right. And here you are in the ledger, in the steward’s own hand.' + ' I don’t like you. That isn’t one of the things I check.'
        : 'Heron’s wing is cracked. Countersign’s right. Name’s in the ledger. Go on, then.');
      win(s, r, 'won-legit');
      return;
    }

    if (!p.seal) {
      s.knows.seal = true;
      say(r, 'vale', 'Good paper. Good hand, too. But the steward’s heron has a cracked left wing, has had since the die was dropped in spring. This bird is in fine health.');
      return confiscate(s, r);
    }
    if (!p.countersign) {
      s.knows.countersignNeeded = true;
      say(r, 'vale', 'Wing’s cracked. Someone’s been paying attention. But there’s a word that goes under the seal, changed every week, and this has a blank where the word should be.');
      return confiscate(s, r);
    }
    if (!s.ledger) {
      s.knows.ledger = true;
      say(r, 'narr', 'He runs a thumb down the gate ledger, slowly, twice.');
      say(r, 'vale', 'Seal’s right. Word’s right. And the steward wrote out a pass for a name he never entered in my book. He doesn’t forget. So he didn’t write this.');
      return confiscate(s, r);
    }
    say(r, 'narr', 'He runs a thumb down the gate ledger and stops on your name.');
    say(r, 'vale', 'Wing’s cracked. Word’s right. Name’s in the book. That’s a pass.');
    win(s, r, 'won-forged');
  }

  function confiscate(s, r) {
    s.pass = null;
    r.verdict = 'denied';
    say(r, 'narr', 'He folds the pass into his belt.');
    suspect(s, r, 2);
    if (!s.over) say(r, 'vale', 'I’m keeping this. Bring me another like it and you’ll meet the watch-captain.');
  }

  function win(s, r, how) {
    s.over = how;
    r.verdict = 'passed';
    say(r, 'narr', 'Vale steps aside. It is the first time you have seen him move his feet.');
    if (how === 'won-legit') {
      say(r, 'sys', 'You are through the gate, with a real pass, honestly got. Vale never bent. You met his rule instead of fighting it.');
    } else {
      say(r, 'sys', 'You are through the gate on a forgery good enough to be a pass. Vale never bent. His order was about passes, and you beat the checking, not the man.');
    }
  }

  function gate(s, text, r) {
    var question = /\?|\b(what|how|where|why|which|who|tell me|explain|ask)\b/.test(text);
    var passWord = /\b(pass|papers|forgery|writ|document)\b/.test(text);
    var sealed = s.sealedTurns > 0;

    // Leaving always works.
    var dest = destination(text, true);
    if (dest && dest !== 'gate') return arrive(s, r, dest);

    if (has(text, /\b(attack|stab|kill|fight|punch|hit|sword|knife|dagger|strike|shove|tackle|threaten)\b/)) {
      say(r, 'narr', 'You go for him. He has been waiting nineteen years for someone to be that stupid, and he is faster than he looks.');
      s.suspicion = ARREST_AT;
      return arrest(s, r);
    }

    if (has(text, /\b(smoke|distract|distraction|diversion|fog)\b/)) {
      if (s.smoke < 1) {
        say(r, 'narr', 'Your smoke pot is spent. You have nothing left to throw.');
        return;
      }
      s.smoke -= 1;
      s.sealedTurns = 3;
      r.verdict = 'denied';
      say(r, 'narr', 'The pot bursts in the gateway and the arch fills with grey. You start forward — and iron screams. One kick to the windlass pin, and the portcullis comes down a hand’s width from your boots.');
      say(r, 'vale', 'Gate’s shut. Gate stays shut until I can see every pair of hands on this road. Whoever threw that, I’d start walking.');
      say(r, 'sys', 'He cannot check passes he cannot see, so nobody passes. The gate is sealed for a while.');
      return suspect(s, r, 1);
    }

    if (sealed) {
      s.sealedTurns -= 1;
      if (has(text, /\b(wait|watch|observe|linger|stand)\b/)) {
        if (s.sealedTurns === 0) {
          say(r, 'narr', 'The smoke thins. Chains rattle and the portcullis climbs back into the arch.');
          say(r, 'vale', 'Right. One at a time. Pass.');
        } else {
          say(r, 'narr', 'You wait. Smoke still hangs in the arch, and Vale is a shape behind the bars, counting hands.');
        }
        return;
      }
      r.verdict = 'denied';
      say(r, 'vale', 'Gate’s shut. Nothing you say to me through these bars opens it.');
      if (s.sealedTurns === 0) say(r, 'narr', 'A while later the smoke thins and the portcullis climbs back into the arch.');
      return;
    }

    if (has(text, /\blet (me|us) (pass|through|in|by)\b/)) return plead(s, r);

    if (passWord && question) return explainChecks(s, r);

    if (has(text, /\b(fire|burning|ablaze|flames?|burns?|alight)\b/)) {
      var n = count(s, 'fire');
      r.verdict = 'denied';
      if (n === 1) {
        say(r, 'narr', 'Vale glances up at a clear sky over the keep, then back at you.');
        say(r, 'vale', 'Odd fire. No smoke, no bell, and the only one who’s noticed is a stranger on the wrong side of the wall.');
        say(r, 'narr', 'He hauls the bell-rope twice anyway.');
        say(r, 'vale', 'There. If it burns, the garrison’s roused and they have buckets. If it doesn’t, the captain will want to know why you said it did. Either way, you’re not going in. Fire is a reason to come out.');
      } else {
        say(r, 'vale', 'It wasn’t burning the last time you said so either.');
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
      if (b === 1) {
        say(r, 'narr', s.resin
          ? 'You unwrap the resin. He looks at it long enough to show he knows exactly what it is.'
          : 'You show him what you have. He does not look at it for long.');
        say(r, 'vale', 'That’d buy my daughter a dowry and me a rope. Put it away.');
        say(r, 'vale', 'If you’ve goods like that, you’ve business the steward would hear. Office by the fish market. He issues passes. I only read them.');
      } else {
        say(r, 'vale', 'I told you the price. It’s a pass. It hasn’t gone up and it hasn’t come down.');
      }
      return suspect(s, r, 1);
    }

    if (has(text, /\b(sneak|slip|climb|run|dash|rush|creep|wall|scale|dodge|squeeze|crawl|jump|hide)\b/)) {
      r.verdict = 'denied';
      say(r, 'narr', 'You move. So does the butt of his halberd, which arrives across the gateway at the height of your chest and stays there.');
      say(r, 'vale', 'The arch is nine feet wide and I’ve stood in it since before you could walk. Try the pass instead.');
      return suspect(s, r, 1);
    }

    if (has(text, /\b(king|queen|lord|lady|noble|messenger|captain|orders?|command|urgent|duke|inspector|friend|cousin|sick|dying|healer|please|beg|important|know who)\b/)) {
      return plead(s, r);
    }

    if (has(text, /\b(wait|watch|observe|look|study|linger|stand)\b/)) {
      var w = count(s, 'watch');
      if (w === 1) {
        s.knows.seal = true;
        s.knows.checks = true;
        say(r, 'narr', 'You stand off and watch. A wool merchant comes up with a cart. Vale takes her pass, tilts it to the lantern, murmurs a word you cannot catch, and runs a thumb down a ledger chained to the wall.');
        say(r, 'narr', 'As the pass comes back you see the seal clearly: a heron in red wax, its left wing split by a crack. The cart rolls through.');
      } else {
        say(r, 'narr', 'A carter, then a priest. Each time: the seal to the light, a word under his breath, the thumb down the ledger. He never skips one.');
      }
      return;
    }

    if (has(text, /\b(seal|countersign|ledger|check|checks|rules?|valid)\b/) || (question && !passWord)) {
      return explainChecks(s, r);
    }

    if (has(text, /\b(talk|hello|greet|hail|name|evening|chat)\b/)) {
      say(r, 'vale', 'Sergeant Vale. Nineteen years on this arch. I’m told I’m poor company. Pass?');
      return;
    }

    r.verdict = 'denied';
    var shrug = [
      'Whatever that was, it wasn’t a pass.',
      'I’ve seen cleverer, and I’ve seen stranger. Neither got in.',
      'You can do that all night. The gate won’t mind and nor will I.'
    ];
    say(r, 'vale', shrug[count(s, 'other') % shrug.length]);
  }

  function plead(s, r) {
    var n = count(s, 'plead');
    r.verdict = 'denied';
    if (n === 1) {
      say(r, 'vale', 'Then whoever sent you will have given you a pass, because everyone who matters knows about me. No pass, and I have to wonder who you really are.');
    } else {
      say(r, 'vale', 'A better story is still a story. I don’t read stories. I read passes.');
      suspect(s, r, 1);
    }
  }

  function explainChecks(s, r) {
    s.knows.checks = true;
    say(r, 'vale', 'No secret to it. The steward’s seal in red wax. This week’s countersign under it. And your name in my ledger, which comes up from his office every evening. All three, or you stay out.');
    say(r, 'vale', 'I tell everyone that. Knowing it has never yet got anyone in. The steward’s office is by the fish market, if you want one made honestly.');
  }

  // ---------- the lower town ----------

  function town(s, text, r) {
    var dest = destination(text, false);
    if (dest && dest !== 'town') return arrive(s, r, dest);
    say(r, 'narr', 'You are in the lower town. You could visit the steward’s office, the tavern, or the scrivener, or go back up to the gate.');
  }

  function steward(s, text, r) {
    if (has(text, /\b(bribe|ledger|book|slip|quietly|name)\b/) || (/\bclerk\b/.test(text) && /\b(offer|give|pay|resin|coins?)\b/.test(text))) {
      if (s.ledger) {
        say(r, 'clerk', 'It’s done. Don’t stand near my desk.');
      } else if (s.resin) {
        s.resin = false;
        s.ledger = true;
        say(r, 'narr', 'You set the vial where only the clerk can see it and say what you want. He is quiet for a long moment. Then the vial is gone, and his pen adds one line to tonight’s gate ledger.');
        say(r, 'clerk', 'Your name goes up the hill with the rest at the evening bell. I never saw you. A name in the book isn’t a pass, mind. That’s your problem.');
      } else if (/\bcoins?|pay|money\b/.test(text)) {
        say(r, 'clerk', 'Coin? I’ve a pension to lose. Come back with something worth losing it for.');
      } else {
        say(r, 'clerk', 'The ledger is the steward’s. I only hold the pen.');
      }
      return;
    }
    if (has(text, /\b(pass|steward|audience|resin|trade|offer|request|business|petition|sell|goods|show|ask)\b/)) {
      if (s.pass && s.pass.kind === 'real') {
        say(r, 'clerk', 'You have your pass. The gate is up the hill.');
      } else if (s.resin) {
        s.resin = false;
        s.pass = { kind: 'real', seal: true, countersign: true };
        s.ledger = true;
        s.knows.checks = true;
        say(r, 'narr', 'The word “resin” gets you through the inner door. The steward holds the vial to the window, weighs it, and names a tariff that happens to be the whole vial.');
        say(r, 'steward', 'The castle apothecary has wanted this since midsummer. You have business within the walls. Clerk — a trade pass, and enter the name.');
        say(r, 'narr', 'Red wax, a heron with a cracked left wing, a word written under it, and your name in the ledger.');
      } else {
        say(r, 'clerk', 'The steward sees people with business. You’ve described a wish, not a business. Good day.');
      }
      return;
    }
    var dest = destination(text, false);
    if (dest && dest !== 'steward') return arrive(s, r, dest);
    say(r, 'clerk', 'State your business with the steward, or make room for someone who has some.');
  }

  function tavern(s, text, r) {
    if (has(text, /\b(buy|drink|drinks|ale|round|listen|eavesdrop|guards?|countersign|word|talk|ask|sit|join)\b/)) {
      if (s.knows.countersign) {
        say(r, 'narr', 'The guards have moved on to dice. You already have what they had to give: “' + COUNTERSIGN + '”.');
      } else if (s.coins < 1) {
        say(r, 'narr', 'You hover near their table. Nobody talks freely next to a stranger with an empty hand.');
      } else {
        s.coins -= 1;
        s.knows.countersign = true;
        s.knows.countersignNeeded = true;
        say(r, 'narr', 'A coin buys a round, and a round buys you a seat at the edge of the complaining.');
        say(r, 'tavern', '…and old Vale sent the miller’s boy back down the hill because the lad wrote “Ashfell”. “' + COUNTERSIGN + ',” he says, “with an A, or it’s no word at all.” Over one letter!');
        say(r, 'narr', 'This week’s countersign is “' + COUNTERSIGN + '”.');
      }
      return;
    }
    var dest = destination(text, false);
    if (dest && dest !== 'tavern') return arrive(s, r, dest);
    say(r, 'narr', 'The guards drink and grumble. A round might loosen them further.');
  }

  function scrivener(s, text, r) {
    if (has(text, /\b(forge|forgery|pass|make|copy|seal|commission|improve|buy|pay|draw|write|new|sheet|coin)\b/)) {
      if (s.pass && s.pass.kind === 'real') {
        say(r, 'scrivener', 'You’re holding the real thing. Go and use it before I’m tempted to copy it.');
        return;
      }
      var seal = s.knows.seal, word = s.knows.countersign;
      if (s.pass && s.pass.seal === seal && s.pass.countersign === word) {
        say(r, 'scrivener', 'I’d only be selling you the same sheet twice. Come back when you know something new about the real one.');
        return;
      }
      if (s.coins < 1) {
        say(r, 'scrivener', 'A coin a sheet, and you’ve no coin.');
        return;
      }
      s.coins -= 1;
      s.pass = { kind: 'forged', seal: seal, countersign: word };
      say(r, 'narr', 'You tell him everything you know about a true pass. He works without looking up.');
      say(r, 'scrivener',
        (seal ? 'Heron, left wing cracked — there.' : 'A heron, as herons generally look. You haven’t told me otherwise.') + ' ' +
        (word ? '“' + COUNTERSIGN + '” under the seal.' : 'Nothing under the seal; I don’t know any word that goes there.') + ' ' +
        'The paper is the best part. What the paper can’t do is write you into anyone’s ledger.');
      return;
    }
    var dest = destination(text, false);
    if (dest && dest !== 'scrivener') return arrive(s, r, dest);
    say(r, 'scrivener', 'A coin a sheet. Tell me what the real one looks like.');
  }

  // ---------- entry point ----------

  function act(s, input) {
    var r = out();
    var text = String(input || '').toLowerCase().trim();
    if (s.over) { say(r, 'sys', 'The evening is over. Start again to try another way.'); return r; }
    if (!text) return r;
    s.turns += 1;

    if (/^(help|hint|hints|\?)$/.test(text)) {
      say(r, 'sys', 'Try anything: show your pass, throw the smoke pot, offer the resin, shout that the castle is on fire, ask Vale what makes a pass valid, watch the gate, or go down to the town (steward, tavern, scrivener).');
      return r;
    }
    if (/^(i|inv|inventory|items)$/.test(text)) {
      say(r, 'sys', 'You carry: ' + inventory(s).join(', ') + '.');
      return r;
    }

    if (s.place === 'gate') gate(s, text, r);
    else if (s.place === 'town') town(s, text, r);
    else if (s.place === 'steward') steward(s, text, r);
    else if (s.place === 'tavern') tavern(s, text, r);
    else if (s.place === 'scrivener') scrivener(s, text, r);
    return r;
  }

  function inventory(s) {
    var items = [];
    if (s.pass) {
      items.push(s.pass.kind === 'real' ? 'a steward’s trade pass'
        : s.pass.seal && s.pass.countersign ? 'a careful forged pass'
        : s.pass.seal ? 'a forged pass with the right seal'
        : 'a forged pass');
    }
    if (s.smoke > 0) items.push('a smoke pot');
    if (s.resin) items.push('a vial of dragon’s-blood resin');
    items.push(s.coins === 1 ? '1 coin' : s.coins + ' coins');
    return items;
  }

  function knowledge(s) {
    var k = [];
    if (s.knows.checks) k.push('A valid pass needs the seal, the countersign, and a ledger entry.');
    if (s.knows.seal) k.push('The steward’s heron seal has a cracked left wing.');
    if (s.knows.countersign) k.push('This week’s countersign is “' + COUNTERSIGN + '”.');
    else if (s.knows.countersignNeeded) k.push('A word goes under the seal. You don’t know it yet.');
    if (s.ledger) k.push('Your name is in the gate ledger.');
    else if (s.knows.ledger) k.push('Vale checks every name against his ledger.');
    return k;
  }

  var PLACE_NAMES = {
    gate: 'The castle gate', town: 'The lower town', steward: 'The steward’s office',
    tavern: 'The Drowned Heron', scrivener: 'The scrivener’s stall'
  };

  function suggestions(s) {
    if (s.over) return [];
    switch (s.place) {
      case 'gate': return ['Show my pass', 'Throw the smoke pot', 'Offer the resin', 'Shout that the castle is on fire', 'Ask what makes a pass valid', 'Watch the gate', 'Go to the town'];
      case 'town': return ['Visit the steward’s office', 'Go to the tavern', 'Find the scrivener', 'Return to the gate'];
      case 'steward': return ['Offer the resin to the steward for a pass', 'Bribe the clerk to add my name to the ledger', 'Go to the tavern', 'Return to the gate'];
      case 'tavern': return ['Buy the guards a round', 'Find the scrivener', 'Return to the gate'];
      case 'scrivener': return ['Commission a forged pass', 'Go to the tavern', 'Return to the gate'];
    }
    return [];
  }

  return {
    ARREST_AT: ARREST_AT,
    createState: createState,
    intro: intro,
    act: act,
    inventory: inventory,
    knowledge: knowledge,
    suggestions: suggestions,
    placeName: function (s) { return PLACE_NAMES[s.place]; }
  };
});
