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
  while (!match.finished) {
    for (let i = 0; i < batchSize && !match.finished; i++) {
      MatchEngine.step(match, random, tactic);
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
    actions: match.actionCounts
  };
}

assert.deepEqual(run(42, 3), run(42, 12), 'render speed must not alter the result');
assert.equal(run(42, 3).ticks, 10800, 'a match must finish after 90 game minutes');
{
  const actions = run(42, 3).actions;
  for (const kind of ['dribbles', 'steals', 'tackles', 'slides', 'headers', 'catches', 'punches', 'passes', 'shots']) {
    assert.ok(actions[kind] > 0, `${kind} must occur in the match simulation`);
  }
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
