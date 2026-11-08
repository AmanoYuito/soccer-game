/* Individual training controls and a persistent post-match growth report. */
const trainingThemes = {
  balanced: 'バランス', attack: '攻撃', defense: '守備',
  fitness: 'フィジカル', recovery: '回復'
};
const growthLabels = {
  ovr: '総合', shoot: 'シュート', pass: 'パス',
  defend: '守備', speed: 'スピード', stamina: '体力'
};
let selectedTrainingPlayerId = null;
const trainingMenuDetails = {
  balanced: ['◎', '基礎練習', '能力をまんべんなく鍛える', '毎節、能力を1つ伸ばす'],
  attack: ['⚽', 'シュート練習', 'ゴール前の決定力を磨く', 'シュート +1〜2・パス +0〜1'],
  defense: ['◆', '守備練習', '奪う・寄せる・守る', '守備 +1〜2'],
  fitness: ['↗', '走り込み', '走力と持久力を高める', 'スピード +1〜2・体力回復'],
  recovery: ['✚', '休養', '次の試合に備えて整える', '体力回復を優先']
};

function playerTrainingTheme(player) {
  return Object.hasOwn(trainingThemes, player.training) ? player.training :
    Object.hasOwn(trainingThemes, state.training) ? state.training : 'balanced';
}

function growthReportHTML(report) {
  if (!Array.isArray(report?.players) || !report.players.length) return '<p class="subtle">試合を終えると、選手ごとの成長がここに残ります。</p>';
  return `<div class="growth-report" aria-label="第${escapeHTML(report.round)}節の選手別成長">${report.players.map(row => {
    const player = state.players.find(item => item.id === row.id) || row;
    const deltas = row.changes && typeof row.changes === 'object' ? row.changes : {};
    const changes = Object.entries(growthLabels).filter(([key]) => Number.isFinite(deltas[key]) && deltas[key] !== 0).map(([key, label]) => {
      const delta = deltas[key];
      return `<span class="growth-chip ${delta < 0 ? 'growth-down' : ''}">${label} ${delta > 0 ? '+' : ''}${delta}</span>`;
    }).join('');
    const special = row.special?.level ? `<span class="growth-chip growth-special">${escapeHTML(specialAbilityCatalog[row.special.id]?.[0] || row.special.id)} ${row.special.learned ? '習得' : `Lv.${row.special.level}へ`}</span>` : '';
    return `<div class="growth-row">${portraitSVG(player)}<div class="growth-person"><strong>${escapeHTML(row.name)}</strong><small>${escapeHTML(row.pos)} · ${trainingThemes[row.training] || 'バランス'}</small></div><div class="growth-changes">${changes || (special ? '' : '<span class="growth-none">今回は変化なし</span>')}${special}</div></div>`;
  }).join('')}</div>`;
}

