/* Player identity and the ability list named in the game specification. */
const abilityGroups = [
  { title: '技術', abilities: [
    ['shotAccuracy', 'シュート精度', 'shoot'], ['shotPower', 'シュート力', 'shoot'],
    ['shortPass', 'ショートパス', 'pass'], ['longPass', 'ロングパス', 'pass'],
    ['dribbling', 'ドリブル', 'attackSpeed'], ['ballControl', 'ボールコントロール', 'attackPass'],
    ['crossing', 'クロス', 'pass'], ['setPiece', 'セットプレー', 'pass'],
    ['heading', 'ヘディング', 'attackDefend'], ['attackingAwareness', '攻撃認知', 'shoot'],
    ['offBall', 'オフボール', 'attackSpeed'], ['vision', '視野', 'pass']
  ] },
  { title: '守備', abilities: [
    ['tackle', 'タックル', 'defend'], ['marking', 'マーク', 'defend'],
    ['interception', 'インターセプト', 'defend'],
    ['defensivePositioning', '守備ポジショニング', 'defend'],
    ['blocking', 'ブロック', 'defend']
  ] },
  { title: '身体', abilities: [
    ['speed', 'スピード', 'speed'], ['acceleration', '加速', 'speed'],
    ['endurance', '持久力', 'condition'], ['strength', 'フィジカル', 'physical'],
    ['jumping', 'ジャンプ', 'physical'], ['agility', '敏捷性', 'speed'],
    ['balance', 'バランス', 'physical']
  ] },
  { title: '判断', abilities: [
    ['decisions', '判断力', 'mind'], ['composure', '冷静さ', 'attackPass'],
    ['concentration', '集中力', 'mind'], ['teamwork', '連携意識', 'pass']
  ] },
  { title: 'GK', abilities: [
    ['saving', 'セービング', 'keeper'], ['reflexes', '反射神経', 'keeper'],
    ['catching', 'キャッチング', 'keeper'], ['gkPositioning', 'GKポジショニング', 'keeper'],
    ['rushing', '飛び出し', 'keeperSpeed'], ['gkKicking', 'GKキック', 'pass'],
    ['highBall', 'ハイボール処理', 'keeper']
  ] }
];
const skinPalette = ['#f2bf91', '#dfa77e', '#c88e68', '#aa7555', '#8e6048', '#e9b892'];
const hairPalette = ['#282a30', '#503527', '#75503a', '#a16b36', '#413d3a', '#d1ad66', '#6b4241'];
const portraitBacks = ['#86a99a', '#a4a083', '#8296b5', '#b29387', '#789e9f'];
const growthTypes = ['早熟', '標準', '晩成', '波型', '大器晩成'];
const specialAbilityCatalog = {
  superSub: ['スーパーサブ', '後半の途中出場で技術・走力が上がる'],
  oneTouchPass: ['ワンタッチパス', '受けてすぐのパスが速く正確になる'],
  midRangeShot: ['ミドルシューター', 'ペナルティエリア外のシュート精度と威力が上がる'],
  aerial: ['空中戦の達人', '浮いたボールを拾いやすく、ヘディング後に素早く動ける'],
  dribbler: ['ドリブル突破', 'フェイントや股抜きの成功率が上がる'],
  ironman: ['鉄人', '試合中の体力消耗を抑える'],
  shotStopper: ['守護神', 'GKのシュートセーブ率が上がる']
};

function defaultSpecialAbilities(player) {
  const hash = playerHash(playerIdentity(player));
  const pool = specialAbilityPool(player);
  const first = player.id >= 11 && player.id < 1000 && player.pos !== 'GK' && player.id % 2 === 0 ? 'superSub' : pool[hash % pool.length];
  const chosen = [first];
  for (let shift = 5; chosen.length < Math.min(3, pool.length); shift += 5) {
    const candidate = pool[(hash >>> shift) % pool.length];
    if (!chosen.includes(candidate)) chosen.push(candidate);
    if (shift > 25) for (const item of pool) if (chosen.length < 3 && !chosen.includes(item)) chosen.push(item);
  }
  return chosen.map((id, index) => ({ id, level: 1 + ((hash >>> (index * 6 + 2)) % 3) }));
}

