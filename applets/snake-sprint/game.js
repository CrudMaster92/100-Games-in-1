(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const timeEl = document.getElementById('time-remaining');
  const messageEl = document.getElementById('message');

  const CELL_SIZE = 30;
  const COLS = 16;
  const ROWS = 9;
  const TICK_MS = 180;
  const TIME_LIMIT_MS = 10000;

  const COLORS = {
    snakeHead: '#42ff9d',
    snakeBody: 'rgba(66, 255, 157, 0.7)',
    snakeHeadTail: 'rgba(66, 255, 157, 0.2)',
    foodA: '#ff3b80',
    foodB: '#ffd166'
  };

  const state = {
    sessionId: null,
    context: {},
    running: false,
    paused: false,
    ended: false,
    snake: [
      { x: 6, y: 4 },
      { x: 5, y: 4 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 4 }
    ],
    direction: { x: 1, y: 0 },
    pendingDirection: { x: 1, y: 0 },
    food: { x: 12, y: 4 },
    flashOn: true,
    lastStepTs: 0,
    deadline: null,
    pauseStarted: null,
    rafId: null,
    flashInterval: null,
    progressThrottle: 0
  };

  canvas.width = COLS * CELL_SIZE;
  canvas.height = ROWS * CELL_SIZE;

  function postToHost(type, payload = {}) {
    if (!state.sessionId) return;
    window.parent?.postMessage({ type, sessionId: state.sessionId, payload }, '*');
  }

  function setMessage(text, outcome) {
    if (!text) {
      messageEl.textContent = '';
      messageEl.className = 'message';
      return;
    }

    messageEl.textContent = text;
    messageEl.className = `message is-visible ${outcome || ''}`.trim();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw snake
    state.snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? getSnakeHeadGradient(segment) : COLORS.snakeBody;
      ctx.fillRect(segment.x * CELL_SIZE, segment.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    });

    // Draw food (flashing)
    const foodColor = state.flashOn ? COLORS.foodA : COLORS.foodB;
    ctx.fillStyle = foodColor;
    ctx.fillRect(state.food.x * CELL_SIZE, state.food.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  function getSnakeHeadGradient(segment) {
    const gradient = ctx.createLinearGradient(
      segment.x * CELL_SIZE,
      segment.y * CELL_SIZE,
      segment.x * CELL_SIZE + CELL_SIZE,
      segment.y * CELL_SIZE + CELL_SIZE
    );
    gradient.addColorStop(0, COLORS.snakeHead);
    gradient.addColorStop(1, COLORS.snakeHeadTail);
    return gradient;
  }

  function step() {
    state.direction = state.pendingDirection;
    const head = state.snake[0];
    const next = { x: head.x + state.direction.x, y: head.y + state.direction.y };

    if (isOutOfBounds(next) || collidesWithSnake(next)) {
      endGame('fail', 'The snake crashed!');
      return;
    }

    state.snake.unshift(next);

    if (next.x === state.food.x && next.y === state.food.y) {
      handleWin();
      return;
    }

    state.snake.pop();
  }

  function collidesWithSnake(point) {
    return state.snake.some((segment) => segment.x === point.x && segment.y === point.y);
  }

  function isOutOfBounds(point) {
    return point.x < 0 || point.y < 0 || point.x >= COLS || point.y >= ROWS;
  }

  function update(time) {
    if (!state.running || state.ended) {
      return;
    }

    if (state.paused) {
      state.rafId = requestAnimationFrame(update);
      return;
    }

    if (!state.lastStepTs) {
      state.lastStepTs = time;
    }

    if (time - state.lastStepTs >= TICK_MS) {
      state.lastStepTs = time;
      step();
      draw();
    }

    updateCountdown(time);

    if (!state.ended) {
      state.rafId = requestAnimationFrame(update);
    }
  }

  function updateCountdown(now) {
    const remainingMs = Math.max(0, state.deadline - now);
    const seconds = (remainingMs / 1000).toFixed(1);
    timeEl.textContent = `${seconds}s`;

    if (remainingMs <= 0) {
      endGame('timeout', "Time's up!");
      return;
    }

    if (now - state.progressThrottle >= 300) {
      state.progressThrottle = now;
      const progress = 1 - remainingMs / TIME_LIMIT_MS;
      postToHost('applet.progress', {
        percent: Math.max(0, Math.min(1, progress)),
        state: 'sprinting'
      });
    }
  }

  function handleWin() {
    setMessage('Snack secured! You win!', 'success');
    draw();
    endGame('success', 'Snake reached the food.', 1200);
  }

  function startFlash() {
    stopFlash();
    state.flashInterval = setInterval(() => {
      state.flashOn = !state.flashOn;
      draw();
    }, 200);
  }

  function stopFlash() {
    if (state.flashInterval) {
      clearInterval(state.flashInterval);
      state.flashInterval = null;
    }
  }

  function startGame() {
    if (state.running) return;

    resetState();
    state.running = true;
    state.ended = false;
    state.deadline = performance.now() + TIME_LIMIT_MS;
    state.lastStepTs = 0;
    setMessage('');
    draw();
    startFlash();
    state.rafId = requestAnimationFrame(update);
    postToHost('applet.progress', { percent: 0, state: 'countdown' });
  }

  function resetState() {
    state.snake = [
      { x: 6, y: 4 },
      { x: 5, y: 4 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 4 }
    ];
    state.direction = { x: 1, y: 0 };
    state.pendingDirection = { x: 1, y: 0 };
    state.food = { x: 12, y: 4 };
    state.flashOn = true;
    state.progressThrottle = 0;
  }

  function endGame(outcome, reason, scoreDelta = 0) {
    if (state.ended) {
      return;
    }

    state.ended = true;
    state.running = false;
    stopFlash();
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

  function handleKeydown(event) {
    const key = event.key;
    if (!state.running || state.paused || state.ended) return;

    const directionMap = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      d: { x: 1, y: 0 }
    };

    const next = directionMap[key];
    if (!next) return;
    if (next.x === -state.direction.x && next.y === -state.direction.y) return;
    state.pendingDirection = next;
  }

  function pauseGame() {
    if (!state.running || state.paused || state.ended) return;
    state.paused = true;
    state.pauseStarted = performance.now();
    stopFlash();
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
    startFlash();
    state.rafId = requestAnimationFrame(update);
  }

  function handleHostEnd() {
    if (state.ended) return;
    endGame('fail', 'Session ended by host.');
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
      return;
    }

    switch (data.type) {
      case 'host.bootstrap':
        state.sessionId = data.sessionId;
        state.context = data.payload || {};
        postToHost('applet.ready');
        break;
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
        // optional: align deadline with host updates
        if (state.running && !state.paused && !state.ended && data.payload && typeof data.payload.remainingMs === 'number') {
          state.deadline = performance.now() + data.payload.remainingMs;
        }
        break;
      default:
        break;
    }
  }

  function bootstrapStandalone() {
    // Provide a lightweight dev mode when launched directly.
    if (state.sessionId) return;
    state.sessionId = 'standalone-session';
    setTimeout(() => {
      postToHost('applet.ready');
    }, 0);
    startGame();
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', handleKeydown);

  draw();

  // Automatically bootstrap when opened outside the host for quick testing.
  if (window === window.parent) {
    bootstrapStandalone();
  }
})();
