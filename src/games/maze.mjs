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

export const mazeGame = {
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
