/**
 * Flappy：一只自动拍翅的小鸟，横版管道。
 *
 * 小鸟不需要按键：它盯着下一个管道的缺口，用一个简单的比例-微分控制器把自己
 * 拉过去。控制器有反应延迟、目标带随机漂移、缺口还会随着得分变窄——所以它
 * 大部分时候能过去，偶尔会撞在管子上，这局就结束。
 */

function clampFlappy(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function spawnPipe(state, x) {
  const margin = state.bird.r + 2;
  const gapSize = state.gapSize;
  const low = margin + gapSize / 2;
  const high = state.height - margin - gapSize / 2;
  const gapY = high > low
    ? low + Math.random() * (high - low)
    : state.height / 2;
  state.pipes.push({ x, gapY, passed: false });
}

export const flappyGame = {
  id: 'flappy',
  name: { en: 'Flappy', zh: '小鸟' },

  create(width, height) {
    const birdR = clampFlappy(height * 0.055, 3, 8);
    const state = {
      width,
      height,
      bird: { x: width * 0.22, y: height * 0.5, vy: 0, r: birdR },
      pipes: [],
      pipeWidth: clampFlappy(height * 0.09, 5, 12),
      spacing: clampFlappy(width * 0.22, 110, 260),
      baseGap: clampFlappy(height * 0.46, 22, 60),
      gapSize: clampFlappy(height * 0.46, 22, 60),
      baseSpeed: clampFlappy(height * 1.9, 95, 220),
      maxSpeed: clampFlappy(height * 4.2, 260, 520),
      score: 0,
      drift: 0,
    };
    spawnPipe(state, width + 40);
    return state;
  },

  step(state, dt) {
    const { bird } = state;
    state.speed = Math.min(state.maxSpeed, state.baseSpeed * (1 + state.score * 0.03));
    state.gapSize = Math.max(state.baseGap * 0.55, state.baseGap - state.score * 0.6);

    for (const pipe of state.pipes) {
      pipe.x -= state.speed * dt;
    }
    while (state.pipes.length > 0 && state.pipes[0].x + state.pipeWidth < -10) {
      state.pipes.shift();
    }
    const last = state.pipes[state.pipes.length - 1];
    if (!last || last.x < state.width - state.spacing) {
      spawnPipe(state, last ? last.x + state.spacing : state.width + 40);
    }

    // 目标：下一个还没过去的管道的缺口中心，带一点反应误差。
    let target = state.height / 2;
    for (const pipe of state.pipes) {
      if (pipe.x + state.pipeWidth > bird.x) {
        target = pipe.gapY;
        break;
      }
    }
    state.drift = state.drift * 0.92 + (Math.random() * 2 - 1) * state.height * 0.035;
    const aim = target + state.drift;

    // 比例-微分控制器：把鸟拉向缺口，同时压住振荡。
    const acceleration = (aim - bird.y) * 26 - bird.vy * 7 + 60;
    bird.vy = clampFlappy(bird.vy + acceleration * dt, -state.height * 3, state.height * 3);
    bird.y += bird.vy * dt;

    if (bird.y - bird.r < 0 || bird.y + bird.r > state.height) return 'over';

    for (const pipe of state.pipes) {
      if (bird.x + bird.r > pipe.x && bird.x - bird.r < pipe.x + state.pipeWidth) {
        const half = state.gapSize / 2;
        if (bird.y - bird.r < pipe.gapY - half || bird.y + bird.r > pipe.gapY + half) {
          return 'over';
        }
      }
      if (!pipe.passed && pipe.x + state.pipeWidth < bird.x) {
        pipe.passed = true;
        state.score += 1;
      }
    }
    return 'running';
  },

  resize(state, width, height) {
    const ratio = height / state.height;
    state.width = width;
    state.height = height;
    state.bird.x = width * 0.22;
    state.bird.y *= ratio;
    state.bird.r = clampFlappy(height * 0.055, 3, 8);
    state.baseGap = clampFlappy(height * 0.46, 22, 60);
    state.gapSize = state.baseGap;
    state.pipeWidth = clampFlappy(height * 0.09, 5, 12);
    state.spacing = clampFlappy(width * 0.22, 110, 260);
    for (const pipe of state.pipes) {
      pipe.x = (pipe.x / state.width) * width;
      pipe.gapY *= ratio;
    }
  },

  draw(ctx, state, width, height, theme) {
    const { bird } = state;
    for (const pipe of state.pipes) {
      const half = state.gapSize / 2;
      ctx.fillStyle = theme.brand;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(pipe.x, 0, state.pipeWidth, Math.max(0, pipe.gapY - half));
      ctx.fillRect(pipe.x, pipe.gapY + half, state.pipeWidth, Math.max(0, height - (pipe.gapY + half)));
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = theme.food;
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI * 2);
    ctx.fill();
  },

  hud(state) {
    return { score: state.score };
  },
};
