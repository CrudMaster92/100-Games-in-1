(() => {
  const pads = Array.from(document.querySelectorAll('.pad'));
  const timeEl = document.getElementById('time-remaining');
  const padsEl = document.getElementById('pads-cleared');
  const statusEl = document.getElementById('status');
  const instructionsEl = document.getElementById('instructions');

  const DEFAULT_TIME_MS = 15000;
  const PROGRESS_THROTTLE_MS = 250;

  const state = {
    sessionId: null,
    context: {},
    running: false,
    paused: false,
    ended: false,
    startTime: null,
    deadline: null,
    pauseStarted: null,
    rafId: null,
    nextActivationTimeout: null,
    pendingActivation: false,
    rng: createRng(Date.now()),
    difficulty: 'easy',
    sequence: [],
    sequenceLength: 10,
    currentIndex: 0,
    activePadIndex: null,
    taps: 0,
    mistakes: 0,
    progressThrottle: 0,
    timeLimitMs: DEFAULT_TIME_MS,
    activationDelay: 320,
    capabilities: {
      audio: null
    }
  };

  function createRng(seed) {
    let t = (seed >>> 0) || 0x6d2b79f5;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value >>> 0;
    }
    if (typeof value === 'string') {
      let hash = 0;
      for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
      }
      return hash >>> 0;
    }
    return Math.floor(Math.random() * 2 ** 32) >>> 0;
  }

  function postToHost(type, payload = {}) {
    if (!state.sessionId) return;
    window.parent?.postMessage({ type, sessionId: state.sessionId, payload }, '*');
  }

  function setStatus(text, variant) {
    statusEl.textContent = text;
    statusEl.className = variant ? `hud__value is-${variant}` : 'hud__value';
  }

  function playAudioCue(name) {
    const audio = state.capabilities.audio || state.context.capabilities?.audio;
    if (!audio) return;
    try {
      if (typeof audio.play === 'function') {
        audio.play(name);
      } else if (typeof audio.trigger === 'function') {
        audio.trigger(name);
      }
    } catch (error) {
      console.warn('Quick Tap audio failed', error);
    }
  }

  function applyDifficulty(level) {
    const difficulty = (level || state.context.difficulty || 'easy').toLowerCase();
    state.difficulty = difficulty;
    if (difficulty === 'hard') {
      state.sequenceLength = 18;
      state.activationDelay = 220;
    } else if (difficulty === 'medium') {
      state.sequenceLength = 14;
      state.activationDelay = 260;
    } else {
      state.sequenceLength = 10;
      state.activationDelay = 320;
    }
    const prompt =
      difficulty === 'hard'
        ? 'Pads flash quicker. React instantly!'
        : difficulty === 'medium'
        ? 'Keep your rhythm steady and clear every highlight.'
        : 'Watch for the glow and tap the matching pad.';
    instructionsEl.textContent = prompt;
  }

  function buildSequence() {
    state.sequence = [];
    let lastIndex = -1;
    for (let i = 0; i < state.sequenceLength; i += 1) {
      let index = Math.floor(state.rng() * pads.length);
      if (index === lastIndex) {
        index = (index + 1 + Math.floor(state.rng() * (pads.length - 1))) % pads.length;
      }
      state.sequence.push(index);
      lastIndex = index;
    }
  }

  function resetPads() {
    pads.forEach((pad) => {
      pad.classList.remove('is-active', 'is-hit', 'is-miss');
      pad.disabled = false;
    });
    state.activePadIndex = null;
  }

  function activateCurrentPad() {
    clearActivationTimer();
    if (!state.running || state.paused || state.ended) {
      state.pendingActivation = true;
      return;
    }
    state.pendingActivation = false;
    const index = state.sequence[state.currentIndex];
    const pad = pads[index];
    if (!pad) return;
    resetPads();
    pad.classList.add('is-active');
    state.activePadIndex = index;
    setStatus(`Pad ${index + 1}!`, 'active');
  }

  function scheduleNextPad(delay = state.activationDelay) {
    clearActivationTimer();
    state.nextActivationTimeout = window.setTimeout(() => {
      state.nextActivationTimeout = null;
      activateCurrentPad();
    }, delay);
  }

  function clearActivationTimer() {
    if (state.nextActivationTimeout) {
      window.clearTimeout(state.nextActivationTimeout);
      state.nextActivationTimeout = null;
    }
  }

  function updateTimer(now) {
    if (!state.deadline) return;
    const remaining = Math.max(0, state.deadline - now);
    timeEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
    if (remaining <= 0) {
      endGame('timeout', "Time's up!", -100);
      return;
    }
    if (state.running && !state.paused) {
      maybeSendProgress(now);
    }
  }

  function tick(now) {
    if (!state.running) {
      return;
    }
    if (!state.paused && !state.ended) {
      updateTimer(now);
      state.rafId = requestAnimationFrame(tick);
    } else if (state.paused) {
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function updatePadsDisplay() {
    padsEl.textContent = `${state.currentIndex} / ${state.sequenceLength}`;
  }

  function maybeSendProgress(now, extra = {}) {
    if (!state.startTime) return;
    if (!extra.force && now - state.progressThrottle < PROGRESS_THROTTLE_MS) return;
    state.progressThrottle = now;
    const percent = state.sequenceLength
      ? Math.min(1, state.currentIndex / state.sequenceLength)
      : 0;
    const payload = Object.assign(
      {
        percent,
        state: state.paused ? 'paused' : state.ended ? 'complete' : 'running',
        scoreDelta: 0
      },
      extra
    );
    if ('force' in payload) {
      delete payload.force;
    }
    postToHost('applet.progress', payload);
  }

  function startGame() {
    if (state.running) return;
    applyDifficulty(state.difficulty);
    state.running = true;
    state.paused = false;
    state.ended = false;
    state.taps = 0;
    state.mistakes = 0;
    state.currentIndex = 0;
    state.pendingActivation = false;
    state.pauseStarted = null;
    state.progressThrottle = 0;
    state.startTime = performance.now();
    const timeBudget = typeof state.context.timeBudgetMs === 'number' ? state.context.timeBudgetMs : DEFAULT_TIME_MS;
    state.timeLimitMs = Math.max(5000, Math.min(timeBudget, 20000));
    state.deadline = state.startTime + state.timeLimitMs;
    resetPads();
    buildSequence();
    updatePadsDisplay();
    setStatus('Get ready…', 'ready');
    maybeSendProgress(state.startTime, { percent: 0, force: true });
    scheduleNextPad(500);
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(tick);
  }

  function pauseGame() {
    if (!state.running || state.paused || state.ended) return;
    state.paused = true;
    state.pauseStarted = performance.now();
    state.pendingActivation = state.nextActivationTimeout !== null || state.pendingActivation;
    clearActivationTimer();
    setStatus('Paused', 'paused');
    pads.forEach((pad) => pad.classList.remove('is-active'));
  }

  function resumeGame() {
    if (!state.running || !state.paused || state.ended) return;
    const now = performance.now();
    if (state.pauseStarted) {
      const pausedDuration = now - state.pauseStarted;
      state.deadline += pausedDuration;
      state.pauseStarted = null;
    }
    state.paused = false;
    setStatus('Go!', 'active');
    if (state.pendingActivation) {
      state.pendingActivation = false;
      scheduleNextPad(0);
    } else if (state.activePadIndex !== null) {
      pads[state.activePadIndex]?.classList.add('is-active');
    } else {
      scheduleNextPad(0);
    }
  }

  function handlePadClick(event) {
    if (!state.running || state.paused || state.ended) return;
    const pad = event.currentTarget;
    const index = Number(pad.dataset.index);
    if (Number.isNaN(index)) return;
    if (index !== state.sequence[state.currentIndex]) {
      state.mistakes += 1;
      pad.classList.add('is-miss');
      setStatus('Wrong pad!', 'fail');
      playAudioCue('fail');
      endGame('fail', 'Tapped the wrong pad.', -120);
      return;
    }

    state.taps += 1;
    pad.classList.remove('is-active');
    pad.classList.add('is-hit');
    playAudioCue('success');
    state.currentIndex += 1;
    updatePadsDisplay();

    if (state.currentIndex >= state.sequenceLength) {
      handleWin();
      return;
    }

    setStatus('Nice! Keep going!', 'success');
    scheduleNextPad();
    maybeSendProgress(performance.now(), { scoreDelta: 50, force: true });
  }

  function handleWin() {
    const now = performance.now();
    const elapsed = Math.max(0, now - state.startTime);
    const tapsPerSecond = state.taps ? state.taps / (elapsed / 1000) : 0;
    setStatus('Sequence cleared!', 'success');
    maybeSendProgress(now, { percent: 1, state: 'complete', scoreDelta: 50, force: true });
    endGame('success', 'Cleared every highlight.', 50 * state.sequenceLength, {
      taps: state.taps,
      tapsPerSecond: Number(tapsPerSecond.toFixed(2)),
      elapsedMs: Math.round(elapsed)
    });
  }

  function endGame(outcome, reason, scoreDelta, stats = {}) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    clearActivationTimer();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (outcome !== 'success') {
      maybeSendProgress(performance.now(), { state: 'complete', scoreDelta: 0, force: true });
    }
    postToHost('applet.result', {
      outcome,
      reason,
      scoreDelta,
      stats: Object.assign({ taps: state.taps, mistakes: state.mistakes }, stats)
    });
  }

  function handleHostEnd() {
    if (state.ended) return;
    endGame('fail', 'Session ended by host.', -100);
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
      return;
    }

    switch (data.type) {
      case 'host.bootstrap': {
        state.sessionId = data.sessionId;
        state.context = data.payload || {};
        state.context.capabilities = state.context.capabilities || {};
        state.rng = createRng(seedFromValue(state.context.seed));
        applyDifficulty(state.context.difficulty || 'easy');
        state.capabilities.audio = state.context.capabilities.audio || null;
        const budget = data.payload?.timeBudgetMs;
        if (typeof budget === 'number') {
          state.context.timeBudgetMs = budget;
        }
        postToHost('applet.ready');
        break;
      }
      case 'host.start':
        startGame();
        break;
      case 'host.pause':
        pauseGame();
        break;
      case 'host.resume':
        resumeGame();
        break;
      case 'host.end':
        handleHostEnd();
        break;
      case 'host.setTimeBudget':
        if (data.payload && typeof data.payload.remainingMs === 'number') {
          if (state.running && !state.paused) {
            state.deadline = performance.now() + data.payload.remainingMs;
            state.context.timeBudgetMs = data.payload.remainingMs;
            updateTimer(performance.now());
          } else {
            state.context.timeBudgetMs = data.payload.remainingMs;
          }
        }
        break;
      case 'host.setDifficulty':
        if (data.payload && typeof data.payload.level === 'string') {
          applyDifficulty(data.payload.level);
          state.context.difficulty = data.payload.level;
        }
        break;
      case 'host.provideCapability':
        if (!data.payload || typeof data.payload.name !== 'string') break;
        if (data.payload.name === 'audio') {
          state.capabilities.audio = data.payload.endpoint;
        }
        break;
      default:
        break;
    }
  }

  function bootstrapStandalone() {
    if (state.sessionId) return;
    state.sessionId = 'standalone-quick-tap';
    state.context = {
      seed: Date.now(),
      difficulty: 'easy',
      timeBudgetMs: DEFAULT_TIME_MS,
      capabilities: {}
    };
    state.rng = createRng(seedFromValue(state.context.seed));
    postToHost('applet.ready');
    startGame();
  }

  pads.forEach((pad) => pad.addEventListener('click', handlePadClick));
  window.addEventListener('message', onMessage);

  if (window === window.parent) {
    bootstrapStandalone();
  }
})();
