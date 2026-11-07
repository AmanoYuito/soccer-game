/* Individual training controls and a persistent post-match growth report. */
const trainingThemes = {
  balanced: 'バランス', attack: '攻撃', defense: '守備',
  fitness: 'フィジカル', recovery: '回復'
};
const growthLabels = {
  ovr: '総合', shoot: 'シュート', pass: 'パス',
  defend: '守備', speed: 'スピード', stamina: '体力'
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
    return `<div class="growth-row">${portraitSVG(player)}<div class="growth-person"><strong>${escapeHTML(row.name)}</strong><small>${escapeHTML(row.pos)} · ${trainingThemes[row.training] || 'バランス'}</small></div><div class="growth-changes">${changes || '<span class="growth-none">今回は変化なし</span>'}</div></div>`;
  }).join('')}</div>`;
}

function training() {
  const rows = state.players.map((player, index) => `<div class="training-player">
    ${portraitSVG(player)}
    <div class="training-player-name"><strong>${escapeHTML(player.name)}</strong><small>${index < 11 ? '先発' : '控え'} · ${escapeHTML(player.pos)} · 総合 ${player.ovr}</small></div>
    <select class="field player-training-select" data-training-id="${player.id}" aria-label="${escapeHTML(player.name)}の練習">
      ${Object.entries(trainingThemes).map(([value, label]) => `<option value="${value}" ${playerTrainingTheme(player) === value ? 'selected' : ''}>${label}</option>`).join('')}
    </select>
  </div>`).join('');
  return `${pageHead('PLAYER DEVELOPMENT','個人練習','選手ごとに練習を選べます。変更は自動で保存され、次の試合後に反映されます。')}
    <div class="card card-pad"><div class="card-title"><h2>選手ごとの練習</h2><span>${state.players.length}人</span></div>
      <p class="subtle">攻撃はシュートとパス、守備は守備力、フィジカルはスピード、回復は体力を伸ばします。バランスは能力を幅広く鍛えます。</p>
      <div class="training-list">${rows}</div>
    </div>
    <div class="card card-pad growth-card"><div class="card-title"><h2>前節の能力上昇と体力の変化</h2><span>${state.lastGrowth ? `第${escapeHTML(state.lastGrowth.round)}節` : '試合後に表示'}</span></div>${growthReportHTML(state.lastGrowth)}</div>`;
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
  if (!event.target.closest('[data-action="openTrainingReport"]')) return;
  closeDialog();
  view = 'training';
  render();
});
