const assert = require('node:assert/strict');
const MatchEngine = require('../dist/match-engine.js');

function seeded(seed) {
  let value = seed;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'DMF', 'CMF', 'AMF', 'LW', 'CF', 'RW'];
const roster = positions.map((pos, id) => ({
  id, name: `選手${id}`, number: id + 1, pos,
  ovr: 65, shoot: pos === 'CF' ? 78 : 60,
  pass: 65, defend: 65, speed: 68, stamina: 95
}));

function create(seed = 42) {
  const random = seeded(seed);
  const match = MatchEngine.create({
    home: 0, away: 1, ownPlayers: roster,
    formation: '4-3-3', opponentStrength: 62, random
  });
  return { match, random };
}

{
  const preview = MatchEngine.makeOpponent(62, seeded(711));
  const match = MatchEngine.create({
    home: 0, away: 1, ownPlayers: roster, formation: '4-3-3',
    opponentStrength: 62, opponentPlayers: preview, random: seeded(42)
  });
  assert.deepEqual(match.players.filter(player => player.side === 1).map(player => player.name),
    preview.map(player => player.name), 'scouted starting XI must match the match lineup');
}

for (const [x, y, lastTouch, expected, side] of [
  [64, -1, 1, 'throwIn', 0], [39, 69, 0, 'throwIn', 1],
  [106, 20, 0, 'goalKick', 1], [-1, 48, 1, 'goalKick', 0],
  [106, 20, 1, 'corner', 0]
]) {
  const { match, random } = create();
  const tactic = { style: 'balanced', press: 50, tempo: 50 };
  Object.assign(match.ball, { carrier: null, kind: 'loose', x, y, vx: 0, vy: 0, lastTouch });
  MatchEngine.step(match, random, tactic);
  assert.equal(match.restart.kind, expected);
  assert.equal(match.restart.side, side);
  const taker = match.players.find(p => p.uid === match.restart.taker);
  assert.equal(taker.slot === 0, expected === 'goalKick');
  const spot = [match.ball.x, match.ball.y];
  for (let i = 0; i < 30; i++) MatchEngine.step(match, random, tactic);
  assert.deepEqual([match.ball.x, match.ball.y], spot);
  while (match.restart) MatchEngine.step(match, random, tactic);
  assert.equal(match.ball.kicker, taker.uid);
  assert.equal(match.ball.kind, 'pass');
  assert.ok(match.ball.airborneUntil > match.seconds);
  assert.equal(match.players.find(p => p.uid === match.ball.intendedReceiver).side, side);
}

function run(seed, batchSize) {
  const { match, random } = create(seed);
  const tactic = { style: 'balanced', press: 50, tempo: 50 };
  let goalMoments = 0;
  const goalCredits = [];
  while (!match.finished) {
    for (let i = 0; i < batchSize && !match.finished; i++) {
      const goalsBefore = match.hg + match.ag;
      MatchEngine.step(match, random, tactic);
      if (match.hg + match.ag > goalsBefore) {
        goalMoments++;
        assert.equal(match.goalMoment.players.length, 22, 'replay keeps all players before kickoff resets them');
        assert.equal(match.goalMoment.ball.kind, 'shot');
        assert.equal(match.goalMoment.hg + match.goalMoment.ag, match.hg + match.ag);
        if (match.goalMoment.assistUid) {
          assert.notEqual(match.goalMoment.assistUid, match.goalMoment.ball.shooter);
          assert.equal(match.goalMoment.players.find(player => player.uid === match.goalMoment.assistUid)?.name, match.goalMoment.assistName);
        }
        goalCredits.push([match.goalMoment.scorerName, match.goalMoment.assistName]);
      }
      if (match.tick % 300 === 0) {
        assert.equal(match.players.length, 22);
        for (const player of match.players) {
          assert.ok(Number.isFinite(player.x) && player.x >= 0 && player.x <= 105);
          assert.ok(Number.isFinite(player.y) && player.y >= 0 && player.y <= 68);
        }
        assert.ok(Number.isFinite(match.ball.x) && Number.isFinite(match.ball.y));
      }
    }
  }
  return {
    ticks: match.tick,
    score: [match.hg, match.ag],
    shots: match.shots,
    possession: match.possession,
    events: match.events,
    actions: match.actionCounts,
    goalMoments,
    goalCredits
  };
}

assert.deepEqual(run(42, 3), run(42, 12), 'render speed must not alter the result');
assert.equal(run(42, 3).ticks, 10800, 'a match must finish after 90 game minutes');

{
  const { match, random } = create();
  const carrier = match.players.find(player => player.uid === match.ball.carrier);
  carrier.x = 62;
  match.ball.x = 62;
  MatchEngine.step(match, random, { style: 'balanced', press: 50, tempo: 50 });
  const defenders = match.players.filter(player => player.side === 1);
  const first = defenders.filter(player => player.pressRole === 'first');
  assert.equal(first.length, 1, 'only one defender should close down the ball');
  assert.ok(first[0].slot >= 5, 'a midfielder should press in midfield instead of pulling a centre-back out');
  const backLine = defenders.filter(player => player.slot >= 1 && player.slot <= 4);
  assert.ok(backLine.every(player => player.tx > carrier.x + 10), 'the back line should protect the space behind the presser');
  const ownBackLine = match.players.filter(player => player.side === 0 && player.slot >= 1 && player.slot <= 4);
  assert.ok(ownBackLine.every(player => player.tx < carrier.x - 9), 'attacking defenders should hold a supporting line behind the ball');
}

