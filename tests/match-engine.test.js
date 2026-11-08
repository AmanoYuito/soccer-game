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

function run(seed, batchSize) {
  const { match, random } = create(seed);
  const tactic = { style: 'balanced', press: 50, tempo: 50 };
  let goalMoments = 0;
  while (!match.finished) {
    for (let i = 0; i < batchSize && !match.finished; i++) {
      const goalsBefore = match.hg + match.ag;
      MatchEngine.step(match, random, tactic);
      if (match.hg + match.ag > goalsBefore) {
        goalMoments++;
        assert.equal(match.goalMoment.players.length, 22, 'replay keeps all players before kickoff resets them');
        assert.equal(match.goalMoment.ball.kind, 'shot');
        assert.equal(match.goalMoment.hg + match.goalMoment.ag, match.hg + match.ag);
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
    goalMoments
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
  const actions = run(42, 3).actions;
  for (const kind of ['dribbles', 'steals', 'tackles', 'slides', 'headers', 'catches', 'punches', 'passes', 'shots']) {
    assert.ok(actions[kind] > 0, `${kind} must occur in the match simulation`);
  }
  assert.ok(actions.completedPasses / actions.passes > .7, 'most selected passes should reach a teammate');
  assert.ok(actions.feints > 0 && actions.nutmegs > 0, 'both skill moves should occur against defenders');
  assert.equal(run(42, 3).goalMoments, run(42, 3).score.reduce((sum, goals) => sum + goals, 0));
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

console.log('Match engine checks passed.');
