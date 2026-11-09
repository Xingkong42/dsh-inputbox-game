/**
 * 输入框小游戏台 / Composer mini-game stage.
 *
 * 行为：
 * - 读取 `useSessionStatus` 发布的「本会话是否正在运行」；
 * - 自己累计「连续运行」的时长，超过阈值（默认 3 分钟）后接管对话输入框；
 * - 接管期间输入框整块变成一块自动运行的小游戏棋盘（不需要任何人为操作）；
 * - 输入框一获得焦点立刻恢复正常编辑；失去焦点后若任务仍在运行，稍后重新接管。
 *
 * 落点：`conversation.input.overlay`（会话级列表槽位，渲染在输入框卡片内部）。
 * 宿主把该槽位放在 `div.overlayAnchor` 里——一个 `position:absolute; inset:0 0 auto;
 * height:0` 的锚点，而输入框卡片本身是 `position:relative`。因此本插件用一个
 * `position:absolute` 的子节点就能精确盖住整张卡片。
 *
 * 整个覆盖层 `pointer-events:none`：点击会穿透到下面的编辑器，于是「聚焦输入框
 * 即恢复正常」不需要任何额外交互。
 *
 * 游戏源码在 src/games/*.mjs，由 scripts/build-client.mjs 内联进本模板生成的
 * client.js；这里只写外壳（计时、测量、焦点、HUD、导演）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-inputbox-game',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;

    // ---- src/games/snake.mjs ----
/**
 * 贪吃蛇。
 *
 * 贪心走位：每一步走最短的那条路去吃食物（同样短的随机挑一条）。
 * 不做「别把自己围死」的兜底——那会让蛇永远不死、只能绕固定圈。
 * 于是它会越玩越长，终于某一步把活动空间用光，撞上自己。
 */

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** 棋盘格边长（CSS 像素）。 */
const SNAKE_CELL = 12;

function cellKey(x, y) {
  return `${x},${y}`;
}

function inBounds(state, x, y) {
  return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
}

/**
 * 身体占位集合。
 *
 * `ignoreTail` 为真时不含尾巴那一格：蛇每走一步尾巴都会让开，所以这一格
 * 此刻是可以走的（食物永远不会落在身上，所以不存在「吃到食物时尾巴不让开」
 * 的情形）。
 */
function bodySet(state, ignoreTail) {
  const set = new Set();
  const limit = ignoreTail ? state.body.length - 1 : state.body.length;
  for (let index = 0; index < limit; index += 1) {
    const part = state.body[index];
    set.add(cellKey(part.x, part.y));
  }
  return set;
}

function resetSnake(state) {
  const y = Math.min(Math.max(0, Math.floor(state.rows / 2)), Math.max(0, state.rows - 1));
  const headX = Math.min(Math.max(2, Math.floor(state.cols / 4)), Math.max(0, state.cols - 1));
  state.body = [{ x: headX, y }];
  while (state.body.length < 3) {
    const tail = state.body[state.body.length - 1];
    if (tail.x - 1 < 0) break;
    state.body.push({ x: tail.x - 1, y });
  }
  state.dir = DIRS[0];
}

function placeFood(state) {
  const taken = bodySet(state, false);
  const free = [];
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      if (!taken.has(cellKey(x, y))) free.push({ x, y });
    }
  }
  state.food = free.length === 0
    ? null
    : free[Math.floor(Math.random() * free.length)];
}

