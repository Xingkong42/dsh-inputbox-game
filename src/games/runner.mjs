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

export const runnerGame = {
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
