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
  { op: 'add', text: '+', low: 2, high: 6, weight: 4 },
  { op: 'mul', text: '×', low: 2, high: 3, weight: 3 },
  { op: 'div', text: '÷', low: 2, high: 2, weight: 1 },
  { op: 'sub', text: '−', low: 1, high: 4, weight: 2 },
];

/** 攻击力上限：没有它，×2 的数值牌会让攻击力指数膨胀，首领瞬间就没了。 */
const POWER_CAP = 99;

/** 每关多少波来一次首领。 */
const WAVES_PER_LEVEL = 8;

function clampRun(value, low, high) {
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
  state.player.power = clampRun(Math.round(state.player.power), 0, POWER_CAP);
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

function makeMonster() {
  return {
    type: 'monster',
    value: 1 + Math.floor(Math.random() * 3),
    lane: 0,
    x: 0,
    hit: false,
  };
}

export const rushGame = {
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
      const monster = makeMonster();
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
      // 首领的强度跟着当前攻击力走：血量 = 攻击力 × (5 + 关卡)，
      // 所以这场硬仗总是要打 (5 + 关卡) 秒；而它每秒削掉的攻击力
      // 也按攻击力的一个比例来 —— 攻击力既是你的 DPS，也是你能挨多久。
      const hp = player.power * (5 + level);
      state.boss = {
        hp,
        maxHp: Math.max(1, hp),
        dps: player.power * (0.03 + 0.006 * level),
        x: state.width + 120,
        width: Math.max(90, state.width * 0.22),
        name: ['石巨人', '铁面兽', '双头蛇', '深渊像'][Math.min(3, level - 1)],
      };
      state.bossNotice = 1.6;
    }

    // 世界左移。
    for (const entity of state.entities) entity.x -= state.speed * dt;
    state.entities = state.entities.filter((entity) => entity.x > -60);
    if (state.boss) {
      state.boss.x -= state.speed * dt;
      // 首领对耗：你的攻击力是 DPS，也是你的命。
      state.boss.hp -= player.power * dt;
      player.power -= state.boss.dps * dt;
      if (state.boss.hp <= 0) {
        player.score += 100 * level;
        player.level += 1;
        state.boss = null;
        state.bossNotice = 1.2;
      }
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
        player.power = Math.max(0, player.power - entity.value);
        player.score = Math.max(0, player.score - 10);
        state.flash = 0.28;
        player.kills += 1;
      }
    }
    state.entities = state.entities.filter((entity) => !entity.taken && !entity.hit);

    // 失败：攻击力被磨光。
    if (player.power <= 0) {
      player.power = 0;
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
      ctx.fillStyle = theme.error;
      roundRectRun(ctx, boss.x - boss.width / 2, y - 20, boss.width, 40, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 12px var(--dsw-font-family, Inter), sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(boss.name, boss.x, y);
      // 血条
      const barWidth = boss.width;
      const ratio = clampRun(boss.hp / boss.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(boss.x - barWidth / 2, y - 28, barWidth, 4);
      ctx.fillStyle = theme.success;
      ctx.fillRect(boss.x - barWidth / 2, y - 28, barWidth * ratio, 4);
    }

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
    ctx.fillStyle = theme.label;
    ctx.font = '600 10px var(--dsw-font-family, Inter), sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(player.power)), player.x, player.y - 22);

    // 关卡徽标（顶部居中，避开外壳的 HUD）
    ctx.fillStyle = theme.label;
    ctx.font = '600 10px var(--dsw-font-family, Inter), sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${player.level} 关`, width / 2, 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
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
