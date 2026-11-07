/* Match presentation and manager controls. The engine owns all positions and outcomes. */
let matchSeed = 0;
function matchRandom() {
  let value = matchSeed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  matchSeed = value | 0;
  return (value >>> 0) / 4294967296;
}

function matchClock(match) {
  if (match.halftimePause) return '45′ ハーフタイム';
  return `${Math.floor(match.minute)}′ ${match.paused ? '一時停止' : '試合中'}`;
}

function matchStaminaHTML(match) {
  return match.players
    .filter(player => player.side === match.ownSide)
    .sort((a, b) => a.slot - b.slot)
    .map(player => `<div class="match-stamina-row"><span>${player.number} ${escapeHTML(player.name)}</span><span class="bar ${player.stamina < 40 ? 'low' : ''}"><i style="width:${Math.round(player.stamina)}%"></i></span><b>${Math.round(player.stamina)}</b></div>`)
    .join('');
}

function matchView() {
  if (!activeMatch) return home();
  const match = activeMatch;
  const substitutions = `${match.subsUsed}/5人 · ${match.windowsUsed}/3回`;
  const queued = match.queuedSubs.length ? ` · 予約 ${match.queuedSubs.length}人` : '';
  return `${pageHead('LIVE MATCH', `第${state.round + 1}節 · 試合観戦`, '選手は自律的にプレーします。監督として戦術と交代を指示できます。')}
    <div class="match-layout">
      <div class="card card-pad">
        <div class="match-score"><div class="side">${escapeHTML(state.clubs[match.home].name)}</div><div class="score" id="score">${match.hg} - ${match.ag}</div><div class="side">${escapeHTML(state.clubs[match.away].name)}</div></div>
        <div class="match-clock" id="match-clock">${matchClock(match)}</div>
        <canvas id="match-canvas" class="field-canvas" width="760" height="430" aria-label="サッカーの試合画面"></canvas>
        <div class="btn-row" style="margin-top:15px">
          <button class="btn ${match.paused ? 'primary' : ''}" data-action="pause" ${match.halftimePause ? 'disabled' : ''}>${match.paused ? '▶ 再開' : 'Ⅱ 一時停止'}</button>
          ${[1, 2, 4].map(speed => `<button class="btn ${match.speed === speed ? 'primary' : ''}" data-action="speed" data-id="${speed}">×${speed}</button>`).join('')}
          <button class="btn" data-action="matchTactics">戦術変更</button>
          <button class="btn" data-action="substitute" ${match.subsUsed >= 5 || (match.windowsUsed >= 3 && !match.halftimePause) ? 'disabled' : ''}>選手交代</button>
        </div>
      </div>
      <div class="panel-stack">
        ${card('実況', `<div class="events" id="events">${eventHTML(match.events)}</div>`)}
        ${card('試合データ', `<div class="news-list"><div class="news-item">シュート　<b id="shots">${match.shots[0]} - ${match.shots[1]}</b></div><div class="news-item">支配率　<b id="possession">${match.possession}% - ${100 - match.possession}%</b></div><div class="news-item">戦術　<b id="live-style">${styleLabel(state.style)}</b></div><div class="news-item">交代　<b id="subs-status">${substitutions}${queued}</b></div></div>`)}
        ${card('選手のスタミナ', `<div class="match-stamina" id="match-stamina">${matchStaminaHTML(match)}</div>`)}
      </div>
    </div>`;
}

function eventHTML(events) {
  return [...events].reverse().map(item => `<div class="event ${item.goal ? 'goal' : ''}"><div class="minute">${item.minute}′</div>${escapeHTML(item.text)}</div>`).join('');
}

function startMatch() {
  if (activeMatch || !ownFixture()) return;
  const fixture = ownFixture();
  if (starters().length !== 11 || starters().filter(player => player.pos === 'GK').length !== 1) {
    showToast('先発は11人、GKは1人にしてください。');
    return;
  }
  const opponentId = fixture[0] === 0 ? fixture[1] : fixture[0];
  matchSeed = state.seed;
  activeMatch = MatchEngine.create({
    home: fixture[0],
    away: fixture[1],
    ownPlayers: starters(),
    formation: state.formation,
    opponentStrength: state.clubs[opponentId].strength,
    random: matchRandom
  });
  view = 'match';
  render();
  clearInterval(matchTimer);
  matchTimer = setInterval(tickMatch, 100);
}