function specialAbilityPool(player) {
  return player.pos === 'GK' ? ['shotStopper', 'ironman'] :
    ['CB', 'LB', 'RB', 'SB'].includes(player.pos) ? ['aerial', 'ironman', 'oneTouchPass', 'superSub'] :
    ['DMF', 'CMF', 'AMF', 'LM', 'RM'].includes(player.pos) ? ['oneTouchPass', 'midRangeShot', 'dribbler', 'ironman', 'superSub'] :
    ['superSub', 'midRangeShot', 'aerial', 'dribbler', 'oneTouchPass', 'ironman'];
}

const specialTrainingTheme = { superSub:'fitness', oneTouchPass:'attack', midRangeShot:'attack', aerial:'defense', dribbler:'attack', ironman:'fitness', shotStopper:'defense' };
function specialTrainingCost(player, id) {
  const known = player.specialAbilities?.find(item => item.id === id);
  return known ? 100 + known.level * 25 : 100;
}
function advanceSpecialTraining(player, theme, appeared, facilityLevel = 1) {
  const id = player.specialFocus;
  if (!id || !specialAbilityPool(player).includes(id)) return null;
  const known = player.specialAbilities.find(item => item.id === id);
  if (known?.level >= 3 || (!known && player.specialAbilities.length >= 5)) return null;
  const gain = (appeared ? 24 : 13) + (specialTrainingTheme[id] === theme ? 9 : 0) + Math.max(1, facilityLevel) * 2;
  const cost = specialTrainingCost(player, id);
  player.specialProgress[id] = Math.min(cost, (player.specialProgress[id] || 0) + gain);
  if (player.specialProgress[id] < cost) return { id, gain, progress: player.specialProgress[id], cost };
  player.specialProgress[id] = 0;
  if (known) known.level++;
  else player.specialAbilities.push({ id, level: 1 });
  const level = known ? known.level : 1;
  if (level >= 3 || player.specialAbilities.length >= 5 && !known) player.specialFocus = null;
  return { id, gain, progress: 0, cost, level, learned: !known };
}

function playerHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function playerIdentity(player) {
  return player.id === null || player.id === undefined ? player.name : `${player.id}:${player.name}`;
}

function appearanceFor(player) {
  const hash = playerHash(playerIdentity(player));
  const source = player.appearance && typeof player.appearance === 'object' ? player.appearance : {};
  const select = (key, count, fallback) => Number.isInteger(source[key]) && source[key] >= 0 && source[key] < count ? source[key] : fallback;
  return {
    skin: select('skin', skinPalette.length, hash % skinPalette.length),
    hair: select('hair', hairPalette.length, (hash >>> 4) % hairPalette.length),
    hairStyle: select('hairStyle', 5, (hash >>> 9) % 5),
    build: select('build', 3, (hash >>> 14) % 3),
    accessory: select('accessory', 3, (hash >>> 20) % 3)
  };
}

function rankOf(value) {
  const n = Number(value) || 0;
  return n >= 90 ? 'S' : n >= 80 ? 'A' : n >= 70 ? 'B' : n >= 60 ? 'C' :
    n >= 50 ? 'D' : n >= 40 ? 'E' : n >= 30 ? 'F' : 'G';
}

function abilityBase(player, source) {
  const shoot = Number(player.shoot) || 50;
  const pass = Number(player.pass) || 50;
  const defend = Number(player.defend) || 50;
  const speed = Number(player.speed) || 50;
  const condition = Number(player.stamina) || 70;
  const values = {
    shoot, pass, defend, speed, condition,
    attackSpeed: shoot * .55 + speed * .45,
    attackPass: shoot * .4 + pass * .6,
    attackDefend: shoot * .6 + defend * .4,
    physical: defend * .45 + speed * .25 + condition * .3,
    mind: pass * .5 + defend * .5,
    keeper: player.pos === 'GK' ? defend * .55 + (Number(player.ovr) || 50) * .45 + 8 : defend * .6,
    keeperSpeed: player.pos === 'GK' ? speed * .55 + defend * .45 : speed * .7
  };
  return values[source] ?? 50;
}

