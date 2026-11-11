const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const makePlayer = (id, training) => ({
  id, name: `選手${id}`, pos: 'CMF', training, age: 22,
  ovr: 60, potential: 80, xp: 0, shoot: 60, pass: 60,
  defend: 60, speed: 60, stamina: 70, form: 70, morale: 70
});
const state = {
  training: 'balanced', facilities: { training: 1 },
  players: [makePlayer(1, 'attack'), makePlayer(2, 'defense'), makePlayer(3, 'fitness'), makePlayer(4, 'recovery')]
};
const context = vm.createContext({
  state,
  document: { addEventListener() {} },
  playerTrainingTheme: player => player.training || state.training,
  rand: (min, max) => max,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  addNews() {}
});
vm.runInContext(fs.readFileSync(require.resolve('../dist/player-data.js'), 'utf8'), context);
for (const player of state.players) vm.runInContext(`enrichPlayer(state.players[${state.players.indexOf(player)}])`, context);
const attackTackleBefore = state.players[0].abilities.tackle;
vm.runInContext(fs.readFileSync(require.resolve('../dist/match-ui.js'), 'utf8'), context);
const report = context.applyTraining({ ownSide: 0, appeared: [], players: [], exitStamina: {} });
assert.equal(report.length, 4);
assert.equal(report[0].changes.shoot, 0, 'one match must not grant a broad skill boost');
assert.equal(report[0].changes.pass, 0);
assert.equal(report[1].changes.defend, 0);
assert.equal(report[2].changes.speed, 0);
assert.equal(report[2].changes.stamina, 21);
assert.equal(report[3].changes.shoot, 0);
assert.equal(report[3].changes.defend, 0);
assert.equal(report[3].changes.speed, 0);
assert.equal(report[3].changes.stamina, 30);
assert.ok(state.players[0].abilityGrowthXP.vision > 0, 'partial growth should persist');
assert.equal(Object.keys(report[3].detailedChanges).length, 0, 'recovery should prioritize rest');
context.applyTraining({ ownSide: 0, appeared: [], players: [], exitStamina: {} });
const thirdReport = context.applyTraining({ ownSide: 0, appeared: [], players: [], exitStamina: {} });
assert.equal(thirdReport[0].detailedChanges.vision, 1, 'attack training should improve a specific skill');
assert.equal(thirdReport[1].detailedChanges.heading, 1, 'defense training should improve a specific skill');
assert.equal(thirdReport[2].detailedChanges.agility, 1, 'fitness training should improve a specific skill');
assert.equal(thirdReport[3].detailedChanges.vision, undefined);
assert.equal(state.players[0].abilities.tackle, attackTackleBefore, 'attack should not improve unrelated tackling');
console.log('Individual training checks passed.');