function tickMatch() {
  const match = activeMatch;
  if (!match || match.paused) return;
  const wasHalftime = match.halftime;
  for (let i = 0; i < 3 * match.speed && !match.finished; i++) {
    MatchEngine.step(match, matchRandom, { style: state.style, press: state.press, tempo: state.tempo });
  }
  if (!wasHalftime && match.halftime) {
    match.paused = true;
    match.halftimePause = true;
    render();
    showHalftimeDialog();
    return;
  }
  drawMatch();
  updateMatchUI();
  if (match.finished) finishMatch();
}

function updateMatchUI() {
  const match = activeMatch;
  if (!match) return;
  if ($('#score')) $('#score').textContent = `${match.hg} - ${match.ag}`;
  if ($('#match-clock')) $('#match-clock').textContent = matchClock(match);
  if ($('#events')) $('#events').innerHTML = eventHTML(match.events);
  if ($('#shots')) $('#shots').textContent = `${match.shots[0]} - ${match.shots[1]}`;
  if ($('#possession')) $('#possession').textContent = `${match.possession}% - ${100 - match.possession}%`;
  if ($('#live-style')) $('#live-style').textContent = styleLabel(state.style);
  if ($('#subs-status')) $('#subs-status').textContent = `${match.subsUsed}/5人 · ${match.windowsUsed}/3回${match.queuedSubs.length ? ` · 予約 ${match.queuedSubs.length}人` : ''}`;
  if ($('#match-stamina')) $('#match-stamina').innerHTML = matchStaminaHTML(match);
}

function drawMatch() {
  const canvas = $('#match-canvas');
  const match = activeMatch;
  if (!canvas || !match) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const px = x => 22 + x / 105 * (width - 44);
  const py = y => 22 + y / 68 * (height - 44);

  ctx.fillStyle = '#176248';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff08' : '#00000008';
    ctx.fillRect(0, i * height / 10, width, height / 10);
  }
  ctx.strokeStyle = '#d9f3d0aa';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, width - 44, height - 44);
  ctx.beginPath(); ctx.moveTo(width / 2, 22); ctx.lineTo(width / 2, height - 22); ctx.stroke();
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(22, height / 2 - 87, 94, 174);
  ctx.strokeRect(width - 116, height / 2 - 87, 94, 174);
  ctx.strokeRect(22, height / 2 - 38, 35, 76);
  ctx.strokeRect(width - 57, height / 2 - 38, 35, 76);
  ctx.fillStyle = '#e6f7db';
  ctx.beginPath(); ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2); ctx.fill();

  for (const player of match.players) {
    const x = px(player.x);
    const y = py(player.y);
    const own = player.side === match.ownSide;
    ctx.fillStyle = '#07191bb0';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 9, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = own ? '#d4f584' : '#ef9d78';
    ctx.fillRect(x - 7, y - 9, 14, 15);
    ctx.fillStyle = own ? '#163328' : '#512c28';
    ctx.fillRect(x - 6, y + 6, 5, 6);
    ctx.fillRect(x + 1, y + 6, 5, 6);
    ctx.fillStyle = '#172b2a';
    ctx.beginPath(); ctx.arc(x, y - 11, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = own ? '#183024' : '#4a2927';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.number, x, y + 2);
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px(match.ball.x), py(match.ball.y), 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#263a36'; ctx.lineWidth = 1; ctx.stroke();
}

function showHalftimeDialog() {
  showDialog(`<div class="eyebrow">HALF TIME</div><h2>ハーフタイム</h2><p>後半の指示を出せます。ここでの交代は交代機会に数えません。</p><div class="btn-row"><button class="btn" data-action="substitute">選手交代</button><button class="btn" data-action="matchTactics">戦術変更</button><button class="btn primary" data-action="resumeHalf">後半開始 →</button></div>`);
}

