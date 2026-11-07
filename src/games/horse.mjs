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

export const horseGame = {
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
  roundRectPath(ctx, -10, -5, 17, 7, 3);
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
