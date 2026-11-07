/* A compact squad view and detailed, graded player sheet. */
let rosterSort = 'lineup';

function rankBadgeHTML(value, label = '') {
  const grade = rankOf(value);
  const number = Math.max(1, Math.min(100, Math.round(Number(value) || 1)));
  return `<span class="rank-badge rank-${grade}" aria-label="${escapeHTML(label)} ${grade}ランク ${number}"><b>${grade}</b><small>${number}</small></span>`;
}

function team() {
  const positions = [...new Set(state.players.map(player => player.pos))];
  const list = state.players.filter((player, index) => filter === 'all' ||
    (filter === 'starter' ? index < 11 : player.pos === filter));
  if (rosterSort === 'ovr') list.sort((a, b) => b.ovr - a.ovr);
  if (rosterSort === 'stamina') list.sort((a, b) => b.stamina - a.stamina);
  if (rosterSort === 'age') list.sort((a, b) => a.age - b.age);
  const cards = list.map(player => {
    const isStarter = state.players.indexOf(player) < 11;
    return `<article class="roster-card">
      <div class="roster-card-top"><span class="tag ${isStarter ? '' : 'blue'}">${isStarter ? '先発' : '控え'}</span><span class="roster-number">#${player.number}</span><span class="roster-pos">${escapeHTML(player.pos)}</span></div>
      <div class="roster-identity">${portraitSVG(player, true)}<div class="roster-name"><strong>${escapeHTML(player.name)}</strong><span>${player.age}歳 · ${player.preferredFoot}利き · ${player.heightCm}cm</span></div><div class="roster-overall">${rankBadgeHTML(player.ovr, '総合')}</div></div>
      <div class="roster-stats"><div><span>シュート</span>${rankBadgeHTML(player.shoot)}</div><div><span>パス</span>${rankBadgeHTML(player.pass)}</div><div><span>守備</span>${rankBadgeHTML(player.defend)}</div><div><span>速さ</span>${rankBadgeHTML(player.speed)}</div></div>
      <div class="roster-footer"><span>体力 ${staminaBar(player.stamina)}</span><button class="btn sm" data-action="selectPlayer" data-id="${player.id}">能力を見る →</button></div>
    </article>`;
  }).join('');
  return `${pageHead('SQUAD MANAGEMENT','選手一覧','能力はS〜Gで評価。「能力を見る」から詳細と見た目を確認できます。')}
    <div class="roster-toolbar"><label>表示 <select class="field" id="team-filter"><option value="all" ${filter === 'all' ? 'selected' : ''}>全選手</option><option value="starter" ${filter === 'starter' ? 'selected' : ''}>先発</option>${positions.map(pos => `<option value="${escapeHTML(pos)}" ${filter === pos ? 'selected' : ''}>${escapeHTML(pos)}</option>`).join('')}</select></label>
      <label>並び順 <select class="field" id="team-sort"><option value="lineup" ${rosterSort === 'lineup' ? 'selected' : ''}>登録順</option><option value="ovr" ${rosterSort === 'ovr' ? 'selected' : ''}>総合の高い順</option><option value="stamina" ${rosterSort === 'stamina' ? 'selected' : ''}>体力の高い順</option><option value="age" ${rosterSort === 'age' ? 'selected' : ''}>年齢の若い順</option></select></label>
      <span class="subtle">${list.length}人 · S 90以上 / A 80〜89 / B 70〜79 / C 60〜69 / D 50〜59 / E以下 49以下</span></div>
    <div class="roster-grid">${cards}</div>`;
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
  if (!event.target.closest('.appearance-editor')) return;
  const editor = event.target.closest('.appearance-editor');
  const player = state?.players.find(item => String(item.id) === editor.dataset.playerId);
  if (!player) return;
  const look = Object.fromEntries(['skin', 'hair', 'hairStyle', 'build', 'accessory'].map(key => [key, Number(document.getElementById(`appearance-${key}`).value)]));
  document.getElementById('appearance-preview').innerHTML = portraitSVG({ ...player, appearance: look }, true);
});

document.addEventListener('click', event => {
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