function showSubDialog() {
  const match = activeMatch;
  if (!match) return;
  const onField = match.players.filter(player => player.side === match.ownSide).sort((a, b) => a.slot - b.slot);
  const bench = state.players.filter(player => !match.appeared.includes(player.id) && !match.queuedSubs.some(sub => sub.inPlayer.id === player.id));
  if (!bench.length) { showToast('交代できる控え選手がいません。'); return; }
  match.paused = true;
  closeDialog();
  render();
  showDialog(`<div class="eyebrow">SUBSTITUTION</div><h2>選手交代</h2><p>交代は次のプレー停止時に実行します。最大5人、交代機会は3回です。</p><label class="label">下げる選手</label><select class="field" id="sub-out" style="width:100%">${onField.filter(player => !match.queuedSubs.some(sub => sub.outId === player.sourceId)).map(player => `<option value="${player.sourceId}">${escapeHTML(player.name)} · ${player.pos} · 体力${Math.round(player.stamina)}</option>`).join('')}</select><label class="label" style="margin-top:15px">入れる選手</label><select class="field" id="sub-in" style="width:100%">${bench.map(player => `<option value="${player.id}">${escapeHTML(player.name)} · ${player.pos} · OVR${player.ovr}</option>`).join('')}</select><div class="btn-row" style="margin-top:20px"><button class="btn primary" data-action="queueSub">交代を予約</button><button class="btn" data-action="cancelMatchDialog">閉じる</button></div><p class="subtle">予約中 ${match.queuedSubs.length}人 · 実行済み ${match.subsUsed}人</p>`);
}

function showTacticDialog() {
  if (!activeMatch) return;
  activeMatch.paused = true;
  closeDialog();
  render();
  showDialog(`<div class="eyebrow">MANAGER INSTRUCTION</div><h2>試合中の戦術</h2><p>指示は選手の判断と動きにすぐ反映されます。</p><label class="label">攻撃方針</label><select class="field" id="live-style-select" style="width:100%"><option value="balanced" ${state.style === 'balanced' ? 'selected' : ''}>バランス</option><option value="possession" ${state.style === 'possession' ? 'selected' : ''}>ポゼッション</option><option value="counter" ${state.style === 'counter' ? 'selected' : ''}>カウンター</option></select><label class="label" style="margin-top:15px">プレス強度 <b id="live-press-value">${state.press}</b></label><input id="live-press" type="range" min="0" max="100" value="${state.press}" style="width:100%;accent-color:#d3f576"><div class="btn-row" style="margin-top:20px"><button class="btn primary" data-action="applyMatchTactics">指示を適用</button><button class="btn" data-action="cancelMatchDialog">閉じる</button></div>`);
}

function applyTraining(match) {
  let gained = 0;
  const appeared = new Set(match.appeared);
  for (const player of state.players) {
    const current = match.players.find(onField => onField.sourceId === player.id && onField.side === match.ownSide);
    const exitStamina = match.exitStamina[player.id];
    const matchStamina = current ? current.stamina : exitStamina;
    if (appeared.has(player.id) && matchStamina !== undefined) player.stamina = Math.round(matchStamina);
    player.stamina = clamp(player.stamina + rand(7, 13) + (state.training === 'recovery' ? 18 : 0), 35, 100);
    player.form = clamp(player.form + rand(-5, 5) + (appeared.has(player.id) ? 1 : 0), 40, 100);
    player.morale = clamp(player.morale + rand(-2, 3), 40, 100);
    const growth = (player.age < 23 ? 12 : player.age < 28 ? 8 : 4) * (1 + state.facilities.training * .16) * (state.training === 'recovery' ? .4 : 1);
    player.xp += growth * (appeared.has(player.id) ? 1.2 : .8);
    if (player.xp >= 100 && player.ovr < player.potential) { player.xp -= 100; player.ovr++; gained++; }
    if (state.training === 'attack') { player.shoot = clamp(player.shoot + rand(0, 1), 1, 100); player.pass = clamp(player.pass + rand(0, 1), 1, 100); }
    if (state.training === 'defense') player.defend = clamp(player.defend + rand(0, 1), 1, 100);
    if (state.training === 'fitness') player.speed = clamp(player.speed + rand(0, 1), 1, 100);
  }
  if (gained) addNews(`${gained}人の選手の総合能力が上昇しました。`);
}

