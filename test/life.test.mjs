import test from 'node:test';
import assert from 'node:assert/strict';
import { lifeGame } from '../src/games/life.mjs';

const DT = 0.05;

/** 跑一局，返回群体曲线与结束状态。 */
function simulate(seconds = 300) {
  const state = lifeGame.create(800, 74);
  const samples = [];
  const steps = Math.round(seconds / DT);
  let over = false;
  for (let i = 0; i < steps; i += 1) {
    if (lifeGame.step(state, DT) === 'over') {
      over = true;
      break;
    }
    if (i % 100 === 0) samples.push(state.creatures.length);
  }
  return { state, samples, over };
}

test('生态箱的群体会明显起伏（不是一块不变的噪点）', () => {
  const { samples } = simulate(240);
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  assert.ok(max >= 15, `群体几乎没长起来，峰值 ${max}`);
  assert.ok(min <= max * 0.6, `群体几乎没掉下去，最低 ${min} / 峰值 ${max}`);
});

test('生态箱的群体会减少（灾害与群体爆发）', () => {
  const { samples } = simulate(240);
  let peak = 0;
  let biggestDrop = 0;
  for (const value of samples) {
    biggestDrop = Math.max(biggestDrop, peak - value);
    peak = Math.max(peak, value);
  }
  assert.ok(biggestDrop >= 5, `最大的群体跌幅只有 ${biggestDrop}`);
});

test('生态箱有失败：群体归零时这一局结束', () => {
  const state = lifeGame.create(800, 74);
  state.creatures = [];
  assert.equal(lifeGame.step(state, DT), 'over');
});

test('生态箱会降下灾害', () => {
  const state = lifeGame.create(800, 74);
  let disasters = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (lifeGame.step(state, DT) === 'over') break;
    if (state.events.length > 0) disasters += 1;
  }
  assert.ok(disasters > 0, '40 秒内一次灾害都没有');
});

test('生态箱的生物不会飞出容器', () => {
  const state = lifeGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    if (lifeGame.step(state, DT) === 'over') break;
    for (const creature of state.creatures) {
      // 允许亚像素级的越界：转向与边界反弹是逐帧算的，浮点上可能差一点点。
      assert.ok(creature.x >= -0.5 && creature.x <= state.width + 0.5, `x 越界: ${creature.x}`);
      assert.ok(creature.y >= -0.5 && creature.y <= state.height + 0.5, `y 越界: ${creature.y}`);
    }
  }
});

test('生态箱的资源会被吃掉（不会无限堆积）', () => {
  const state = lifeGame.create(800, 74);
  for (let i = 0; i < 2000; i += 1) {
    if (lifeGame.step(state, DT) === 'over') break;
  }
  assert.ok(state.resources.length <= state.maxResources, '资源数量失控');
});

test('生态箱的群体不会超过上限', () => {
  const state = lifeGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    if (lifeGame.step(state, DT) === 'over') break;
    assert.ok(state.creatures.length <= state.maxCreatures, `群体超上限: ${state.creatures.length}`);
  }
});