/** 从 target 出发、避开 blocked 的距离场：每个格子离 target 有几步。 */
function distanceField(state, target, blocked) {
  const dist = new Map();
  if (!target) return dist;
  dist.set(cellKey(target.x, target.y), 0);
  const queue = [target];
  while (queue.length > 0) {
    const current = queue.shift();
    const depth = dist.get(cellKey(current.x, current.y));
    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (!inBounds(state, nx, ny)) continue;
      const key = cellKey(nx, ny);
      if (dist.has(key) || blocked.has(key)) continue;
      dist.set(key, depth + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

/** 从 (x, y) 出发能活动到多少格。 */
function freeSpace(state, x, y) {
  const blocked = bodySet(state, true);
  const seen = new Set([cellKey(x, y)]);
  const queue = [{ x, y }];
  let count = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    count += 1;
    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (!inBounds(state, nx, ny)) continue;
      const key = cellKey(nx, ny);
      if (seen.has(key) || blocked.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return count;
}

function chooseDirection(state) {
  const head = state.body[0];
  const blocked = bodySet(state, true);

  const safe = [];
  for (const dir of DIRS) {
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;
    if (!inBounds(state, nx, ny)) continue;
    if (blocked.has(cellKey(nx, ny))) continue;
    safe.push(dir);
  }
  if (safe.length === 0) return state.dir;

  const shortest = (candidates, dist) => {
    let best = Infinity;
    const picks = [];
    for (const dir of candidates) {
      const nx = head.x + dir.x;
      const ny = head.y + dir.y;
      const depth = dist.get(cellKey(nx, ny));
      if (depth === undefined) continue;
      if (depth < best) {
        best = depth;
        picks.length = 0;
        picks.push(dir);
      } else if (depth === best) {
        picks.push(dir);
      }
    }
    return picks;
  };

  const foodSteps = shortest(safe, distanceField(state, state.food, blocked));
  if (foodSteps.length > 0) {
    return foodSteps[Math.floor(Math.random() * foodSteps.length)];
  }

  let fallback = safe[0];
  let bestArea = -1;
  for (const dir of safe) {
    const area = freeSpace(state, head.x + dir.x, head.y + dir.y);
    if (area > bestArea) {
      bestArea = area;
      fallback = dir;
    }
  }
  return fallback;
}

/** 走一格。返回 'moved' / 'ate' / 'died'。 */
function advance(state) {
  const dir = chooseDirection(state);
  if (!dir) return 'died';
  const head = state.body[0];
  const nx = head.x + dir.x;
  const ny = head.y + dir.y;
  if (!inBounds(state, nx, ny) || bodySet(state, true).has(cellKey(nx, ny))) {
    return 'died';
  }
  state.dir = dir;
  state.body.unshift({ x: nx, y: ny });
  if (state.food && state.food.x === nx && state.food.y === ny) {
    state.score += 1;
    placeFood(state);
    return 'ate';
  }
  state.body.pop();
  return 'moved';
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const snakeGame = {
  id: 'snake',
  name: { en: 'Snake', zh: '贪吃蛇' },

  create(width, height) {
    const cols = Math.max(8, Math.floor(width / SNAKE_CELL));
    const rows = Math.max(2, Math.floor(height / SNAKE_CELL));
    const state = {
      cols,
      rows,
      width,
      height,
      body: [],
      dir: DIRS[0],
      food: null,
      score: 0,
      accumulator: 0,
    };
    resetSnake(state);
    placeFood(state);
    return state;
  },

  step(state, dt) {
    state.accumulator += dt * 1000;
    const stepMs = Math.max(70, 150 - state.score * 4);
    let guard = 0;
    while (state.accumulator >= stepMs && guard < 8) {
      state.accumulator -= stepMs;
      guard += 1;
      if (advance(state) === 'died') return 'over';
    }
    return 'running';
  },

  draw(ctx, state, width, height, theme) {
    const SNAKE_CELL = Math.max(6, Math.min(width / state.cols, height / state.rows));
    const boardWidth = SNAKE_CELL * state.cols;
    const boardHeight = SNAKE_CELL * state.rows;
    const offsetX = (width - boardWidth) / 2;
    const offsetY = (height - boardHeight) / 2;

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    for (let column = 1; column < state.cols; column += 1) {
      const x = Math.round(offsetX + column * SNAKE_CELL) + 0.5;
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + boardHeight);
    }
    for (let row = 1; row < state.rows; row += 1) {
      const y = Math.round(offsetY + row * SNAKE_CELL) + 0.5;
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + boardWidth, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (state.food) {
      ctx.fillStyle = theme.food;
      ctx.beginPath();
      ctx.arc(
        offsetX + (state.food.x + 0.5) * SNAKE_CELL,
        offsetY + (state.food.y + 0.5) * SNAKE_CELL,
        Math.max(2.5, SNAKE_CELL * 0.26),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const total = Math.max(1, state.body.length);
    state.body.forEach((part, index) => {
      const freshness = 1 - index / total;
      ctx.globalAlpha = 0.4 + 0.6 * freshness;
      ctx.fillStyle = theme.brand;
      const padding = Math.max(1, SNAKE_CELL * 0.14);
      roundRectPath(
        ctx,
        offsetX + part.x * SNAKE_CELL + padding,
        offsetY + part.y * SNAKE_CELL + padding,
        SNAKE_CELL - padding * 2,
        SNAKE_CELL - padding * 2,
        Math.max(2, SNAKE_CELL * 0.28),
      );
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },

  hud(state) {
    return { score: state.score };
  },
};


// ---- src/games/pong.mjs ----
/**
 * Pong：两块 AI 挡板自动对打。
 *
 * 扁宽的输入框正是 Pong 的原生形状，所以这是四个游戏里最贴合容器的一个。
 *
 * 两块挡板都用「预测落点」驱动：先按当前球速模拟几次墙面反射，算出球会落到
 * 哪一格，再把挡板往那儿挪。但预测会带一个随机漂移（模拟反应误差），而且挡板
 * 有速度上限——所以 AI 偶尔会漏接，于是比分会来回动，游戏会分出胜负。
 */

/** 拿到多少分算一局结束。 */
const WIN_SCORE = 5;

function clampPong(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function createBall(state, toward) {
  const angle = (25 + Math.random() * 20) * (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 180);
  const speed = state.baseSpeed;
  return {
    x: state.width / 2,
    y: state.height / 2,
    vx: Math.cos(angle) * speed * toward,
    vy: Math.sin(angle) * speed,
    r: state.ballR,
    prevX: state.width / 2,
  };
}

/**
 * 预测球到达 targetX 时的纵坐标。
 *
 * 只考虑上下墙的反射，不考虑挡板——够用了：预测本来就是用来让 AI 「大致」
 * 站在正确位置，误差正是这个游戏的一部分。
 */
function predictLanding(state, targetX) {
  const { ball, height } = state;
  let x = ball.x;
  let y = ball.y;
  let vx = ball.vx;
  let vy = ball.vy;
  const r = ball.r;
  for (let i = 0; i < 4000; i += 1) {
    x += vx;
    y += vy;
    if (y < r) {
      y = r + (r - y);
      vy = Math.abs(vy);
    } else if (y > height - r) {
      y = (height - r) - (y - (height - r));
      vy = -Math.abs(vy);
    }
    if (vx < 0 && x <= targetX) return y;
    if (vx > 0 && x >= targetX) return y;
    if (vx === 0) return y;
  }
  return y;
}

function movePaddle(state, paddle, targetX, approaching, dt) {
  // 球正朝自己飞的时候去追落点；球朝反方向飞的时候回到中间待命。
  const predicted = approaching ? predictLanding(state, targetX) : state.height / 2;
  paddle.error = paddle.error * 0.96 + (Math.random() * 2 - 1) * state.errorAmplitude;
  const target = predicted + paddle.error;
  const maxStep = state.paddleSpeed * dt;
  const delta = target - paddle.y;
  paddle.y += clampPong(delta, -maxStep, maxStep);
  const half = state.paddleH / 2;
  paddle.y = clampPong(paddle.y, half, state.height - half);
}

function bounce(state, ball, paddle, direction) {
  const offset = clampPong((ball.y - paddle.y) / (state.paddleH / 2), -1, 1);
  const angle = clampPong(offset * 0.85, 0.28, Math.PI - 0.28);
  const speed = Math.min(state.maxSpeed, state.speed + 7);
  state.speed = speed;
  ball.vx = Math.cos(angle) * speed * direction;
  ball.vy = Math.sin(angle) * speed;
  state.rally += 1;
  state.bestRally = Math.max(state.bestRally, state.rally);
}

const pongGame = {
  id: 'pong',
  name: { en: 'Pong', zh: '乒乓' },

  create(width, height) {
    const state = {
      width,
      height,
      paddleH: clampPong(height * 0.28, 12, 36),
      paddleW: clampPong(height * 0.07, 4, 8),
      ballR: clampPong(height * 0.05, 3, 7),
      baseSpeed: clampPong(height * 3.2, 150, 340),
      maxSpeed: clampPong(height * 6.2, 320, 720),
      paddleSpeed: clampPong(height * 4.6, 170, 520),
      errorAmplitude: clampPong(height * 0.16, 5, 22),
      speed: 0,
      rally: 0,
      bestRally: 0,
      left: { y: height / 2, score: 0, error: 0 },
      right: { y: height / 2, score: 0, error: 0 },
      ball: null,
    };
    state.speed = state.baseSpeed;
    state.ball = createBall(state, 1);
    return state;
  },

  step(state, dt) {
    const { ball } = state;
    const halfPaddle = state.paddleH / 2;

    movePaddle(state, state.left, state.paddleW, ball.vx < 0, dt);
    movePaddle(state, state.right, state.width - state.paddleW, ball.vx > 0, dt);

    ball.prevX = ball.x;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // 上下墙
    if (ball.y < ball.r) {
      ball.y = ball.r + (ball.r - ball.y);
      ball.vy = Math.abs(ball.vy);
    } else if (ball.y > state.height - ball.r) {
      ball.y = (state.height - ball.r) - (ball.y - (state.height - ball.r));
      ball.vy = -Math.abs(ball.vy);
    }

    // 左挡板
    if (ball.vx < 0 && ball.prevX >= state.paddleW && ball.x <= state.paddleW) {
      if (Math.abs(ball.y - state.left.y) <= halfPaddle + ball.r) {
        bounce(state, ball, state.left, 1);
      }
    }
    // 右挡板
    if (ball.vx > 0 && ball.prevX <= state.width - state.paddleW && ball.x >= state.width - state.paddleW) {
      if (Math.abs(ball.y - state.right.y) <= halfPaddle + ball.r) {
        bounce(state, ball, state.right, -1);
      }
    }

    // 得分
    if (ball.x < -ball.r) {
      state.right.score += 1;
      if (state.right.score >= WIN_SCORE) return 'over';
      state.speed = state.baseSpeed;
      state.rally = 0;
      state.ball = createBall(state, 1);
      return 'running';
    }
    if (ball.x > state.width + ball.r) {
      state.left.score += 1;
      if (state.left.score >= WIN_SCORE) return 'over';
      state.speed = state.baseSpeed;
      state.rally = 0;
      state.ball = createBall(state, -1);
      return 'running';
    }

    return 'running';
  },

  resize(state, width, height) {
    const ratio = height / state.height;
    state.width = width;
    state.height = height;
    state.left.y *= ratio;
    state.right.y *= ratio;
    state.ball.x = width / 2;
    state.ball.y *= ratio;
  },

  draw(ctx, state, width, height, theme) {
    ctx.fillStyle = theme.grid;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, Math.round(height / 2) - 0.5, width, 1);
    ctx.globalAlpha = 1;

    const paddleWidth = state.paddleW;
    const paddleHeight = state.paddleH;
    const halfPaddle = paddleHeight / 2;
    ctx.fillStyle = theme.brand;
    ctx.fillRect(0, state.left.y - halfPaddle, paddleWidth, paddleHeight);
    ctx.fillRect(width - paddleWidth, state.right.y - halfPaddle, paddleWidth, paddleHeight);

    const { ball } = state;
    ctx.fillStyle = theme.food;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  },

  hud(state) {
    return { score: `${state.left.score} : ${state.right.score}`, detail: state.bestRally };
  },
};


// ---- src/games/flappy.mjs ----
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

const flappyGame = {
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


// ---- src/games/life.mjs ----
/**
 * 生态箱（原来的「生命游戏」）。
 *
 * Conway 生命游戏在这个容器里行不通：输入框是 800×74，折算下来只有 6 行格子，
 * 六行高的生命游戏几乎必然死绝；而且一秒演二十代，眼睛根本追不上变化。
 *
 * 这里换成一套「群体 + 资源 + 灾害」的生态模拟：
 * - 生物在容器里游荡，吃掉绿色资源维命，能量够了就分裂（群体增长）；
 * - 能量耗尽就饿死（群体减少）；
 * - 定期降临灾害：陨石砸出一片死区、寒潮让代谢翻倍、干旱让资源断供；
 * - 群体超过承载力会触发「群体爆发」：资源被吃光，大批饿死；
 * - 群体归零，这一局就结束。
 *
 * 群体数因此会起起伏伏——涨上去、掉下来，不是一块永远不变的噪点。
 */

function clampLife(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function randomIn(low, high) {
  return low + Math.random() * (high - low);
}

function makeCreature(state, spread) {
  const radius = randomIn(2, 3.4);
  return {
    x: randomIn(radius, state.width - radius),
    y: randomIn(radius, state.height - radius),
    vx: randomIn(-20, 20),
    vy: randomIn(-20, 20),
    energy: state.splitEnergy,
    radius,
    speed: randomIn(26, 44),
    phase: randomIn(0, Math.PI * 2),
  };
}

/** 朝最近的资源偏一点，同时带一点随机游走；撞到边界反弹。 */
function steer(state, creature, dt) {
  let target = null;
  let nearest = Infinity;
  for (const resource of state.resources) {
    const dx = resource.x - creature.x;
    const dy = resource.y - creature.y;
    const distance = dx * dx + dy * dy;
    if (distance < nearest) {
      nearest = distance;
      target = resource;
    }
  }

  const speed = creature.speed * (state.freezeTimer > 0 ? 0.55 : 1);
  let desiredX;
  let desiredY;
  if (target) {
    desiredX = target.x - creature.x;
    desiredY = target.y - creature.y;
  } else {
    const angle = state.time * 0.6 + creature.phase;
    desiredX = Math.cos(angle) * 60;
    desiredY = Math.sin(angle * 1.3) * 30;
  }

  const current = Math.atan2(creature.vy, creature.vx);
  const wanted = Math.atan2(desiredY, desiredX);
  let diff = wanted - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = clampLife(diff, -3.2 * dt, 3.2 * dt);
  const angle = current + turn;
  creature.vx = Math.cos(angle) * speed;
  creature.vy = Math.sin(angle) * speed;
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;

  if (creature.x < creature.radius) {
    creature.x = creature.radius;
    creature.vx = Math.abs(creature.vx);
  } else if (creature.x > state.width - creature.radius) {
    creature.x = state.width - creature.radius;
    creature.vx = -Math.abs(creature.vx);
  }
  if (creature.y < creature.radius) {
    creature.y = creature.radius;
    creature.vy = Math.abs(creature.vy);
  } else if (creature.y > state.height - creature.radius) {
    creature.y = state.height - creature.radius;
    creature.vy = -Math.abs(creature.vy);
  }
}

function triggerDisaster(state) {
  const roll = Math.random();
  if (roll < 0.45) {
    const radius = clampLife(Math.min(state.width, state.height) * 0.32, 18, 90);
    state.events.push({
      kind: 'meteor',
      x: randomIn(radius, state.width - radius),
      y: randomIn(radius, state.height - radius),
      radius,
      ttl: 0.55,
      life: 0.55,
    });
  } else if (roll < 0.72) {
    state.freezeTimer = 6;
    state.events.push({ kind: 'freeze', x: 0, y: 0, radius: 0, ttl: 6, life: 6 });
  } else {
    state.droughtTimer = 12;
    state.events.push({ kind: 'drought', x: 0, y: 0, radius: 0, ttl: 12, life: 12 });
  }
}

const lifeGame = {
  id: 'life',
  name: { en: 'Ecology', zh: '生态箱' },

  create(width, height) {
    const maxCreatures = clampLife(Math.round((width * height) / 900), 18, 90);
    const state = {
      width,
      height,
      creatures: [],
      resources: [],
      events: [],
      banner: null,
      time: 0,
      peak: 0,
      births: 0,
      deaths: 0,
      maxCreatures,
      capacity: Math.round(maxCreatures * 0.45),
      resourceInterval: 0.34,
      maxResources: 34,
      resourceEnergy: 55,
      resourceLife: 11,
      energyDecay: 4.5,
      reproduceAt: 92,
      splitEnergy: 46,
      disasterTimer: 7,
      freezeTimer: 0,
      droughtTimer: 0,
      boomCooldown: 0,
    };
    for (let i = 0; i < Math.round(maxCreatures * 0.3); i += 1) {
      state.creatures.push(makeCreature(state, true));
    }
    return state;
  },

  step(state, dt) {
    state.time += dt;
    state.freezeTimer = Math.max(0, state.freezeTimer - dt);
    state.droughtTimer = Math.max(0, state.droughtTimer - dt);
    state.boomCooldown = Math.max(0, state.boomCooldown - dt);

    // 资源：干旱时几乎断供。
    const interval = state.resourceInterval * (state.droughtTimer > 0 ? 3 : 1);
    state.resourceTimer = (state.resourceTimer ?? interval) - dt;
    while (state.resourceTimer <= 0) {
      state.resourceTimer += interval;
      if (state.resources.length < state.maxResources) {
        state.resources.push({
          x: randomIn(6, state.width - 6),
          y: randomIn(6, state.height - 6),
          life: state.resourceLife,
        });
      }
    }
    for (const resource of state.resources) resource.life -= dt;
    state.resources = state.resources.filter((resource) => resource.life > 0);

    // 群体：移动、觅食、代谢。
    const survivors = [];
    for (const creature of state.creatures) {
      steer(state, creature, dt);
      const decay = state.energyDecay * (state.freezeTimer > 0 ? 2 : 1);
      creature.energy -= decay * dt;
      if (creature.energy <= 0) {
        state.deaths += 1;
        continue;
      }
      survivors.push(creature);
    }
    state.creatures = survivors;

    // 吃资源。
    for (const creature of state.creatures) {
      for (let index = state.resources.length - 1; index >= 0; index -= 1) {
        const resource = state.resources[index];
        const dx = resource.x - creature.x;
        const dy = resource.y - creature.y;
        const reach = creature.radius + 4;
        if (dx * dx + dy * dy <= reach * reach) {
          creature.energy += state.resourceEnergy;
          state.resources.splice(index, 1);
          break;
        }
      }
    }

    // 繁殖：能量够了就分裂，群体增长。
    if (state.creatures.length < state.maxCreatures) {
      const newborns = [];
      for (const creature of state.creatures) {
        if (creature.energy < state.reproduceAt) continue;
        creature.energy = state.splitEnergy;
        const child = makeCreature(state, false);
        child.x = creature.x + randomIn(-5, 5);
        child.y = creature.y + randomIn(-5, 5);
        child.energy = state.splitEnergy;
        newborns.push(child);
        state.births += 1;
      }
      state.creatures = state.creatures.concat(newborns.slice(0, state.maxCreatures - state.creatures.length));
    }

    // 灾害。
    state.disasterTimer -= dt;
    if (state.disasterTimer <= 0) {
      state.disasterTimer = randomIn(6, 12);
      triggerDisaster(state);
    }
    for (const event of state.events) {
      event.ttl -= dt;
      if (event.kind === 'meteor' && event.ttl > 0) {
        for (const creature of state.creatures) {
          const dx = creature.x - event.x;
          const dy = creature.y - event.y;
          if (dx * dx + dy * dy <= event.radius * event.radius) {
            creature.energy -= 140 * dt;
          }
        }
        state.resources = state.resources.filter((resource) => {
          const dx = resource.x - event.x;
          const dy = resource.y - event.y;
          return dx * dx + dy * dy > event.radius * event.radius;
        });
      }
    }
    state.events = state.events.filter((event) => event.ttl > 0);

    // 群体爆发：超过承载力，资源被吃光，大批饿死。
    if (state.creatures.length > state.capacity && state.boomCooldown <= 0) {
      state.boomCooldown = 6;
      const doomed = Math.ceil(state.creatures.length * 0.45);
      state.creatures.sort((left, right) => left.energy - right.energy);
      for (let index = 0; index < doomed && index < state.creatures.length; index += 1) {
        state.creatures[index].energy = 0;
      }
      state.deaths += doomed;
      state.banner = { key: 'boom', ttl: 1.6 };
    }
    state.creatures = state.creatures.filter((creature) => creature.energy > 0);

    // 事件横幅。
    if (state.banner) {
      state.banner.ttl -= dt;
      if (state.banner.ttl <= 0) state.banner = null;
    }
    for (const event of state.events) {
      if (event.kind !== 'meteor') state.banner = { key: event.kind, ttl: Math.min(event.ttl, 1.6) };
    }

    state.peak = Math.max(state.peak, state.creatures.length);

    // 群体归零 = 这一局结束。
    if (state.creatures.length === 0) return 'over';
    return 'running';
  },

  resize(state, width, height) {
    const ratioX = width / state.width;
    const ratioY = height / state.height;
    state.width = width;
    state.height = height;
    state.maxCreatures = clampLife(Math.round((width * height) / 900), 18, 90);
    state.capacity = Math.round(state.maxCreatures * 0.45);
    for (const creature of state.creatures) {
      creature.x *= ratioX;
      creature.y *= ratioY;
    }
    for (const resource of state.resources) {
      resource.x *= ratioX;
      resource.y *= ratioY;
    }
  },

  draw(ctx, state, width, height, theme, labels) {
    // 资源：绿色的补给点，越接近过期越暗。
    for (const resource of state.resources) {
      const freshness = clampLife(resource.life / 3, 0.25, 1);
      ctx.globalAlpha = 0.35 + 0.55 * freshness;
      ctx.fillStyle = theme.success;
      ctx.beginPath();
      ctx.arc(resource.x, resource.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 生物：能量越足越亮。
    for (const creature of state.creatures) {
      const vigor = clampLife(creature.energy / state.reproduceAt, 0, 1);
      ctx.globalAlpha = 0.35 + 0.6 * vigor;
      ctx.fillStyle = theme.brand;
      ctx.beginPath();
      ctx.arc(creature.x, creature.y, creature.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 陨石：正在扩张的红色冲击环。
    for (const event of state.events) {
      if (event.kind !== 'meteor') continue;
      const progress = 1 - event.ttl / event.life;
      ctx.globalAlpha = 0.5 * (1 - progress);
      ctx.strokeStyle = theme.error;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(event.x, event.y, event.radius * (0.4 + 0.6 * progress), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 事件横幅。
    if (state.banner && labels) {
      const text = labels[state.banner.key];
      if (text) {
        ctx.globalAlpha = clampLife(state.banner.ttl, 0, 1);
        ctx.fillStyle = theme.label;
        ctx.font = '600 12px var(--dsw-font-family, Inter), sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  },

  hud(state) {
    return { score: state.creatures.length, unit: 'population' };
  },
};


// ---- src/games/horse.mjs ----
/**
 * 赛马：五匹马在跑道上自动比赛，你押了一注。
 *
 * 这是一款「观赏 + 押注」的游戏：马匹各有基础速度和爆发力，比赛有终点线；
 * 每场比赛前自动挑一匹马下注并给出赔率，押中赢钱、押错赔钱，
 * 本金赔光这一局就结束。
 *
 * 摄像机跟着领先的马走（并锁死不回退），所以落后的马会从左边追上来，
 * 终点线从右边滚进来——横版卷轴的经典调度。
 */

const HORSE_COUNT = 5;

/** 五匹马的颜色，互相能分清。 */
const HORSE_COLORS = ['#e0483c', '#3b82f6', '#f0a92c', '#22a06b', '#8b5cf6'];

function clampRace(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function makeHorse(index) {
  return {
    index,
    x: Math.random() * 26,
    base: 52 + Math.random() * 26,
    stamina: 0.7 + Math.random() * 0.6,
    burstTimer: 0.8 + Math.random() * 3,
    bursting: false,
    recovery: 0,
    phase: Math.random() * Math.PI * 2,
    color: HORSE_COLORS[index % HORSE_COLORS.length],
  };
}

/**
 * 每场比赛前给所有马重新洗牌：基础速度、体力、爆发节奏全部重掷。
 *
 * 这一步是必须的：实力只在建局时随机一次的话，同一匹马永远是那匹最快的，
 * 连着几场的名次几乎一模一样（第一局 3 号领先，之后场场 3 号领先）。
 * 每场重掷之后，每匹马都是这一场的角色——快的马这场快，下场可能就掉队。
 */
function reshuffleHorses(state) {
  for (const horse of state.horses) {
    horse.base = 52 + Math.random() * 26;
    horse.stamina = 0.7 + Math.random() * 0.6;
    horse.x = Math.random() * 26;
    horse.burstTimer = 0.5 + Math.random() * 2.5;
    horse.bursting = false;
    horse.recovery = 0;
    horse.phase = Math.random() * Math.PI * 2;
  }
}

/** 摄像机锁死不回退，但也不让领先马跑出画面。 */
function updateCamera(state) {
  let leader = state.horses[0];
  for (const horse of state.horses) {
    if (horse.x > leader.x) leader = horse;
  }
  const wanted = leader.x - state.width * 0.62;
  if (wanted > state.cameraX) state.cameraX = wanted;
}

/**
 * 开赛前挑一匹马下注。
 *
 * 赔率按「这匹马大概能赢多少」算，再抽走两成给庄家：
 * 公平赔率是 (1-p)/p，给出 ×0.8 之后每场的期望是负的
 * （E = p·赔率 − (1−p) = −0.2·(1−p)），所以本金会慢慢缩水，
 * 押中一次能拉回一大截，但长期一定走向破产——这就是这款游戏的失败机制。
 */
function beginBet(state) {
  state.phase = 'betting';
  state.phaseTimer = 1.1;
  // 先洗牌，再算赔率——赔率必须对应这一场的实力，而不是上一场的。
  reshuffleHorses(state);
  state.cameraX = 0;
  const weights = state.horses.map((horse) => horse.base ** 1.2);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  let picked = 0;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      picked = index;
      break;
    }
  }
  state.picked = picked;
  state.bet = Math.max(5, Math.round(state.bankroll * 0.45));
  const chance = weights[picked] / total;
  state.odds = Math.max(1.2, Math.round(((1 - chance) / chance) * 0.8 * 10) / 10);
}

function startRace(state) {
  state.phase = 'racing';
  state.finishAt = 900 + Math.random() * 700;
}

function settleRace(state) {
  const order = [...state.horses].sort((left, right) => right.x - left.x);
  state.order = order.map((horse) => horse.index);
  state.winner = order[0].index;
  const place = order.findIndex((horse) => horse.index === state.picked) + 1;
  state.lastPlace = place;
  state.won = place === 1;
  if (state.won) state.bankroll += state.bet * state.odds;
  else state.bankroll = Math.max(0, state.bankroll - state.bet);
  state.phase = 'settling';
  state.phaseTimer = 2.2;
}

const horseGame = {
  id: 'horse',
  name: { en: 'Horse race', zh: '赛马' },

  create(width, height) {
    const lanes = Math.max(3, Math.min(HORSE_COUNT, Math.floor(height / 15)));
    const laneHeight = height / lanes;
    const state = {
      width,
      height,
      lanes,
      laneHeight,
      horses: [],
      cameraX: 0,
      bankroll: 100,
      bet: 10,
      odds: 3,
      picked: 0,
      lastPlace: 0,
      won: false,
      order: [],
      phase: 'betting',
      phaseTimer: 1.1,
      finishAt: 1200,
      distance: 0,
    };
    for (let index = 0; index < lanes; index += 1) {
      const horse = makeHorse(index);
      horse.y = laneHeight * (index + 0.5);
      state.horses.push(horse);
    }
    beginBet(state);
    return state;
  },

  step(state, dt) {
    if (state.phase === 'betting') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) startRace(state);
      return 'running';
    }

    if (state.phase === 'racing') {
      for (const horse of state.horses) {
        // 爆发 / 恢复：跑一段快的，再慢下来喘口气。
        if (horse.bursting) {
          horse.burstTimer -= dt;
          if (horse.burstTimer <= 0) {
            horse.bursting = false;
            horse.recovery = 0.8 + Math.random() * 1.2;
          }
        } else if (horse.recovery > 0) {
          horse.recovery -= dt;
        } else {
          horse.burstTimer -= dt;
          if (horse.burstTimer <= 0) {
            horse.bursting = true;
            horse.burstTimer = 0.9 + Math.random() * 1.4;
          }
        }
        let speed = horse.base;
        if (horse.bursting) speed = horse.base * 1.45 * horse.stamina;
        else if (horse.recovery > 0) speed = horse.base * 0.72;
        horse.x += speed * dt;
        horse.phase += dt * (6 + speed * 0.08);
      }
      updateCamera(state);
      let leader = state.horses[0];
      for (const horse of state.horses) {
        if (horse.x > leader.x) leader = horse;
      }
      state.distance = leader.x;
      if (leader.x >= state.finishAt) settleRace(state);
      return 'running';
    }

    // 结算：停一下让结果看清楚。
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.bankroll <= 0) return 'over';
      beginBet(state);
    }
    return 'running';
  },

  resize(state, width, height) {
    const ratio = height / state.height;
    state.width = width;
    state.height = height;
    state.laneHeight = height / state.lanes;
    for (const horse of state.horses) horse.y *= ratio;
  },

  draw(ctx, state, width, height, theme) {
    // 跑道：随镜头滚动的刻度线。
    ctx.strokeStyle = theme.grid;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const markerSpacing = 50;
    const first = Math.floor(state.cameraX / markerSpacing) * markerSpacing;
    for (let x = first; x < state.cameraX + width; x += markerSpacing) {
      const screenX = Math.round(x - state.cameraX) + 0.5;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, height);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 跑道分道线。
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    for (let lane = 1; lane < state.lanes; lane += 1) {
      const y = Math.round(state.laneHeight * lane) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 终点线：黑白格子带。
    const finishX = state.finishAt - state.cameraX;
    if (finishX > -30 && finishX < width + 30) {
      const cell = 8;
      for (let row = 0; row * cell < height; row += 1) {
        for (let column = 0; column * cell < 16; column += 1) {
          ctx.fillStyle = (row + column) % 2 === 0 ? '#f5f5f5' : '#20242b';
          ctx.fillRect(finishX + column * cell, row * cell, cell, cell);
        }
      }
    }

    // 马。
    for (const horse of state.horses) {
      const x = horse.x - state.cameraX;
      if (x < -40 || x > width + 40) continue;
      drawHorse(ctx, horse, x, horse.y, theme, horse.index === state.picked);
    }
  },

  hud(state) {
    let detail = null;
    if (state.phase === 'betting') {
      detail = { kind: 'bet', n: state.picked + 1, odds: state.odds };
    } else if (state.phase === 'racing') {
      let leader = state.horses[0];
      for (const horse of state.horses) if (horse.x > leader.x) leader = horse;
      detail = { kind: 'lead', n: leader.index + 1 };
    } else {
      detail = state.won
        ? { kind: 'win', n: state.bet * state.odds }
        : { kind: 'lose', n: state.bet };
    }
    return { score: state.bankroll, unit: 'bankroll', detail };
  },
};

/** 画一匹马：身体 + 颈 + 头 + 四条摆动的腿 + 尾巴。 */
function drawHorse(ctx, horse, x, y, theme, picked) {
  const swing = Math.sin(horse.phase) * 3.2;
  const body = horse.color;
  ctx.save();
  ctx.translate(x, y);

  // 影子
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(0, 5, 11, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 腿
  ctx.strokeStyle = body;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, 1); ctx.lineTo(-5 - swing, 6);
  ctx.moveTo(-2, 1); ctx.lineTo(-2 + swing, 6);
  ctx.moveTo(4, 1); ctx.lineTo(4 + swing, 6);
  ctx.moveTo(7, 1); ctx.lineTo(7 - swing, 6);
  ctx.stroke();

  // 尾巴
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.quadraticCurveTo(-14, -3 + swing * 0.4, -13, 2 + swing * 0.3);
  ctx.stroke();

  // 身体
  ctx.fillStyle = body;
  roundRectHorse(ctx, -10, -5, 17, 7, 3);
  ctx.fill();

  // 颈与头
  ctx.beginPath();
  ctx.moveTo(6, -4);
  ctx.lineTo(11, -11);
  ctx.lineTo(15, -10);
  ctx.lineTo(9, -2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(14, -11, 4, 2.6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // 鬃毛
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(9, -8);
  ctx.lineTo(13, -12);
  ctx.stroke();

  // 眼睛
  ctx.fillStyle = '#101418';
  ctx.beginPath();
  ctx.arc(15, -12, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // 押中的那匹：脚下画个圈
  if (picked) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = theme.food;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 5, 13, 3.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function roundRectHorse(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}


// ---- src/games/runner.mjs ----
/**
 * 跳跃跑酷：小人自动向前奔跑，遇到障碍或深坑就自动起跳。
 *
 * 横向卷轴：世界向左滚，小人固定在屏幕左侧 22% 处，速度随距离慢慢加快。
 * 障碍分两种——地上的方块（跳过去）和地面的缺口（跃过去，掉下去就死）。
 *
 * 失败即结束：撞上障碍或掉进缺口，这一局就完了，由导演换下一个游戏。
 */

const GRAVITY = 900;
const JUMP_SPEED = 330;

function clampRun(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function randomBetween(low, high) {
  return low + Math.random() * (high - low);
}

function spawnObstacle(state) {
  const reach = (2 * JUMP_SPEED / GRAVITY) * state.speed;
  // 障碍生成在屏幕右边缘之外。障碍的 x 是「会左移的屏幕坐标」，
  // 所以相邻障碍的实际间距 = 生成间隔 × 当前速度，不会因为写死常数而挤成一团。
  const x = state.width + 20;
  if (Math.random() < 0.66) {
    // 方块：矮而窄，跳过去就行。
    state.obstacles.push({
      kind: 'block',
      x,
      w: 9 + Math.random() * 9,
      h: 9 + Math.random() * 9,
    });
  } else {
    // 深坑：宽度按「当前跳跃能力」算——偶尔宽到根本跃不过去，那就摔了。
    const factor = 0.3 + Math.random() * 0.7;
    const width = Math.min(state.width * 0.4, reach * factor);
    state.obstacles.push({
      kind: 'pit',
      x,
      w: width,
      h: 0,
    });
  }
}

const runnerGame = {
  id: 'runner',
  name: { en: 'Runner', zh: '跳跃跑酷' },

  create(width, height) {
    const groundY = height - 9;
    const state = {
      width,
      height,
      groundY,
      player: { x: width * 0.22, y: groundY, vy: 0, onGround: true, phase: 0, radius: 4.5 },
      obstacles: [],
      spawnTimer: 1.1,
      distance: 0,
      speed: 150,
      jumps: 0,
      dead: false,
      deadTimer: 0,
      lastJumpReason: '',
    };
    return state;
  },

  step(state, dt) {
    if (state.dead) {
      state.deadTimer += dt;
      return state.deadTimer > 1.3 ? 'over' : 'running';
    }

    // 速度随距离缓慢上升（distance 是像素，除以 10 才是米）：
    // 150 px/s 起步，大约两分钟才爬到 320 px/s 的上限。
    state.speed = Math.min(320, 150 + state.distance * 0.008);

    // 生成障碍。
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = randomBetween(1.0, 2.0);
      spawnObstacle(state);
    }

    // 世界左移。
    for (const obstacle of state.obstacles) obstacle.x -= state.speed * dt;
    state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -40);

    // 物理。
    const player = state.player;
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= state.groundY) {
      player.y = state.groundY;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }
    player.phase += dt * (player.onGround ? 14 : 6);

    // 自动起跳：按「一次跳跃能横跨多远」倒推该在哪起跳。
    //
    // 一次跳跃的滞空时间固定（2·v/g），水平跨距 = 滞空时间 × 速度。
    // 想越过宽 w 的障碍（它的近边在前方 gap 处），起跳点必须满足
    // gap + w < 跨距；所以等到 gap 逼近「跨距 − w − 余量」时才起跳，
    // 跳得刚好、又不会提前落地砸在障碍上。跨不过去的宽坑因此必死。
    if (player.onGround) {
      const reach = (2 * JUMP_SPEED / GRAVITY) * state.speed;
      for (const obstacle of state.obstacles) {
        const gap = obstacle.x - player.x;
        if (gap < -8 || gap > reach) continue;
        const wanted = Math.max(4, reach - obstacle.w - 20);
        if (gap <= wanted) {
          player.vy = -JUMP_SPEED;
          player.onGround = false;
          state.jumps += 1;
          state.lastJumpReason = obstacle.kind;
          break;
        }
      }
    }

    // 碰撞与坠落。小人的脚底就是 y（贴地的那一点），头顶在 y-13。
    const left = player.x - player.radius;
    const right = player.x + player.radius;
    const feet = player.y;
    const head = player.y - 13;
    for (const obstacle of state.obstacles) {
      if (obstacle.kind === 'block') {
        const blockTop = state.groundY - obstacle.h;
        if (right > obstacle.x && left < obstacle.x + obstacle.w && feet > blockTop && head < state.groundY) {
          state.dead = true;
          break;
        }
      } else if (obstacle.kind === 'pit') {
        // 坑：脚还在地面高度上就掉下去。
        if (right > obstacle.x && left < obstacle.x + obstacle.w && feet > state.groundY - 3) {
          state.dead = true;
          state.fell = true;
          break;
        }
      }
    }
    if (player.y > state.height + 20) state.dead = true;

    state.distance += state.speed * dt;
    return 'running';
  },

  resize(state, width, height) {
    const ratio = height / state.height;
    state.width = width;
    state.height = height;
    state.groundY = height - 9;
    state.player.x = width * 0.22;
    state.player.y *= ratio;
  },

  draw(ctx, state, width, height, theme) {
    const groundY = state.groundY;

    // 地面：按缺口断开的几段。
    const pits = state.obstacles
      .filter((obstacle) => obstacle.kind === 'pit')
      .map((obstacle) => [obstacle.x, obstacle.x + obstacle.w])
      .sort((left, right) => left[0] - right[0]);
    ctx.fillStyle = theme.grid;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, groundY, width, height - groundY);
    ctx.globalAlpha = 1;

    // 地面纹理（滚动的小刻度）。
    ctx.fillStyle = theme.brand;
    ctx.globalAlpha = 0.35;
    const spacing = 26;
    const offset = -(state.distance % spacing);
    for (let x = offset; x < width; x += spacing) {
      ctx.fillRect(Math.round(x), groundY + 2, 3, 3);
    }
    ctx.globalAlpha = 1;

    // 障碍。
    for (const obstacle of state.obstacles) {
      if (obstacle.kind !== 'block') continue;
      ctx.fillStyle = theme.food;
      roundRect(ctx, obstacle.x, groundY - obstacle.h, obstacle.w, obstacle.h, 2);
      ctx.fill();
    }

    // 坑：把地面挖掉的那一段画成暗色。
    for (const [from, to] of pits) {
      ctx.fillStyle = theme.error;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(from, groundY - 2, to - from, height - groundY + 2);
      ctx.globalAlpha = 1;
    }

    // 小人。
    drawRunner(ctx, state.player, theme, state.dead);
  },

  hud(state) {
    return { score: Math.floor(state.distance / 10), unit: 'distance' };
  },
};

function drawRunner(ctx, player, theme, dead) {
  const x = player.x;
  const y = player.y;
  const swing = player.onGround ? Math.sin(player.phase) * 3 : 1.5;
  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(0, 1, 6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 腿
  ctx.strokeStyle = theme.brand;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-1.5, -3); ctx.lineTo(-1.5 + swing, 0);
  ctx.moveTo(1.5, -3); ctx.lineTo(1.5 - swing, 0);
  ctx.stroke();

  // 身体
  ctx.fillStyle = theme.brand;
  roundRect(ctx, -4, -10, 8, 8, 2.5);
  ctx.fill();

  // 头
  ctx.beginPath();
  ctx.arc(0, -12.5, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛（死掉时变成叉）
  ctx.fillStyle = '#101418';
  if (dead) {
    ctx.strokeStyle = '#101418';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.6, -13.4); ctx.lineTo(-0.4, -12.2);
    ctx.moveTo(-0.4, -13.4); ctx.lineTo(-1.6, -12.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-1.2, -13, 0.8, 0, Math.PI * 2);
    ctx.arc(1.2, -13, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}


// ---- src/games/rush.mjs ----
/**
 * 数值跑酷：经典广告里的三跑道玩法。
 *
 * 小人自动往前跑，屏幕分成三条道。每条道上会滚来一块「数值牌」（+5 / ×2 / ÷2 / −3）
 * 或者一只怪物。小人自动挑一条收益最高、又没有怪物的道：吃到数值牌改变自己的
 * 攻击力（×2 翻倍、÷2 减半），撞到怪物则掉攻击力。
 *
 * 每 5 波来一个大首领，占满整屏、正面硬碰：它每秒掉你「攻击力」点血，
 * 你每秒也打它「攻击力」点血——攻击力就是你的 DPS，也是你的命。打死它进入下一关，
 * 攻击力不够就会被磨光，那就是失败。
 *
 * 只要不失败就能一直闯下去：关卡越高，首领越硬、怪物越密、数值牌越难挑。
 */

const LANES = 3;

/** 数值牌：加、乘是好事，除、减是陷阱。 */
const TILE_OPS = [
  { op: 'add', text: '+', low: 3, high: 8, weight: 4 },
  { op: 'mul', text: '×', low: 2, high: 2, weight: 3 },
  { op: 'mul', text: '×', low: 3, high: 3, weight: 1 },
  { op: 'div', text: '÷', low: 2, high: 2, weight: 1 },
  { op: 'sub', text: '−', low: 1, high: 3, weight: 1 },
];

/** 攻击力上限：没有它，×2 的数值牌会让攻击力指数膨胀，首领瞬间就没了。 */
const POWER_CAP = 99;

/** 每关多少波来一次首领。 */
const WAVES_PER_LEVEL = 8;

/** 开火间隔（秒）：每 0.2 秒一发，每发打掉 攻击力 × 0.2 点血，DPS 正好等于攻击力。 */
const FIRE_INTERVAL = 0.2;

function clampRush(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

/** 数值牌对当前攻击力的收益（用来挑道）：加、乘是正收益，除、减是负收益。 */
function tileGain(tile, power) {
  switch (tile.op) {
    case 'add': return tile.value;
    case 'mul': return power * (tile.value - 1);
    case 'div': return Math.ceil(power / tile.value) - power;
    case 'sub': return -tile.value;
    default: return 0;
  }
}

function applyTile(state, tile) {
  switch (tile.op) {
    case 'add': state.player.power += tile.value; break;
    case 'mul': state.player.power *= tile.value; break;
    case 'div': state.player.power = Math.max(1, Math.floor(state.player.power / tile.value)); break;
    case 'sub': state.player.power = Math.max(1, state.player.power - tile.value); break;
    default: break;
  }
  state.player.power = clampRush(Math.round(state.player.power), 0, POWER_CAP);
}

function makeTile() {
  const op = pickWeighted(TILE_OPS);
  return {
    type: 'tile',
    op: op.op,
    text: op.text,
    value: Math.floor(Math.random() * (op.high - op.low + 1)) + op.low,
    lane: 0,
    x: 0,
    taken: false,
  };
}

function makeMonster(level = 1) {
  return {
    type: 'monster',
    value: 2 + Math.floor(Math.random() * 3) + Math.floor(level / 2),
    lane: 0,
    x: 0,
    hit: false,
  };
}

const rushGame = {
  id: 'rush',
  name: { en: 'Number rush', zh: '数值跑酷' },

  create(width, height) {
    const laneHeight = height / LANES;
    const state = {
      width,
      height,
      laneHeight,
      entities: [],
      boss: null,
      player: {
        x: width * 0.24,
        y: laneHeight * 1.5,
        lane: 1,
        targetLane: 1,
        power: 8,
        life: 100,
        maxLife: 100,
        level: 1,
        score: 0,
        kills: 0,
      },
      speed: 150,
      scroll: 0,
      spawnTimer: 0.6,
      waves: 0,
      wavesPerLevel: WAVES_PER_LEVEL,
      spawnGap: 150,
      phase: 'running',
      deadTimer: 0,
      flash: 0,
      bossNotice: 0,
      fireTimer: 0,
      // 特效：全部是纯数据（位置、寿命、颜色种类），由 draw 渲染成画面。
      fx: {
        shots: [],    // 飞行中的弹丸
        bursts: [],   // 命中爆点
        rings: [],    // 冲击环
        shake: 0,     // 屏幕震动
        flash: 0,     // 全屏闪光
        muzzle: 0,    // 枪口火光
      },
    };
    return state;
  },

  step(state, dt) {
    if (state.phase === 'over') {
      state.deadTimer += dt;
      return state.deadTimer > 1.3 ? 'over' : 'running';
    }
    state.flash = Math.max(0, state.flash - dt);
    state.bossNotice = Math.max(0, state.bossNotice - dt);

    const player = state.player;
    const level = player.level;

    // 速度随关卡缓慢上升；数值牌与怪物的密度也随关卡变紧。
    state.speed = 150 + level * 8;
    state.spawnGap = 150 - Math.min(60, level * 6);

    // 生成：每条道上滚动来的实体。
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && !state.boss) {
      state.spawnTimer = 1.3;
      const lanes = [0, 1, 2];
      const monsterLane = Math.floor(Math.random() * LANES);
      // 至少留一条道是安全的，否则这一波无解。
      const safeLane = lanes.filter((lane) => lane !== monsterLane)[Math.floor(Math.random() * 2)];
      const monster = makeMonster(level);
      monster.lane = monsterLane;
      monster.x = state.width + 40;
      state.entities.push(monster);
      const tile = makeTile();
      tile.lane = safeLane;
      tile.x = state.width + 40;
      state.entities.push(tile);
      state.waves += 1;
    }

    // 首领：每 wavesPerLevel 波来一次。
    if (!state.boss && state.waves >= state.wavesPerLevel) {
      state.waves = 0;
      // 首领的血量是**绝对值**，只随关卡涨；它每秒削掉的攻击力也是绝对值。
      //
      // 早先这里写的是「血量按当前攻击力算、掉血速度按当前攻击力算」，
      // 结果是个死亡螺旋：被打得越狠 → 打得越慢 → 战斗拖得越久 → 被削得越多，
      // 而且拖得越久掉得越多，最后攻击力在开打时就先归零。
      //
      // 现在：血量固定（关卡决定），你的攻击力决定**打得多快**（ DPS ），首领的
      // 伤害是每场固定的量。攻击力越高这场打得越快、掉得越少——强是值得的，
      // 但再强也不会被拖进无限循环。
      const hp = 60 + level * 45;
      state.boss = {
        hp,
        maxHp: hp,
        dps: 3 + level,
        x: state.width + 120,
        width: Math.max(90, state.width * 0.22),
        flash: 0,
        name: ['石巨人', '铁面兽', '双头蛇', '深渊像'][Math.min(3, level - 1)],
      };
      // 清场：首领之战不留残余怪物。
      state.entities = [];
      state.bossNotice = 1.6;
    }

    // 世界左移。
    for (const entity of state.entities) entity.x -= state.speed * dt;
    state.entities = state.entities.filter((entity) => entity.x > -60);

    // ---- 特效推进 ----
    const fx = state.fx;
    fx.shake = Math.max(0, fx.shake - dt * 3.2);
    fx.flash = Math.max(0, fx.flash - dt * 2.6);
    fx.muzzle = Math.max(0, fx.muzzle - dt * 9);

    if (state.boss) {
      state.boss.x -= state.speed * dt;
      state.boss.flash = Math.max(0, state.boss.flash - dt * 5);
      player.life -= state.boss.dps * dt;
    }

    // ---- 开火：首领在场上时，小人持续朝它射击 ----
    //
    // 伤害跟着子弹走：每 0.2 秒一发，每发打掉 攻击力 × 0.2 点血，
    // 于是 DPS 正好等于攻击力，弹道、枪口火光和命中爆点都看得见。
    //
    // 这里用累加器而不是「倒计时归零就重置」：0.2 − 0.05×4 在浮点下不等于 0，
    // 倒计时写法会悄悄把射速拖成 0.25 秒一发。累加器减掉整段间隔、余量留着，
    // 节奏才不会漂。
    state.fireTimer += dt;
    while (state.fireTimer >= FIRE_INTERVAL) {
      state.fireTimer -= FIRE_INTERVAL;
      if (!state.boss) break;
      const fromX = player.x;
      const fromY = player.y - 11;
      const toX = state.boss.x;
      const toY = state.height / 2;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const length = Math.hypot(dx, dy) || 1;
      const speed = 950;
      fx.shots.push({
        x: fromX,
        y: fromY,
        vx: (dx / length) * speed,
        vy: (dy / length) * speed,
        life: 0.4,
        maxLife: 0.4,
      });
      fx.muzzle = 0.09;
      state.boss.hp -= player.power * FIRE_INTERVAL;
    }

    // 弹丸飞行与命中。
    for (const shot of fx.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (!shot.dead && state.boss && shot.x >= state.boss.x - state.boss.width / 2) {
        shot.dead = true;
        state.boss.flash = 0.16;
        fx.bursts.push({ x: shot.x, y: shot.y, life: 0.26, maxLife: 0.26, size: 8, kind: 'hit', seed: Math.random() * 6.28 });
      }
    }
    fx.shots = fx.shots.filter((shot) => !shot.dead && shot.life > 0);
    for (const burst of fx.bursts) burst.life -= dt;
    fx.bursts = fx.bursts.filter((burst) => burst.life > 0);
    for (const ring of fx.rings) ring.life -= dt;
    fx.rings = fx.rings.filter((ring) => ring.life > 0);

    if (state.boss && state.boss.hp <= 0) {
      player.score += 100 * level;
      player.level += 1;
      // 首领倒下：炸开一团。
      fx.bursts.push({ x: state.boss.x, y: state.height / 2, life: 0.5, maxLife: 0.5, size: 16, kind: 'hit', seed: Math.random() * 6.28 });
      fx.rings.push({ x: state.boss.x, y: state.height / 2, life: 0.45, maxLife: 0.45, radius: 34 });
      fx.shake = 0.5;
      state.boss = null;
      state.bossNotice = 1.2;
    }

    // 挑道：看前方最近的实体，选收益最高、又没有怪物的道。
    const lookahead = state.speed * 1.5;
    const scores = [];
    for (let lane = 0; lane < LANES; lane += 1) {
      let nearest = null;
      for (const entity of state.entities) {
        if (entity.lane !== lane) continue;
        const distance = entity.x - player.x;
        if (distance < -30 || distance > lookahead) continue;
        if (!nearest || distance < nearest.distance) nearest = { entity, distance };
      }
      let score = 0.1;
      if (nearest) {
        score = nearest.entity.type === 'tile'
          ? tileGain(nearest.entity, player.power)
          : -nearest.entity.value * 3;
      }
      scores.push({ lane, score, distance: nearest ? nearest.distance : Infinity });
    }
    scores.sort((left, right) => right.score - left.score);
    const best = scores[0];
    const current = scores.find((entry) => entry.lane === player.targetLane);
    // 收益差距太小就别折腾，避免来回抖动。
    if (best.lane !== player.targetLane && (!current || best.score - current.score > 1.5)) {
      player.targetLane = best.lane;
    }

    // 横向平滑换道。
    const targetY = state.laneHeight * (player.targetLane + 0.5);
    player.y += (targetY - player.y) * Math.min(1, dt * 12);
    player.lane = player.targetLane;

    // 吃牌 / 撞怪。
    for (const entity of state.entities) {
      if (entity.taken || entity.hit) continue;
      if (Math.abs(entity.x - player.x) > 12) continue;
      if (entity.lane !== player.targetLane) continue;
      if (entity.type === 'tile') {
        entity.taken = true;
        applyTile(state, entity);
        player.score += 5;
      } else {
        entity.hit = true;
        // 怪物啃的是**生命**（数量），不是攻击力——攻击力是 DPS，动了就拖慢战斗。
        player.life = Math.max(0, player.life - entity.value);
        player.score = Math.max(0, player.score - 10);
        state.flash = 0.28;
        state.fx.shake = 0.42;
        state.fx.flash = 0.5;
        state.fx.bursts.push({
          x: entity.x,
          y: state.laneHeight * (entity.lane + 0.5),
          life: 0.3,
          maxLife: 0.3,
          size: 9,
          kind: 'damage',
          seed: Math.random() * 6.28,
        });
        state.fx.rings.push({ x: entity.x, y: state.laneHeight * (entity.lane + 0.5), life: 0.3, maxLife: 0.3, radius: 12 });
        player.kills += 1;
      }
    }
    state.entities = state.entities.filter((entity) => !entity.taken && !entity.hit);

    // 失败：生命被啃光。
    if (player.life <= 0) {
      player.life = 0;
      state.phase = 'over';
    }
    state.scroll += state.speed * dt;
    return 'running';
  },

  resize(state, width, height) {
    const ratio = height / state.height;
    state.width = width;
    state.height = height;
    state.laneHeight = height / LANES;
    state.player.x = width * 0.24;
    state.player.y *= ratio;
  },

  draw(ctx, state, width, height, theme) {
    const laneHeight = state.laneHeight;
    const fx = state.fx;

    // 屏幕震动：受击或首领倒下时抖一下。
    if (fx.shake > 0) {
      const amount = fx.shake * 7;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    // 跑道分隔线
    ctx.strokeStyle = theme.grid;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lane = 1; lane < LANES; lane += 1) {
      const y = Math.round(laneHeight * lane) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 数值牌
    for (const entity of state.entities) {
      if (entity.taken || entity.hit) continue;
      const y = laneHeight * (entity.lane + 0.5);
      const good = entity.type === 'tile' && (entity.op === 'add' || entity.op === 'mul');
      ctx.fillStyle = good ? theme.success : theme.food;
      roundRectRun(ctx, entity.x - 11, y - 8, 22, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#101418';
      ctx.font = '600 11px var(--dsw-font-family, Inter), sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${entity.text}${entity.value}`, entity.x, y + 0.5);
    }

    // 怪物
    for (const entity of state.entities) {
      if (entity.type !== 'monster' || entity.hit) continue;
      const y = laneHeight * (entity.lane + 0.5);
      ctx.fillStyle = theme.error;
      ctx.beginPath();
      ctx.arc(entity.x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 9px var(--dsw-font-family, Inter), sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`−${entity.value}`, entity.x, y + 0.5);
    }

    // 首领
    if (state.boss) {
      const boss = state.boss;
      const y = height / 2;
      // 被击中的一瞬闪白。
      ctx.fillStyle = boss.flash > 0 ? '#ffffff' : theme.error;
      roundRectRun(ctx, boss.x - boss.width / 2, y - 20, boss.width, 40, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 12px var(--dsw-font-family, Inter), sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(boss.name, boss.x, y);
      // 血条
      const barWidth = boss.width;
      const ratio = clampRush(boss.hp / boss.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(boss.x - barWidth / 2, y - 28, barWidth, 4);
      ctx.fillStyle = theme.success;
      ctx.fillRect(boss.x - barWidth / 2, y - 28, barWidth * ratio, 4);
    }

    // ---- 攻击表现 ----
    // 弹丸：一道拉长的亮光，尾随在后面。
    for (const shot of fx.shots) {
      ctx.globalAlpha = Math.min(1, shot.life / shot.maxLife);
      ctx.fillStyle = theme.food;
      ctx.beginPath();
      ctx.ellipse(shot.x, shot.y, 4.2, 1.7, Math.atan2(shot.vy, shot.vx), 0, Math.PI * 2);
      ctx.fill();
    }
    // 命中爆点：几颗向外飞溅的火星。
    for (const burst of fx.bursts) {
      const progress = 1 - burst.life / burst.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillStyle = burst.kind === 'damage' ? theme.error : theme.food;
      for (let i = 0; i < 7; i += 1) {
        const angle = (i / 7) * Math.PI * 2 + burst.seed;
        const radius = burst.size * progress;
        ctx.beginPath();
        ctx.arc(burst.x + Math.cos(angle) * radius, burst.y + Math.sin(angle) * radius, 1.8 * (1 - progress) + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // 冲击环
    for (const ring of fx.rings) {
      const progress = 1 - ring.life / ring.maxLife;
      ctx.globalAlpha = Math.max(0, (1 - progress) * 0.85);
      ctx.strokeStyle = theme.label;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, Math.max(1, ring.radius * progress), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 小人 + 攻击力
    const player = state.player;
    ctx.globalAlpha = state.flash > 0 ? 0.45 : 1;
    ctx.fillStyle = theme.brand;
    roundRectRun(ctx, player.x - 5, player.y - 9, 10, 12, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x, player.y - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 枪口火光：开火的一瞬冒个小亮点。
    if (fx.muzzle > 0) {
      ctx.globalAlpha = Math.min(1, fx.muzzle * 8);
      ctx.fillStyle = theme.food;
      ctx.beginPath();
      ctx.arc(player.x + 6, player.y - 11, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = theme.label;
    ctx.font = '600 10px var(--dsw-font-family, Inter), sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(player.power)), player.x, player.y - 22);

    // 生命条（脚下那条细线）：生命是真正的失败条件。
    const lifeRatio = clampRush(player.life / player.maxLife, 0, 1);
    const barWidth = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(player.x - barWidth / 2, player.y + 3, barWidth, 3);
    ctx.fillStyle = lifeRatio > 0.35 ? theme.success : theme.error;
    ctx.fillRect(player.x - barWidth / 2, player.y + 3, barWidth * lifeRatio, 3);

    // 关卡徽标（顶部居中，避开外壳的 HUD）
    ctx.fillStyle = theme.label;
    ctx.font = '600 10px var(--dsw-font-family, Inter), sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${player.level} 关`, width / 2, 10);

    // 首领来啦 / 关卡通过的提示
    if (state.bossNotice > 0) {
      ctx.globalAlpha = Math.min(1, state.bossNotice);
      ctx.fillStyle = theme.error;
      ctx.font = '600 13px var(--dsw-font-family, Inter), sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.boss ? '首领来了' : '过关', width / 2, height / 2);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 受击时的全屏红闪（画在最后，盖住整个画面）。
    if (fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.45, fx.flash * 0.5);
      ctx.fillStyle = theme.error;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  },

  hud(state) {
    return { score: state.player.score, unit: 'score' };
  },
};

function roundRectRun(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}


// ---- src/games/maze.mjs ----
/**
 * 走迷宫：每局随机生成一个迷宫，小球自己找路出去。
 *
 * 迷宫用深度优先（DFS）随机生成——算法保证它是**完美迷宫**（任意两格连通、
 * 只有一条路），再随机拆掉一小部分内墙「编织」出一些环路，免得整张图只有一条
 * 唯一的走法。
 *
 * 小球用**右手贴墙法**探索：到了格子就依次试「右转 → 直走 → 左转 → 回头」，
 * 右手边没墙就右转。在完美迷宫里这个走法保证一定能走到出口，而走出来的轨迹
 * 弯弯曲曲贴着墙走，看起来正是在「不断试着寻找路线」。身后留一条渐隐的轨迹，
 * 探索过的地方一眼能看见。
 */

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

/** 方向按顺时针排：北 → 东 → 南 → 西，右手边就是 +1。 */
const MAZE_DIRS = [
  { dx: 0, dy: -1, bit: NORTH, opposite: SOUTH },
  { dx: 1, dy: 0, bit: EAST, opposite: WEST },
  { dx: 0, dy: 1, bit: SOUTH, opposite: NORTH },
  { dx: -1, dy: 0, bit: WEST, opposite: EAST },
];

/** 每秒走多少格。 */
const SPEED = 7.5;

/** 轨迹保留多少个点。 */
const TRAIL_LIMIT = 90;

function clampMaze(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/**
 * 随机生成迷宫。
 *
 * 返回每个格子四面墙的位掩码：bit 为 1 表示那面有墙。
 * 先用 DFS 造出完美迷宫，再拆掉少量内墙织出环路。
 */
function generateMaze(cols, rows) {
  const walls = new Uint8Array(cols * rows).fill(NORTH | EAST | SOUTH | WEST);
  const visited = new Uint8Array(cols * rows);
  const stack = [0];
  visited[0] = 1;

  while (stack.length > 0) {
    const index = stack[stack.length - 1];
    const x = index % cols;
    const y = Math.floor(index / cols);
    const candidates = [];
    if (x > 0 && visited[index - 1] === 0) candidates.push([x - 1, y, WEST, EAST]);
    if (x < cols - 1 && visited[index + 1] === 0) candidates.push([x + 1, y, EAST, WEST]);
    if (y > 0 && visited[index - cols] === 0) candidates.push([x, y - 1, NORTH, SOUTH]);
    if (y < rows - 1 && visited[index + cols] === 0) candidates.push([x, y + 1, SOUTH, NORTH]);

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, ny, bit, opposite] = candidates[Math.floor(Math.random() * candidates.length)];
    walls[index] &= ~bit;
    walls[ny * cols + nx] &= ~opposite;
    visited[ny * cols + nx] = 1;
    stack.push(ny * cols + nx);
  }

  // 编织：拆掉约 8% 的内墙，让迷宫不只有一条唯一的路。
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      if (x < cols - 1 && Math.random() < 0.08) {
        walls[index] &= ~EAST;
        walls[index + 1] &= ~WEST;
      }
      if (y < rows - 1 && Math.random() < 0.08) {
        walls[index] &= ~SOUTH;
        walls[index + cols] &= ~NORTH;
      }
    }
  }
  return walls;
}

/** 墙可以随机挑的颜色（都取主题里的色，跟随明暗主题）。 */
const WALL_STYLES = ['brand', 'food', 'label'];

const mazeGame = {
  id: 'maze',
  name: { en: 'Maze', zh: '走迷宫' },

  create(width, height) {
    const cell = Math.max(9, Math.min(14, Math.floor(height / 6)));
    const cols = Math.max(20, Math.floor(width / cell));
    const rows = Math.max(5, Math.floor(height / cell));
    const state = {
      width,
      height,
      cell,
      cols,
      rows,
      walls: new Uint8Array(0),
      ball: { x: 0, y: 0, dir: 1, fromX: 0, fromY: 0, t: 0, steps: 0 },
      trail: [],
      escapes: 0,
      phase: 'running',
      deadTimer: 0,
      flash: 0,
    };
    newMaze(state);
    return state;
  },

  step(state, dt) {
    if (state.phase === 'over') {
      state.deadTimer += dt;
      return state.deadTimer > 1.2 ? 'over' : 'running';
    }
    state.flash = Math.max(0, state.flash - dt * 2);

    const ball = state.ball;
    ball.t += dt * SPEED;
    while (ball.t >= 1) {
      ball.t -= 1;
      if (!advanceMaze(state)) break;
    }

    // 轨迹淡出。
    for (const point of state.trail) point.life -= dt * 0.55;
    state.trail = state.trail.filter((point) => point.life > 0);
    return 'running';
  },

  resize(state, width, height) {
    const cell = Math.max(9, Math.min(14, Math.floor(height / 6)));
    const cols = Math.max(20, Math.floor(width / cell));
    const rows = Math.max(5, Math.floor(height / cell));
    if (cols === state.cols && rows === state.rows) return;
    state.width = width;
    state.height = height;
    state.cell = cell;
    state.cols = cols;
    state.rows = rows;
    newMaze(state);
  },

  draw(ctx, state, width, height, theme) {
    const { cell, cols, rows, walls } = state;

    // 墙：只画上边和左边，最后再补外框，免得每面墙画两遍。
    //
    // 颜色每张迷宫随机挑一种（brand / food / label 三选一）：之前用最淡那档边框色
    // 配 1px 细线，浅色主题下几乎看不见。线条也加粗了——12px 的格子里
    // 1px 实在太细。
    ctx.strokeStyle = theme[state.wallStyle] || theme.brand;
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1.5, cell * 0.14);
    ctx.beginPath();
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const mask = walls[y * cols + x];
        const px = x * cell;
        const py = y * cell;
        if (mask & NORTH) {
          ctx.moveTo(px + 0.5, py + 0.5);
          ctx.lineTo(px + cell + 0.5, py + 0.5);
        }
        if (mask & WEST) {
          ctx.moveTo(px + 0.5, py + 0.5);
          ctx.lineTo(px + 0.5, py + cell + 0.5);
        }
      }
    }
    const bottom = rows * cell;
    const right = cols * cell;
    ctx.moveTo(right + 0.5, 0.5);
    ctx.lineTo(right + 0.5, bottom + 0.5);
    ctx.moveTo(0.5, bottom + 0.5);
    ctx.lineTo(right + 0.5, bottom + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 入口与出口：红进绿出，和墙的颜色刻意错开，任何时候都分得清。
    ctx.fillStyle = theme.error;
    ctx.fillRect(0, state.startY * cell + 1, 3, cell - 2);
    ctx.fillStyle = theme.success;
    ctx.fillRect(right - 3, state.exitY * cell + 1, 3, cell - 2);

    // 走过的轨迹。
    for (const point of state.trail) {
      ctx.globalAlpha = Math.min(0.45, point.life * 0.45);
      ctx.fillStyle = theme.brand;
      ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // 小球：在两格之间平滑滑动。
    const ball = state.ball;
    const x = (ball.fromX + (ball.x - ball.fromX) * ball.t) * cell + cell / 2;
    const y = (ball.fromY + (ball.y - ball.fromY) * ball.t) * cell + cell / 2;
    ctx.fillStyle = theme.success;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.2, cell * 0.26), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3.4, cell * 0.42), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 过关闪光
    if (state.flash > 0) {
      ctx.globalAlpha = Math.min(0.5, state.flash);
      ctx.fillStyle = theme.success;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  },

  hud(state) {
    return { score: state.escapes };
  },
};

/** 换一张新迷宫，把小球放回入口。 */
function newMaze(state) {
  state.walls = generateMaze(state.cols, state.rows);
  // 每张迷宫随机一种墙的颜色。
  state.wallStyle = WALL_STYLES[Math.floor(Math.random() * WALL_STYLES.length)];
  const startY = Math.floor(Math.random() * state.rows);
  const exitY = Math.floor(Math.random() * state.rows);
  state.startY = startY;
  state.exitY = exitY;
  state.ball = { x: 0, y: startY, dir: 1, fromX: 0, fromY: startY, t: 0, steps: 0 };
  state.trail = [];
}

/**
 * 小球走一格。
 *
 * 右手贴墙法：依次试「右转 → 直走 → 左转 → 回头」，右边没墙就右转。
 * 在完美迷宫里这保证能走到出口。
 *
 * @returns 是否还在这一局里（走出去了就返回 false）
 */
function advanceMaze(state) {
  const { cols, rows, walls } = state;
  const ball = state.ball;
  const index = ball.y * cols + ball.x;
  const order = [(ball.dir + 1) % 4, ball.dir, (ball.dir + 3) % 4, (ball.dir + 2) % 4];
  for (const dir of order) {
    const move = MAZE_DIRS[dir];
    if (walls[index] & move.bit) continue;
    const nx = ball.x + move.dx;
    const ny = ball.y + move.dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    ball.fromX = ball.x;
    ball.fromY = ball.y;
    ball.x = nx;
    ball.y = ny;
    ball.dir = dir;
    ball.steps += 1;
    state.trail.push({ x: nx * state.cell + state.cell / 2, y: ny * state.cell + state.cell / 2, life: 1 });
    if (state.trail.length > TRAIL_LIMIT) state.trail.shift();

    // 走到出口了：这一局通关，换一张新迷宫。
    if (nx === cols - 1 && ny === state.exitY) {
      state.escapes += 1;
      state.flash = 0.6;
      newMaze(state);
      return false;
    }
    return true;
  }
  return true;
}


// ---- src/games/registry.mjs ----
/**
 * 游戏池的公共工具。
 *
 * 这个文件没有 import，构建脚本会把它原样内联进浏览器半面；Node 单测则直接
 * import 它。两条路径共用同一份实现，避免「测的和跑的不是一个东西」。
 */

/**
 * 随机挑一个游戏。
 *
 * `excludeId` 用于「定时轮换时不挑中当前这个」；失败重开时不传，于是可能还是
 * 同一个游戏——这是有意的：失败重开同一个游戏，和失败后随机换一个，都是用户
 * 可以接受的行为。
 */
function pickRandomGame(games, random = Math.random, excludeId) {
  if (!Array.isArray(games) || games.length === 0) return undefined;
  const pool = excludeId === undefined
    ? games
    : games.filter((game) => game.id !== excludeId);
  const candidates = pool.length > 0 ? pool : games;
  const index = Math.floor(random() * candidates.length);
  return candidates[Math.max(0, Math.min(candidates.length - 1, index))];
}


const GAMES = [snakeGame, pongGame, flappyGame, lifeGame, horseGame, runnerGame, rushGame, mazeGame];

    /** 本插件的客户端文案命名空间。 */
    const NAMESPACE = 'dsh-inputbox-game';

    /** 任务连续运行多久之后接管输入框（毫秒），可由设置页/宿主配置覆盖。 */
    const DEFAULT_THRESHOLD_MS = 180000;

    /** 多久轮换一次游戏（毫秒），0 表示不轮换。 */
    const DEFAULT_ROTATION_MS = 180000;

    /** 失焦之后延迟多久再重新接管（毫秒），避免与用户的下一次点击打架。 */
    const RESUME_DELAY_MS = 700;

    /** 撞死之后定格多久再自动重开（毫秒）。 */
    const OVER_DELAY_MS = 1400;

    /** 游戏循环的心跳（毫秒）。 */
    const TICK_MS = 50;

    const TICK_SECONDS = TICK_MS / 1000;

    /** 设置在 localStorage 里的键。 */
    const STORAGE_KEY = 'dsh-inputbox-game.settings.v1';

    const en = {
      'game.snake': 'Snake',
      'game.pong': 'Pong',
      'game.flappy': 'Flappy',
      'game.life': 'Ecology',
      'game.horse': 'Horse race',
      'game.runner': 'Runner',
      'game.rush': 'Number rush',
      'game.maze': 'Maze',
      'hint.restore': 'Click the composer to keep typing',
      'hint.startOutside': 'Click outside the input box to start the game',
      'hint.score': 'Score {score}',
      'hint.generation': 'Generation {score}',
      'hint.rally': 'Longest rally {score}',
      'hint.versus': 'Score {score}',
      'hint.population': 'Population {score}',
      'hint.bankroll': 'Bankroll {score}',
      'hint.distance': '{score} m',
      'hud.bet': 'Bet on #{n} · {odds}x',
      'hud.lead': 'No.{n} leads',
      'hud.win': 'Won +{n}',
      'hud.lose': 'Lost -{n}',
      'hint.best': 'Best {score}',
      'game.over': 'Crashed · restarting',
      'event.meteor': 'Meteor',
      'event.freeze': 'Cold snap',
      'event.drought': 'Drought',
      'event.boom': 'Population boom',
      'settings.title': 'Composer mini-games',
      'settings.intro': 'While a task keeps running, the composer turns into an auto-playing mini game. Click outside the input box to start it; focusing the composer brings the normal editor back.',
      'settings.threshold': 'Take over after',
      'settings.threshold.hint': 'How long a task must run before the composer turns into a game.',
      'settings.rotation': 'Rotate games',
      'settings.rotation.hint': 'How often the stage switches to another game. A crash always restarts a random game.',
      'settings.games': 'Games',
      'settings.games.hint': 'Which games the stage may pick from.',
      'settings.reset': 'Restore defaults',
      'settings.immediate': 'Immediately',
      'settings.seconds': '{n}s',
      'settings.minutes': '{n} min',
      'settings.minutes.off': 'Off',
    };
    const zh = {
      'game.snake': '贪吃蛇',
      'game.pong': '乒乓',
      'game.flappy': '小鸟',
      'game.life': '生态箱',
      'game.horse': '赛马',
      'game.runner': '跳跃跑酷',
      'game.rush': '数值跑酷',
      'game.maze': '走迷宫',
      'hint.restore': '点击输入框即可恢复编辑',
      'hint.startOutside': '点击输入框之外开始游戏',
      'hint.score': '得分 {score}',
      'hint.generation': '第 {score} 代',
      'hint.rally': '最长回合 {score}',
      'hint.versus': '比分 {score}',
      'hint.population': '群体 {score}',
      'hint.bankroll': '本金 {score}',
      'hint.distance': '{score} 米',
      'hud.bet': '押 {n} 号 · {odds} 倍',
      'hud.lead': '{n} 号领先',
      'hud.win': '押中 +{n}',
      'hud.lose': '没押中 -{n}',
      'hint.best': '最高 {score}',
      'game.over': '撞到了 · 马上重新开始',
      'event.meteor': '陨石',
      'event.freeze': '寒潮',
      'event.drought': '干旱',
      'event.boom': '群体爆发',
      'settings.title': '输入框小游戏',
      'settings.intro': '任务运行期间，输入框会变成一个自动运行的小游戏；点击输入框之外开始游戏，点击输入框即可恢复正常编辑。',
      'settings.threshold': '多久后接管',
      'settings.threshold.hint': '任务连续运行超过这个时间，输入框才变成小游戏。',
      'settings.rotation': '轮换间隔',
      'settings.rotation.hint': '每隔多久换一个游戏。撞死时总是随机重开一局。',
      'settings.games': '游戏池',
      'settings.games.hint': '轮换时可以选到哪些游戏。',
      'settings.reset': '恢复默认',
      'settings.immediate': '立即',
      'settings.seconds': '{n} 秒',
      'settings.minutes': '{n} 分钟',
      'settings.minutes.off': '关闭',
    };

    /* ------------------------------------------------------------------ *
     * 设置：宿主 Config 作默认值，设置页的选择存在 localStorage 里并覆盖它。
     * ------------------------------------------------------------------ */

    const settingsStore = (() => {
      const listeners = new Set();
      let hostDefaults = null;

      const stored = () => {
        try {
          const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
          return {};
        }
      };

      const read = () => ({
        thresholdMs: DEFAULT_THRESHOLD_MS,
        rotationMs: DEFAULT_ROTATION_MS,
        games: GAMES.map((game) => game.id),
        ...(hostDefaults || {}),
        ...stored(),
      });

      const notify = () => {
        for (const listener of listeners) listener();
      };

      return {
        read,
        write(patch) {
          const next = { ...stored(), ...patch };
          try {
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch (error) {
            // 隐私模式或存储被禁用：这次不落盘，内存里的值照常生效。
          }
          notify();
        },
        clear() {
          try {
            globalThis.localStorage?.removeItem(STORAGE_KEY);
          } catch (error) {
            // 忽略
          }
          notify();
        },
        setHostDefaults(value) {
          if (!value || typeof value !== 'object') return;
          hostDefaults = value;
          notify();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    })();

    function useSettings() {
      const [settings, setSettings] = useState(() => settingsStore.read());
      useEffect(() => settingsStore.subscribe(() => setSettings(settingsStore.read())), []);
      return [settings, settingsStore];
    }

    /* ------------------------------------------------------------------ *
     * 绘制辅助
     * ------------------------------------------------------------------ */

    function readTheme(canvas) {
      const styles = getComputedStyle(canvas);
      const read = (name, fallback) => {
        const value = styles.getPropertyValue(name).trim();
        return value.length > 0 ? value : fallback;
      };
      return {
        brand: read('--dsw-alias-brand-primary', '#247bbf'),
        grid: read('--dsw-alias-border-l1', 'rgba(127,127,127,0.3)'),
        food: read('--dsw-alias-state-warn-primary', '#e0913c'),
        error: read('--dsw-alias-state-error-primary', '#e5484d'),
        success: read('--dsw-alias-state-success-primary', '#3fb950'),
        label: read('--dsw-alias-label-secondary', '#8b949e'),
      };
    }

    function drawScene(canvas, game, state, width, height, t) {
      const dpr = globalThis.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const theme = readTheme(canvas);
      const labels = {
        meteor: translateText(t, 'event.meteor', undefined, 'Meteor'),
        freeze: translateText(t, 'event.freeze', undefined, 'Freeze'),
        drought: translateText(t, 'event.drought', undefined, 'Drought'),
        boom: translateText(t, 'event.boom', undefined, 'Population boom'),
      };
      game.draw(ctx, state, width, height, theme, labels);
    }

    function formatDuration(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    /** 翻译助手：拿不到文案时退回一个中性说法，绝不把 key 露给用户。 */
    function translateText(t, key, vars, fallback) {
      let value;
      try {
        value = typeof t === 'function' ? t(key, vars) : undefined;
      } catch (error) {
        value = undefined;
      }
      return typeof value === 'string' && value.length > 0 && value !== key ? value : fallback;
    }

    /* ------------------------------------------------------------------ *
     * 舞台组件
     * ------------------------------------------------------------------ */

    function MiniGameStage(props) {
      const { sessionId, useSessionStatus, t, schedule } = props;

      const [settings] = useSettings();
      // 注意：0 是合法值（「立即接管」），不能用 || 兜底。
      const thresholdMs = Number.isFinite(Number(settings.thresholdMs))
        ? Number(settings.thresholdMs)
        : DEFAULT_THRESHOLD_MS;
      const rotationMs = Math.max(0, Number(settings.rotationMs) || 0);
      const enabledKey = Array.isArray(settings.games) ? settings.games.join(',') : '';

      const pool = useMemo(() => {
        const ids = enabledKey.length > 0 ? enabledKey.split(',') : [];
        const list = GAMES.filter((game) => ids.includes(game.id));
        return list.length > 0 ? list : GAMES;
      }, [enabledKey]);

      const running = useSessionStatus((snapshot) => (
        sessionId === undefined ? false : snapshot.get(sessionId)?.running === true
      ));

      const [clock, setClock] = useState(() => Date.now());
      const [focused, setFocused] = useState(false);
      const [blurAt, setBlurAt] = useState(0);
      const [rect, setRect] = useState(null);
      const [phase, setPhase] = useState('playing');
      const [gameId, setGameId] = useState(GAMES[0].id);
      const [hud, setHud] = useState({ score: 0, unit: 'score' });

      const startedRef = useRef(0);
      const rectRef = useRef(null);
      const anchorRef = useRef(null);
      const canvasRef = useRef(null);
      const bestRef = useRef({});
      const poolRef = useRef(pool);
      poolRef.current = pool;

      // 连续运行的起点：任务一开始运行就记下，停下来就清零。
      useEffect(() => {
        if (running) {
          if (startedRef.current === 0) startedRef.current = Date.now();
        } else {
          startedRef.current = 0;
        }
        setClock(Date.now());
      }, [running]);

      // 心跳：驱动「已运行多久」和失焦后的恢复延迟。
      useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => setClock(Date.now()), 250);
        return () => clearInterval(timer);
      }, [running]);

      // 焦点：聚焦输入框就恢复正常编辑。
      useEffect(() => {
        const isComposerField = (node) => {
          if (!node || typeof node !== 'object' || typeof node.tagName !== 'string') return false;
          const editable = node.isContentEditable === true
            || node.tagName === 'TEXTAREA'
            || node.tagName === 'INPUT';
          if (!editable) return false;
          return typeof node.closest === 'function' && node.closest('[data-composer-card]') !== null;
        };
        const sync = () => {
          const inside = isComposerField(document.activeElement);
          setFocused(inside);
          if (inside) {
            setBlurAt(0);
          } else {
            setBlurAt((previous) => (previous === 0 ? Date.now() : previous));
          }
        };
        const onFocusOut = () => {
          setTimeout(sync, 0);
        };
        document.addEventListener('focusin', sync, true);
        document.addEventListener('focusout', onFocusOut, true);
        return () => {
          document.removeEventListener('focusin', sync, true);
          document.removeEventListener('focusout', onFocusOut, true);
        };
      }, []);

      const elapsed = running && startedRef.current > 0 ? Math.max(0, clock - startedRef.current) : 0;
      const overdue = elapsed >= thresholdMs;
      const settled = blurAt === 0 || clock - blurAt >= RESUME_DELAY_MS;
      const visible = running && overdue && !focused && settled;
      // 画布只有在量到尺寸之后才会挂上，所以游戏循环要等 ready 为真才起跑。
      const ready = visible && rect !== null;

      // 当前游戏被用户在设置里关掉了：换一个。
      useEffect(() => {
        if (pool.some((game) => game.id === gameId)) return;
        const next = pickRandomGame(pool, Math.random);
        if (next) setGameId(next.id);
      }, [pool, gameId]);

      // 量一次输入框卡片：棋盘铺满整张卡片（宽 × 高），也就是整个输入框。
      useEffect(() => {
        if (!visible) {
          rectRef.current = null;
          setRect(null);
          return undefined;
        }
        const measure = () => {
          const marker = anchorRef.current;
          if (!marker) return;
          // 量宿主的 overlay 锚点（我们那个 0×0 占位 div 的父元素），**不要**量占位
          // div 本身——它宽度恒为 0，早先正是因此只画出了左侧一小条。
          const host = marker.parentElement;
          if (!host) return;
          const hostRect = host.getBoundingClientRect();
          const card = typeof host.closest === 'function'
            ? host.closest('[data-composer-card]')
            : null;
          const cardRect = card ? card.getBoundingClientRect() : hostRect;
          const width = Math.max(cardRect.width, 160);
          const height = Math.max(cardRect.height, 64);
          const next = { left: 0, top: 0, width, height };
          const previous = rectRef.current;
          if (previous && Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5) {
            return;
          }
          rectRef.current = next;
          setRect(next);
        };
        measure();
        const marker = anchorRef.current;
        const host = marker ? marker.parentElement : null;
        const card = host && typeof host.closest === 'function'
          ? host.closest('[data-composer-card]')
          : null;
        let observer = null;
        if (card && typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(measure);
          observer.observe(card);
        }
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
          if (observer) observer.disconnect();
          window.removeEventListener('resize', measure);
          window.removeEventListener('scroll', measure, true);
        };
      }, [visible]);

      // 游戏循环：自动跑，不需要任何人为操作。
      useEffect(() => {
        if (!ready) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const game = GAMES.find((entry) => entry.id === gameId) || GAMES[0];
        const start = rectRef.current || { width: 640, height: 72 };
        let state = game.create(start.width, start.height);
        let size = { width: start.width, height: start.height };
        let hudElapsed = 0;
        let overUntil = 0;
        let rotateAt = Date.now() + rotationMs;
        setPhase('playing');

        const tick = () => {
          const now = Date.now();
          const current = rectRef.current;
          if (current && (Math.abs(current.width - size.width) > 0.5 || Math.abs(current.height - size.height) > 0.5)) {
            size = { width: current.width, height: current.height };
            if (typeof game.resize === 'function') {
              game.resize(state, size.width, size.height);
            } else {
              state = game.create(size.width, size.height);
            }
          }

          if (overUntil > 0) {
            // 撞死后的定格：让「游戏结束」被看见，再重开一局。
            if (now >= overUntil) {
              overUntil = 0;
              const next = pickRandomGame(poolRef.current, Math.random);
              if (next && next.id !== gameId) {
                setGameId(next.id);
              } else {
                state = game.create(size.width, size.height);
                setPhase('playing');
              }
            }
          } else if (game.step(state, TICK_SECONDS) === 'over') {
            const result = game.hud(state);
            if (typeof result.score === 'number') {
              const previous = bestRef.current[game.id] || 0;
              bestRef.current[game.id] = Math.max(previous, result.score);
            }
            overUntil = now + OVER_DELAY_MS;
            setPhase('over');
          }

          // 定时轮换：换一个游戏（不挑中当前这个）。
          if (rotationMs > 0 && now >= rotateAt) {
            rotateAt = now + rotationMs;
            const next = pickRandomGame(poolRef.current, Math.random, gameId);
            if (next && next.id !== gameId) {
              setGameId(next.id);
              setPhase('playing');
            }
          }

          drawScene(canvas, game, state, size.width, size.height, t);
          hudElapsed += TICK_SECONDS;
          if (hudElapsed >= 0.25) {
            hudElapsed = 0;
            setHud(game.hud(state));
          }
        };

        const dispose = schedule(tick, TICK_MS);
        return () => {
          if (typeof dispose === 'function') dispose();
          else clearInterval(dispose);
        };
      }, [ready, gameId, enabledKey, rotationMs, schedule]);

      const translate = (key, vars, fallback) => {
        let value;
        try {
          value = typeof t === 'function' ? t(key, vars) : undefined;
        } catch (error) {
          value = undefined;
        }
        return typeof value === 'string' && value.length > 0 && value !== key ? value : fallback;
      };

      const game = GAMES.find((entry) => entry.id === gameId) || GAMES[0];
      const gameName = translate(`game.${game.id}`, {}, game.name?.en ?? game.id);
      const scoreText = translate(`hint.${hud.unit || 'score'}`, { score: hud.score }, `${hud.score}`);
      const detail = hud.detail;
      const detailText = detail && typeof detail === 'object' && detail.kind
        ? translate(`hud.${detail.kind}`, detail, '')
        : typeof detail === 'string' ? detail : '';
      const best = bestRef.current[game.id];
      const bestText = typeof best === 'number' && best > 0
        ? translate('hint.best', { score: best }, `Best ${best}`)
        : '';
      const hudRight = [scoreText, detailText, bestText].filter((part) => part && part.length > 0).join(' · ');

      const board = ready
        ? h('div', {
            'aria-hidden': 'true',
            style: {
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden',
              borderRadius: 'var(--dsw-radius-md)',
              background: 'var(--dsw-specific-input-major)',
              boxShadow: 'inset 0 0 0 1px var(--dsw-alias-border-l1)',
            },
          },
            h('canvas', {
              ref: canvasRef,
              style: {
                display: 'block',
                width: '100%',
                height: '100%',
                opacity: phase === 'over' ? 0.35 : 1,
                transition: 'opacity 120ms linear',
              },
            }),
            // 顶栏：游戏名 + 已运行时长（左） · 得分 / 最高分（右）
            h('div', {
              style: {
                position: 'absolute',
                top: 6,
                left: 10,
                right: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
                lineHeight: '14px',
                color: 'var(--dsw-alias-label-secondary)',
                pointerEvents: 'none',
              },
            },
              h('span', null, `${gameName} · ${formatDuration(elapsed)}`),
              h('span', null, hudRight)),
            // 底栏：怎么把输入框拿回来
            h('div', {
              style: {
                position: 'absolute',
                bottom: 6,
                left: 10,
                fontSize: 11,
                lineHeight: '14px',
                color: 'var(--dsw-alias-label-secondary)',
                pointerEvents: 'none',
              },
            }, translate('hint.restore', {}, 'Click the composer to keep typing')),
            // 撞死提示
            phase === 'over'
              ? h('div', {
                  style: {
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--dsw-alias-state-error-primary)',
                    pointerEvents: 'none',
                  },
                }, translate('game.over', {}, 'Crashed · restarting'))
              : null)
        : null;

      return h('div', { ref: anchorRef, style: { width: 0, height: 0 } }, board);
    }

    /* ------------------------------------------------------------------ *
     * 设置页（注册在设置 → 插件 下面）
     * ------------------------------------------------------------------ */

    const MINUTE = 60000;

    function SettingsPage(props) {
      const { t } = props;
      const [settings, store] = useSettings();

      const translate = (key, vars, fallback) => {
        let value;
        try {
          value = typeof t === 'function' ? t(key, vars) : undefined;
        } catch (error) {
          value = undefined;
        }
        return typeof value === 'string' && value.length > 0 && value !== key ? value : fallback;
      };

      // 两种行式：
      //
      // · 横向行（标签在左、控件在右）——控件必须**窄**（一个下拉框）。
      //   文字列给 flex:1 + min-width:0，能正常折行，不会被挤成竖排一列字。
      // · 纵向块（标签在上、控件在下）——控件本身很宽时用这个，比如游戏池那排复选框。
      //
      // 之前游戏池用的是横向行：复选框列表把右侧撑满，左边的文字列被压到
      // 几像素宽，于是「轮换时可以选到哪些游戏。」变成一列竖着的单字。
      const row = (label, hint, control) => h('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 0',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        },
      },
        h('div', { style: { flex: '1 1 auto', minWidth: 0, paddingRight: 24 } },
          h('div', { style: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } }, label),
          h('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' } }, hint)),
        h('div', { style: { flex: '0 0 auto' } }, control));

      const block = (label, hint, control) => h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '14px 0',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        },
      },
        h('div', { style: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } }, label),
        h('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' } }, hint),
        h('div', { style: { marginTop: 2 } }, control));

      const select = (value, options, onChange) => h('select', {
        value: String(value),
        onChange: (event) => onChange(Number(event.target.value)),
        style: {
          fontSize: 12,
          lineHeight: '18px',
          padding: '3px 6px',
          borderRadius: 'var(--dsw-radius-sm)',
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-2)',
          color: 'var(--dsw-alias-label-primary)',
        },
      }, options.map((option) => h('option', { key: String(option.value), value: String(option.value) }, option.label)));

      const thresholdOptions = [
        { value: 0, label: translate('settings.immediate', {}, 'Immediately') },
        { value: 30000, label: translate('settings.seconds', { n: 30 }, '30s') },
      ].concat([1, 2, 3, 5, 10].map((minutes) => ({
        value: minutes * MINUTE,
        label: translate('settings.minutes', { n: minutes }, `${minutes} min`),
      })));
      const rotationOptions = [{ value: 0, label: translate('settings.minutes.off', {}, 'Off') }]
        .concat([1, 2, 3, 5, 10].map((minutes) => ({
          value: minutes * MINUTE,
          label: translate('settings.minutes', { n: minutes }, `${minutes} min`),
        })));

      const enabled = Array.isArray(settings.games) ? settings.games : [];
      // 复选框列表：每个选项整体不折行（nowrap），列表本身换行（flex-wrap）。
      // 这样八个游戏会排成两三行，而不是把每项里的字挤成竖排。
      const gameBoxes = h('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px' },
      }, GAMES.map((entry) => h('label', {
        key: entry.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--dsw-alias-label-primary)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        },
      },
        h('input', {
          type: 'checkbox',
          checked: enabled.includes(entry.id),
          onChange: (event) => {
            const next = event.target.checked
              ? [...enabled, entry.id]
              : enabled.filter((id) => id !== entry.id);
            store.write({ games: next });
          },
        }),
        h('span', null, translate(`game.${entry.id}`, {}, entry.name?.en ?? entry.id)))));

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0, padding: '0 0 8px' } },
        h('div', {
          style: {
            fontSize: 12,
            lineHeight: '18px',
            color: 'var(--dsw-alias-label-tertiary)',
            padding: '10px 0 2px',
          },
        }, translate('settings.intro', {}, '')),
        row(
          translate('settings.threshold', {}, 'Take over after'),
          translate('settings.threshold.hint', {}, ''),
          select(settings.thresholdMs, thresholdOptions, (value) => store.write({ thresholdMs: value })),
        ),
        row(
          translate('settings.rotation', {}, 'Rotate games'),
          translate('settings.rotation.hint', {}, ''),
          select(settings.rotationMs, rotationOptions, (value) => store.write({ rotationMs: value })),
        ),
        // 游戏池用纵向块：它比其它控件宽得多，横排会把左边挤扁。
        block(
          translate('settings.games', {}, 'Games'),
          translate('settings.games.hint', {}, ''),
          gameBoxes,
        ),
        h('div', { style: { paddingTop: '14px' } },
          h('button', {
            type: 'button',
            onClick: () => store.clear(),
            style: {
              fontSize: 12,
              lineHeight: '18px',
              padding: '4px 10px',
              borderRadius: 'var(--dsw-radius-sm)',
              border: '1px solid var(--dsw-alias-border-l2)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-primary)',
              cursor: 'pointer',
            },
          }, translate('settings.reset', {}, 'Restore defaults'))));
    }

    /* ------------------------------------------------------------------ *
     * 「点击输入框之外开始游戏」的提示。
     *
     * 输入框被聚焦时游戏**不会**接管——那是故意的，不能打断正在打字的人。
     * 于是「干等着看游戏开始」的人可能一直看不到：光标一直停在输入框里，
     * 条件永远不满足。任务已经跑够时间、而输入框正被聚焦时，
     * 就在输入框上方挂这一句，让他知道该怎么让它开始。
     * ------------------------------------------------------------------ */

    function StartHint(props) {
      const { sessionId, useSessionStatus, t } = props;
      const running = useSessionStatus((snapshot) => (
        sessionId === undefined ? false : snapshot.get(sessionId)?.running === true
      ));
      const [settings] = useSettings();
      const thresholdMs = Number.isFinite(Number(settings.thresholdMs))
        ? Number(settings.thresholdMs)
        : DEFAULT_THRESHOLD_MS;
      const [clock, setClock] = useState(() => Date.now());
      const [focused, setFocused] = useState(false);
      const startedRef = useRef(0);

      useEffect(() => {
        if (running) {
          if (startedRef.current === 0) startedRef.current = Date.now();
        } else {
          startedRef.current = 0;
        }
        setClock(Date.now());
      }, [running]);

      useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => setClock(Date.now()), 250);
        return () => clearInterval(timer);
      }, [running]);

      useEffect(() => {
        const isComposerField = (node) => {
          if (!node || typeof node !== 'object' || typeof node.tagName !== 'string') return false;
          const editable = node.isContentEditable === true
            || node.tagName === 'TEXTAREA'
            || node.tagName === 'INPUT';
          if (!editable) return false;
          return typeof node.closest === 'function' && node.closest('[data-composer-card]') !== null;
        };
        const sync = () => setFocused(isComposerField(document.activeElement));
        const onFocusOut = () => {
          setTimeout(sync, 0);
        };
        document.addEventListener('focusin', sync, true);
        document.addEventListener('focusout', onFocusOut, true);
        return () => {
          document.removeEventListener('focusin', sync, true);
          document.removeEventListener('focusout', onFocusOut, true);
        };
      }, []);

      const elapsed = running && startedRef.current > 0 ? Math.max(0, clock - startedRef.current) : 0;
      if (!running || elapsed < thresholdMs || !focused) return null;
      return h('div', {
        role: 'status',
        style: {
          display: 'flex',
          justifyContent: 'center',
          padding: '2px 0',
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-tertiary)',
        },
      }, translateText(t, 'hint.startOutside', undefined, 'Click outside the input box to start the game'));
    }

    /* ------------------------------------------------------------------ *
     * 注册
     * ------------------------------------------------------------------ */

    /** 宿主配置（cordis.patch.yml 里的 config）通过这条只读路由下发给浏览器半面。 */
    const CONFIG_ROUTE = '/api/dsh-inputbox-game/config';

    function loadHostConfig() {
      try {
        const promise = globalThis.fetch?.(CONFIG_ROUTE, { cache: 'no-store' });
        if (!promise || typeof promise.then !== 'function') return;
        promise
          .then((response) => (response && response.ok ? response.json() : null))
          .then((value) => settingsStore.setHostDefaults(value))
          .catch(() => {
            // 拿不到宿主配置就用内置默认值，设置页照常工作。
          });
      } catch (error) {
        // 忽略
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NAMESPACE, { zh, en }), 'dsh-inputbox-game: copy');
        } catch (error) {
          console.error('[dsh-inputbox-game] locale registration failed:', error);
        }
        const t = ctx.locale.bind(NAMESPACE);

        // 定时器：优先用客户端的 timer 服务，没有再退回浏览器定时器。
        const timerService = ctx.get('timer');
        const schedule = timerService && typeof timerService.interval === 'function'
          ? (callback, delay) => timerService.interval(callback, delay)
          : (callback, delay) => setInterval(callback, delay);

        loadHostConfig();

        // 输入框舞台：接管时把整张输入框卡片变成小游戏棋盘。
        let overlayDisposer;
        try {
          overlayDisposer = ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
            name: 'conversation.input.overlay',
            id: 'dsh-inputbox-game',
            // 先于宿主自带的斜杠菜单、命令面板、反馈对话框注册：同一层叠上下文里
            // 后渲染的浮层才盖在上面，我们的棋盘不会挡住它们。
            order: -1,
            locale: NAMESPACE,
            inject: () => ({ t, schedule }),
          }, MiniGameStage));
        } catch (error) {
          console.error('[dsh-inputbox-game] slot registration failed:', error);
        }

        // 设置页：设置 → 插件 → 「输入框小游戏」。
        try {
          ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
            name: 'settings.plugins.tab',
            id: 'dsh-inputbox-game',
            order: 55,
            label: () => translateText(t, 'settings.title', undefined, 'Composer mini-games'),
            locale: NAMESPACE,
            inject: () => ({ t }),
          }, SettingsPage));
        } catch (error) {
          console.error('[dsh-inputbox-game] settings tab registration failed:', error);
        }

        // 设置页只放在 设置 → 插件 里，不往「通用」里塞。
        //
        // 「点击输入框之外开始游戏」的提示：输入框上方的一条整宽说明，
        // 只在任务已经跑够时间、而输入框正被聚焦时出现。
        try {
          ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
            name: 'conversation.input.dock',
            id: 'dsh-inputbox-game-start-hint',
            order: 15,
            locale: NAMESPACE,
            inject: () => ({ t }),
          }, StartHint));
        } catch (error) {
          console.error('[dsh-inputbox-game] start hint registration failed:', error);
        }
        return overlayDisposer;
      },
    };
  },
});
