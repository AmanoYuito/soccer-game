/* A compact squad view and detailed, graded player sheet. */
let rosterSort = 'lineup';
let selectedLineupSlot = 9;

function swapIntoLineup(players, formation, slot, playerId) {
  const index = players.findIndex(player => player.id === playerId);
  if (index < 0 || slot < 0 || slot >= 11 || index === slot) return false;
  if ((players[index].pos === 'GK') !== (formations[formation]?.[slot] === 'GK')) return false;
  [players[slot], players[index]] = [players[index], players[slot]];
  if (players.slice(0, 11).filter(player => player.pos === 'GK').length !== 1) {
    [players[slot], players[index]] = [players[index], players[slot]];
    return false;
  }
  return true;
}

function rankBadgeHTML(value, label = '') {
  const grade = rankOf(value);
  const number = Math.max(1, Math.min(100, Math.round(Number(value) || 1)));
  return `<span class="rank-badge rank-${grade}" aria-label="${escapeHTML(label)} ${grade}ランク ${number}"><b>${grade}</b><small>${number}</small></span>`;
}
function specialAbilityBadges(player, limit = 3) {
  return `<span class="special-badges">${(player.specialAbilities || []).slice(0, limit).map(item => `<span class="special-badge" title="${escapeHTML(specialAbilityCatalog[item.id]?.[1] || '')}">${escapeHTML(specialAbilityCatalog[item.id]?.[0] || item.id)} <b>Lv.${item.level}</b></span>`).join('')}</span>`;
}