function createAbilities(player) {
  const result = {};
  for (const group of abilityGroups) {
    for (const [key, , source] of group.abilities) {
      const variation = (playerHash(`${playerIdentity(player)}:${key}`) % 13) - 6;
      result[key] = Math.max(1, Math.min(100, Math.round(abilityBase(player, source) + variation)));
    }
  }
  return result;
}

function enrichPlayer(player) {
  let changed = false;
  if (!Array.isArray(player.specialAbilities)) { player.specialAbilities = defaultSpecialAbilities(player); changed = true; }
  else {
    const clean = player.specialAbilities.filter(item => item && Object.hasOwn(specialAbilityCatalog, item.id) && Number.isInteger(item.level) && item.level >= 1 && item.level <= 3).slice(0, 5);
    if (clean.length !== player.specialAbilities.length) { player.specialAbilities = clean; changed = true; }
  }
  if (!player.specialProgress || typeof player.specialProgress !== 'object' || Array.isArray(player.specialProgress)) { player.specialProgress = {}; changed = true; }
  if (player.specialFocus !== null && (typeof player.specialFocus !== 'string' || !specialAbilityPool(player).includes(player.specialFocus))) { player.specialFocus = null; changed = true; }
  const appearance = appearanceFor(player);
  if (!player.appearance || Object.keys(appearance).some(key => player.appearance[key] !== appearance[key])) {
    player.appearance = appearance;
    changed = true;
  }
  const defaults = createAbilities(player);
  if (!player.abilities || typeof player.abilities !== 'object') { player.abilities = defaults; changed = true; }
  else for (const [key, value] of Object.entries(defaults)) {
    if (!Number.isFinite(player.abilities[key]) || player.abilities[key] < 1 || player.abilities[key] > 100) {
      player.abilities[key] = value;
      changed = true;
    }
  }
  const hash = playerHash(playerIdentity(player));
  if (!Number.isFinite(player.heightCm)) { player.heightCm = 166 + hash % 27; changed = true; }
  if (!Number.isFinite(player.weightKg)) { player.weightKg = Math.round(player.heightCm * .45 - 5 + (hash >>> 7) % 8); changed = true; }
  if (player.preferredFoot !== '左' && player.preferredFoot !== '右') { player.preferredFoot = hash % 5 === 0 ? '左' : '右'; changed = true; }
  if (!growthTypes.includes(player.growthType)) { player.growthType = growthTypes[(hash >>> 11) % growthTypes.length]; changed = true; }
  return changed;
}

function enrichRoster(saveData) {
  let changed = false;
  for (const player of [...(saveData.players || []), ...(saveData.market || [])]) changed = enrichPlayer(player) || changed;
  return changed;
}

function advanceDetailedAbilities(player, before, theme) {
  if (!player.abilities) enrichPlayer(player);
  const changes = {
    shoot: player.shoot - before.shoot,
    pass: player.pass - before.pass,
    defend: player.defend - before.defend,
    speed: player.speed - before.speed
  };
  const sets = {
    shoot: ['shotAccuracy', 'shotPower', 'heading', 'attackingAwareness'],
    pass: ['shortPass', 'longPass', 'ballControl', 'crossing', 'setPiece', 'vision', 'teamwork'],
    defend: ['tackle', 'marking', 'interception', 'defensivePositioning', 'blocking'],
    speed: ['speed', 'acceleration', 'agility', 'offBall']
  };
  for (const [source, keys] of Object.entries(sets)) {
    for (const key of keys) player.abilities[key] = Math.min(100, player.abilities[key] + Math.max(0, changes[source]));
  }
  if (theme === 'fitness') {
    player.abilities.endurance = Math.min(100, player.abilities.endurance + 1);
    player.abilities.strength = Math.min(100, player.abilities.strength + 1);
  }
  if (player.pos === 'GK' && changes.defend > 0) {
    for (const key of ['saving', 'reflexes', 'catching', 'gkPositioning', 'highBall']) {
      player.abilities[key] = Math.min(100, player.abilities[key] + changes.defend);
    }
  }
}
