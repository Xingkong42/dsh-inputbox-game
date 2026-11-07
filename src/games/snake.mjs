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

export const snakeGame = {
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