function training() {
  const selected = state.players.find(player => player.id === selectedTrainingPlayerId) || state.players[0];
  selectedTrainingPlayerId = selected.id;
  const rows = state.players.map((player, index) => `<button class="training-selector ${player.id === selected.id ? 'selected' : ''}" data-action="selectTrainingPlayer" data-id="${player.id}" aria-pressed="${player.id === selected.id}">
    ${portraitSVG(player)}<span class="training-selector-name"><strong>${escapeHTML(player.name)}</strong><small>${index < 11 ? '先発' : '控え'} · ${escapeHTML(player.pos)} · ${rankOf(player.ovr)} ${player.ovr}</small></span><span class="training-selector-theme">${trainingThemes[playerTrainingTheme(player)]}</span></button>`).join('');
  const menu = Object.entries(trainingMenuDetails).map(([key, [icon, title, description, effect]]) => `<button class="training-menu-card ${playerTrainingTheme(selected) === key ? 'selected' : ''}" data-action="setPlayerTraining" data-id="${selected.id}" data-theme="${key}" aria-pressed="${playerTrainingTheme(selected) === key}">
    <span class="training-menu-icon">${icon}</span><span><strong>${title}</strong><small>${description}</small><em>${effect}</em></span><span class="training-menu-check">${playerTrainingTheme(selected) === key ? '設定中' : '選ぶ'}</span></button>`).join('');
  const specialOptions = specialAbilityPool(selected).filter(id => {
    const known = selected.specialAbilities.find(item => item.id === id);
    return known ? known.level < 3 : selected.specialAbilities.length < 5;
  });
  const specialCards = specialOptions.map(id => {
    const known = selected.specialAbilities.find(item => item.id === id);
    const cost = specialTrainingCost(selected, id), progress = Math.min(cost, selected.specialProgress[id] || 0);
    return `<button class="special-training-card ${selected.specialFocus === id ? 'selected' : ''}" data-action="setSpecialTraining" data-id="${selected.id}" data-special="${id}" aria-pressed="${selected.specialFocus === id}"><strong>${escapeHTML(specialAbilityCatalog[id][0])}<small>${known ? `Lv.${known.level} → ${known.level+1}` : '新しく習得'}</small></strong><span>${escapeHTML(specialAbilityCatalog[id][1])}</span><i class="special-progress"><b style="width:${Math.round(progress/cost*100)}%"></b></i><em>${progress}/${cost} · ${trainingThemes[specialTrainingTheme[id]]}練習で進みやすい</em></button>`;
  }).join('');
  return `<div class="console-screen training-screen">${pageHead('TRAINING ROOM','育成・特訓','選手を選び、その選手の練習メニューを決めます。')}
    <div class="console-layout training-layout"><section class="console-panel training-roster"><div class="console-panel-heading"><div><small>YOUR TEAM</small><h2>練習する選手</h2></div><span class="console-count">${state.players.length}人</span></div><div class="training-selectors">${rows}</div></section>
    <section class="console-panel training-workbench"><div class="console-panel-heading"><div><small>PLAYER TRAINING</small><h2>練習メニュー</h2></div><button class="btn sm" data-action="selectPlayer" data-id="${selected.id}">能力詳細</button></div>
      <div class="training-focus">${portraitSVG(selected, true)}<div class="training-focus-name"><strong>${escapeHTML(selected.name)}</strong><small>#${selected.number} · ${escapeHTML(selected.pos)} · ${selected.growthType} · 体力 ${Math.round(selected.stamina)}%</small></div>${rankBadgeHTML(selected.ovr, '総合')}</div>
      <div class="training-core-stats"><span>シュート ${rankBadgeHTML(selected.shoot)}</span><span>パス ${rankBadgeHTML(selected.pass)}</span><span>守備 ${rankBadgeHTML(selected.defend)}</span><span>速さ ${rankBadgeHTML(selected.speed)}</span></div>
      <div class="training-menu-grid">${menu}</div><p class="training-explainer">メニューは選ぶと自動保存され、次の試合終了時に成長へ反映されます。</p>
      <div class="special-training"><div class="console-panel-heading"><div><small>SPECIAL SKILL</small><h2>特殊能力の習得</h2></div><span class="console-count">${selected.specialAbilities.length}/5</span></div><p>伸ばしたい能力を1つ選ぼう。練習と試合出場で進捗がたまり、必要値に達すると習得またはLvアップします。</p><div class="special-owned">習得済み ${specialAbilityBadges(selected,5)}</div><div class="special-training-grid">${specialCards || '<span class="special-training-done">習得できる能力はすべて最高レベルです。</span>'}</div></div></section></div>
    <section class="console-panel training-results"><div class="console-panel-heading"><div><small>LAST MATCH</small><h2>前節の成長</h2></div><span class="console-count">${state.lastGrowth ? `第${escapeHTML(state.lastGrowth.round)}節` : '試合後に表示'}</span></div>${growthReportHTML(state.lastGrowth)}</section></div>`;
}

document.addEventListener('change', event => {
  const select = event.target.closest('[data-training-id]');
  if (!select || !state || !Object.hasOwn(trainingThemes, select.value)) return;
  const player = state.players.find(item => item.id === Number(select.dataset.trainingId));
  if (!player) return;
  player.training = select.value;
  persist();
  showToast(`${player.name}の練習を「${trainingThemes[select.value]}」に設定しました`);
});

document.addEventListener('click', event => {
  const selector = event.target.closest('[data-action="selectTrainingPlayer"]');
  if (selector && state) {
    selectedTrainingPlayerId = Number(selector.dataset.id);
    render();
    return;
  }
  const menu = event.target.closest('[data-action="setPlayerTraining"]');
  if (menu && state && Object.hasOwn(trainingThemes, menu.dataset.theme)) {
    const player = state.players.find(item => item.id === Number(menu.dataset.id));
    if (!player) return;
    player.training = menu.dataset.theme;
    persist();
    render();
    showToast(`${player.name}の練習を「${trainingThemes[player.training]}」に設定しました`);
    return;
  }
  const special = event.target.closest('[data-action="setSpecialTraining"]');
  if (special && state) {
    const player = state.players.find(item => item.id === Number(special.dataset.id));
    if (!player || !specialAbilityPool(player).includes(special.dataset.special)) return;
    player.specialFocus = special.dataset.special;
    persist();render();
    showToast(`${player.name}の習得目標を「${specialAbilityCatalog[player.specialFocus][0]}」に設定しました`);
    return;
  }
  if (!event.target.closest('[data-action="openTrainingReport"]')) return;
  closeDialog();
  view = 'training';
  render();
});