function team() {
  const slots = fieldSlots();
  selectedLineupSlot = Math.max(0, Math.min(10, selectedLineupSlot));
  const targetPos = formations[state.formation][selectedLineupSlot];
  const target = state.players[selectedLineupSlot];
  const isKeeperSlot = targetPos === 'GK';
  const list = state.players.filter((player, index) => (player.pos === 'GK') === isKeeperSlot &&
    (filter === 'all' || (filter === 'starter' ? index < 11 : player.pos === filter)));
  if (rosterSort === 'ovr') list.sort((a, b) => b.ovr - a.ovr);
  if (rosterSort === 'stamina') list.sort((a, b) => b.stamina - a.stamina);
  if (rosterSort === 'age') list.sort((a, b) => a.age - b.age);
  const slotButtons = slots.map((slot, index) => `<button class="lineup-token ${selectedLineupSlot === index ? 'selected' : ''} ${slot.player.stamina < 50 ? 'tired' : ''}" style="left:${slot.x}%;top:${slot.y}%" data-action="selectSlot" data-slot="${index}" aria-label="${formations[state.formation][index]} ${escapeHTML(slot.player.name)}を選ぶ">
    ${portraitSVG(slot.player)}<span class="lineup-token-text"><b>${escapeHTML(slot.player.name.split(' ')[0])}</b><small>${formations[state.formation][index]} · ${rankOf(slot.player.ovr)}</small></span></button>`).join('');
  const rows = list.map(player => {
    const index = state.players.indexOf(player);
    return `<div class="lineup-candidate ${index === selectedLineupSlot ? 'current' : ''}">
      ${portraitSVG(player)}<div class="lineup-candidate-info"><strong>${escapeHTML(player.name)}</strong><small>${index < 11 ? `先発 ${index + 1}` : '控え'} · ${escapeHTML(player.pos)} · 適性${Math.round(positionFit(player.pos, targetPos) * 100)}%</small>${specialAbilityBadges(player, 1)}<span class="candidate-stamina ${player.stamina < 50 ? 'low' : ''}"><i style="width:${player.stamina}%"></i></span></div>
      ${rankBadgeHTML(player.ovr, '総合')}<div class="lineup-candidate-actions"><button class="btn sm" data-action="selectPlayer" data-id="${player.id}" aria-label="${escapeHTML(player.name)}の能力を見る">能力</button><button class="btn primary sm" data-action="assignSlot" data-id="${player.id}" ${index === selectedLineupSlot ? 'disabled' : ''}>${index === selectedLineupSlot ? '起用中' : '起用'}</button></div></div>`;
  }).join('');
  return `<div class="console-screen lineup-screen">${pageHead('TEAM SELECTION','チーム編成','ピッチの位置を選び、右の選手を「起用」で入れ替えます。')}
    <div class="console-layout"><section class="console-panel lineup-board"><div class="console-panel-heading"><div><small>STARTING XI</small><h2>先発の11人</h2></div><label>布陣 <select class="field" id="lineup-formation" aria-label="フォーメーション">${Object.keys(formations).map(value => `<option value="${value}" ${state.formation === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
      <div class="lineup-pitch"><div class="lineup-lines"></div>${slotButtons}</div>
      <div class="lineup-selected"><span class="lineup-step">選択中</span>${portraitSVG(target)}<div><strong>${escapeHTML(target.name)}</strong><small>${targetPos} · 適性${Math.round(positionFit(target.pos, targetPos) * 100)}% · 体力${Math.round(target.stamina)}%</small></div>${rankBadgeHTML(target.ovr, '総合')}</div>
    </section><section class="console-panel lineup-list-panel"><div class="console-panel-heading"><div><small>PLAYERS</small><h2>${targetPos}の候補</h2></div><span class="console-count">${list.length}人</span></div>
      <div class="lineup-filters"><label>表示<select class="field" id="team-filter"><option value="all" ${filter === 'all' ? 'selected' : ''}>全選手</option><option value="starter" ${filter === 'starter' ? 'selected' : ''}>先発</option>${[...new Set(state.players.map(player => player.pos))].filter(pos => (pos === 'GK') === isKeeperSlot).map(pos => `<option value="${escapeHTML(pos)}" ${filter === pos ? 'selected' : ''}>${escapeHTML(pos)}</option>`).join('')}</select></label><label>並び順<select class="field" id="team-sort"><option value="lineup" ${rosterSort === 'lineup' ? 'selected' : ''}>登録順</option><option value="ovr" ${rosterSort === 'ovr' ? 'selected' : ''}>総合順</option><option value="stamina" ${rosterSort === 'stamina' ? 'selected' : ''}>体力順</option><option value="age" ${rosterSort === 'age' ? 'selected' : ''}>年齢順</option></select></label></div>
      <div class="lineup-candidates">${rows || '<p class="console-empty">この条件の候補はいません。表示を「全選手」にしてください。</p>'}</div></section></div>
    <p class="console-footnote">選手の位置適性と体力を見て布陣を決めましょう。起用の変更は自動保存されます。</p></div>`;
}

function abilitySectionHTML(group, player, open = false) {
  return `<details class="ability-section" ${open ? 'open' : ''}><summary>${group.title}<span>${group.abilities.length}項目</span></summary><div class="ability-list">${group.abilities.map(([key, label]) => {
    const value = player.abilities[key];
    return `<div class="ability-row"><span>${label}</span><div class="ability-track"><i style="width:${value}%"></i></div>${rankBadgeHTML(value, label)}</div>`;
  }).join('')}</div></details>`;
}

function appearanceSelectHTML(id, label, values, selected) {
  return `<label class="appearance-field">${label}<select class="field" id="appearance-${id}">${values.map((text, index) => `<option value="${index}" ${selected === index ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}

function playerDialog(id) {
  const player = state.players.find(item => item.id === id);
  if (!player) return;
  enrichPlayer(player);
  const index = state.players.indexOf(player);
  const isStarter = index < 11;
  const bench = state.players.slice(isStarter ? 11 : 0, isStarter ? undefined : 11);
  const look = appearanceFor(player);
  const fit = isStarter ? Math.round(positionFit(player.pos, formations[state.formation][index]) * 100) : null;
  const abilityCards = [
    ['総合', player.ovr], ['シュート', player.shoot], ['パス', player.pass],
    ['守備', player.defend], ['スピード', player.speed]
  ].map(([label, value]) => `<div class="profile-stat"><span>${label}</span>${rankBadgeHTML(value, label)}</div>`).join('');
  const details = abilityGroups.filter(group => group.title !== 'GK' || player.pos === 'GK')
    .map(group => abilitySectionHTML(group, player, group.title === (player.pos === 'GK' ? 'GK' : '技術'))).join('');
  showDialog(`<div class="player-sheet"><div class="eyebrow">PLAYER PROFILE</div>
    <div class="player-profile-head">${portraitSVG(player, true)}<div><h2>${escapeHTML(player.name)}</h2><p>#${player.number} · ${escapeHTML(player.pos)} · ${player.age}歳 · ${isStarter ? '先発' : '控え'}</p><p>${player.heightCm}cm / ${player.weightKg}kg · ${player.preferredFoot}利き · ${player.growthType}</p></div></div>
    <div class="profile-stat-grid">${abilityCards}</div>
    <div class="profile-info"><span>体力 <b>${Math.round(player.stamina)}%</b></span><span>調子 <b>${rankOf(player.form)} ${player.form}</b></span><span>士気 <b>${rankOf(player.morale)} ${player.morale}</b></span><span>将来性の推定 <b>${rankOf(player.potential)} ${player.potential}</b></span>${fit === null ? '' : `<span>今の配置への適性 <b>${fit}%</b></span>`}</div>
    <h3 class="profile-section-title">特殊能力 <small>Lv.1〜3</small></h3><div class="special-profile">${(player.specialAbilities || []).map(item => `<div><strong>${escapeHTML(specialAbilityCatalog[item.id]?.[0] || item.id)} <b>Lv.${item.level}</b></strong><small>${escapeHTML(specialAbilityCatalog[item.id]?.[1] || '')}</small></div>`).join('')}</div>
    <h3 class="profile-section-title">詳しい能力 <small>数値は1〜100</small></h3>${details}
    <details class="appearance-section"><summary>見た目を変える <span>髪・肌・体格・アクセサリー</span></summary>
      <div class="appearance-editor" data-player-id="${player.id}"><div class="appearance-preview" id="appearance-preview">${portraitSVG(player, true)}</div><div class="appearance-fields">
        ${appearanceSelectHTML('skin', '肌色', ['明るい', 'やや明るい', '標準', '健康的', '濃い', 'ピンク系'], look.skin)}
        ${appearanceSelectHTML('hair', '髪色', ['黒', 'こげ茶', '茶', '明るい茶', 'グレー', '金', '赤茶'], look.hair)}
        ${appearanceSelectHTML('hairStyle', '髪型', ['短髪', 'ふんわり', 'センター分け', '横分け', 'ウェーブ'], look.hairStyle)}
        ${appearanceSelectHTML('build', '体格', ['細身', '標準', 'がっしり'], look.build)}
        ${appearanceSelectHTML('accessory', 'アクセサリー', ['なし', 'メガネ', 'ヘアバンド'], look.accessory)}
      </div><button class="btn primary sm" data-action="saveAppearance" data-id="${player.id}">見た目を保存</button></div>
    </details>
    <div class="profile-swap"><label class="label" for="swap-target">${isStarter ? '控えと入れ替える' : '先発と入れ替える'}</label><select class="field" id="swap-target">${bench.map(other => `<option value="${other.id}">${escapeHTML(other.name)} (${escapeHTML(other.pos)} / ${rankOf(other.ovr)} ${other.ovr})</option>`).join('')}</select><button class="btn" data-action="swapPlayer" data-id="${player.id}">入れ替える</button></div>
    <button class="btn ghost profile-close" data-action="closeDialog">閉じる</button>
  </div>`);
}

document.addEventListener('change', event => {
  if (event.target.id === 'team-sort') { rosterSort = event.target.value; render(); }
  if (event.target.id === 'lineup-formation' && Object.hasOwn(formations, event.target.value)) {
    state.formation = event.target.value;
    persist();
    render();
  }
  if (!event.target.closest('.appearance-editor')) return;
  const editor = event.target.closest('.appearance-editor');
  const player = state?.players.find(item => String(item.id) === editor.dataset.playerId);
  if (!player) return;
  const look = Object.fromEntries(['skin', 'hair', 'hairStyle', 'build', 'accessory'].map(key => [key, Number(document.getElementById(`appearance-${key}`).value)]));
  document.getElementById('appearance-preview').innerHTML = portraitSVG({ ...player, appearance: look }, true);
});

document.addEventListener('click', event => {
  const slotButton = event.target.closest('[data-action="selectSlot"]');
  if (slotButton && state) {
    selectedLineupSlot = Number(slotButton.dataset.slot);
    filter = 'all';
    render();
    return;
  }
  const assignButton = event.target.closest('[data-action="assignSlot"]');
  if (assignButton && state) {
    const player = state.players.find(item => item.id === Number(assignButton.dataset.id));
    if (!player || !swapIntoLineup(state.players, state.formation, selectedLineupSlot, player.id)) {
      showToast('この位置には起用できません。GKはGKの位置にしてください。');
      return;
    }
    persist();
    render();
    showToast(`${player.name}を先発に起用しました`);
    return;
  }
  const button = event.target.closest('[data-action="saveAppearance"]');
  if (!button || !state) return;
  const player = state.players.find(item => item.id === Number(button.dataset.id));
  if (!player) return;
  player.appearance = Object.fromEntries(['skin', 'hair', 'hairStyle', 'build', 'accessory'].map(key => [key, Number(document.getElementById(`appearance-${key}`).value)]));
  player.appearance = appearanceFor(player);
  persist();
  closeDialog();
  render();
  playerDialog(player.id);
  showToast(`${player.name}の見た目を保存しました`);
});
