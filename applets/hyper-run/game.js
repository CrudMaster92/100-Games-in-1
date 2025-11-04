(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const timeEl = document.getElementById('time-remaining');
  const distanceEl = document.getElementById('distance');
  const messageEl = document.getElementById('message');
  const instructionsEl = document.getElementById('instructions');
  const objectiveEl = document.getElementById('objective');

  const CANVAS_WIDTH = canvas.width;
  const CANVAS_HEIGHT = canvas.height;
  const LANES = 3;
  const PLAYER_WIDTH = 36;
  const PLAYER_HEIGHT = 48;
  const PLAYER_X = 110;
  const TIME_LIMIT_MS = 12000;
  const PROGRESS_THROTTLE_MS = 250;

  const COLORS = {
    horizon: '#0b142b',
    laneEdge: 'rgba(125, 255, 239, 0.22)',
    laneDivider: 'rgba(125, 255, 239, 0.12)',
    player: '#7dffef',
    playerTrail: 'rgba(125, 255, 239, 0.35)',
    obstacleA: '#ff5f87',
    obstacleB: '#ffa26b'
  };

  const state = {
    sessionId: null,
    context: {},
    running: false,
    paused: false,
    ended: false,
    deadline: null,
    pauseStarted: null,
    rafId: null,
    lastFrame: 0,
    spawnTimer: 0,
    baseSpawnMs: 520,
    speed: 230,
    laneCenters: buildLaneCenters(),
    player: {
      lane: 1,
      targetLane: 1,
      y: 0
    },
    obstacles: [],
    rng: createRng(Date.now()),
    difficulty: 'medium',
    distance: 0,
    progressThrottle: 0
  };

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  state.player.y = laneToY(state.player.lane);

  function buildLaneCenters() {
    const laneHeight = CANVAS_HEIGHT / LANES;
    return Array.from({ length: LANES }, (_, index) => laneHeight * index + laneHeight / 2);
  }

  function laneToY(laneIndex) {
    const center = state.laneCenters[laneIndex];
    return center - PLAYER_HEIGHT / 2;
  }

  function createRng(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
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

  function setMessage(text, variant) {
    if (!text) {
      messageEl.textContent = '';
      messageEl.className = 'message';
      return;
    }

    const variantClass = variant ? ` ${variant}` : '';
    messageEl.textContent = text;
    messageEl.className = `message is-visible${variantClass}`;
  }

  function applyDifficulty(level) {
    const difficulty = (level || state.context.difficulty || 'medium').toLowerCase();
    state.difficulty = difficulty;

    if (difficulty === 'hard') {
      state.baseSpawnMs = 360;
      state.speed = 280;
      instructionsEl.textContent = 'Barriers are relentless. Snap between lanes with ↑ and ↓!';
    } else if (difficulty === 'easy') {
      state.baseSpawnMs = 640;
      state.speed = 190;
      instructionsEl.textContent = 'Slide between lanes with ↑ and ↓ to outpace the obstacles.';
    } else {
      state.baseSpawnMs = 520;
      state.speed = 230;
      instructionsEl.textContent = 'Keep sprinting and dodge every barrier with quick lane changes.';
    }
  }

  function resetState() {
    state.running = false;
    state.ended = false;
    state.paused = false;
    state.player.lane = 1;
    state.player.targetLane = 1;
    state.player.y = laneToY(state.player.lane);
    state.obstacles = [];
    state.lastFrame = 0;
    state.spawnTimer = 0;
    state.distance = 0;
    state.progressThrottle = 0;
    timeEl.textContent = `${(TIME_LIMIT_MS / 1000).toFixed(1)}s`;
    distanceEl.textContent = '0 m';
    setMessage('');
    draw(0);
  }

  function startGame() {
    if (state.running) return;

    resetState();
    state.running = true;
    state.deadline = performance.now() + TIME_LIMIT_MS;
    postToHost('applet.progress', { percent: 0, state: 'running' });
    setObjectiveText('Survive 12 seconds of the gauntlet!');
    scheduleNextSpawn();
    state.rafId = requestAnimationFrame(update);
  }

  function setObjectiveText(text) {
    if (objectiveEl) {
      objectiveEl.textContent = text;
    }
  }

  function scheduleNextSpawn() {
    const jitter = 0.6 + state.rng() * 0.8;
    state.spawnTimer = state.baseSpawnMs * jitter;
  }

  function spawnObstacle() {
    const lane = Math.floor(state.rng() * LANES);
    const laneHeight = CANVAS_HEIGHT / LANES;
    const height = laneHeight * 0.66;
    const width = 34 + state.rng() * 26;
    const y = state.laneCenters[lane] - height / 2;
    const colorShift = state.rng();
    state.obstacles.push({
      lane,
      x: CANVAS_WIDTH + width,
      y,
      width,
      height,
      colorShift
    });
  }

  function update(now) {
    if (!state.running || state.ended) {
      return;
    }

    if (state.paused) {
      state.rafId = requestAnimationFrame(update);
      return;
    }

    if (!state.lastFrame) {
      state.lastFrame = now;
    }

    const delta = Math.min(50, now - state.lastFrame);
    state.lastFrame = now;

    stepGame(delta);
    draw(now);
    updateCountdown(now);

    if (!state.ended) {
      state.rafId = requestAnimationFrame(update);
    }
  }

  function stepGame(deltaMs) {
    const deltaSeconds = deltaMs / 1000;
    state.spawnTimer -= deltaMs;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      scheduleNextSpawn();
    }

    // Smooth player movement toward target lane
    const targetY = laneToY(state.player.targetLane);
    const blend = 1 - Math.exp(-deltaMs / 90);
    state.player.y += (targetY - state.player.y) * blend;

    // Update obstacles
    const speed = state.speed;
    state.obstacles.forEach((obstacle) => {
      obstacle.x -= speed * deltaSeconds;
    });

    state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -40);

    state.distance += speed * deltaSeconds * 0.12;
    distanceEl.textContent = `${Math.round(state.distance)} m`;

    checkCollisions();
  }

  function checkCollisions() {
    const playerY = state.player.y;
    const playerRect = {
      x: PLAYER_X,
      y: playerY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT
    };

    for (const obstacle of state.obstacles) {
      if (rectsOverlap(playerRect, obstacle)) {
        endGame('fail', 'You clipped a barrier!', -50);
        return;
      }
    }
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function draw(now) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawTrack(now);
    drawObstacles(now);
    drawPlayer(now);
  }

  function drawTrack(now) {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#0d162e');
    gradient.addColorStop(1, '#050712');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = COLORS.laneEdge;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 12, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 24);

    ctx.setLineDash([12, 16]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.laneDivider;
    const laneHeight = CANVAS_HEIGHT / LANES;
    for (let i = 1; i < LANES; i += 1) {
      const y = laneHeight * i;
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(CANVAS_WIDTH - 12, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Speed streaks
    const streakCount = 12;
    for (let i = 0; i < streakCount; i += 1) {
      const progress = ((now / 6 + i * 50) % CANVAS_WIDTH) / CANVAS_WIDTH;
      const x = CANVAS_WIDTH - progress * CANVAS_WIDTH;
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#7dffef';
      ctx.fillRect(x, 0, 2, CANVAS_HEIGHT);
    }
    ctx.globalAlpha = 1;
  }

  function drawObstacles(now) {
    state.obstacles.forEach((obstacle) => {
      const oscillation = Math.sin((now / 180 + obstacle.colorShift * Math.PI * 2)) * 0.5 + 0.5;
      const color = lerpColor(COLORS.obstacleA, COLORS.obstacleB, oscillation);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    });
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function drawPlayer(now) {
    const bob = Math.sin(now / 120) * 2;
    const x = PLAYER_X;
    const y = state.player.y + bob;
    const trailGradient = ctx.createLinearGradient(x - 30, y, x, y + PLAYER_HEIGHT);
    trailGradient.addColorStop(0, 'rgba(125, 255, 239, 0)');
    trailGradient.addColorStop(1, COLORS.playerTrail);
    ctx.fillStyle = trailGradient;
    ctx.fillRect(x - 24, y, 20, PLAYER_HEIGHT);

    ctx.fillStyle = COLORS.player;
    ctx.fillRect(x, y, PLAYER_WIDTH, PLAYER_HEIGHT);

    ctx.fillStyle = '#0d162e';
    ctx.fillRect(x + PLAYER_WIDTH - 10, y + 12, 8, 8);
    ctx.fillRect(x + PLAYER_WIDTH - 10, y + 28, 8, 8);
  }

  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const bigint = parseInt(value, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  function updateCountdown(now) {
    const remainingMs = Math.max(0, state.deadline - now);
    const seconds = (remainingMs / 1000).toFixed(1);
    timeEl.textContent = `${seconds}s`;

    if (remainingMs <= 0) {
      handleWin();
      return;
    }

    if (now - state.progressThrottle >= PROGRESS_THROTTLE_MS) {
      state.progressThrottle = now;
      const percent = 1 - remainingMs / TIME_LIMIT_MS;
      postToHost('applet.progress', {
        percent: Math.max(0, Math.min(1, percent)),
        state: 'sprinting'
      });
    }
  }

  function handleWin() {
    if (state.ended) {
      return;
    }
    const score = Math.round(state.distance) + 150;
    setMessage('Sprint survived! Hyper reflexes!', 'success');
    endGame('success', 'Survived the Hyper Run.', score);
  }

  function endGame(outcome, reason, scoreDelta = 0) {
    if (state.ended) return;

    state.ended = true;
    state.running = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    const now = performance.now();
    updateCountdown(now);

    if (outcome === 'fail' || outcome === 'timeout') {
      setMessage(reason, 'fail');
    }

    postToHost('applet.result', {
      outcome,
      reason,
      scoreDelta
    });
  }

  function pauseGame() {
    if (!state.running || state.paused || state.ended) return;
    state.paused = true;
    state.pauseStarted = performance.now();
    setMessage('Paused', '');
  }

  function resumeGame() {
    if (!state.paused || state.ended) return;
    state.paused = false;
    if (state.pauseStarted) {
      const pausedDuration = performance.now() - state.pauseStarted;
      state.deadline += pausedDuration;
      state.pauseStarted = null;
    }
    setMessage('');
  }

  function handleHostEnd() {
    if (state.ended) return;
    endGame('fail', 'Session ended by host.');
  }

  function handleKeydown(event) {
    if (state.paused || state.ended || !state.running) {
      return;
    }

    const key = event.key;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      state.player.targetLane = Math.max(0, state.player.targetLane - 1);
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      state.player.targetLane = Math.min(LANES - 1, state.player.targetLane + 1);
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
        if (state.context?.seed != null) {
          state.rng = createRng(seedFromValue(state.context.seed));
        }
        applyDifficulty(state.context?.difficulty);
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
        state.rafId = requestAnimationFrame(update);
        break;
      case 'host.end':
        handleHostEnd();
        break;
      case 'host.setDifficulty':
        applyDifficulty(data.payload?.level);
        break;
      case 'host.setTimeBudget':
        if (state.running && !state.paused && !state.ended) {
          const remaining = data.payload?.remainingMs;
          if (typeof remaining === 'number') {
            state.deadline = performance.now() + remaining;
          }
        }
        break;
      default:
        break;
    }
  }

  function bootstrapStandalone() {
    if (state.sessionId) return;
    state.sessionId = 'standalone-hyper-run';
    state.rng = createRng(seedFromValue(Date.now()));
    applyDifficulty('medium');
    setTimeout(() => {
      postToHost('applet.ready');
      startGame();
    }, 0);
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', handleKeydown);

  draw(0);

  if (window === window.parent) {
    bootstrapStandalone();
  }
})();