{
  const { match, random } = create();
  const carrier = match.players.find(player => player.uid === match.ball.carrier);
  carrier.x = 62;
  match.ball.x = 62;
  const nearby = match.players.find(player => player.side === 1 && player.slot === 5);
  nearby.x = 63;
  nearby.y = 29;
  MatchEngine.step(match, random, { style: 'balanced', press: 50, tempo: 50 });
  assert.equal(match.players.filter(player => player.pressRole === 'first').length, 1);
  assert.equal(match.players.filter(player => player.pressRole === 'cover').length, 1, 'a second defender should cover behind the press');
}
{
  // Rare saves and solo goals are checked across fixtures instead of requiring all in one game.
  const games = [42, 71, 108, 201].map(seed => run(seed, 3));
  const actions = Object.fromEntries(Object.keys(games[0].actions).map(key =>
    [key, games.reduce((sum, game) => sum + game.actions[key], 0)]));
  for (const kind of ['dribbles', 'steals', 'tackles', 'slides', 'headers', 'catches', 'punches', 'passes', 'shots']) {
    assert.ok(actions[kind] > 0, `${kind} must occur in the match simulation`);
  }
  assert.ok(actions.completedPasses / actions.passes > .7, 'most selected passes should reach a teammate');
  assert.ok(actions.feints > 0 && actions.nutmegs > 0, 'both skill moves should occur against defenders');
  assert.equal(run(42, 3).goalMoments, run(42, 3).score.reduce((sum, goals) => sum + goals, 0));
  assert.ok(games.flatMap(game => game.goalCredits).some(([, assist]) => assist), 'a completed final pass can produce an assist');
  assert.ok(games.flatMap(game => game.goalCredits).some(([, assist]) => !assist), 'solo goals should not invent an assist');
}

{
  const { match, random } = create();
  const passer = match.players.find(player => player.side === 0 && player.slot === 6);
  const receiver = match.players.find(player => player.side === 0 && player.slot === 9);
  receiver.x = 84;
  receiver.y = 34;
  match.ball = { ...match.ball, carrier: null, kind: 'pass', lastTouch: 0,
    passBy: passer.uid, intendedReceiver: receiver.uid, passTarget: { x: 84, y: 34 },
    x: 84, y: 34, vx: 0, vy: 0, ignoreUntil: 0, airborneUntil: 0 };
  MatchEngine.step(match, random, { style: 'balanced', press: 50, tempo: 50 });
  assert.equal(match.assistCandidate?.uid, passer.uid, 'the final passer is remembered on reception');
  assert.equal(match.assistCandidate?.receiverUid, receiver.uid);
  const opponent = match.players.find(player => player.side === 1 && player.slot === 2);
  opponent.x = 80;
  opponent.y = 34;
  match.ball = { ...match.ball, carrier: null, kind: 'pass', lastTouch: 0,
    passBy: receiver.uid, intendedReceiver: null, x: 80, y: 34,
    vx: 0, vy: 0, ignoreUntil: 0, airborneUntil: 0 };
  MatchEngine.step(match, random, { style: 'balanced', press: 50, tempo: 50 });
  assert.equal(match.assistCandidate, null, 'an opponent touch cancels the assist');
}

{
  const { match } = create();
  const bench1 = { ...roster[7], id: 100, name: '控えA', number: 18, stamina: 100 };
  const bench2 = { ...roster[9], id: 101, name: '控えB', number: 19, stamina: 100 };
  assert.equal(MatchEngine.queueSub(match, 0, bench1), 'GKはGK同士で交代してください。');
  assert.equal(MatchEngine.queueSub(match, 7, bench1), null);
  assert.equal(MatchEngine.queueSub(match, 9, bench2), null);
  assert.equal(MatchEngine.queueSub(match, 7, bench2), 'その選手は交代できません。');
  MatchEngine.applyQueuedSubs(match, false);
  assert.equal(match.subsUsed, 2);
  assert.equal(match.windowsUsed, 1, 'two substitutions at one stoppage use one window');
  assert.ok(match.players.some(player => player.sourceId === 100));
  assert.ok(match.players.some(player => player.sourceId === 101));
  assert.ok(match.appeared.includes(100));
  assert.ok(!match.players.some(player => player.sourceId === 7));
}

{
  const { match } = create();
  const bench = { ...roster[6], id: 102, name: '控えC', number: 20, stamina: 100 };
  assert.equal(MatchEngine.queueSub(match, 6, bench), null);
  MatchEngine.applyQueuedSubs(match, true);
  assert.equal(match.subsUsed, 1);
  assert.equal(match.windowsUsed, 0, 'halftime substitution does not use a window');
}

{
  const { match } = create();
  match.minute = 62;
  const bench = { ...roster[9], id: 103, name: 'スーパーサブ', number: 21,
    specialAbilities: [{ id: 'superSub', level: 2 }] };
  assert.equal(MatchEngine.queueSub(match, 9, bench), null);
  MatchEngine.applyQueuedSubs(match, false);
  const entered = match.players.find(player => player.sourceId === 103);
  assert.equal(entered.superSubBoost, 6);
  assert.equal(entered.shoot, bench.shoot + 6);
  assert.ok(match.events.at(-1).text.includes('スーパーサブ +6'));
}

console.log('Match engine checks passed.');