function finishMatch() {
  const match = activeMatch;
  if (!match || match.committed) return;
  match.committed = true;
  clearInterval(matchTimer);
  state.seed = matchSeed;
  updateTable(match.home, match.away, match.hg, match.ag);
  for (const [home, away] of state.fixtures[state.round]) {
    if (home === match.home && away === match.away) continue;
    const [hg, ag] = aiResult(home, away);
    updateTable(home, away, hg, ag);
  }
  for (const id of new Set(match.appeared)) {
    const player = state.players.find(item => item.id === id);
    if (player) player.apps++;
  }
  for (const id of match.goalScorers) {
    const player = state.players.find(item => item.id === id);
    if (player) player.goals++;
  }
  applyTraining(match);
  const ownGoals = match.ownSide === 0 ? match.hg : match.ag;
  const opponentGoals = match.ownSide === 0 ? match.ag : match.hg;
  const won = ownGoals > opponentGoals;
  state.cash += Math.round((match.home === 0 ? state.fans * .04 * state.facilities.stadium : 120) + 120 - state.players.length * 12);
  state.fans = clamp(state.fans + (won ? rand(45, 130) : ownGoals === opponentGoals ? rand(-15, 45) : rand(-85, 5)), 500, 30000);
  const result = { round: state.round + 1, home: state.clubs[match.home].name, away: state.clubs[match.away].name, hg: match.hg, ag: match.ag };
  state.results.unshift(result);
  state.lastMatch = result;
  addNews(`第${state.round + 1}節 ${result.home} ${match.hg}-${match.ag} ${result.away}。${won ? '勝利で勝点3を獲得！' : ownGoals === opponentGoals ? '勝点1を獲得。' : '次節での巻き返しを狙います。'}`);
  state.round++;
  activeMatch = null;
  view = 'home';
  persist();
  render();
  showDialog(`<div class="eyebrow">FULL TIME</div><h2>試合終了</h2><div class="summary-score">${escapeHTML(result.home)} ${match.hg} - ${match.ag} ${escapeHTML(result.away)}</div><p>シュート ${match.shots[0]} - ${match.shots[1]} · 支配率 ${match.possession}% - ${100 - match.possession}%<br>交代 ${match.subsUsed}人 · 現在の順位 ${sortedTable().findIndex(team => team.id === 0) + 1}位 / 12クラブ</p><button class="btn primary" data-action="closeDialog">ホームへ戻る →</button>`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || !activeMatch) return;
  const action = button.dataset.action;
  if (action === 'substitute') showSubDialog();
  if (action === 'matchTactics') showTacticDialog();
  if (action === 'queueSub') {
    const outId = Number($('#sub-out')?.value);
    const inPlayer = state.players.find(player => player.id === Number($('#sub-in')?.value));
    if (!inPlayer) return;
    const error = MatchEngine.queueSub(activeMatch, outId, inPlayer);
    if (error) { showToast(error); return; }
    const halftime = activeMatch.halftimePause;
    if (halftime) MatchEngine.applyQueuedSubs(activeMatch, true);
    closeDialog();
    if (halftime) { render(); showHalftimeDialog(); }
    else { activeMatch.paused = false; render(); }
    showToast(halftime ? '交代を実行しました' : '次のプレー停止時に交代します');
  }
  if (action === 'applyMatchTactics') {
    state.style = $('#live-style-select').value;
    state.press = Number($('#live-press').value);
    persist();
    closeDialog();
    if (activeMatch.halftimePause) { render(); showHalftimeDialog(); }
    else { activeMatch.paused = false; render(); }
    showToast('戦術を変更しました');
  }
  if (action === 'cancelMatchDialog') {
    closeDialog();
    if (activeMatch.halftimePause) { render(); showHalftimeDialog(); }
    else { activeMatch.paused = false; render(); }
  }
  if (action === 'resumeHalf') {
    closeDialog();
    activeMatch.halftimePause = false;
    activeMatch.paused = false;
    render();
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'live-press' && $('#live-press-value')) $('#live-press-value').textContent = event.target.value;
});
