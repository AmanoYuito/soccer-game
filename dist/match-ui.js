/* Match presentation and manager controls. The engine owns all positions and outcomes. */
let matchSeed = 0;
let matchCamera = 'diagonal';
let matchWasPaused = false;
let matchInfoTab = 'bench';
let selectedMatchSubOutId = null;
let lastMatchBenchTick = -30;
let replayFrames = [];
let goalReplay = null;
let replayTimer = null;
let replayHoldTimer = null;
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

function matchTrayHTML(match) {
  if (matchInfoTab === 'stats') return `<div class="match-tray-stats"><div><span>シュート</span><strong id="shots">${match.shots[0]} - ${match.shots[1]}</strong></div><div><span>支配率</span><strong id="possession">${match.possession}% - ${100 - match.possession}%</strong></div><div><span>突破</span><strong id="skill-moves">${match.actionCounts.feints}回 / 股抜き${match.actionCounts.nutmegs}回</strong></div><div><span>戦術</span><strong id="live-style">${styleLabel(state.style)}</strong></div><div><span>交代</span><strong id="subs-status">${match.subsUsed}/5人 · ${match.windowsUsed}/3回</strong></div></div>`;
  if (matchInfoTab === 'log') return `<div class="match-tray-log" id="events">${eventHTML(match.events.slice(-14)) || '<p>キックオフを待っています。</p>'}</div>`;
  const onField = match.players.filter(player => player.side === match.ownSide).sort((a, b) => a.slot - b.slot);
  const bench = state.players.filter(player => !match.appeared.includes(player.id));
  const selected = onField.find(player => player.sourceId === selectedMatchSubOutId);
  const canSub = match.subsUsed + match.queuedSubs.length < 5 && (match.windowsUsed < 3 || match.halftimePause);
  const tile = (player, reserve) => {
    const queued = match.queuedSubs.some(sub => reserve ? sub.inPlayer.id === player.id : sub.outId === player.sourceId);
    const compatible = selected && (selected.pos === 'GK') === (player.pos === 'GK');
    const disabled = !canSub || queued || (reserve && !compatible);
    const action = reserve ? 'confirmMatchSub' : 'selectMatchSub';
    const label = queued ? '予約済' : reserve ? '入れる' : player.sourceId === selectedMatchSubOutId ? '選択中' : '交代';
    return `<button class="match-bench-player ${player.sourceId === selectedMatchSubOutId && !reserve ? 'selected' : ''}" data-action="${action}" data-id="${reserve ? player.id : player.sourceId}" ${disabled ? 'disabled' : ''} aria-label="${escapeHTML(player.name)} ${label}">${portraitSVG(player)}<span class="match-bench-person"><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.pos)} · #${player.number} · 体力${Math.round(player.stamina)}%</small>${specialAbilityBadges(player, 1)}<span class="match-bench-stamina ${player.stamina < 45 ? 'low' : ''}"><i style="width:${Math.round(player.stamina)}%"></i></span></span><b class="match-bench-action">${label}</b></button>`;
  };
  const hint = !canSub ? '交代枠または交代機会を使い切りました。' : selected
    ? `${escapeHTML(selected.name)}に代わる控えを選んでください。${selected.pos === 'GK' ? 'GK同士で交代できます。' : ''}`
    : '交代したいピッチ上の選手を選び、次に控えを選んでください。';
  return `<div class="match-bench-groups"><p class="match-swap-hint">⇄ ${hint}${match.halftimePause ? ' ハーフタイム中はすぐ交代します。' : ' 試合中は次のプレー停止時に交代します。'}</p><div><h3>ピッチの11人</h3><div class="match-bench-grid">${onField.map(player => tile(player, false)).join('')}</div></div><div><h3>控え</h3><div class="match-bench-grid">${bench.map(player => tile(player, true)).join('') || '<p class="match-bench-empty">交代できる控えはいません。</p>'}</div></div></div>`;
}

