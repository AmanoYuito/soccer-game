/* Fixed-step match simulation. All coordinates are metres on a 105 x 68 pitch. */
(function (global) {
  'use strict';

  const DT = 1 / 30;
  const LENGTH = 105;
  const WIDTH = 68;
  const GOAL_HALF_WIDTH = 3.66;
  const FORMATIONS = {
    '4-3-3': [1, 4, 3, 3],
    '4-4-2': [1, 4, 4, 2],
    '3-5-2': [1, 3, 5, 2]
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const direction = side => side === 0 ? 1 : -1;

  function slots(formation) {
    const rows = FORMATIONS[formation] || FORMATIONS['4-3-3'];
    const xRows = [6.5, 26, 52, 79];
    const result = [];
    rows.forEach((size, row) => {
      for (let i = 0; i < size; i++) {
        result.push({ x: xRows[row], y: WIDTH * (i + 1) / (size + 1) });
      }
    });
    return result;
  }

  function makePlayer(source, side, slot, index, formation) {
    const base = slots(formation)[slot];
    const x = side === 0 ? base.x : LENGTH - base.x;
    return {
      uid: `${side}-${index}`,
      sourceId: source.id ?? null,
      side,
      slot,
      name: source.name,
      number: source.number ?? index + 1,
      pos: source.pos,
      x,
      y: base.y,
      vx: 0,
      vy: 0,
      tx: x,
      ty: base.y,
      ovr: source.ovr,
      shoot: source.shoot,
      pass: source.pass,
      defend: source.defend,
      speed: source.speed,
      stamina: source.stamina
    };
  }

  function makeOpponent(strength, random) {
    const roles = ['GK', 'LB', 'CB', 'CB', 'RB', 'DMF', 'CMF', 'AMF', 'LW', 'CF', 'RW'];
    const surnames = ['安藤', '成瀬', '片桐', '古賀', '相沢', '矢野', '神谷', '瀬戸', '宮本', '千葉', '稲葉'];
    return roles.map((pos, i) => {
      const value = clamp(Math.round(strength + (random() - .5) * 18), 38, 88);
      return {
        id: null,
        name: `${surnames[i]} ${['翔', '蓮', '陸', '光', '翼'][Math.floor(random() * 5)]}`,
        number: i + 1,
        pos,
        ovr: value,
        shoot: clamp(value + Math.round((random() - .5) * 25), 20, 95),
        pass: clamp(value + Math.round((random() - .5) * 24), 20, 95),
        defend: clamp(value + Math.round((random() - .5) * 25), 20, 95),
        speed: clamp(value + Math.round((random() - .5) * 22), 25, 95),
        stamina: 92
      };
    });
  }

  function event(match, text, type = 'normal') {
    match.events.push({ minute: Math.min(90, Math.floor(match.minute)), text, goal: type === 'goal', type });
    if (match.events.length > 55) match.events.shift();
  }

  function kickoff(match, side) {
    match.players.forEach(player => {
      const base = match.baseSlots[player.side][player.slot];
      player.x = player.side === 0 ? base.x : LENGTH - base.x;
      player.y = base.y;
      player.vx = 0;
      player.vy = 0;
    });
    const carrier = match.players.find(p => p.side === side && p.slot === 6);
    carrier.x = 52.5;
    carrier.y = 34;
    match.ball = {
      x: 52.5, y: 34, vx: 0, vy: 0,
      carrier: carrier.uid, kind: 'controlled', lastTouch: side,
      shooter: null, kicker: null, ignoreUntil: 0, actionAt: match.seconds + .55
    };
  }

  function create(options) {
    const { home, away, ownPlayers, formation, opponentStrength, random } = options;
    const ownSide = home === 0 ? 0 : 1;
    const opponent = makeOpponent(opponentStrength, random);
    const homeRoster = ownSide === 0 ? ownPlayers : opponent;
    const awayRoster = ownSide === 1 ? ownPlayers : opponent;
    const match = {
      home, away, ownSide, formation,
      seconds: 0, minute: 0, tick: 0,
      hg: 0, ag: 0, shots: [0, 0], possessionSeconds: [0, 0], possession: 50,
      events: [], paused: false, speed: 1, committed: false, finished: false,
      halftime: false, subsUsed: 0, windowsUsed: 0, queuedSubs: [],
      appeared: ownPlayers.map(p => p.id), usedBench: [], subbedOut: [], exitStamina: {}, goalScorers: [],
      baseSlots: [slots(formation), slots('4-3-3')],
      players: []
    };
    if (ownSide === 1) match.baseSlots = [slots('4-3-3'), slots(formation)];
    match.players = [
      ...homeRoster.map((p, i) => makePlayer(p, 0, i, i, ownSide === 0 ? formation : '4-3-3')),
      ...awayRoster.map((p, i) => makePlayer(p, 1, i, i, ownSide === 1 ? formation : '4-3-3'))
    ];
    kickoff(match, 0);
    event(match, 'キックオフ！');
    return match;
  }

  function activePlayer(match) {
    return match.players.find(p => p.uid === match.ball.carrier) || null;
  }

  function nearestPlayers(match, side, point, count = 2) {
    return match.players.filter(p => p.side === side).sort((a, b) => distance(a, point) - distance(b, point)).slice(0, count);
  }

  function updateTargets(match, tactic) {
    const holder = activePlayer(match);
    const ball = match.ball;
    const pressurePoint = holder || ball;
    const defendingSide = holder ? 1 - holder.side : 1 - ball.lastTouch;
    const pressers = nearestPlayers(match, defendingSide, pressurePoint, 2);
    const ownPress = clamp(tactic.press / 100, 0, 1);
    for (const player of match.players) {
      const base = match.baseSlots[player.side][player.slot];
      const dir = direction(player.side);
      const baseX = player.side === 0 ? base.x : LENGTH - base.x;
      if (player.slot === 0) {
        player.tx = clamp(baseX + (ball.x - baseX) * .045, 3, 102);
        player.ty = clamp(34 + (ball.y - 34) * .25, 24, 44);
        continue;
      }
      if (holder && player.uid === holder.uid) {
        player.tx = clamp(player.x + dir * 12, 2, 103);
        player.ty = clamp(player.y + (34 - player.y) * .12, 3, 65);
        continue;
      }
      if (pressers.includes(player)) {
        const factor = player.side === match.ownSide ? .62 + ownPress * .38 : .8;
        player.tx = clamp(baseX + (pressurePoint.x - baseX) * factor, 3, 102);
        player.ty = clamp(base.y + (pressurePoint.y - base.y) * factor, 3, 65);
        continue;
      }
      const attacking = holder && holder.side === player.side;
      const shift = attacking ? .27 : .16;
      player.tx = clamp(baseX + (ball.x - 52.5) * shift + (attacking ? dir * 3 : 0), 3, 102);
      player.ty = clamp(base.y + (ball.y - 34) * (attacking ? .25 : .18), 3, 65);
    }
  }

  function movePlayers(match) {
    for (const player of match.players) {
      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const d = Math.hypot(dx, dy);
      const maxSpeed = (4.5 + 3.5 * player.speed / 100) * (1 - .18 * (1 - player.stamina / 100) ** 2);
      const accel = player.slot === 0 ? 7 : 11;
      const desiredX = d > .3 ? dx / d * maxSpeed : 0;
      const desiredY = d > .3 ? dy / d * maxSpeed : 0;
      player.vx += clamp(desiredX - player.vx, -accel * DT, accel * DT);
      player.vy += clamp(desiredY - player.vy, -accel * DT, accel * DT);
      player.x = clamp(player.x + player.vx * DT, 1, 104);
      player.y = clamp(player.y + player.vy * DT, 1, 67);
      const load = Math.hypot(player.vx, player.vy) / maxSpeed;
      player.stamina = clamp(player.stamina - (player.slot === 0 ? .001 : .004) * load * DT * 30, 20, 100);
    }
  }

  function takePossession(match, player) {
    match.ball.carrier = player.uid;
    match.ball.kind = 'controlled';
    match.ball.lastTouch = player.side;
    match.ball.vx = 0;
    match.ball.vy = 0;
    match.ball.actionAt = match.seconds + .35;
  }

  function tackle(match, holder, random, tactic) {
    const defenders = nearestPlayers(match, 1 - holder.side, holder, 2);
    for (const defender of defenders) {
      if (defender.slot === 0 || distance(defender, holder) > 1.55) continue;
      const press = defender.side === match.ownSide ? tactic.press : 50;
      const chance = clamp(.07 + (defender.defend - holder.ovr) / 400 + press / 1000, .025, .2);
      if (random() < chance) {
        takePossession(match, defender);
        return true;
      }
    }
    return false;
  }

  function findPass(match, holder, tactic, random) {
    const dir = direction(holder.side);
    const teammates = match.players.filter(p => p.side === holder.side && p.uid !== holder.uid && p.slot !== 0);
    let best = null;
    let bestScore = -Infinity;
    for (const target of teammates) {
      const d = distance(holder, target);
      if (d < 5 || d > 43) continue;
      const forward = (target.x - holder.x) * dir;
      const nearby = nearestPlayers(match, 1 - holder.side, target, 1)[0];
      const space = nearby ? distance(nearby, target) : 10;
      const score = forward * .55 - d * .15 + Math.min(space, 15) * 1.3 + random() * 13
        + (holder.side === match.ownSide && tactic.style === 'possession' ? (20 - d) * .35 : 0);
      if (score > bestScore) { bestScore = score; best = target; }
    }
    return best;
  }

  function kick(match, holder, targetX, targetY, speed, kind, random) {
    const dx = targetX - holder.x;
    const dy = targetY - holder.y;
    const d = Math.max(.1, Math.hypot(dx, dy));
    match.ball.carrier = null;
    match.ball.kind = kind;
    match.ball.lastTouch = holder.side;
    match.ball.shooter = kind === 'shot' ? holder.uid : null;
    match.ball.kicker = holder.uid;
    match.ball.ignoreUntil = match.seconds + .4;
    match.ball.x = holder.x + dx / d * 1.05;
    match.ball.y = holder.y + dy / d * 1.05;
    match.ball.vx = dx / d * speed;
    match.ball.vy = dy / d * speed;
    match.ball.actionAt = match.seconds + .4;
  }

  function decide(match, holder, random, tactic) {
    if (match.seconds < match.ball.actionAt) return;
    const dir = direction(holder.side);
    const goalDistance = holder.side === 0 ? 105 - holder.x : holder.x;
    const defenders = nearestPlayers(match, 1 - holder.side, holder, 1);
    const pressure = defenders.length ? distance(holder, defenders[0]) : 15;
    const attackingTactic = holder.side === match.ownSide ? tactic.style : 'balanced';
    const shootBias = attackingTactic === 'counter' ? .07 : 0;
    if (holder.slot !== 0 && goalDistance < 32 && random() < clamp(.14 + (32 - goalDistance) / 80 + shootBias, .12, .5)) {
      const error = (random() - .5) * (15 - holder.shoot / 9);
      const targetY = 34 + (random() - .5) * 5 + error;
      kick(match, holder, holder.side === 0 ? 106 : -1, targetY, 24 + holder.shoot / 11, 'shot', random);
      match.shots[holder.side]++;
      event(match, `${holder.name} がシュート！`, 'shot');
      return;
    }
    const passChance = attackingTactic === 'possession' ? .62 : attackingTactic === 'counter' ? .32 : .45;
    if (pressure < 6 || random() < passChance) {
      const receiver = findPass(match, holder, tactic, random);
      if (receiver) {
        const error = (100 - holder.pass) / 25;
        const aimX = receiver.x + receiver.vx * .55 + (random() - .5) * error;
        const aimY = receiver.y + receiver.vy * .55 + (random() - .5) * error;
        kick(match, holder, aimX, aimY, 12 + holder.pass / 8, 'pass', random);
        return;
      }
    }
    const tempo = holder.side === match.ownSide ? clamp(tactic.tempo, 0, 100) : 50;
    match.ball.actionAt = match.seconds + .7 - tempo * .003 + random() * .35;
    holder.tx = clamp(holder.x + dir * 13, 2, 103);
  }

  function applyQueuedSubs(match, isHalftime) {
    if (!match.queuedSubs.length) return [];
    const queue = match.queuedSubs.splice(0);
    const executed = [];
    for (const sub of queue) {
      const outgoing = match.players.find(p => p.sourceId === sub.outId && p.side === match.ownSide);
      if (!outgoing || match.usedBench.includes(sub.inPlayer.id) || match.subsUsed >= 5) continue;
      const replacement = makePlayer(sub.inPlayer, match.ownSide, outgoing.slot, Number(String(outgoing.uid).split('-')[1]), match.formation);
      replacement.x = outgoing.x;
      replacement.y = outgoing.y;
      replacement.vx = outgoing.vx;
      replacement.vy = outgoing.vy;
      replacement.uid = `${match.ownSide}-sub-${sub.inPlayer.id}`;
      match.players[match.players.indexOf(outgoing)] = replacement;
      match.exitStamina[outgoing.sourceId] = outgoing.stamina;
      if (match.ball.carrier === outgoing.uid) match.ball.carrier = replacement.uid;
      match.subbedOut.push(outgoing.sourceId);
      match.usedBench.push(sub.inPlayer.id);
      match.appeared.push(sub.inPlayer.id);
      match.subsUsed++;
      executed.push(`${outgoing.name} → ${replacement.name}`);
    }
    if (executed.length && !isHalftime) match.windowsUsed++;
    if (executed.length) event(match, `交代 ${executed.join('、')}`, 'sub');
    return executed;
  }

  function queueSub(match, outId, inPlayer) {
    if (match.finished || match.subsUsed + match.queuedSubs.length >= 5) return '交代枠は5人までです。';
    if (match.windowsUsed >= 3 && !(match.seconds >= 177 && match.seconds <= 183)) return '交代機会は3回までです。';
    if (match.subbedOut.includes(outId) || match.queuedSubs.some(s => s.outId === outId)) return 'その選手は交代できません。';
    const outgoing = match.players.find(p => p.side === match.ownSide && p.sourceId === outId);
    if (!outgoing) return 'ピッチ上の選手を選んでください。';
    if ((outgoing.pos === 'GK') !== (inPlayer.pos === 'GK')) return 'GKはGK同士で交代してください。';
    if (match.usedBench.includes(inPlayer.id) || match.queuedSubs.some(s => s.inPlayer.id === inPlayer.id)) return 'その控え選手はすでに選ばれています。';
    match.queuedSubs.push({ outId, inPlayer });
    return null;
  }

  function restart(match, side, x, y, isHalftime = false) {
    applyQueuedSubs(match, isHalftime);
    const players = nearestPlayers(match, side, { x, y }, 1);
    const taker = players[0] || match.players.find(p => p.side === side);
    taker.x = clamp(x, 2, 103);
    taker.y = clamp(y, 2, 66);
    takePossession(match, taker);
  }

  function processBall(match, random, tactic) {
    const ball = match.ball;
    const holder = activePlayer(match);
    if (holder) {
      const dir = direction(holder.side);
      ball.x = clamp(holder.x + dir * .7, 0, LENGTH);
      ball.y = holder.y;
      match.possessionSeconds[holder.side] += DT;
      if (match.tick % 6 === 0 && !tackle(match, holder, random, tactic)) decide(match, holder, random, tactic);
      return;
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    const nextSpeed = Math.max(0, speed - 1.7 * DT);
    if (speed > 0) { ball.vx *= nextSpeed / speed; ball.vy *= nextSpeed / speed; }
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT;
    const goalSide = ball.x > LENGTH ? 0 : ball.x < 0 ? 1 : -1;
    if (goalSide !== -1) {
      if (ball.kind === 'shot' && ball.y >= 34 - GOAL_HALF_WIDTH && ball.y <= 34 + GOAL_HALF_WIDTH) {
        if (goalSide === 0) match.hg++; else match.ag++;
        const scorer = match.players.find(p => p.uid === ball.shooter);
        if (scorer?.sourceId !== null && scorer?.sourceId !== undefined) {
          match.goalScorers.push(scorer.sourceId);
        }
        event(match, `ゴール！ ${scorer?.name || '選手'} がネットを揺らした！`, 'goal');
        applyQueuedSubs(match, false);
        kickoff(match, 1 - goalSide);
      } else {
        event(match, 'ゴールキック。');
        restart(match, 1 - goalSide, goalSide === 0 ? 100 : 5, 34);
      }
      return;
    }
    if (ball.y < 0 || ball.y > WIDTH) {
      event(match, 'スローイン。');
      restart(match, 1 - ball.lastTouch, clamp(ball.x, 5, 100), clamp(ball.y, 2, 66));
      return;
    }
    const nearby = match.players.filter(p => Math.hypot(p.x - ball.x, p.y - ball.y) < (p.slot === 0 ? 3.1 : 1.25));
    nearby.sort((a, b) => distance(a, ball) - distance(b, ball));
    for (const player of nearby) {
      if (player.uid === ball.kicker && match.seconds < ball.ignoreUntil) continue;
      if (ball.kind === 'shot' && player.uid === ball.shooter) continue;
      if (ball.kind === 'shot' && player.side !== ball.lastTouch) {
        if (player.slot === 0) {
          const saveChance = clamp(.5 + player.ovr / 220 - speed / 110, .35, .85);
          if (random() < saveChance) {
            event(match, `${player.name} がシュートをセーブ！`, 'save');
            restart(match, player.side, player.x, player.y);
            return;
          }
        } else if (random() < .5) {
          event(match, `${player.name} がシュートをブロック。`);
          ball.vx *= -.45;
          ball.vy += (random() - .5) * 9;
          ball.kind = 'free';
          ball.lastTouch = player.side;
          return;
        }
      }
      if (ball.kind !== 'shot' || player.slot === 0 || speed < 10) {
        takePossession(match, player);
        return;
      }
    }
    if (speed < .8) {
      const player = nearestPlayers(match, 1 - ball.lastTouch, ball, 1)[0];
      if (player) takePossession(match, player);
    }
  }

  function step(match, random, tactic) {
    if (match.finished) return;
    match.tick++;
    match.seconds = match.tick * DT;
    match.minute = Math.min(90, match.seconds / 4);
    if (!match.halftime && match.seconds >= 180) {
      match.halftime = true;
      event(match, 'ハーフタイム。後半が始まります。');
      applyQueuedSubs(match, true);
      kickoff(match, 1);
    }
    if (match.tick % 15 === 1) updateTargets(match, tactic);
    movePlayers(match);
    processBall(match, random, tactic);
    const possessionTotal = match.possessionSeconds[0] + match.possessionSeconds[1];
    match.possession = possessionTotal ? Math.round(match.possessionSeconds[0] / possessionTotal * 100) : 50;
    if (match.seconds >= 360) {
      match.finished = true;
      event(match, '試合終了。');
    }
  }

  const MatchEngine = { create, step, queueSub, applyQueuedSubs, slots, makeOpponent };
  global.MatchEngine = MatchEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = MatchEngine;
})(typeof window !== 'undefined' ? window : globalThis);
