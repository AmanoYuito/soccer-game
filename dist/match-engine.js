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
  const rating = (player, key, fallback) => Number.isFinite(player.abilities?.[key]) ? player.abilities[key] : fallback;
  const specialLevel = (player, id) => player.specialAbilities?.find(item => item.id === id)?.level || 0;

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
      stamina: source.stamina,
      abilities: source.abilities ? { ...source.abilities } : null,
      specialAbilities: source.specialAbilities ? source.specialAbilities.map(item => ({ ...item })) : [],
      appearance: source.appearance ? { ...source.appearance } : null,
      heightCm: source.heightCm || 175
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
        stamina: 92,
        appearance: { skin: i % 6, hair: (i * 3) % 7, hairStyle: i % 5, build: (i + 1) % 3, accessory: i % 3 },
        specialAbilities: i === 0 ? [{ id: 'shotStopper', level: 1 }] : i === 9 ? [{ id: 'midRangeShot', level: 2 }] : i === 8 ? [{ id: 'dribbler', level: 1 }] : []
      };
    });
  }

  function event(match, text, type = 'normal') {
    match.events.push({ minute: Math.min(90, Math.floor(match.minute)), text, goal: type === 'goal', type });
    if (match.events.length > 55) match.events.shift();
  }

  function kickoff(match, side) {
    match.assistCandidate = null;
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
      shooter: null, kicker: null, ignoreUntil: 0, actionAt: match.seconds + .55,
      dribbleUntil: 0, trail: [], airborneUntil: 0, flightStart: 0, flightDuration: 0
    };
  }

  function create(options) {
    const { home, away, ownPlayers, formation, opponentStrength, random } = options;
    const ownSide = home === 0 ? 0 : 1;
    const opponent = options.opponentPlayers || makeOpponent(opponentStrength, random);
    const homeRoster = ownSide === 0 ? ownPlayers : opponent;
    const awayRoster = ownSide === 1 ? ownPlayers : opponent;
    const match = {
      home, away, ownSide, formation,
      seconds: 0, minute: 0, tick: 0,
      hg: 0, ag: 0, shots: [0, 0], possessionSeconds: [0, 0], possession: 50,
      events: [], paused: false, speed: 1, committed: false, finished: false,
      highlight: null, goalFlash: null, goalMoment: null, assistCandidate: null,
      actionCounts: { dribbles: 0, feints: 0, nutmegs: 0, steals: 0, tackles: 0, slides: 0, headers: 0, catches: 0, punches: 0, passes: 0, completedPasses: 0, shots: 0 },
      visualActions: [],
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

  function bandFor(match, player) {
    const base = match.baseSlots[player.side][player.slot];
    return base.x < 40 ? 'back' : base.x < 70 ? 'middle' : 'front';
  }

  function shapePoint(match, player, ball, defending) {
    const base = match.baseSlots[player.side][player.slot];
    const dir = direction(player.side);
    const band = bandFor(match, player);
    // The lines slide together across the pitch while retaining width and depth.
    const centre = 52.5 + (ball.x - 52.5) * (defending ? .56 : .62);
    const depth = band === 'back' ? -20 : band === 'middle' ? 0 : 18;
    const x = clamp(centre + dir * depth, 3, 102);
    const y = clamp(base.y + (ball.y - base.y) * (defending ? .3 : .2), 4, 64);
    return { x, y };
  }

  function updateTargets(match, tactic) {
    const holder = activePlayer(match);
    const ball = match.ball;
    const pressurePoint = holder || ball;
    const attackingSide = holder ? holder.side : ball.lastTouch;
    const defendingSide = 1 - attackingSide;
    const press = defendingSide === match.ownSide ? clamp(tactic.press, 0, 100) : 50;
    const defenders = match.players.filter(player => player.side === defendingSide && player.slot !== 0);
    const zones = new Map(defenders.map(player => [player.uid, shapePoint(match, player, ball, true)]));
    const pressRange = 12 + press * .1;
    const candidates = defenders.filter(player => {
      const zone = zones.get(player.uid);
      return (!player.staggerUntil || player.staggerUntil <= match.seconds) &&
        (distance(player, pressurePoint) < pressRange || distance(zone, pressurePoint) < pressRange);
    }).sort((a, b) => {
      const cost = player => {
        const zone = zones.get(player.uid);
        const linePenalty = bandFor(match, player) === 'back' && distance(zone, pressurePoint) > 12 ? 8 : 0;
        return distance(player, pressurePoint) * .72 + distance(zone, pressurePoint) * .28 + linePenalty;
      };
      return cost(a) - cost(b);
    });
    const first = candidates[0] || null;
    const cover = first && holder ? candidates.slice(1).find(player => distance(player, holder) < 14) || null : null;
    const opponents = match.players.filter(player => player.side === attackingSide && player.slot !== 0 && player.uid !== holder?.uid);
    const marked = new Set();
    const marks = new Map();
    for (const defender of defenders) {
      if (defender === first || defender === cover) continue;
      const zone = zones.get(defender.uid);
      let best = null;
      let cost = Infinity;
      for (const opponent of opponents) {
        if (marked.has(opponent.uid) || distance(opponent, pressurePoint) > 30) continue;
        const goalSide = { x: opponent.x - direction(defender.side) * 2, y: opponent.y };
        const nextCost = distance(zone, goalSide) + (bandFor(match, defender) === 'back' && bandFor(match, opponent) === 'front' ? -3 : 0);
        if (nextCost < cost && nextCost < 16) { best = opponent; cost = nextCost; }
      }
      if (best) { marks.set(defender.uid, best); marked.add(best.uid); }
    }
    const support = holder ? match.players
      .filter(player => player.side === attackingSide && player.uid !== holder.uid && player.slot !== 0 && bandFor(match, player) !== 'back')
      .sort((a, b) => distance(a, holder) - distance(b, holder)).slice(0, 2) : [];
    for (const player of match.players) {
      const dir = direction(player.side);
      player.pressRole = null;
      if (player.slot === 0) {
        const goalX = player.side === 0 ? 6.5 : 98.5;
        const threat = player.side === defendingSide && Math.abs(ball.x - goalX) < 28;
        player.tx = clamp(goalX + dir * (threat ? 3.5 : 0) + (ball.x - goalX) * .045, 3, 102);
        player.ty = clamp(34 + (ball.y - 34) * (threat ? .38 : .25), 23, 45);
        continue;
      }
      if (holder && player.uid === holder.uid) {
        if (player.skillMove?.until > match.seconds) {
          player.tx = player.skillMove.targetX;
          player.ty = player.skillMove.targetY;
        } else {
          const nearest = nearestPlayers(match, 1 - player.side, player, 1)[0];
          const avoid = nearest && distance(player, nearest) < 7
            ? clamp((player.y - nearest.y || (player.y < 34 ? -1 : 1)) * 1.2, -5, 5) : 0;
          player.tx = clamp(player.x + dir * 10, 2, 103);
          player.ty = clamp(player.y + (34 - player.y) * .04 + avoid, 3, 65);
        }
        continue;
      }
      if (player.staggerUntil > match.seconds) {
        player.tx = clamp(player.x - dir * 2, 2, 103);
        player.ty = clamp(player.y + player.staggerLane * 2.8, 3, 65);
        continue;
      }
      if (!holder && ball.kind === 'pass' && player.uid === ball.intendedReceiver) {
        player.tx = clamp(ball.passTarget.x, 2, 103);
        player.ty = clamp(ball.passTarget.y, 3, 65);
        continue;
      }
      if (player.side === defendingSide) {
        const zone = zones.get(player.uid);
        if (player === first) {
          // Approach from the goal side, then slow down to jockey instead of running through the carrier.
          const standoff = 1.2 + (100 - press) * .014;
          player.pressRole = 'first';
          player.pressIntensity = press;
          player.tx = clamp(pressurePoint.x - dir * standoff, 3, 102);
          player.ty = clamp(pressurePoint.y + (player.y < pressurePoint.y ? -.35 : .35), 3, 65);
        } else if (player === cover) {
          player.pressRole = 'cover';
          player.tx = clamp(pressurePoint.x - dir * 5.5, 3, 102);
          player.ty = clamp(pressurePoint.y + (player.y < pressurePoint.y ? -3.2 : 3.2), 3, 65);
        } else {
          const opponent = marks.get(player.uid);
          if (opponent) {
            const goalSideX = opponent.x - dir * 2.3;
            player.tx = clamp(zone.x * .5 + clamp(goalSideX, zone.x - 8, zone.x + 8) * .5, 3, 102);
            player.ty = clamp(zone.y * .4 + clamp(opponent.y, zone.y - 11, zone.y + 11) * .6, 3, 65);
          } else {
            player.tx = zone.x;
            player.ty = zone.y;
          }
        }
        continue;
      }
      const zone = shapePoint(match, player, ball, false);
      if (!holder) {
        player.tx = zone.x;
        player.ty = zone.y;
        continue;
      }
      const band = bandFor(match, player);
      const lane = player.y <= holder.y ? -1 : 1;
      const supportIndex = support.indexOf(player);
      if (supportIndex >= 0) {
        const targetX = holder.x + dir * (supportIndex === 0 ? 6 : -8);
        const targetY = holder.y + lane * (supportIndex === 0 ? 7 : 6);
        const availability = .45 + rating(player, 'offBall', player.speed) / 400;
        player.tx = clamp(zone.x * (1 - availability) + targetX * availability, 3, 102);
        player.ty = clamp(zone.y * (1 - availability) + targetY * availability, 3, 65);
      } else {
        player.tx = zone.x;
        player.ty = zone.y;
      }
      if (band === 'back' && (player.tx - holder.x) * dir > -9) player.tx = clamp(holder.x - dir * 9, 3, 102);
    }
    // Avoid two teammates aiming at the same patch of grass.
    const attack = match.players.filter(player => player.side === attackingSide && player.slot !== 0 && player.uid !== holder?.uid);
    for (let i = 0; i < attack.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = attack[i], b = attack[j];
        if (Math.hypot(a.tx - b.tx, a.ty - b.ty) < 4.5) {
          a.ty = clamp(a.ty + (a.ty <= b.ty ? -3.4 : 3.4), 3, 65);
        }
      }
    }
  }

  function movePlayers(match) {
    const holder = activePlayer(match);
    for (const player of match.players) {
      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const d = Math.hypot(dx, dy);
      const jockey = holder && player.pressRole === 'first' && distance(player, holder) < 3.2;
      const pressBoost = player.pressRole === 'first' ? 1.06 + (player.pressIntensity || 50) / 650 : 1;
      const maxSpeed = (4.5 + 3.5 * rating(player, 'speed', player.speed) / 100) * pressBoost * (jockey ? .7 : 1) * (player.staggerUntil > match.seconds ? .42 : 1) * (1 - .18 * (1 - player.stamina / 100) ** 2);
      const accel = (player.slot === 0 ? 7 : 11) * (.75 + rating(player, 'acceleration', player.speed) / 250);
      let desiredX = d > .3 ? dx / d * maxSpeed : 0;
      let desiredY = d > .3 ? dy / d * maxSpeed : 0;
      if (player.slot !== 0 && player.pressRole !== 'first') {
        for (const teammate of match.players) {
          if (teammate === player || teammate.side !== player.side || teammate.slot === 0) continue;
          const gapX = player.x - teammate.x, gapY = player.y - teammate.y;
          const gap = Math.hypot(gapX, gapY);
          if (gap > .01 && gap < 3.1) {
            const push = (3.1 - gap) / 3.1 * 2.3;
            desiredX += gapX / gap * push;
            desiredY += gapY / gap * push;
          }
        }
        const desiredSpeed = Math.hypot(desiredX, desiredY);
        if (desiredSpeed > maxSpeed) {
          desiredX *= maxSpeed / desiredSpeed;
          desiredY *= maxSpeed / desiredSpeed;
        }
      }
      player.vx += clamp(desiredX - player.vx, -accel * DT, accel * DT);
      player.vy += clamp(desiredY - player.vy, -accel * DT, accel * DT);
      player.x = clamp(player.x + player.vx * DT, 1, 104);
      player.y = clamp(player.y + player.vy * DT, 1, 67);
      const load = Math.hypot(player.vx, player.vy) / maxSpeed;
      const endurance = rating(player, 'endurance', 70);
      player.stamina = clamp(player.stamina - (player.slot === 0 ? .001 : .004) * load * DT * 30 * (1.2 - endurance / 350) * (1 - .12 * specialLevel(player, 'ironman')), 20, 100);
    }
  }

  function recordAction(match, kind, player, duration = .9, details = {}) {
    match.visualActions.push({ kind, uid: player.uid, x: player.x, y: player.y, start: match.seconds, until: match.seconds + duration, ...details });
    match.visualActions = match.visualActions.filter(action => action.until > match.seconds).slice(-8);
  }

  function takePossession(match, player, kind = 'receive') {
    const oldSide = match.ball.lastTouch;
    if (match.ball.kind === 'pass' && oldSide === player.side) match.actionCounts.completedPasses++;
    match.assistCandidate = match.ball.kind === 'pass' && oldSide === player.side &&
      match.ball.passBy && match.ball.passBy !== player.uid
      ? { uid: match.ball.passBy, receiverUid: player.uid, side: player.side,
          receivedAt: match.seconds, x: player.x, y: player.y }
      : null;
    match.ball.carrier = player.uid;
    match.ball.kind = 'controlled';
    match.ball.lastTouch = player.side;
    match.ball.passBy = null;
    match.ball.assistUid = null;
    match.ball.vx = 0;
    match.ball.vy = 0;
    player.receivedAt = match.seconds;
    match.ball.actionAt = match.seconds + (specialLevel(player, 'oneTouchPass') ? .16 : .35);
    match.ball.dribbleUntil = 0;
    match.ball.airborneUntil = 0;
    match.ball.intendedReceiver = null;
    match.ball.trail = [];
    if ((kind === 'intercept' || kind === 'tackle' || kind === 'slide') && oldSide !== player.side && match.seconds > 1) {
      match.highlight = { kind, x: player.x, y: player.y, until: match.seconds + (kind === 'tackle' ? 1.4 : 1.15), winner: player.uid };
      match.actionCounts.steals++;
      if (kind === 'tackle' || kind === 'slide') match.actionCounts.tackles++;
      if (kind === 'slide') match.actionCounts.slides++;
      event(match, kind === 'slide' ? `${player.name} がスライディングで奪取！` : kind === 'tackle' ? `${player.name} がタックルで奪取！` : `${player.name} がボールを奪った！`, 'steal');
    }
  }

  function tackle(match, holder, random, tactic) {
    if (holder.skillMove?.until > match.seconds) return false;
    const defenders = nearestPlayers(match, 1 - holder.side, holder, 2);
    for (const defender of defenders) {
      if (defender.slot === 0 || defender.staggerUntil > match.seconds || distance(defender, holder) > 2.6) continue;
      const press = defender.side === match.ownSide ? tactic.press : 50;
      const tackling = rating(defender, 'tackle', defender.defend);
      const control = rating(holder, 'ballControl', holder.pass);
      const chance = clamp(.11 + (tackling - control) / 320 + press / 850, .04, .28);
      const move = distance(defender, holder) > 1.7 ? 'slide' : 'tackle';
      if (match.tick % 18 === 0) recordAction(match, move, defender, move === 'slide' ? 1.15 : .8);
      if (random() < chance) {
        takePossession(match, defender, move);
        recordAction(match, move, defender, move === 'slide' ? 1.15 : .8);
        if (match.highlight) match.highlight.loser = holder.uid;
        return true;
      }
    }
    return false;
  }

  function trySkillMove(match, holder, random) {
    if (holder.slot === 0 || holder.skillCooldownUntil > match.seconds ||
        match.seconds < match.ball.actionAt || holder.skillMove?.until > match.seconds) return false;
    const dir = direction(holder.side);
    const defender = nearestPlayers(match, 1 - holder.side, holder, 1)[0];
    if (!defender || defender.slot === 0 || defender.staggerUntil > match.seconds) return false;
    const gap = distance(holder, defender);
    const ahead = (defender.x - holder.x) * dir;
    if (gap < 1.25 || gap > 4.5 || ahead < -.6 || ahead > 4.2) return false;
    const control = rating(holder, 'ballControl', holder.pass);
    const agility = rating(holder, 'agility', holder.speed);
    const dribble = rating(holder, 'dribbling', (holder.speed + holder.pass) / 2);
    const marking = rating(defender, 'marking', defender.defend);
    const tackling = rating(defender, 'tackle', defender.defend);
    const success = clamp(.5 + (control + agility + dribble - marking - tackling - 65) / 420 + .04 * specialLevel(holder, 'dribbler'), .28, .88);
    if (random() >= success) {
      holder.skillCooldownUntil = match.seconds + .8;
      return false;
    }
    holder.skillCooldownUntil = match.seconds + 2.7;
    const kind = gap < 2.7 && random() < .5 ? 'nutmeg' : 'feint';
    const lane = holder.y <= defender.y ? -1 : 1;
    const duration = kind === 'nutmeg' ? 1.15 : 1.05;
    holder.skillMove = {
      kind, start: match.seconds, until: match.seconds + duration,
      targetX: clamp(defender.x + dir * 5.5, 2, 103),
      targetY: clamp(defender.y + lane * (kind === 'nutmeg' ? 1.2 : 3.3), 3, 65),
      defenderUid: defender.uid, lane
    };
    holder.tx = holder.skillMove.targetX;
    holder.ty = holder.skillMove.targetY;
    defender.staggerUntil = match.seconds + .8;
    defender.staggerLane = -lane;
    match.ball.dribbleUntil = holder.skillMove.until;
    match.ball.actionAt = holder.skillMove.until + .12;
    recordAction(match, kind, holder, duration, { defenderUid: defender.uid, lane });
    recordAction(match, 'stumble', defender, .8, { lane: -lane });
    match.actionCounts.dribbles++;
    match.actionCounts[kind === 'nutmeg' ? 'nutmegs' : 'feints']++;
    event(match, `${holder.name} が${kind === 'nutmeg' ? '股抜き' : 'フェイント'}で突破！`, 'dribble');
    return true;
  }

  function findPass(match, holder, tactic, random) {
    const dir = direction(holder.side);
    const teammates = match.players.filter(p => p.side === holder.side && p.uid !== holder.uid && p.slot !== 0);
    const defenders = match.players.filter(p => p.side !== holder.side && p.slot !== 0);
    let best = null;
    let bestScore = -Infinity;
    for (const target of teammates) {
      const d = distance(holder, target);
      if (d < 3 || d > 32) continue;
      const forward = (target.x - holder.x) * dir;
      const space = Math.min(...defenders.map(defender => distance(defender, target)));
      const dx = target.x - holder.x;
      const dy = target.y - holder.y;
      let laneRisk = 0;
      for (const defender of defenders) {
        const along = ((defender.x - holder.x) * dx + (defender.y - holder.y) * dy) / (d * d);
        if (along <= .12 || along >= .92) continue;
        const lateral = Math.hypot(defender.x - (holder.x + dx * along), defender.y - (holder.y + dy * along));
        laneRisk = Math.max(laneRisk, Math.max(0, 4 - lateral));
      }
      const shortBonus = holder.side === match.ownSide && tactic.style === 'possession' ? (28 - d) * .3 : 0;
      const vision = rating(holder, 'vision', holder.pass);
      const decisions = rating(holder, 'decisions', (holder.pass + holder.defend) / 2);
      const score = forward * .34 - d * .52 + Math.min(space, 12) * 1.8 - laneRisk * (2.8 + vision / 45) + shortBonus + random() * (7 - decisions / 20);
      if (score > bestScore) { bestScore = score; best = target; }
    }
    return best;
  }

  function kick(match, holder, targetX, targetY, speed, kind, random) {
    const dx = targetX - holder.x;
    const dy = targetY - holder.y;
    const d = Math.max(.1, Math.hypot(dx, dy));
    const candidate = match.assistCandidate;
    const assistUid = kind === 'shot' && candidate?.receiverUid === holder.uid &&
      candidate.side === holder.side && match.seconds - candidate.receivedAt <= 7 &&
      Math.hypot(holder.x - candidate.x, holder.y - candidate.y) <= 22
      ? candidate.uid : null;
    match.assistCandidate = null;
    match.ball.carrier = null;
    match.ball.kind = kind;
    match.ball.lastTouch = holder.side;
    match.ball.shooter = kind === 'shot' ? holder.uid : null;
    match.ball.assistUid = assistUid;
    match.ball.passBy = kind === 'pass' ? holder.uid : null;
    match.ball.kicker = holder.uid;
    match.ball.intendedReceiver = null;
    match.ball.passTarget = null;
    match.ball.ignoreUntil = match.seconds + .4;
    match.ball.x = holder.x + dx / d * 1.05;
    match.ball.y = holder.y + dy / d * 1.05;
    match.ball.vx = dx / d * speed;
    match.ball.vy = dy / d * speed;
    match.ball.actionAt = match.seconds + .4;
    match.ball.dribbleUntil = 0;
    const flightDuration = kind === 'pass' && d > 16 ? Math.min(1.25, d / speed * .7) : kind === 'shot' ? .75 : 0;
    match.ball.flightStart = match.seconds;
    match.ball.flightDuration = flightDuration;
    match.ball.airborneUntil = match.seconds + flightDuration;
    recordAction(match, kind, holder, kind === 'shot' ? 1.05 : .8);
    if (kind === 'shot') match.actionCounts.shots++; else match.actionCounts.passes++;
  }

  function decide(match, holder, random, tactic) {
    if (match.seconds < match.ball.actionAt) return;
    if (match.seconds < match.ball.dribbleUntil) {
      match.ball.actionAt = match.ball.dribbleUntil;
      return;
    }
    const dir = direction(holder.side);
    const goalDistance = holder.side === 0 ? 105 - holder.x : holder.x;
    const defenders = nearestPlayers(match, 1 - holder.side, holder, 1);
    const pressure = defenders.length ? distance(holder, defenders[0]) : 15;
    const attackingTactic = holder.side === match.ownSide ? tactic.style : 'balanced';
    const shootBias = attackingTactic === 'counter' ? .07 : 0;
    if (holder.slot !== 0 && goalDistance < 32 && random() < clamp(.14 + (32 - goalDistance) / 80 + shootBias, .12, .5)) {
      const middleBonus = goalDistance >= 18 ? 3 * specialLevel(holder, 'midRangeShot') : 0;
      const accuracy = Math.min(100, rating(holder, 'shotAccuracy', holder.shoot) + middleBonus);
      const power = Math.min(100, rating(holder, 'shotPower', holder.shoot) + middleBonus);
      const error = (random() - .5) * (15 - accuracy / 9);
      const targetY = 34 + (random() - .5) * 5 + error;
      kick(match, holder, holder.side === 0 ? 106 : -1, targetY, 22 + power / 12, 'shot', random);
      match.shots[holder.side]++;
      event(match, `${holder.name} がシュート！`, 'shot');
      return;
    }
    const passChance = attackingTactic === 'possession' ? .8 : attackingTactic === 'counter' ? .5 : .68;
    if (pressure < 6 || random() < passChance) {
      const receiver = findPass(match, holder, tactic, random);
      if (receiver) {
        const oneTouchBonus = match.seconds - holder.receivedAt <= 1 ? 3 * specialLevel(holder, 'oneTouchPass') : 0;
        const passSkill = Math.min(100, rating(holder, distance(holder, receiver) > 20 ? 'longPass' : 'shortPass', holder.pass) + oneTouchBonus);
        const error = (100 - passSkill) / 35;
        const aimX = clamp(receiver.x + receiver.vx * .42 + (random() - .5) * error, 2, 103);
        const aimY = clamp(receiver.y + receiver.vy * .42 + (random() - .5) * error, 2, 66);
        kick(match, holder, aimX, aimY, 12.5 + passSkill / 11, 'pass', random);
        match.ball.intendedReceiver = receiver.uid;
        match.ball.passTarget = { x: aimX, y: aimY };
        return;
      }
    }
    const tempo = holder.side === match.ownSide ? clamp(tactic.tempo, 0, 100) : 50;
    match.ball.dribbleUntil = match.seconds + 1.5 - tempo * .003 + random() * .45;
    match.ball.actionAt = match.ball.dribbleUntil;
    holder.tx = clamp(holder.x + dir * 13, 2, 103);
    match.actionCounts.dribbles++;
    event(match, `${holder.name} がドリブルで前へ！`, 'dribble');
  }

  function applyQueuedSubs(match, isHalftime) {
    if (!match.queuedSubs.length) return [];
    const queue = match.queuedSubs.splice(0);
    const executed = [];
    for (const sub of queue) {
      const outgoing = match.players.find(p => p.sourceId === sub.outId && p.side === match.ownSide);
      if (!outgoing || match.usedBench.includes(sub.inPlayer.id) || match.subsUsed >= 5) continue;
      const replacement = makePlayer(sub.inPlayer, match.ownSide, outgoing.slot, Number(String(outgoing.uid).split('-')[1]), match.formation);
      const boost = match.minute >= 45 ? 3 * specialLevel(replacement, 'superSub') : 0;
      if (boost) {
        for (const key of ['ovr', 'shoot', 'pass', 'defend', 'speed']) replacement[key] = clamp(replacement[key] + boost, 1, 100);
        if (replacement.abilities) for (const key of Object.keys(replacement.abilities)) replacement.abilities[key] = clamp(replacement.abilities[key] + boost, 1, 100);
        replacement.superSubBoost = boost;
      }
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
      executed.push(`${outgoing.name} → ${replacement.name}${boost ? `（スーパーサブ +${boost}）` : ''}`);
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
      const touch = Math.sin(match.seconds * 10);
      const skill = holder.skillMove?.until > match.seconds ? holder.skillMove : null;
      if (skill?.kind === 'nutmeg') {
        const phase = (match.seconds - skill.start) / (skill.until - skill.start);
        const defender = match.players.find(player => player.uid === skill.defenderUid);
        ball.x = clamp(phase < .58 && defender ? defender.x + dir * (phase * 3 - .7) : holder.x + dir * (1 + .3 * touch), 0, LENGTH);
        ball.y = clamp(phase < .58 && defender ? defender.y : holder.y + .3 * touch, 0, WIDTH);
      } else {
        ball.x = clamp(holder.x + dir * (.65 + .14 * Math.max(0, touch)), 0, LENGTH);
        ball.y = clamp(holder.y + (skill ? skill.lane * Math.sin((match.seconds - skill.start) / (skill.until - skill.start) * Math.PI) * 1.1 : .17 * touch), 0, WIDTH);
      }
      match.possessionSeconds[holder.side] += DT;
      if (match.tick % 6 === 0 && !trySkillMove(match, holder, random) && !tackle(match, holder, random, tactic)) decide(match, holder, random, tactic);
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
        match.goalFlash = { side: goalSide, start: match.seconds, until: match.seconds + 1.5 };
        const scorer = match.players.find(p => p.uid === ball.shooter);
        const assistant = ball.assistUid && ball.assistUid !== ball.shooter
          ? match.players.find(p => p.uid === ball.assistUid && p.side === goalSide) : null;
        match.goalMoment = {
          seconds: match.seconds, minute: match.minute, ownSide: match.ownSide,
          hg: match.hg, ag: match.ag, scorerName: scorer?.name || '選手',
          assistName: assistant?.name || null, assistUid: assistant?.uid || null,
          players: match.players.map(player => ({ ...player, appearance: player.appearance ? { ...player.appearance } : null })),
          ball: { ...ball, trail: ball.trail.map(dot => ({ ...dot })) },
          visualActions: match.visualActions.map(action => ({ ...action })),
          highlight: match.highlight ? { ...match.highlight } : null,
          goalFlash: { ...match.goalFlash }
        };
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
    const nearby = match.players.filter(player => {
      const control = rating(player, 'ballControl', player.pass);
      const radius = player.slot === 0 ? 3.1 : ball.kind === 'pass' && player.uid === ball.intendedReceiver ? 1.35 + control / 400 : ball.kind === 'pass' && player.side === ball.lastTouch ? 1.25 + control / 600 : 1.25;
      return distance(player, ball) < radius + (ball.kind === 'pass' && match.seconds < ball.airborneUntil ? .07 * specialLevel(player, 'aerial') : 0);
    });
    nearby.sort((a, b) => distance(a, ball) - distance(b, ball) - (a.uid === ball.intendedReceiver ? .2 : 0) + (b.uid === ball.intendedReceiver ? .2 : 0));
    for (const player of nearby) {
      if (player.uid === ball.kicker && match.seconds < ball.ignoreUntil) continue;
      if (ball.kind === 'shot' && player.uid === ball.shooter) continue;
      if (ball.kind === 'shot' && player.side !== ball.lastTouch) {
        if (player.slot === 0) {
          const reflexes = rating(player, 'reflexes', player.ovr);
          const saving = rating(player, 'saving', player.ovr);
          const saveChance = clamp(.42 + (reflexes + saving) / 440 - speed / 110 + .035 * specialLevel(player, 'shotStopper'), .35, .9);
          if (random() < saveChance) {
            const catchBall = speed < 25 || random() < clamp(.25 + rating(player, 'catching', player.ovr) / 200, .3, .75);
            if (catchBall) {
              takePossession(match, player);
              match.ball.actionAt = match.seconds + 1;
              recordAction(match, 'catch', player, 1.25);
              match.actionCounts.catches++;
              event(match, `${player.name} がジャンプしてキャッチ！`, 'save');
            } else {
              ball.carrier = null;
              ball.kind = 'free';
              match.assistCandidate = null;
              ball.lastTouch = player.side;
              ball.vx = direction(player.side) * 14;
              ball.vy = (random() - .5) * 12;
              ball.kicker = player.uid;
              ball.ignoreUntil = match.seconds + .5;
              recordAction(match, 'punch', player, 1.25);
              match.actionCounts.punches++;
              event(match, `${player.name} がジャンプしてパンチング！`, 'save');
            }
            return;
          }
        } else if (random() < .5) {
          event(match, `${player.name} がシュートをブロック。`);
          match.assistCandidate = null;
          ball.vx *= -.45;
          ball.vy += (random() - .5) * 9;
          ball.kind = 'free';
          ball.lastTouch = player.side;
          return;
        }
      }
      if (ball.kind !== 'shot' || player.slot === 0 || speed < 10) {
        if (ball.kind === 'pass' && match.seconds < ball.airborneUntil && player.slot !== 0) {
          takePossession(match, player, player.side !== ball.lastTouch ? 'intercept' : 'receive');
          recordAction(match, 'header', player, 1.1);
          match.actionCounts.headers++;
          match.ball.actionAt = match.seconds + .65 - .12 * specialLevel(player, 'aerial');
          event(match, `${player.name} がジャンプしてヘディング！`, 'header');
          return;
        }
        takePossession(match, player, player.side !== ball.lastTouch ? 'intercept' : 'receive');
        return;
      }
    }
    if (speed < .8) {
      const player = nearestPlayers(match, 1 - ball.lastTouch, ball, 1)[0];
      if (player) takePossession(match, player, 'intercept');
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
    if (match.tick % 9 === 1) updateTargets(match, tactic);
    movePlayers(match);
    processBall(match, random, tactic);
    if (match.tick % 4 === 0) {
      match.ball.trail.push({ x: match.ball.x, y: match.ball.y });
      if (match.ball.trail.length > 6) match.ball.trail.shift();
    }
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