function matchView() {
  if (!activeMatch) return home();
  const match = activeMatch;
  const latest = match.events[match.events.length - 1];
  return `<div class="match-app">
    <div class="match-topline"><span>ASTERIA ${state.division} DIVISION <i></i> 第${state.round + 1}節</span><span class="match-live-dot">● LIVE MATCH</span></div>
    <div class="match-hud">
      <div class="hud-team ${match.ownSide === 0 ? 'hud-own' : ''}"><span class="hud-kit hud-kit-home">${escapeHTML(state.clubs[match.home].name.slice(0, 1))}</span><div><small>HOME</small><strong>${escapeHTML(state.clubs[match.home].name)}</strong></div></div>
      <div class="hud-center"><div class="hud-score"><span id="home-score">${match.hg}</span><b>:</b><span id="away-score">${match.ag}</span></div><div class="hud-clock" id="match-clock">${matchClock(match)}</div></div>
      <div class="hud-team hud-away ${match.ownSide === 1 ? 'hud-own' : ''}"><div><small>AWAY</small><strong>${escapeHTML(state.clubs[match.away].name)}</strong></div><span class="hud-kit hud-kit-away">${escapeHTML(state.clubs[match.away].name.slice(0, 1))}</span></div>
    </div>
    <div class="match-columns"><div class="match-primary">
      <div class="stadium-frame"><canvas id="match-canvas" class="stadium-canvas" width="960" height="540" aria-label="サッカーの試合画面"></canvas>
        <div class="stadium-camera" role="group" aria-label="カメラ視点">${[['diagonal','斜め'],['follow','追従'],['full','全体']].map(([mode,label]) => `<button data-action="camera" data-mode="${mode}" class="${matchCamera === mode ? 'active' : ''}" aria-pressed="${matchCamera === mode}">${label}</button>`).join('')}</div>
        <div class="stadium-commentary ${latest?.goal && match.minute - latest.minute < 1 ? 'commentary-goal' : ''}" id="live-comment"><span class="commentary-minute">${latest?.minute ?? 0}′</span><span class="commentary-text">${escapeHTML(latest?.text || 'キックオフ！')}</span></div>
      </div>
      <div class="match-progress"><span>前半</span><div class="match-progress-track"><i id="match-progress-fill" style="width:${match.minute / 90 * 100}%"></i><b></b></div><span>後半</span></div>
      <div class="match-control-deck"><button class="deck-button deck-primary ${match.paused ? 'is-active' : ''}" data-action="${match.halftimePause ? 'resumeHalf' : 'pause'}">${match.halftimePause ? '▶ 後半開始' : match.paused ? '▶ 試合を再開' : 'Ⅱ 一時停止'}</button><button class="deck-button" data-action="cycleSpeed">速度 ${match.speed}倍 ↻</button><button class="deck-button deck-manager-button" data-action="matchTactics">⚑ 戦術変更</button></div>
      <p class="match-help">選手は自動でプレーします。監督は速度・戦術・交代を選べます。ゴール後はリプレイを再生します。</p>
    </div></div>
    <section class="match-tray" aria-label="試合情報"><div class="match-tray-top"><div><small>COACH'S BENCH</small><h2>監督席</h2></div><div class="match-tray-tabs">${[['bench','ベンチ'],['stats','試合情報'],['log','試合記録']].map(([id,label]) => `<button data-action="matchTab" data-tab="${id}" class="${matchInfoTab === id ? 'active' : ''}" aria-pressed="${matchInfoTab === id}">${label}</button>`).join('')}</div></div><div id="match-tray-content">${matchTrayHTML(match)}</div></section>
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
  matchInfoTab = 'bench';
  selectedMatchSubOutId = null;
  lastMatchBenchTick = -30;
  replayFrames = [];
  closeGoalReplay(false);
  matchCamera = 'diagonal';
  activeMatch = MatchEngine.create({
    home: fixture[0],
    away: fixture[1],
    ownPlayers: starters(),
    formation: state.formation,
    opponentStrength: state.clubs[opponentId].strength,
    opponentPlayers: scoutingRoster(),
    random: matchRandom
  });
  view = 'match';
  render();
  window.scrollTo(0, 0);
  clearInterval(matchTimer);
  matchTimer = setInterval(tickMatch, 100);
}

function tickMatch() {
  const match = activeMatch;
  if (!match || match.paused) return;
  const wasHalftime = match.halftime;
  let scored = false;
  for (let i = 0; i < 3 * match.speed && !match.finished; i++) {
    const score = match.hg + match.ag;
    MatchEngine.step(match, matchRandom, { style: state.style, press: state.press, tempo: state.tempo });
    if (match.hg + match.ag > score) {
      replayFrames.push(match.goalMoment);
      scored = true;
      break;
    }
    if (match.tick % 2 === 0) captureReplayFrame(match);
  }
  if (scored) {
    if (!wasHalftime && match.halftime) match.halftimePause = true;
    drawMatch();
    updateMatchUI();
    startGoalReplay(match);
    return;
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

function captureReplayFrame(match) {
  replayFrames.push({
    seconds: match.seconds, minute: match.minute, ownSide: match.ownSide,
    players: match.players.map(player => ({ ...player, appearance: player.appearance ? { ...player.appearance } : null })),
    ball: { ...match.ball, trail: match.ball.trail.map(dot => ({ ...dot })) },
    visualActions: match.visualActions.map(action => ({ ...action })),
    highlight: match.highlight ? { ...match.highlight } : null,
    goalFlash: match.goalFlash ? { ...match.goalFlash } : null
  });
  if (replayFrames.length > 120) replayFrames.shift();
}

function startGoalReplay(match) {
  closeGoalReplay(false);
  const moment = match.goalMoment;
  if (!moment) return;
  const scorer = moment.players.find(player => player.uid === moment.ball.shooter);
  const assistant = moment.assistUid ? moment.players.find(player => player.uid === moment.assistUid) : null;
  const frames = replayFrames.filter(frame => frame && frame.seconds >= moment.seconds - 7 && frame.seconds <= moment.seconds);
  if (!frames.length || frames[frames.length - 1] !== moment) frames.push(moment);
  const wasPaused = match.paused;
  match.paused = true;
  goalReplay = { frames, index: 0, wasPaused };
  const overlay = document.createElement('div');
  overlay.className = 'goal-replay';
  overlay.id = 'goal-replay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'ゴールリプレイ');
  overlay.innerHTML = `<div class="replay-card"><div class="replay-heading"><div class="replay-title"><small>GOAL! · REPLAY</small><h2>ゴールリプレイ</h2><div class="replay-credits"><div class="replay-credit">${scorer ? portraitSVG(scorer, true) : ''}<span><small>得点者</small><strong>${escapeHTML(moment.scorerName)}</strong></span></div>${assistant ? `<div class="replay-credit">${portraitSVG(assistant, true)}<span><small>アシスト</small><strong>${escapeHTML(moment.assistName)}</strong></span></div>` : ''}</div></div><div class="replay-score">${match.hg}<span>–</span>${match.ag}</div></div><canvas id="replay-canvas" width="960" height="540" aria-label="得点直前のリプレイ映像"></canvas><div class="replay-footer"><div class="replay-progress"><i id="replay-progress-fill"></i></div><span>自動で試合に戻ります</span><button class="replay-skip" data-action="skipReplay">▶ 試合へ戻る</button></div></div>`;
  document.body.append(overlay);
  overlay.querySelector('.replay-skip')?.focus();
  const canvas = overlay.querySelector('#replay-canvas');
  const drawFrame = () => {
    if (!goalReplay) return;
    const index = Math.min(goalReplay.index, goalReplay.frames.length - 1);
    drawMatch(goalReplay.frames[index], canvas, 'follow');
    const progress = overlay.querySelector('#replay-progress-fill');
    if (progress) progress.style.width = `${100 * (index + 1) / goalReplay.frames.length}%`;
    goalReplay.index++;
    if (goalReplay.index >= goalReplay.frames.length) {
      clearInterval(replayTimer);
      replayTimer = null;
      replayHoldTimer = setTimeout(() => closeGoalReplay(), 1100);
    }
  };
  drawFrame();
  if (goalReplay && goalReplay.index < frames.length) replayTimer = setInterval(drawFrame, 55);
}

function closeGoalReplay(resume = true) {
  clearInterval(replayTimer);
  clearTimeout(replayHoldTimer);
  replayTimer = null;
  replayHoldTimer = null;
  document.getElementById('goal-replay')?.remove();
  if (!goalReplay) return;
  const wasPaused = goalReplay.wasPaused;
  goalReplay = null;
  replayFrames = [];
  if (!resume || !activeMatch) return;
  activeMatch.paused = wasPaused;
  if (activeMatch.halftimePause) {
    activeMatch.paused = true;
    render();
    showHalftimeDialog();
  } else if (activeMatch.finished) finishMatch();
  else { render(); drawMatch(); }
}

function updateMatchUI() {
  const match = activeMatch;
  if (!match) return;
  if (matchInfoTab === 'bench' && match.tick - lastMatchBenchTick >= 30 && $('#match-tray-content')) {
    $('#match-tray-content').innerHTML = matchTrayHTML(match);
    lastMatchBenchTick = match.tick;
  }
  if ($('#home-score')) $('#home-score').textContent = match.hg;
  if ($('#away-score')) $('#away-score').textContent = match.ag;
  if ($('#match-clock')) $('#match-clock').textContent = matchClock(match);
  if ($('#events')) $('#events').innerHTML = eventHTML(match.events.slice(-14));
  if ($('#shots')) $('#shots').textContent = `${match.shots[0]} - ${match.shots[1]}`;
  if ($('#possession')) $('#possession').textContent = `${match.possession}% - ${100 - match.possession}%`;
  if ($('#skill-moves')) $('#skill-moves').textContent = `${match.actionCounts.feints}回 / 股抜き${match.actionCounts.nutmegs}回`;
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

function drawGoalIllustration(ctx, pitch, py, side, pulse = 0, camera = 'diagonal') {
  const dir = side === 0 ? 1 : -1;
  const frontX = side === 0 ? pitch.x + pitch.w - 4 : pitch.x + 4;
  if (camera === 'full') {
    const top = py(29.1), bottom = py(38.9), backX = frontX + dir * 38;
    ctx.save();
    ctx.fillStyle = '#eaf3df58';
    ctx.fillRect(Math.min(frontX, backX), top, Math.abs(backX - frontX), bottom - top);
    ctx.strokeStyle = '#f7fff0b0';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = top + (bottom - top) * i / 6;
      ctx.beginPath(); ctx.moveTo(frontX, y); ctx.lineTo(backX, y); ctx.stroke();
    }
    ctx.strokeStyle = '#fffef2';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(frontX, top); ctx.lineTo(frontX, bottom); ctx.stroke();
    ctx.restore();
    return;
  }
  const matrix = ctx.getTransform();
  const project = (x, y) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f });
  const scale = Math.max(1, matrix.a);
  const near = project(frontX, py(29.1));
  const far = project(frontX, py(38.9));
  const rearNear = project(frontX + dir * (42 + pulse * 8), py(29.1));
  const rearFar = project(frontX + dir * (42 + pulse * 8), py(38.9));
  rearNear.y -= 12 * scale;
  rearFar.y -= 12 * scale;
  const height = 39 * scale;
  const postTop = point => ({ x: point.x, y: point.y - height - pulse * 5 });
  const nTop = postTop(near);
  const fTop = postTop(far);
  const rnTop = postTop(rearNear);
  const rfTop = postTop(rearFar);
  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  const quad = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); };
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const netFace = (a, b, c, d, fill, stroke, columns, rows) => {
    ctx.fillStyle = fill;
    quad(a, b, c, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = .85;
    for (let i = 1; i < columns; i++) {
      const t = i / columns;
      line(mix(a, b, t), mix(d, c, t));
    }
    for (let i = 1; i < rows; i++) {
      const t = i / rows;
      line(mix(a, d, t), mix(b, c, t));
    }
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The net follows the ground projection, while the posts rise vertically.
  ctx.fillStyle = '#15352630';
  quad(near, far, rearFar, rearNear);
  netFace(rnTop, rfTop, rearFar, rearNear, '#e4f4de18', '#f7fff068', 10, 5);
  netFace(nTop, fTop, rfTop, rnTop, pulse ? '#fff1c468' : '#f4f5dd48', '#ffffff88', 10, 6);
  netFace(fTop, rfTop, rearFar, far, '#d3e7da30', '#ffffff8a', 6, 5);
  netFace(nTop, rnTop, rearNear, near, '#d3e7da38', '#ffffff8a', 6, 5);
  ctx.strokeStyle = '#d9e8de';
  ctx.lineWidth = 2.6;
  line(nTop, rnTop); line(fTop, rfTop); line(rnTop, rfTop);
  line(rnTop, rearNear); line(rfTop, rearFar);
  ctx.strokeStyle = '#eaf3e39c';
  ctx.lineWidth = 1.8;
  line(near, rearNear); line(far, rearFar); line(rearNear, rearFar);
  ctx.strokeStyle = '#244d4188';
  ctx.lineWidth = 10;
  for (const [a, b] of [[nTop, near], [fTop, far], [nTop, fTop]]) {
    line({ x: a.x + 2, y: a.y + 3 }, { x: b.x + 2, y: b.y + 3 });
  }
  ctx.strokeStyle = pulse ? '#fff5bb' : '#fffef2';
  ctx.lineWidth = 7;
  ctx.lineCap = 'square';
  line(nTop, near); line(fTop, far); line(nTop, fTop);
  ctx.fillStyle = '#fffefa';
  for (const post of [nTop, fTop]) ctx.fillRect(post.x - 4, post.y - 4, 8, 8);
  ctx.restore();
}

function drawBallIllustration(ctx, x, y, groundY, spin) {
  const lift = Math.max(0, groundY - y);
  ctx.save();
  ctx.fillStyle = '#15382780';
  ctx.beginPath();
  ctx.ellipse(x + 1, groundY + 5, Math.max(3, 8 - lift * .14), Math.max(1.5, 3 - lift * .05), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = '#213a34';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffdf0';
  ctx.beginPath();
  ctx.arc(0, -.5, 6.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8ba59a';
  ctx.lineWidth = .8;
  ctx.beginPath();
  ctx.arc(0, -.5, 6.9, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const innerX = Math.cos(a) * 3.3;
    const innerY = Math.sin(a) * 3.3;
    const outerX = Math.cos(a) * 6;
    const outerY = Math.sin(a) * 6;
    ctx.strokeStyle = '#748e84';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.lineTo(outerX, outerY);
    ctx.stroke();
    ctx.fillStyle = '#273c38';
    ctx.beginPath();
    ctx.arc(outerX, outerY, 1.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#263c38';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const x0 = Math.cos(a) * 3.25;
    const y0 = Math.sin(a) * 3.25;
    if (i === 0) ctx.moveTo(x0, y0); else ctx.lineTo(x0, y0);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4, -5, 2, 2);
  ctx.restore();
}

function drawMatch(match = activeMatch, canvas = $('#match-canvas'), camera = matchCamera) {
  if (!canvas || !match) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const pitch = { x: 60, y: 36, w: 1100, h: 620 };
  const sceneWidth = pitch.x * 2 + pitch.w;
  const sceneHeight = pitch.y * 2 + pitch.h;
  const px = x => pitch.x + x / 105 * pitch.w;
  const py = y => pitch.y + y / 68 * pitch.h;
  const leftGoalLead = clamp((50 - match.ball.x) / 15, 0, 1);
  const rightGoalLead = clamp((match.ball.x - 55) / 15, 0, 1);
  const goalProximity = Math.max(leftGoalLead, rightGoalLead);
  const zoom = camera === 'diagonal' ? 1.5 + goalProximity * .4 : camera === 'follow' ? 1.9 : Math.min(width / sceneWidth, height / sceneHeight);
  const focusX = camera === 'full' ? sceneWidth / 2 : clamp(px(match.ball.x), 115, sceneWidth - 115);
  const focusY = camera === 'full' ? sceneHeight / 2 : clamp(py(match.ball.y), 80, sceneHeight - 80);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1b392d';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  if (camera !== 'full') ctx.transform(1, -.07, .66, .48, 0, 0);
  ctx.translate(-focusX, -focusY);

  // An original pixel stadium and pitch; no external game art is used.
  ctx.fillStyle = '#654538';
  ctx.fillRect(0, 0, sceneWidth, sceneHeight);
  ctx.fillStyle = '#2b3c34';
  ctx.fillRect(0, 0, sceneWidth, 30);
  ctx.fillRect(0, sceneHeight - 30, sceneWidth, 30);
  const crowd = ['#d5c078', '#d85b48', '#6d9f93', '#e4d8aa', '#49615b'];
  for (let i = 0; i < 240; i++) {
    const x = (i * 83) % sceneWidth;
    const y = i % 2 ? 5 + (i * 17) % 20 : sceneHeight - 27 + (i * 13) % 20;
    ctx.fillStyle = crowd[i % crowd.length];
    ctx.fillRect(x, y, 4, 3);
  }
  ctx.fillStyle = '#b88455';
  ctx.fillRect(0, 28, sceneWidth, 8);
  ctx.fillRect(0, sceneHeight - 36, sceneWidth, 8);
  ctx.fillStyle = '#244e35';
  ctx.fillRect(pitch.x - 5, pitch.y - 5, pitch.w + 10, pitch.h + 10);
  ctx.fillStyle = '#52923c';
  ctx.fillRect(pitch.x, pitch.y, pitch.w, pitch.h);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#65a449' : '#5d9c43';
    ctx.fillRect(pitch.x + i * pitch.w / 12, pitch.y, pitch.w / 12 + 1, pitch.h);
  }
  for (let i = 0; i < 600; i++) {
    const x = pitch.x + (i * 139 + i * i * 17) % pitch.w;
    const y = pitch.y + (i * 83 + i * i * 13) % pitch.h;
    const worn = (x < pitch.x + pitch.w * .22 || x > pitch.x + pitch.w * .78) && Math.abs(y - py(34)) < pitch.h * .27;
    ctx.fillStyle = worn && i % 5 === 0 ? '#9c9c5970' : i % 3 === 0 ? '#85b96245' : '#386f3250';
    ctx.fillRect(x, y, 3 + i % 5, 2 + i % 3);
  }
  ctx.fillStyle = '#d8c65f';
  ctx.fillRect(pitch.x, pitch.y - 5, pitch.w, 5);
  ctx.fillRect(pitch.x, pitch.y + pitch.h, pitch.w, 5);
  ctx.strokeStyle = '#e6efc7';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(pitch.x + 4, pitch.y + 4, pitch.w - 8, pitch.h - 8);
  ctx.beginPath(); ctx.moveTo(px(52.5), pitch.y + 4); ctx.lineTo(px(52.5), pitch.y + pitch.h - 4); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(px(52.5), py(34), pitch.w * 9.15 / 105, pitch.h * 9.15 / 68, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(px(0) + 4, py(34 - 20), px(16.5) - px(0), py(40) - py(0));
  ctx.strokeRect(px(88.5), py(34 - 20), px(105) - px(88.5) - 4, py(40) - py(0));
  ctx.strokeRect(px(0) + 4, py(34 - 9), px(5.5) - px(0), py(18) - py(0));
  ctx.strokeRect(px(99.5), py(34 - 9), px(105) - px(99.5) - 4, py(18) - py(0));
  ctx.fillStyle = '#e6efc7';
  for (const x of [11, 52.5, 94]) { ctx.beginPath(); ctx.arc(px(x), py(34), 3, 0, Math.PI * 2); ctx.fill(); }
  for (const side of [0, 1]) {
    const flash = match.goalFlash;
    const progress = flash?.side === side && flash.until > match.seconds
      ? (match.seconds - flash.start) / (flash.until - flash.start) : -1;
    const pulse = progress >= 0 ? Math.max(0, Math.sin(progress * Math.PI)) : 0;
    drawGoalIllustration(ctx, pitch, py, side, pulse, camera);
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
    const actionProgress = action ? Math.min(1, Math.max(0, (match.seconds - action.start) / (action.until - action.start))) : 0;
    const jump = ['header', 'catch', 'punch'].includes(pose) ? Math.max(0, Math.round(Math.sin(Math.min(1, (match.seconds - action.start) / (action.until - action.start)) * Math.PI) * 15)) : 0;
    const dir = player.side === 0 ? 1 : -1;
    const own = player.side === match.ownSide;
    const keeper = player.slot === 0;
    const look = appearanceFor(player);
    const skin = skinPalette[look.skin];
    const hair = hairPalette[look.hair];
    const bodyWidth = [14, 16, 19][look.build];
    const bodyHalf = Math.floor(bodyWidth / 2);
    const heightOffset = Math.max(-1, Math.min(2, Math.round((player.heightCm - 175) / 10)));
    const moving = Math.hypot(player.vx, player.vy) > 1.4;
    const stride = moving ? Math.round(Math.sin(match.seconds * 15 + player.slot) * 3) : 0;
    const lean = moving ? Math.round(clamp(player.vx * .35, -2, 2)) : 0;
    const bob = moving ? Math.round(Math.abs(Math.sin(match.seconds * 15 + player.slot)) * 2) : 0;
    const facing = Math.abs(player.vx) > Math.abs(player.vy) * .7 ? Math.sign(player.vx) : 0;
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
    if (camera !== 'full') {
      const determinant = .48 + .07 * .66;
      ctx.translate(x, y);
      ctx.transform(.48 / determinant, .07 / determinant, -.66 / determinant, 1 / determinant, 0, 0);
      ctx.translate(-x, -y);
    }
    if (pose === 'feint' || pose === 'nutmeg') {
      const lane = action.lane || 1;
      const sweep = Math.sin(actionProgress * Math.PI);
      ctx.strokeStyle = pose === 'nutmeg' ? '#ffe69b' : '#c9f6bc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - dir * 22, y + lane * 15);
      ctx.quadraticCurveTo(x - dir * 5, y + lane * (18 + sweep * 8), x + dir * 13, y + lane * 4);
      ctx.stroke();
      ctx.fillStyle = '#fff1bd';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - dir * (12 + i * 8), y + 10 + lane * i * 3, 5, 2);
    }
    if (pose === 'stumble') {
      ctx.strokeStyle = '#fff1c0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 13, y - 24); ctx.lineTo(x - 19, y - 29); ctx.moveTo(x + 13, y - 23); ctx.lineTo(x + 19, y - 29); ctx.stroke();
    }
    ctx.save();
    if (pose !== 'slide') ctx.translate(lean, -bob);
    ctx.translate(0, -jump);
    if (pose === 'feint') ctx.translate(0, (action.lane || 1) * Math.sin(actionProgress * Math.PI) * 5);
    if (pose === 'stumble') { ctx.translate(x, y); ctx.rotate((action.lane || 1) * Math.sin(actionProgress * Math.PI) * .26); ctx.translate(-x, -y); }
    if (pose === 'slide') {
      ctx.fillStyle = shorts;
      ctx.fillRect(x - dir * 9 - 6, y - 1, 17, 6);
      ctx.fillStyle = shirt;
      ctx.fillRect(x - 9, y - 7, 19, 9);
      ctx.fillStyle = skin;
      ctx.fillRect(x + dir * 10 - 4, y - 9, 8, 8);
      ctx.fillStyle = hair;
      ctx.fillRect(x + dir * 10 - 4, y - 11, 8, 3);
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
    ctx.fillStyle = skin;
    ctx.fillRect(x - bodyHalf - 2, y - 7 - stride, 4, 9);
    ctx.fillRect(x + bodyHalf - 2, y - 7 + stride, 4, 9);
    ctx.fillStyle = shirt;
    ctx.fillRect(x - bodyHalf, y - 10 - heightOffset, bodyWidth, 14 + heightOffset);
    ctx.fillStyle = trim;
    ctx.fillRect(x - bodyHalf, y - 9 - heightOffset, bodyWidth, 3);
    ctx.fillRect(x - 2, y - 6, 4, 8);
    ctx.fillStyle = skin;
    ctx.fillRect(x - 5, y - 18 - heightOffset, 10, 9);
    ctx.fillStyle = hair;
    ctx.fillRect(x - 6, y - 20 - heightOffset, 12, look.hairStyle === 2 ? 6 : 4);
    ctx.fillRect(x - 6, y - 17 - heightOffset, 2, look.hairStyle === 1 ? 6 : 4);
    if (look.hairStyle === 3 || look.hairStyle === 4) ctx.fillRect(x + 4, y - 18 - heightOffset, 2, 5);
    if (look.hairStyle === 4) ctx.fillRect(x - 2, y - 22 - heightOffset, 6, 3);
    ctx.fillStyle = '#3c3934';
    if (facing > 0) ctx.fillRect(x + 2, y - 15 - heightOffset, 2, 2);
    else if (facing < 0) ctx.fillRect(x - 4, y - 15 - heightOffset, 2, 2);
    else { ctx.fillRect(x - 3, y - 15 - heightOffset, 1, 2); ctx.fillRect(x + 2, y - 15 - heightOffset, 1, 2); }
    if (look.accessory === 1) {
      ctx.fillStyle = '#283638';
      ctx.fillRect(x - 5, y - 14 - heightOffset, 4, 2);
      ctx.fillRect(x + 1, y - 14 - heightOffset, 4, 2);
    } else if (look.accessory === 2) {
      ctx.fillStyle = '#eee8cb';
      ctx.fillRect(x - 6, y - 18 - heightOffset, 12, 2);
    }
    if (pose === 'pass' || pose === 'shot' || pose === 'tackle') {
      ctx.fillStyle = shorts;
      ctx.fillRect(x + dir * 5, y + 5, dir * 12, 4);
      ctx.fillStyle = '#1d3340';
      ctx.fillRect(x + dir * 14, y + 6, dir * 5, 3);
    }
    if (pose === 'nutmeg') {
      ctx.fillStyle = shorts;
      ctx.fillRect(x - 10, y + 4, 5, 8);
      ctx.fillRect(x + 5, y + 4, 5, 8);
      ctx.fillStyle = '#1d3340';
      ctx.fillRect(x - 12, y + 10, 6, 3);
      ctx.fillRect(x + 6, y + 10, 6, 3);
    }
    if (jump) {
      ctx.fillStyle = skin;
      ctx.fillRect(x - 11, y - 21, 4, 13);
      ctx.fillRect(x + 7, y - 21, 4, 13);
      if (pose === 'punch') ctx.fillRect(x + dir * 8, y - 29, 5, 9);
    }
    }
    ctx.restore();
    if (carrier === player && camera !== 'full') {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const name = player.name.split(' ')[0];
      const textWidth = ctx.measureText(name).width;
      ctx.fillStyle = '#163a2cee';
      ctx.fillRect(x - textWidth / 2 - 5, y - 47, textWidth + 10, 15);
      ctx.fillStyle = '#fff8dd';
      ctx.fillText(name, x, y - 36);
    }
    ctx.restore();
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
    for (const [i, dot] of match.ball.trail.entries()) {
      const radius = 1.5 + i * .45;
      ctx.fillStyle = `rgba(255, 250, 221, ${.12 + i * .08})`;
      ctx.beginPath();
      ctx.arc(Math.round(px(dot.x)), Math.round(py(dot.y)), radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const bx = Math.round(px(match.ball.x));
  const by = Math.round(py(match.ball.y));
  const flight = match.ball.airborneUntil > match.seconds && match.ball.flightDuration > 0
    ? Math.sin(Math.PI * (match.seconds - match.ball.flightStart) / match.ball.flightDuration) * 21 : 0;
  const holdAction = carrier && [...match.visualActions].reverse().find(item => item.uid === carrier.uid && item.until > match.seconds);
  const heldHeight = holdAction && ['header', 'catch'].includes(holdAction.kind) ? 17 : 0;
  const ballY = by - Math.max(0, Math.round(flight), heldHeight);
  const spin = (match.ball.x + match.ball.y * .35) * .11 + (flight > 0 ? match.seconds * 6 : 0);
  ctx.save();
  if (camera !== 'full') {
    const determinant = .48 + .07 * .66;
    ctx.translate(bx, ballY);
    ctx.transform(.48 / determinant, .07 / determinant, -.66 / determinant, 1 / determinant, 0, 0);
    ctx.translate(-bx, -ballY);
  }
  drawBallIllustration(ctx, bx, ballY, by, spin);
  ctx.restore();
  ctx.restore();
  if (camera !== 'full' && canvas.id === 'match-canvas') {
    const mini = { x: width - 195, y: 16, w: 175, h: 112 };
    ctx.fillStyle = '#143a2ee9';
    ctx.fillRect(mini.x - 5, mini.y - 5, mini.w + 10, mini.h + 10);
    ctx.fillStyle = '#578f4b';
    ctx.fillRect(mini.x, mini.y, mini.w, mini.h);
    ctx.strokeStyle = '#e9efc5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mini.x + 2, mini.y + 2, mini.w - 4, mini.h - 4);
    ctx.beginPath();ctx.moveTo(mini.x + mini.w / 2, mini.y);ctx.lineTo(mini.x + mini.w / 2, mini.y + mini.h);ctx.stroke();
    const determinant = .48 + .07 * .66;
    const viewportPoint = (screenX, screenY) => {
      const worldX = focusX + (.48 * screenX - .66 * screenY) / (determinant * zoom);
      const worldY = focusY + (.07 * screenX + screenY) / (determinant * zoom);
      return {
        x: mini.x + (worldX - pitch.x) / pitch.w * mini.w,
        y: mini.y + (worldY - pitch.y) / pitch.h * mini.h,
      };
    };
    const viewport = [
      viewportPoint(-width / 2, -height / 2),
      viewportPoint(width / 2, -height / 2),
      viewportPoint(width / 2, height / 2),
      viewportPoint(-width / 2, height / 2),
    ];
    ctx.save();
    ctx.beginPath();
    ctx.rect(mini.x, mini.y, mini.w, mini.h);
    ctx.clip();
    ctx.strokeStyle = '#ffe181';
    ctx.beginPath();
    ctx.moveTo(viewport[0].x, viewport[0].y);
    for (const point of viewport.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    for (const player of match.players) {
      ctx.fillStyle = player.side === match.ownSide ? '#f7efd4' : '#d45b4d';
      ctx.fillRect(mini.x + player.x / 105 * mini.w - 2, mini.y + player.y / 68 * mini.h - 2, 4, 4);
    }
    ctx.fillStyle = '#ffdf65';
    ctx.beginPath();ctx.arc(mini.x + match.ball.x / 105 * mini.w, mini.y + match.ball.y / 68 * mini.h, 3.3, 0, Math.PI * 2);ctx.fill();
  }
}

function showHalftimeDialog() {
  showDialog(`<div class="eyebrow">HALF TIME</div><h2>ハーフタイム</h2><p>後半の指示を出せます。ここでの交代は交代機会に数えません。</p><div class="btn-row"><button class="btn" data-action="openHalftimeBench">監督席で交代</button><button class="btn" data-action="matchTactics">戦術変更</button><button class="btn primary" data-action="resumeHalf">後半開始 →</button></div>`);
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
    const growthFactor = player.growthType === '早熟' ? (player.age < 23 ? 1.2 : .8) :
      player.growthType === '晩成' ? (player.age >= 25 ? 1.2 : .8) :
      player.growthType === '大器晩成' ? (player.age >= 27 ? 1.35 : .7) :
      player.growthType === '波型' ? (state.round % 3 === 0 ? 1.25 : .9) : 1;
    const growth = (player.age < 23 ? 10 : player.age < 28 ? 7 : 4) * (1 + state.facilities.training * .12) * (theme === 'recovery' ? .5 : 1) * growthFactor;
    player.xp += growth * (appeared.has(player.id) ? 1.2 : .8);
    if (player.xp >= 100 && player.ovr < player.potential) { player.xp -= 100; player.ovr++; gained++; }
    const development = advanceDetailedAbilities(player, theme, appeared.has(player.id), state.facilities.training, rand);
    const special = advanceSpecialTraining(player, theme, appeared.has(player.id), state.facilities.training);
    if (special?.level) addNews(`${player.name}が「${specialAbilityCatalog[special.id][0]}」を${special.learned ? '習得' : `Lv.${special.level}に強化`}しました。`);
    report.push({
      id: player.id, name: player.name, pos: player.pos, training: theme,
      changes: Object.fromEntries(Object.keys(before).map(key => [key, player[key] - before[key]])),
      detailedChanges: development.detailed, detailedProgress: development.progress,
      staminaBefore: before.stamina, staminaAfter: player.stamina, special
    });
  }
  if (gained) addNews(`${gained}人の選手の総合能力が上昇しました。`);
  return report;
}

function finishMatch() {
  const match = activeMatch;
  if (!match || match.committed) return;
  closeGoalReplay(false);
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
  showDialog(`<div class="eyebrow">FULL TIME</div><h2>試合終了</h2><div class="summary-score">${escapeHTML(result.home)} ${match.hg} - ${match.ag} ${escapeHTML(result.away)}</div><p>シュート ${match.shots[0]} - ${match.shots[1]} · 支配率 ${match.possession}% - ${100 - match.possession}%<br>交代 ${match.subsUsed}人 · 現在の順位 ${sortedTable().findIndex(team => team.id === 0) + 1}位 / 12クラブ</p><h3 class="growth-title">選手ごとの細かい能力の成長</h3><p class="growth-hint">上がった能力を明るい表示で、次の上昇までの成長ポイントを％で表示します。体力は名前の下です。</p>${growthReportHTML(state.lastGrowth)}<div class="btn-row" style="margin-top:18px"><button class="btn primary" data-action="closeDialog">ホームへ戻る →</button><button class="btn" data-action="openTrainingReport">育成画面で見る</button></div>`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || !activeMatch) return;
  const action = button.dataset.action;
  if (action === 'skipReplay') { closeGoalReplay(); return; }
  if (action === 'selectMatchSub') {
    selectedMatchSubOutId = Number(button.dataset.id);
    matchInfoTab = 'bench';
    render();
    return;
  }
  if (action === 'confirmMatchSub') {
    const incoming = state.players.find(player => player.id === Number(button.dataset.id));
    if (!incoming || selectedMatchSubOutId === null) return;
    const error = MatchEngine.queueSub(activeMatch, selectedMatchSubOutId, incoming);
    if (error) { showToast(error); return; }
    const halftime = activeMatch.halftimePause;
    if (halftime) MatchEngine.applyQueuedSubs(activeMatch, true);
    selectedMatchSubOutId = null;
    render();
    showToast(halftime ? `${incoming.name}を起用しました` : `${incoming.name}の交代を予約しました`);
    return;
  }
  if (action === 'openHalftimeBench') {
    closeDialog();
    matchInfoTab = 'bench';
    render();
    document.getElementById('match-tray-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'matchTab' && ['bench', 'stats', 'log'].includes(button.dataset.tab)) {
    matchInfoTab = button.dataset.tab;
    render();
    return;
  }
  if (action === 'camera') {
    if (!['diagonal', 'follow', 'full'].includes(button.dataset.mode)) return;
    matchCamera = button.dataset.mode;
    render();
  }
  if (action === 'cycleSpeed') {
    activeMatch.speed = activeMatch.speed === 1 ? 2 : activeMatch.speed === 2 ? 4 : 1;
    render();
  }
  if (action === 'managerMenu') showManagerMenu();
  if (action === 'substitute') showSubDialog();
  if (action === 'matchTactics') { matchWasPaused = activeMatch.paused; showTacticDialog(); }
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
