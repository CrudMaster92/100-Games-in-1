(() => {
  const canvas = document.getElementById('playfield');
  const ctx = canvas.getContext('2d');
  const timerEl = document.getElementById('time-remaining');
  const statusEl = document.getElementById('status-text');
  const messageEl = document.getElementById('message');
  const difficultyEl = document.getElementById('difficulty-label');

  const WIDTH = 480;
  const HEIGHT = 270;
  const PLAYER_RADIUS = 16;
  const KEY_SPEED = 230;
  const POINTER_SPEED = 280;
  const DEFAULT_TIME_MS = 20000;
  const PROGRESS_THROTTLE_MS = 350;
  const OUT_OF_BOUNDS_MARGIN = 60;

  const ORB_COLORS = ['#48c4ff', '#ff5e8c', '#ffdd66'];

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const state = {
    sessionId: null,
    context: {},
    running: false,
    paused: false,
    ended: false,
    rafId: null,
    lastFrame: 0,
    deadline: null,
    pauseStarted: null,
    startTime: null,
    progressThrottle: 0,
    timeLimitMs: DEFAULT_TIME_MS,
    difficulty: 'medium',
    keys: { up: false, down: false, left: false, right: false },
    pointer: { active: false, x: WIDTH / 2, y: HEIGHT / 2 },
    player: { x: WIDTH / 2, y: HEIGHT / 2 },
    orbs: [],
    spawnTimerMs: 0,
    spawnIntervalMs: 780,
    orbSpeed: 150,
    homingStrength: 0.08,
    dodgedCount: 0,
    rng: createRng(Date.now()),
    capabilities: {
      audio: null,
      telemetry: null,
      rng: null
    }
  };

  const KEY_MAP = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right'
  };

  function createRng(seed) {
    let t = (seed >>> 0) || 0;
    if (!t) t = 0x6d2b79f5;
    return () => {
      t |= 0;
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
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
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
      }
      return hash >>> 0;
    }
    return Date.now() >>> 0;
  }

  function postToHost(type, payload = {}) {
    if (!state.sessionId) return;
    window.parent?.postMessage({ type, sessionId: state.sessionId, payload }, '*');
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setMessage(text, variant) {
    if (!text) {
      messageEl.textContent = '';
      messageEl.className = 'message';
      return;
    }

    messageEl.textContent = text;
    messageEl.className = `message is-visible ${variant || ''}`.trim();
  }

  function toTitle(value) {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyDifficulty(level) {
    state.difficulty = level || state.difficulty;
    let spawnInterval;
    let speed;
    let homing;

    switch (state.difficulty) {
      case 'hard':
        spawnInterval = 520;
        speed = 185;
        homing = 0.18;
        break;
      case 'easy':
        spawnInterval = 900;
        speed = 140;
        homing = 0.04;
        break;
      case 'medium':
      default:
        spawnInterval = 760;
        speed = 160;
        homing = 0.1;
        break;
    }

    state.spawnIntervalMs = spawnInterval;
    state.orbSpeed = speed;
    state.homingStrength = homing;
    difficultyEl.textContent = toTitle(state.difficulty);
  }

  function resetGameState() {
    state.player.x = WIDTH / 2;
    state.player.y = HEIGHT * 0.72;
    state.orbs = [];
    state.spawnTimerMs = 600;
    state.dodgedCount = 0;
    state.progressThrottle = 0;
    state.lastFrame = 0;
    state.startTime = performance.now();
    state.pointer.active = false;
    state.keys.up = false;
    state.keys.down = false;
    state.keys.left = false;
    state.keys.right = false;
  }

  function startGame() {
    if (state.running) return;
    state.ended = false;
    state.running = true;
    setMessage('');
    applyDifficulty(state.difficulty);
    resetGameState();
    const limit = typeof state.context.timeBudgetMs === 'number' ? state.context.timeBudgetMs : DEFAULT_TIME_MS;
    state.timeLimitMs = clamp(limit, 16000, 28000);
    const now = performance.now();
    state.startTime = now;
    state.deadline = now + state.timeLimitMs;
    setStatus('Evade the incoming orbs!');
    maybeSendProgress(now, { percent: 0, state: 'countdown' });
    scheduleNextFrame();
  }

  function scheduleNextFrame() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(update);
  }

  function update(now) {
    if (!state.running || state.ended) {
      return;
    }

    if (state.paused) {
      state.lastFrame = now;
      scheduleNextFrame();
      return;
    }

    if (!state.lastFrame) {
      state.lastFrame = now;
    }

    const deltaMs = Math.min(50, now - state.lastFrame);
    const deltaSeconds = deltaMs / 1000;
    state.lastFrame = now;

    movePlayer(deltaSeconds);
    spawnOrbs(deltaMs, now);
    advanceOrbs(deltaSeconds, now);
    draw(now);
    updateTimer(now);
    maybeSendProgress(now);

    if (!state.ended) {
      scheduleNextFrame();
    }
  }

  function movePlayer(deltaSeconds) {
    const movement = getMovementVector();
    const speed = state.pointer.active ? POINTER_SPEED : KEY_SPEED;
    state.player.x += movement.x * speed * deltaSeconds;
    state.player.y += movement.y * speed * deltaSeconds;

    const radius = PLAYER_RADIUS;
    state.player.x = clamp(state.player.x, radius, WIDTH - radius);
    state.player.y = clamp(state.player.y, radius, HEIGHT - radius);
  }

  function getMovementVector() {
    if (state.pointer.active) {
      const dx = state.pointer.x - state.player.x;
      const dy = state.pointer.y - state.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) return { x: 0, y: 0 };
      const scale = Math.min(1, dist / 120);
      return { x: (dx / dist) * scale, y: (dy / dist) * scale };
    }

    let x = 0;
    let y = 0;
    if (state.keys.left) x -= 1;
    if (state.keys.right) x += 1;
    if (state.keys.up) y -= 1;
    if (state.keys.down) y += 1;
    if (!x && !y) return { x: 0, y: 0 };
    const mag = Math.hypot(x, y) || 1;
    return { x: x / mag, y: y / mag };
  }

  function spawnOrbs(deltaMs, now) {
    state.spawnTimerMs -= deltaMs;
    while (state.spawnTimerMs <= 0) {
      createOrb(now);
      const jitter = 0.65 + state.rng() * 0.5;
      state.spawnTimerMs += state.spawnIntervalMs * jitter;
    }
  }

  function createOrb(now) {
    const spawnSide = Math.floor(state.rng() * 4);
    const margin = 24;
    let x = 0;
    let y = 0;

    switch (spawnSide) {
      case 0:
        x = state.rng() * WIDTH;
        y = -margin;
        break;
      case 1:
        x = WIDTH + margin;
        y = state.rng() * HEIGHT;
        break;
      case 2:
        x = state.rng() * WIDTH;
        y = HEIGHT + margin;
        break;
      case 3:
      default:
        x = -margin;
        y = state.rng() * HEIGHT;
        break;
    }

    const noiseX = (state.rng() - 0.5) * 80;
    const noiseY = (state.rng() - 0.5) * 80;
    const targetX = clamp(state.player.x + noiseX, 0, WIDTH);
    const targetY = clamp(state.player.y + noiseY, 0, HEIGHT);
    const angle = Math.atan2(targetY - y, targetX - x);
    const speed = state.orbSpeed + state.rng() * 40;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const colorIndex = Math.floor(state.rng() * 3);
    const homingChance = state.difficulty === 'hard' ? 0.45 : state.difficulty === 'medium' ? 0.25 : 0.12;
    const homing = state.rng() < homingChance ? state.homingStrength : 0;

    state.orbs.push({
      x,
      y,
      vx,
      vy,
      speed,
      radius: state.difficulty === 'hard' ? 18 : 16,
      colorIndex,
      homing,
      type: homing > 0 ? 'homing' : 'drift',
      spawnedAt: now
    });
  }

  function advanceOrbs(deltaSeconds, now) {
    const remainingOrbs = [];
    const player = state.player;
    let hit = null;

    for (let i = 0; i < state.orbs.length; i += 1) {
      const orb = state.orbs[i];

      if (orb.homing > 0) {
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const dist = Math.hypot(dx, dy) || 1;
        const desiredVx = (dx / dist) * orb.speed;
        const desiredVy = (dy / dist) * orb.speed;
        const factor = orb.homing * (deltaSeconds * 60);
        orb.vx += (desiredVx - orb.vx) * factor;
        orb.vy += (desiredVy - orb.vy) * factor;
      }

      orb.x += orb.vx * deltaSeconds;
      orb.y += orb.vy * deltaSeconds;

      const dxp = orb.x - player.x;
      const dyp = orb.y - player.y;
      if (dxp * dxp + dyp * dyp <= Math.pow(orb.radius + PLAYER_RADIUS - 2, 2)) {
        hit = orb;
        break;
      }

      if (
        orb.x < -OUT_OF_BOUNDS_MARGIN ||
        orb.x > WIDTH + OUT_OF_BOUNDS_MARGIN ||
        orb.y < -OUT_OF_BOUNDS_MARGIN ||
        orb.y > HEIGHT + OUT_OF_BOUNDS_MARGIN
      ) {
        state.dodgedCount += 1;
        continue;
      }

      remainingOrbs.push(orb);
    }

    if (hit) {
      handleCollision(hit, now);
      return;
    }

    state.orbs = remainingOrbs;
  }

  function draw(now) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#051127');
    gradient.addColorStop(1, '#071c35');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawGrid();
    drawSafeRing(now);
    drawOrbs();
    drawPlayer(now);
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(72, 196, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 24; x < WIDTH; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 24; y < HEIGHT; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSafeRing(now) {
    ctx.save();
    const elapsed = state.startTime ? Math.max(0, now - state.startTime) : 0;
    const pulse = Math.sin(elapsed / 300) * 0.5 + 0.5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(66, 255, 157, ${0.18 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(WIDTH / 2, HEIGHT / 2, WIDTH * 0.45, HEIGHT * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrbs() {
    for (let i = 0; i < state.orbs.length; i += 1) {
      const orb = state.orbs[i];
      const orbGradient = ctx.createRadialGradient(
        orb.x,
        orb.y,
        orb.radius * 0.2,
        orb.x,
        orb.y,
        orb.radius
      );
      const color = ORB_COLORS[orb.colorIndex % ORB_COLORS.length];
      orbGradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      orbGradient.addColorStop(0.3, `${color}cc`);
      orbGradient.addColorStop(1, `${color}00`);
      ctx.fillStyle = orbGradient;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(now) {
    const pulse = Math.sin(now / 200) * 0.08 + 1;
    const radius = PLAYER_RADIUS * pulse;
    const gradient = ctx.createRadialGradient(state.player.x, state.player.y, radius * 0.2, state.player.x, state.player.y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.6, '#42ff9dcc');
    gradient.addColorStop(1, 'rgba(66, 255, 157, 0.1)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (state.pointer.active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(72, 196, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(state.player.x, state.player.y);
      ctx.lineTo(state.pointer.x, state.pointer.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function updateTimer(now) {
    if (!state.deadline) return;
    const remaining = Math.max(0, state.deadline - now);
    const seconds = (remaining / 1000).toFixed(1);
    timerEl.textContent = `${seconds}s`;

    if (remaining <= 0) {
      handleSurvivalComplete();
    }
  }

  function maybeSendProgress(now, extra = {}) {
    if (!state.startTime) return;
    const force = extra.force === true;
    if (!state.running && !force) return;
    if (!force && now - state.progressThrottle < PROGRESS_THROTTLE_MS) return;
    state.progressThrottle = now;
    const elapsed = now - state.startTime;
    const percent = clamp(elapsed / state.timeLimitMs, 0, 1);
    const payload = Object.assign(
      {
        percent,
        state: state.paused ? 'paused' : state.running ? 'running' : 'complete',
        scoreDelta: 0
      },
      extra
    );
    if ('force' in payload) {
      delete payload.force;
    }
    postToHost('applet.progress', payload);
  }

  function handleCollision(orb, now) {
    if (state.ended) return;
    setStatus('Critical hit!');
    setMessage('Impact! Shields down!', 'fail');
    playAudioCue('fail');
    emitTelemetry('orb_dodge_hit', {
      difficulty: state.difficulty,
      elapsedMs: Math.round(now - state.startTime),
      orbType: orb.type
    });
    endGame('fail', 'Collided with an orb.', -150);
  }

  function handleSurvivalComplete() {
    if (state.ended) return;
    setStatus('Mission complete!');
    setMessage('Survived the barrage!', 'success');
    playAudioCue('success');
    const bonus = state.difficulty === 'hard' ? 260 : state.difficulty === 'medium' ? 220 : 200;
    endGame('success', 'Survived the orb barrage.', bonus, {
      dodged: state.dodgedCount
    });
  }

  function endGame(outcome, reason, scoreDelta, stats = {}) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    const now = performance.now();
    updateTimer(now);
    const progressPayload = { state: 'complete', force: true };
    if (outcome === 'success') {
      progressPayload.percent = 1;
    }
    maybeSendProgress(now, progressPayload);
    postToHost('applet.result', {
      outcome,
      reason,
      scoreDelta,
      stats: Object.assign(
        {
          difficulty: state.difficulty,
          survivedMs: state.startTime ? Math.round(now - state.startTime) : 0,
          dodged: state.dodgedCount
        },
        stats
      )
    });
  }

  function pauseGame() {
    if (!state.running || state.paused || state.ended) return;
    state.paused = true;
    state.pauseStarted = performance.now();
    setStatus('Paused');
    setMessage('Paused', '');
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
    setMessage('');
    setStatus('Evade the incoming orbs!');
    scheduleNextFrame();
  }

  function handleHostEnd() {
    if (state.ended) return;
    setStatus('Session terminated');
    endGame('fail', 'Session ended by host.', -120);
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

  function emitTelemetry(eventName, payload) {
    const telemetry = state.capabilities.telemetry || state.context.capabilities?.telemetry;
    if (telemetry) {
      try {
        if (typeof telemetry.emit === 'function') {
          telemetry.emit(eventName, payload);
          return;
        }
        if (typeof telemetry.log === 'function') {
          telemetry.log(eventName, payload);
          return;
        }
      } catch (error) {
        console.warn('Telemetry emit failed', error);
      }
    }
    postToHost('telemetry.emit', { event: eventName, payload });
  }

  function handleKeydown(event) {
    const action = KEY_MAP[event.key];
    if (!action) return;
    event.preventDefault();
    state.keys[action] = true;
  }

  function handleKeyup(event) {
    const action = KEY_MAP[event.key];
    if (!action) return;
    event.preventDefault();
    state.keys[action] = false;
  }

  function pointerToCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    return { x: clamp(x, 0, WIDTH), y: clamp(y, 0, HEIGHT) };
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const pos = pointerToCanvas(event);
    state.pointer.active = true;
    state.pointer.x = pos.x;
    state.pointer.y = pos.y;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // noop if capture unsupported
    }
  }

  function handlePointerMove(event) {
    if (!state.pointer.active) return;
    event.preventDefault();
    const pos = pointerToCanvas(event);
    state.pointer.x = pos.x;
    state.pointer.y = pos.y;
  }

  function handlePointerUp(event) {
    if (!state.pointer.active) return;
    event.preventDefault();
    state.pointer.active = false;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // ignore
    }
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
        const seedValue = state.context.seed ?? Date.now();
        state.rng = createRng(seedFromValue(seedValue));
        applyDifficulty(state.context.difficulty || state.difficulty);
        state.context.timeBudgetMs = state.context.timeBudgetMs ?? DEFAULT_TIME_MS;
        if (state.context.capabilities) {
          state.capabilities.audio = state.context.capabilities.audio || null;
          state.capabilities.telemetry = state.context.capabilities.telemetry || null;
          state.capabilities.rng = state.context.capabilities.rng || null;
        }
        setStatus('Ready for launch');
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
          if (state.running && !state.paused && !state.ended) {
            state.deadline = performance.now() + data.payload.remainingMs;
          }
          state.context.timeBudgetMs = data.payload.remainingMs;
        }
        break;
      case 'host.setDifficulty':
        if (data.payload && typeof data.payload.level === 'string') {
          applyDifficulty(data.payload.level);
        }
        break;
      case 'host.provideCapability':
        if (!data.payload || typeof data.payload.name !== 'string') break;
        if (data.payload.name === 'audio') {
          state.capabilities.audio = data.payload.endpoint;
        } else if (data.payload.name === 'telemetry') {
          state.capabilities.telemetry = data.payload.endpoint;
        } else if (data.payload.name === 'rng') {
          state.capabilities.rng = data.payload.endpoint;
          if (state.capabilities.rng && typeof state.capabilities.rng.next === 'function') {
            state.rng = () => state.capabilities.rng.next();
          }
        }
        break;
      default:
        break;
    }
  }

  function bootstrapStandalone() {
    if (state.sessionId) return;
    state.sessionId = 'standalone-orb-dodge';
    state.context = {
      seed: Date.now(),
      difficulty: 'medium',
      timeBudgetMs: DEFAULT_TIME_MS,
      capabilities: {}
    };
    state.rng = createRng(seedFromValue(state.context.seed));
    applyDifficulty(state.context.difficulty);
    setStatus('Standalone mode');
    postToHost('applet.ready');
    startGame();
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  draw(performance.now());

  if (window === window.parent) {
    bootstrapStandalone();
  }
})();
