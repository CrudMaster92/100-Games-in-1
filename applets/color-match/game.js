(() => {
  const paletteContainer = document.getElementById('palette');
  const promptText = document.getElementById('prompt-text');
  const subtext = document.getElementById('subtext');
  const mistakesEl = document.getElementById('mistakes');
  const timeEl = document.getElementById('time-remaining');
  const streakEl = document.getElementById('current-streak');
  const bestEl = document.getElementById('best-streak');
  const feedbackEl = document.getElementById('feedback');

  const STORAGE_KEY = 'color-match::stats';
  const DEFAULT_TIME_MS = 18000;
  const MEDIUM_TIME_MS = 16000;
  const MAX_MISTAKES = 3;
  const PROGRESS_THROTTLE_MS = 600;

  const state = {
    sessionId: null,
    context: {},
    running: false,
    paused: false,
    ended: false,
    deadline: null,
    pauseStarted: null,
    rafId: null,
    difficulty: 'easy',
    paletteSize: 3,
    palette: [],
    targetIndex: 0,
    mistakes: 0,
    streak: 0,
    bestStreak: 0,
    rng: createRng(Date.now()),
    tiles: [],
    lastProgressSent: 0,
    hintSent: false,
    capabilities: {
      audio: null,
      storage: null
    }
  };

  function createRng(seed) {
    let t = (seed >>> 0) || 0;
    if (!t) t = 0x6d2b79f5;
    return () => {
      t |= 0;
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.floor(value) >>> 0;
    }
    if (typeof value === 'string') {
      let hash = 0;
      for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
      }
      return hash;
    }
    return Math.floor(Math.random() * 2 ** 32);
  }

  function postToHost(type, payload = {}) {
    if (!state.sessionId) return;
    window.parent?.postMessage({ type, sessionId: state.sessionId, payload }, '*');
  }

  function setFeedback(text, variant) {
    feedbackEl.textContent = text || '';
    feedbackEl.className = variant ? `feedback ${variant}` : 'feedback';
  }

  function applyDifficulty(level) {
    const difficulty = level || state.context.difficulty || 'easy';
    state.difficulty = difficulty;
    state.paletteSize = difficulty === 'medium' ? 4 : 3;
    const mistakesLeft = MAX_MISTAKES - state.mistakes;
    mistakesEl.textContent = `Mistakes left: ${Math.max(mistakesLeft, 0)}`;
    if (difficulty === 'medium') {
      subtext.textContent = 'Shades are closer now—look carefully.';
    } else {
      subtext.textContent = 'Select the tile that matches the RGB code exactly.';
    }
  }

  function updateTimer(now) {
    if (!state.deadline) return;
    const remaining = Math.max(0, state.deadline - now);
    timeEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
    if (remaining <= 0 && state.running && !state.ended) {
      endGame('timeout', 'Time ran out!', -75);
    }
  }

  function tick(now) {
    if (!state.running || state.paused || state.ended) {
      return;
    }
    updateTimer(now);
    if (!state.ended) {
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function updateMistakesDisplay() {
    const left = Math.max(0, MAX_MISTAKES - state.mistakes);
    mistakesEl.textContent = `Mistakes left: ${left}`;
  }

  function randomColorComponent(rangeMin, rangeMax) {
    const min = Math.max(0, rangeMin);
    const max = Math.min(255, rangeMax);
    return Math.floor(min + (max - min) * state.rng());
  }

  function randomBaseColor() {
    // Avoid extremes so medium variations remain visible.
    return {
      r: randomColorComponent(40, 215),
      g: randomColorComponent(40, 215),
      b: randomColorComponent(40, 215)
    };
  }

  function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function createVariation(base, intensity) {
    return {
      r: clampChannel(base.r + (state.rng() - 0.5) * intensity * 2),
      g: clampChannel(base.g + (state.rng() - 0.5) * intensity * 2),
      b: clampChannel(base.b + (state.rng() - 0.5) * intensity * 2)
    };
  }

  function paletteToCss(color) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }

  function clearTiles() {
    state.tiles.forEach((tile) => {
      tile.removeEventListener('click', handleTileClick);
    });
    paletteContainer.innerHTML = '';
    state.tiles = [];
  }

  function buildPalette() {
    clearTiles();
    const base = randomBaseColor();
    const palette = [base];
    if (state.difficulty === 'medium') {
      while (palette.length < state.paletteSize) {
        const variation = createVariation(base, 24);
        if (colorDistance(variation, base) > 10) {
          palette.push(variation);
        }
      }
    } else {
      while (palette.length < state.paletteSize) {
        const candidate = randomBaseColor();
        if (!palette.some((c) => colorDistance(c, candidate) < 80)) {
          palette.push(candidate);
        }
      }
    }

    // Shuffle palette deterministically via Fisher-Yates using RNG.
    for (let i = palette.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      [palette[i], palette[j]] = [palette[j], palette[i]];
    }

    state.palette = palette;
    state.targetIndex = Math.floor(state.rng() * palette.length);
    const target = palette[state.targetIndex];
    promptText.textContent = `Match RGB(${target.r}, ${target.g}, ${target.b})`;

    palette.forEach((color, index) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'palette-tile';
      tile.dataset.index = String(index);
      tile.dataset.locked = 'false';
      tile.style.background = paletteToCss(color);
      tile.setAttribute('aria-label', `Color option ${index + 1}`);
      tile.innerHTML = `<span class="label">${index + 1}</span>`;
      tile.addEventListener('click', handleTileClick);
      tile.addEventListener('animationend', (event) => {
        if (event.animationName === 'shake') {
          tile.classList.remove('is-incorrect');
        }
      });
      state.tiles.push(tile);
      paletteContainer.appendChild(tile);
    });
  }

  function disableTiles(disabled, preserveLocked = false) {
    state.tiles.forEach((tile) => {
      if (disabled) {
        tile.disabled = true;
        tile.classList.add('is-disabled');
        return;
      }

      const isLocked = preserveLocked && tile.dataset.locked === 'true';
      tile.disabled = isLocked;
      tile.classList.toggle('is-disabled', isLocked);
      if (!isLocked) {
        tile.classList.remove('is-incorrect');
      }
    });
  }

  function maybeSendProgress(extra = {}) {
    const now = performance.now();
    if (now - state.lastProgressSent < PROGRESS_THROTTLE_MS) return;
    state.lastProgressSent = now;
    const progressPayload = Object.assign(
      {
        percent: Math.max(0, 100 - (state.mistakes / MAX_MISTAKES) * 100),
        state: state.ended ? 'complete' : 'running',
        scoreDelta: 0
      },
      extra
    );
    postToHost('applet.progress', progressPayload);
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
      console.warn('Audio cue failed', error);
    }
  }

  async function readStorage() {
    const storage = state.capabilities.storage || state.context.capabilities?.storage;
    if (!storage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          state.streak = Number(parsed.current) || 0;
          state.bestStreak = Number(parsed.best) || 0;
          updateStreakDisplay();
        }
      } catch (error) {
        console.warn('Local storage read failed', error);
      }
      return;
    }

    try {
      const value = await (typeof storage.getItem === 'function'
        ? storage.getItem(STORAGE_KEY)
        : storage.get?.(STORAGE_KEY));
      if (!value) return;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      state.streak = Number(parsed.current) || 0;
      state.bestStreak = Number(parsed.best) || 0;
      updateStreakDisplay();
    } catch (error) {
      console.warn('Storage capability read failed', error);
    }
  }

  async function writeStorage() {
    const payload = JSON.stringify({ current: state.streak, best: state.bestStreak });
    const storage = state.capabilities.storage || state.context.capabilities?.storage;
    if (!storage) {
      try {
        localStorage.setItem(STORAGE_KEY, payload);
      } catch (error) {
        console.warn('Local storage write failed', error);
      }
      return;
    }

    try {
      if (typeof storage.setItem === 'function') {
        await storage.setItem(STORAGE_KEY, payload);
      } else if (typeof storage.set === 'function') {
        await storage.set(STORAGE_KEY, payload);
      }
    } catch (error) {
      console.warn('Storage capability write failed', error);
    }
  }

  function updateStreakDisplay() {
    streakEl.textContent = String(state.streak);
    bestEl.textContent = String(state.bestStreak);
  }

  function startGame() {
    if (state.running) return;
    state.mistakes = 0;
    applyDifficulty(state.difficulty);
    state.running = true;
    state.paused = false;
    state.ended = false;
    state.hintSent = false;
    state.lastProgressSent = 0;
    updateMistakesDisplay();
    setFeedback('Find the matching color!', '');

    const timeBudget = state.context.timeBudgetMs || DEFAULT_TIME_MS;
    const limit = state.difficulty === 'medium' ? Math.min(timeBudget, MEDIUM_TIME_MS) : timeBudget;
    state.deadline = performance.now() + limit;
    maybeSendProgress({ state: 'running' });

    buildPalette();
    disableTiles(false);

    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function finishWithOutcome(outcome, reason, scoreDelta, stats = {}) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    stopTimer();
    disableTiles(true);
    updateTimer(performance.now());

    const payload = {
      outcome,
      reason,
      scoreDelta,
      stats: Object.assign({ streak: state.streak, bestStreak: state.bestStreak, mistakes: state.mistakes }, stats)
    };
    postToHost('applet.result', payload);
  }

  function endGame(outcome, reason, scoreDelta) {
    if (state.ended) return;

    if (outcome === 'success') {
      setFeedback(reason, 'success');
      playAudioCue('success');
    } else {
      setFeedback(reason, 'fail');
      playAudioCue('fail');
      state.streak = 0;
      writeStorage();
      updateStreakDisplay();
    }

    finishWithOutcome(outcome, reason, scoreDelta);
  }

  function handleTileClick(event) {
    if (!state.running || state.paused || state.ended) return;
    const target = event.currentTarget;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;

    disableTiles(true);

    if (index === state.targetIndex) {
      const now = performance.now();
      const remaining = Math.max(0, state.deadline - now);
      const scoreDelta = Math.round(100 + remaining / 50);
      target.classList.add('is-correct');
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      writeStorage();
      updateStreakDisplay();
      setFeedback('Perfect match!', 'success');
      maybeSendProgress({ percent: 100, scoreDelta, state: 'complete' });
      finishWithOutcome('success', 'Matched the correct tile.', scoreDelta, { remainingMs: Math.round(remaining) });
    } else {
      target.classList.add('is-incorrect');
      state.mistakes += 1;
      updateMistakesDisplay();
      setFeedback('Not quite, try again.', 'fail');
      maybeSendProgress({ scoreDelta: -25, state: 'mistake' });
      target.dataset.locked = 'true';
      disableTiles(false, true);
      target.classList.add('is-disabled');

      if (state.mistakes >= MAX_MISTAKES) {
        endGame('fail', 'Too many incorrect picks.', -100);
      } else if (state.mistakes === MAX_MISTAKES - 1 && !state.hintSent) {
        postToHost('applet.needsHint', { hintCode: 'color-match-close-look' });
        state.hintSent = true;
      }
    }
  }

  function pauseGame() {
    if (!state.running || state.paused || state.ended) return;
    state.paused = true;
    state.pauseStarted = performance.now();
    stopTimer();
    disableTiles(true);
    setFeedback('Paused', '');
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
    disableTiles(false, true);
    setFeedback('Find the matching color!', '');
    state.rafId = requestAnimationFrame(tick);
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
        state.capabilities.audio = state.context.capabilities?.audio || null;
        state.capabilities.storage = state.context.capabilities?.storage || null;
        state.rng = createRng(seedFromValue(state.context.seed));
        state.difficulty = state.context.difficulty || 'easy';
        updateStreakDisplay();
        readStorage();
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
        if (state.running && !state.paused && data.payload && typeof data.payload.remainingMs === 'number') {
          state.deadline = performance.now() + data.payload.remainingMs;
          updateTimer(performance.now());
        } else if (!state.running && data.payload && typeof data.payload.remainingMs === 'number') {
          state.context.timeBudgetMs = data.payload.remainingMs;
        }
        break;
      case 'host.setDifficulty':
        if (data.payload && typeof data.payload.level === 'string') {
          state.difficulty = data.payload.level;
          applyDifficulty(state.difficulty);
        }
        break;
      case 'host.provideCapability':
        if (!data.payload || typeof data.payload.name !== 'string') break;
        if (data.payload.name === 'audio') {
          state.capabilities.audio = data.payload.endpoint;
        } else if (data.payload.name === 'storage') {
          state.capabilities.storage = data.payload.endpoint;
          readStorage();
        }
        break;
      default:
        break;
    }
  }

  function bootstrapStandalone() {
    if (state.sessionId) return;
    state.sessionId = 'standalone-color-match';
    state.context = { seed: Date.now(), difficulty: 'easy', timeBudgetMs: DEFAULT_TIME_MS, capabilities: {} };
    state.rng = createRng(seedFromValue(state.context.seed));
    postToHost('applet.ready');
    startGame();
  }

  function onKeydown(event) {
    if (!state.running || state.paused || state.ended) return;
    const key = event.key;
    if (key < '1' || key > String(state.palette.length)) return;
    const index = Number(key) - 1;
    const tile = state.tiles[index];
    if (tile) {
      tile.focus();
      tile.click();
    }
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKeydown);

  if (window === window.parent) {
    bootstrapStandalone();
  }
})();
