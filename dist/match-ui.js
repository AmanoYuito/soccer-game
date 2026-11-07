/* Match presentation and manager controls. The engine owns all positions and outcomes. */
let matchSeed = 0;
let matchCamera = 'full';
let matchWasPaused = false;
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
  const latest = match.events[match.events.length - 1];
  return `<div class="match-app">
    <div class="match-topline"><span>ASTERIA ${state.division} DIVISION <i></i> 第${state.round + 1}節</span><span class="match-live-dot">● LIVE MATCH</span></div>
    <div class="match-hud">
      <div class="hud-team ${match.ownSide === 0 ? 'hud-own' : ''}"><span class="hud-kit hud-kit-home">${escapeHTML(state.clubs[match.home].name.slice(0, 1))}</span><div><small>HOME</small><strong>${escapeHTML(state.clubs[match.home].name)}</strong></div></div>
      <div class="hud-center"><div class="hud-score"><span id="home-score">${match.hg}</span><b>:</b><span id="away-score">${match.ag}</span></div><div class="hud-clock" id="match-clock">${matchClock(match)}</div></div>
      <div class="hud-team hud-away ${match.ownSide === 1 ? 'hud-own' : ''}"><div><small>AWAY</small><strong>${escapeHTML(state.clubs[match.away].name)}</strong></div><span class="hud-kit hud-kit-away">${escapeHTML(state.clubs[match.away].name.slice(0, 1))}</span></div>
    </div>
    <div class="match-columns">
      <div class="match-primary">
        <div class="stadium-frame">
          <canvas id="match-canvas" class="stadium-canvas" width="960" height="540" aria-label="サッカーの試合画面"></canvas>
          <button class="stadium-corner-label" data-action="camera">${matchCamera === 'full' ? 'ボールを追う' : '全体を見る'} <span>↻</span></button>
          <div class="stadium-commentary ${latest?.goal && match.minute - latest.minute < 1 ? 'commentary-goal' : ''}" id="live-comment"><span class="commentary-minute">${latest?.minute ?? 0}′</span><span class="commentary-text">${escapeHTML(latest?.text || 'キックオフ！')}</span></div>
        </div>
        <div class="match-progress"><span>前半</span><div class="match-progress-track"><i id="match-progress-fill" style="width:${match.minute / 90 * 100}%"></i><b></b></div><span>後半</span></div>
        <div class="match-control-deck">
          <button class="deck-button deck-primary ${match.paused ? 'is-active' : ''}" data-action="pause" ${match.halftimePause ? 'disabled' : ''}>${match.paused ? '▶ 試合を再開' : 'Ⅱ 一時停止'}</button>
          <button class="deck-button" data-action="cycleSpeed">速度 ${match.speed}倍 ↻</button>
          <button class="deck-button deck-manager-button" data-action="managerMenu">⚑ 監督メニュー</button>
        </div>
      </div>
      <aside class="match-aside">
        <div class="match-aside-card"><div class="aside-heading"><span>試合データ</span><small>MATCH DATA</small></div><div class="stat-line"><span>シュート</span><strong id="shots">${match.shots[0]} - ${match.shots[1]}</strong></div><div class="stat-line"><span>支配率</span><strong id="possession">${match.possession}% - ${100 - match.possession}%</strong></div><div class="stat-line"><span>戦術</span><strong id="live-style">${styleLabel(state.style)}</strong></div><div class="stat-line"><span>交代</span><strong id="subs-status">${substitutions}${queued}</strong></div></div>
        <details class="match-aside-card stamina-card"><summary class="aside-heading"><span>選手の体力を見る</span><small>▼</small></summary><div class="match-stamina" id="match-stamina">${matchStaminaHTML(match)}</div></details>
        <details class="match-aside-card match-log-card"><summary class="aside-heading"><span>試合の記録を見る</span><small>▼</small></summary><div class="events" id="events">${eventHTML(match.events)}</div></details>
      </aside>
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
  matchCamera = window.matchMedia('(max-width:780px)').matches ? 'follow' : 'full';
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
  if ($('#home-score')) $('#home-score').textContent = match.hg;
  if ($('#away-score')) $('#away-score').textContent = match.ag;
  if ($('#match-clock')) $('#match-clock').textContent = matchClock(match);
  if ($('#events')) $('#events').innerHTML = eventHTML(match.events);
  if ($('#shots')) $('#shots').textContent = `${match.shots[0]} - ${match.shots[1]}`;
  if ($('#possession')) $('#possession').textContent = `${match.possession}% - ${100 - match.possession}%`;
  if ($('#live-style')) $('#live-style').textContent = styleLabel(state.style);
  if ($('#subs-status')) $('#subs-status').textContent = `${match.subsUsed}/5人 · ${match.windowsUsed}/3回${match.queuedSubs.length ? ` · 予約 ${match.queuedSubs.length}人` : ''}`;
  if ($('#match-stamina')) $('#match-stamina').innerHTML = matchStaminaHTML(match);
  if ($('#match-progress-fill')) $('#match-progress-fill').style.width = `${Math.min(100, match.minute / 90 * 100)}%`;
  const latest = match.events[match.events.length - 1];
  if ($('#live-comment') && latest) {
    $('#live-comment').innerHTML = `<span class="commentary-minute">${latest.minute}′</span><span class="commentary-text">${escapeHTML(latest.text)}</span>`;
    $('#live-comment').classList.toggle('commentary-goal', !!latest.goal && match.minute - latest.minute < 1);
  }
}

function drawMatch() {
  const canvas = $('#match-canvas');
  const match = activeMatch;
  if (!canvas || !match) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const pitch = { x: 44, y: 36, w: 872, h: 468 };
  const px = x => pitch.x + x / 105 * pitch.w;
  const py = y => pitch.y + y / 68 * pitch.h;
  const zoom = matchCamera === 'follow' ? 1.72 : 1;
  const focusX = clamp(px(match.ball.x), width / (2 * zoom), width - width / (2 * zoom));
  const focusY = clamp(py(match.ball.y), height / (2 * zoom), height - height / (2 * zoom));
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);

  // An original pixel stadium and pitch; no external game art is used.
  ctx.fillStyle = '#654538';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#2b3c34';
  ctx.fillRect(0, 0, width, 30);
  ctx.fillRect(0, height - 30, width, 30);
  const crowd = ['#d5c078', '#d85b48', '#6d9f93', '#e4d8aa', '#49615b'];
  for (let i = 0; i < 240; i++) {
    const x = (i * 83) % width;
    const y = i % 2 ? 5 + (i * 17) % 20 : height - 27 + (i * 13) % 20;
    ctx.fillStyle = crowd[i % crowd.length];
    ctx.fillRect(x, y, 4, 3);
  }
  ctx.fillStyle = '#b88455';
  ctx.fillRect(0, 28, width, 8);
  ctx.fillRect(0, height - 36, width, 8);
  ctx.fillStyle = '#244e35';
  ctx.fillRect(pitch.x - 5, pitch.y - 5, pitch.w + 10, pitch.h + 10);
  ctx.fillStyle = '#52923c';
  ctx.fillRect(pitch.x, pitch.y, pitch.w, pitch.h);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#65a449' : '#5d9c43';
    ctx.fillRect(pitch.x + i * pitch.w / 12, pitch.y, pitch.w / 12 + 1, pitch.h);
  }
  ctx.fillStyle = '#d8c65f';
  ctx.fillRect(pitch.x, pitch.y - 5, pitch.w, 5);
  ctx.fillRect(pitch.x, pitch.y + pitch.h, pitch.w, 5);
  ctx.strokeStyle = '#e6efc7';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(pitch.x + 4, pitch.y + 4, pitch.w - 8, pitch.h - 8);
  ctx.beginPath(); ctx.moveTo(px(52.5), pitch.y + 4); ctx.lineTo(px(52.5), pitch.y + pitch.h - 4); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(px(52.5), py(34), 54, 54, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(px(0) + 4, py(34 - 20), px(16.5) - px(0), py(40) - py(0));
  ctx.strokeRect(px(88.5), py(34 - 20), px(105) - px(88.5) - 4, py(40) - py(0));
  ctx.strokeRect(px(0) + 4, py(34 - 9), px(5.5) - px(0), py(18) - py(0));
  ctx.strokeRect(px(99.5), py(34 - 9), px(105) - px(99.5) - 4, py(18) - py(0));
  ctx.fillStyle = '#e6efc7';
  for (const x of [11, 52.5, 94]) { ctx.beginPath(); ctx.arc(px(x), py(34), 3, 0, Math.PI * 2); ctx.fill(); }
  for (const x of [pitch.x - 9, pitch.x + pitch.w + 1]) {
    ctx.fillStyle = '#d8e3d0';
    ctx.fillRect(x, py(34 - 4), 9, py(8) - py(0));
    ctx.fillStyle = '#91ad94';
    for (let n = 1; n < 4; n++) ctx.fillRect(x + n * 2, py(34 - 4), 1, py(8) - py(0));
  }

  const carrier = match.players.find(player => player.uid === match.ball.carrier);
  const dribbling = carrier && match.ball.dribbleUntil > match.seconds;
  if (dribbling) {
    const dir = carrier.side === 0 ? 1 : -1;
    const x = Math.round(px(carrier.x));
    const y = Math.round(py(carrier.y));
    ctx.fillStyle = '#f7e5a488';
    for (let i = 1; i <= 3; i++) ctx.fillRect(x - dir * (9 + i * 9), y + 2 + (i % 2) * 3, 8 - i, 3);
  }
  for (const player of [...match.players].sort((a, b) => a.y - b.y)) {
    const x = Math.round(px(player.x));
    const y = Math.round(py(player.y));
    const action = [...match.visualActions].reverse().find(item => item.uid === player.uid && item.until > match.seconds);
    const pose = action?.kind;
    const jump = ['header', 'catch', 'punch'].includes(pose) ? Math.max(0, Math.round(Math.sin(Math.min(1, (match.seconds - action.start) / (action.until - action.start)) * Math.PI) * 15)) : 0;
    const dir = player.side === 0 ? 1 : -1;
    const own = player.side === match.ownSide;
    const keeper = player.slot === 0;
    const stride = Math.abs(player.vx) + Math.abs(player.vy) > 1 ? Math.round(Math.sin(match.seconds * 15 + player.slot) * 2) : 0;
    const shirt = keeper ? '#e7ad46' : own ? '#f8f3dc' : '#cf5650';
    const trim = keeper ? '#65452a' : own ? '#275c8d' : '#f4d7aa';
    const shorts = own ? '#275c8d' : '#f0e4cf';
    ctx.fillStyle = '#173d2b80';
    ctx.beginPath(); ctx.ellipse(x, y + 11, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (carrier === player) {
      ctx.strokeStyle = '#fff49c';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 7, 15, 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff49c';
      ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x - 5, y - 30); ctx.lineTo(x + 5, y - 30); ctx.fill();
    }
    ctx.save();
    ctx.translate(0, -jump);
    if (pose === 'slide') {
      ctx.fillStyle = shorts;
      ctx.fillRect(x - dir * 9 - 6, y - 1, 17, 6);
      ctx.fillStyle = shirt;
      ctx.fillRect(x - 9, y - 7, 19, 9);
      ctx.fillStyle = '#d69d69';
      ctx.fillRect(x + dir * 10 - 4, y - 9, 8, 8);
      ctx.fillStyle = '#1d3340';
      ctx.fillRect(x + dir * 13, y + 1, 12, 3);
      ctx.fillStyle = '#e4cc91';
      ctx.fillRect(x - dir * 10, y + 9, 4, 2);
    } else {
    ctx.fillStyle = '#1d3340';
    ctx.fillRect(x - 7, y + 8 + stride, 5, 3);
    ctx.fillRect(x + 2, y + 8 - stride, 5, 3);
    ctx.fillStyle = shorts;
    ctx.fillRect(x - 6, y + 3, 5, 7 + stride);
    ctx.fillRect(x + 1, y + 3, 5, 7 - stride);
    ctx.fillStyle = '#d69d69';
    ctx.fillRect(x - 10, y - 7, 4, 9);
    ctx.fillRect(x + 6, y - 7, 4, 9);
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 8, y - 10, 16, 14);
    ctx.fillStyle = trim;
    ctx.fillRect(x - 8, y - 9, 16, 3);
    ctx.fillRect(x - 2, y - 6, 4, 8);
    ctx.fillStyle = '#d69d69';
    ctx.fillRect(x - 5, y - 18, 10, 9);
    ctx.fillStyle = '#293034';
    ctx.fillRect(x - 6, y - 20, 12, 4);
    ctx.fillRect(x - 6, y - 17, 2, 4);
    if (pose === 'pass' || pose === 'shot' || pose === 'tackle') {
      ctx.fillStyle = shorts;
      ctx.fillRect(x + dir * 5, y + 5, dir * 12, 4);
      ctx.fillStyle = '#1d3340';
      ctx.fillRect(x + dir * 14, y + 6, dir * 5, 3);
    }
    if (jump) {
      ctx.fillStyle = '#d69d69';
      ctx.fillRect(x - 11, y - 21, 4, 13);
      ctx.fillRect(x + 7, y - 21, 4, 13);
      if (pose === 'punch') ctx.fillRect(x + dir * 8, y - 29, 5, 9);
    }
    }
    ctx.restore();
    if (carrier === player && matchCamera === 'follow') {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const name = player.name.split(' ')[0];
      const textWidth = ctx.measureText(name).width;
      ctx.fillStyle = '#163a2cee';
      ctx.fillRect(x - textWidth / 2 - 5, y - 47, textWidth + 10, 15);
      ctx.fillStyle = '#fff8dd';
      ctx.fillText(name, x, y - 36);
    }
  }
  if (match.highlight && match.seconds < match.highlight.until) {
    const flash = match.highlight;
    const x = Math.round(px(flash.x));
    const y = Math.round(py(flash.y));
    const life = (flash.until - match.seconds) / (flash.kind === 'tackle' ? 1.4 : 1.15);
    ctx.strokeStyle = '#ffe276';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 12 + (1 - life) * 19, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (match.ball.trail?.length && (dribbling || !carrier)) {
    ctx.fillStyle = '#fff9cf88';
    for (const [i, dot] of match.ball.trail.entries()) {
      const size = 2 + Math.round(i / 2);
      ctx.fillRect(Math.round(px(dot.x)) - size / 2, Math.round(py(dot.y)) - size / 2, size, size);
    }
  }
  const bx = Math.round(px(match.ball.x));
  const by = Math.round(py(match.ball.y));
  const flight = match.ball.airborneUntil > match.seconds && match.ball.flightDuration > 0
    ? Math.sin(Math.PI * (match.seconds - match.ball.flightStart) / match.ball.flightDuration) * 21 : 0;
  const holdAction = carrier && [...match.visualActions].reverse().find(item => item.uid === carrier.uid && item.until > match.seconds);
  const heldHeight = holdAction && ['header', 'catch'].includes(holdAction.kind) ? 17 : 0;
  const ballY = by - Math.max(0, Math.round(flight), heldHeight);
  ctx.fillStyle = '#21432b88';
  ctx.fillRect(bx - 4, by + 3, 9, 3);
  ctx.fillStyle = '#fffdf1';
  ctx.fillRect(bx - 5, ballY - 5, 10, 10);
  ctx.fillStyle = '#243b34';
  ctx.fillRect(bx - 1, ballY - 1, 3, 3);
  ctx.restore();
}

function showHalftimeDialog() {
  showDialog(`<div class="eyebrow">HALF TIME</div><h2>ハーフタイム</h2><p>後半の指示を出せます。ここでの交代は交代機会に数えません。</p><div class="btn-row"><button class="btn" data-action="substitute">選手交代</button><button class="btn" data-action="matchTactics">戦術変更</button><button class="btn primary" data-action="resumeHalf">後半開始 →</button></div>`);
}

function showManagerMenu() {
  if (!activeMatch) return;
  matchWasPaused = activeMatch.paused;
  activeMatch.paused = true;
  render();
  const noSubs = activeMatch.subsUsed >= 5 || (activeMatch.windowsUsed >= 3 && !activeMatch.halftimePause);
  showDialog(`<div class="eyebrow">MANAGER MENU</div><h2>監督メニュー</h2><p>試合に指示を出します。</p><div class="manager-menu-actions"><button class="btn" data-action="matchTactics">⚑ 戦術を変える</button><button class="btn" data-action="substitute" ${noSubs ? 'disabled' : ''}>⇄ 選手を交代する</button></div><div class="btn-row" style="margin-top:18px"><button class="btn primary" data-action="cancelMatchDialog">▶ 試合に戻る</button></div>`);
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
  const report = [];
  for (const player of state.players) {
    const before = Object.fromEntries(['ovr', 'shoot', 'pass', 'defend', 'speed', 'stamina'].map(key => [key, player[key]]));
    const theme = playerTrainingTheme(player);
    const current = match.players.find(onField => onField.sourceId === player.id && onField.side === match.ownSide);
    const exitStamina = match.exitStamina[player.id];
    const matchStamina = current ? current.stamina : exitStamina;
    if (appeared.has(player.id) && matchStamina !== undefined) player.stamina = Math.round(matchStamina);
    player.stamina = clamp(player.stamina + rand(7, 13) + (theme === 'recovery' ? 18 : theme === 'fitness' ? 8 : 0), 35, 100);
    player.form = clamp(player.form + rand(-5, 5) + (appeared.has(player.id) ? 1 : 0), 40, 100);
    player.morale = clamp(player.morale + rand(-2, 3), 40, 100);
    const growth = (player.age < 23 ? 12 : player.age < 28 ? 8 : 4) * (1 + state.facilities.training * .16) * (theme === 'recovery' ? .4 : 1);
    player.xp += growth * (appeared.has(player.id) ? 1.2 : .8);
    if (player.xp >= 100 && player.ovr < player.potential) { player.xp -= 100; player.ovr++; gained++; }
    if (theme === 'attack') {
      player.shoot = clamp(player.shoot + rand(1, 2), 1, 100);
      player.pass = clamp(player.pass + rand(0, 1), 1, 100);
    } else if (theme === 'defense') {
      player.defend = clamp(player.defend + rand(1, 2), 1, 100);
    } else if (theme === 'fitness') {
      player.speed = clamp(player.speed + rand(1, 2), 1, 100);
    } else if (theme === 'balanced') {
      const focus = ['shoot', 'pass', 'defend', 'speed'][rand(0, 3)];
      player[focus] = clamp(player[focus] + 1, 1, 100);
    }
    report.push({
      id: player.id, name: player.name, pos: player.pos, training: theme,
      changes: Object.fromEntries(Object.keys(before).map(key => [key, player[key] - before[key]]))
    });
  }
  if (gained) addNews(`${gained}人の選手の総合能力が上昇しました。`);
  return report;
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
  state.lastGrowth = { round: state.round + 1, players: applyTraining(match) };
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
  showDialog(`<div class="eyebrow">FULL TIME</div><h2>試合終了</h2><div class="summary-score">${escapeHTML(result.home)} ${match.hg} - ${match.ag} ${escapeHTML(result.away)}</div><p>シュート ${match.shots[0]} - ${match.shots[1]} · 支配率 ${match.possession}% - ${100 - match.possession}%<br>交代 ${match.subsUsed}人 · 現在の順位 ${sortedTable().findIndex(team => team.id === 0) + 1}位 / 12クラブ</p><h3 class="growth-title">選手ごとの能力上昇と体力の変化</h3><p class="growth-hint">全${state.lastGrowth.players.length}人。枠内をスクロールして確認できます。</p>${growthReportHTML(state.lastGrowth)}<div class="btn-row" style="margin-top:18px"><button class="btn primary" data-action="closeDialog">ホームへ戻る →</button><button class="btn" data-action="openTrainingReport">育成画面で見る</button></div>`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || !activeMatch) return;
  const action = button.dataset.action;
  if (action === 'camera') {
    matchCamera = matchCamera === 'full' ? 'follow' : 'full';
    render();
  }
  if (action === 'cycleSpeed') {
    activeMatch.speed = activeMatch.speed === 1 ? 2 : activeMatch.speed === 2 ? 4 : 1;
    render();
  }
  if (action === 'managerMenu') showManagerMenu();
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
    else { activeMatch.paused = matchWasPaused; render(); }
    showToast(halftime ? '交代を実行しました' : '次のプレー停止時に交代します');
  }
  if (action === 'applyMatchTactics') {
    state.style = $('#live-style-select').value;
    state.press = Number($('#live-press').value);
    persist();
    closeDialog();
    if (activeMatch.halftimePause) { render(); showHalftimeDialog(); }
    else { activeMatch.paused = matchWasPaused; render(); }
    showToast('戦術を変更しました');
  }
  if (action === 'cancelMatchDialog') {
    closeDialog();
    if (activeMatch.halftimePause) { render(); showHalftimeDialog(); }
    else { activeMatch.paused = matchWasPaused; render(); }
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
