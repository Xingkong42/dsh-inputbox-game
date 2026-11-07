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

export const lifeGame = {
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
