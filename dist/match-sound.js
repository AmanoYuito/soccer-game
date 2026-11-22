// Short, original stadium cues. The audio device opens on a user gesture.
const MatchSound = (() => {
  const key = 'soccer-match-sound';
  let enabled = true;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch {}
  let context, output;
  let lastKick = -1;
  const available = !!(window.AudioContext || window.webkitAudioContext);

  function tone(start, from, to, duration, volume, type) {
    const voice = context.createOscillator();
    const envelope = context.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(from, start);
    voice.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + .009);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    voice.connect(envelope).connect(output);
    voice.start(start);
    voice.stop(start + duration);
    voice.onended = () => { voice.disconnect(); envelope.disconnect(); };
  }

  function cheer(start) {
    const buffer = context.createBuffer(1, context.sampleRate * 1.4, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) {
      previous = previous * .75 + (Math.random() * 2 - 1) * .25;
      samples[i] = previous;
    }
    const voices = context.createBufferSource();
    const swell = context.createGain();
    voices.buffer = buffer;
    swell.gain.setValueAtTime(.001, start);
    swell.gain.linearRampToValueAtTime(.45, start + .2);
    swell.gain.exponentialRampToValueAtTime(.001, start + 1.4);
    voices.connect(swell).connect(output);
    voices.start(start);
    voices.onended = () => { voices.disconnect(); swell.disconnect(); };
  }

  function play(cue) {
    if (!enabled || context?.state !== 'running' || document.hidden) return;
    const now = context.currentTime;
    if (cue === 'goal') {
      cheer(now);
      [392, 494, 587, 784].forEach((note, i) =>
        tone(now + i * .105, note, note, i === 3 ? .36 : .12, .12, 'triangle'));
    } else if (cue === 'pass' || cue === 'shot') {
      if (cue === 'pass' && now - lastKick < .14) return;
      lastKick = now;
      tone(now, cue === 'shot' ? 215 : 170, 55, cue === 'shot' ? .14 : .085, .28, 'sine');
      tone(now, 780, 260, .035, .075, 'triangle');
    } else {
      const count = cue === 'fulltime' ? 3 : cue === 'halftime' ? 2 : 1;
      for (let i = 0; i < count; i++)
        tone(now + i * .18, 2270, 2420, i === count - 1 ? .32 : .12, .085, 'sine');
    }
  }

  async function unlock(cue) {
    if (!available || !enabled) return;
    try {
      if (!context) {
        context = new (window.AudioContext || window.webkitAudioContext)();
        output = context.createGain();
        output.gain.value = .45;
        output.connect(context.destination);
      }
      output.gain.value = .45;
      if (context.state !== 'running') await context.resume();
      play(cue);
    } catch { /* Keep the match playable if the device cannot produce audio. */ }
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {}
    if (enabled) unlock('pass');
    else if (output) output.gain.value = 0;
  }
  return { available, get enabled() { return enabled; }, play, unlock, toggle };
})();
