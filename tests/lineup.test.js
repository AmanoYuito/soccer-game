const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'DMF', 'CMF', 'AMF', 'LW', 'CF', 'RW', 'GK', 'CF'];
const players = positions.map((pos, id) => ({ id, pos }));
const context = vm.createContext({
  document: { addEventListener() {} },
  formations: { '4-3-3': positions.slice(0, 11) },
  players
});
vm.runInContext(fs.readFileSync(require.resolve('../dist/player-ui.js'), 'utf8'), context);
const swap = (slot, id) => vm.runInContext(`swapIntoLineup(players, '4-3-3', ${slot}, ${id})`, context);
assert.equal(swap(9, 12), true, 'a bench forward can become a starter');
assert.equal(players[9].id, 12);
assert.equal(players[12].id, 9);
assert.equal(swap(0, 12), false, 'an outfield player cannot take the GK slot');
assert.equal(swap(9, 11), false, 'a GK cannot take an outfield slot');
assert.equal(swap(0, 11), true, 'the reserve GK can replace the starter');
assert.equal(players[0].id, 11);
assert.equal(players.slice(0, 11).filter(player => player.pos === 'GK').length, 1);
console.log('Lineup selection checks passed.');
