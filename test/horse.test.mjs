import test from 'node:test';
import assert from 'node:assert/strict';
import { horseGame } from '../src/games/horse.mjs';

const DT = 0.05;

test('赛马会开赛并跑出成绩', () => {
  const state = horseGame.create(800, 74);
  let settled = false;
  for (let i = 0; i < 20000; i += 1) {
    if (horseGame.step(state, DT) === 'over') break;
    if (state.phase === 'settling') {
      settled = true;
      break;
    }
  }
  assert.equal(settled, true, '两万步内应该有一场跑完');
  assert.equal(state.order.length, state.horses.length, '名次没有排出来');
});

test('赛马每场重新洗牌：冠军不会固定成一匹', () => {
  // 每局赛马都会在破产时结束，所以跨多个新局各跑一场来采样。
  const winners = [];
  for (let round = 0; round < 10; round += 1) {
    const state = horseGame.create(800, 74);
    let lastPhase = state.phase;
    for (let i = 0; i < 20000; i += 1) {
      if (horseGame.step(state, DT) === 'over') break;
      if (state.phase === 'settling' && lastPhase !== 'settling') {
        winners.push(state.winner);
        break;
      }
      lastPhase = state.phase;
    }
  }
  assert.ok(winners.length >= 6, `只拿到 ${winners.length} 场结果`);
  const distinct = new Set(winners);
  assert.ok(distinct.size >= 3, `冠军只有 ${distinct.size} 匹（${winners.join(',')}），说明实力没有重新洗牌`);
});

test('赛马每场的实力分布都会重掷', () => {
  const state = horseGame.create(800, 74);
  const strengths = [];
  const orders = [];
  let lastPhase = state.phase;
  for (let i = 0; i < 300000; i += 1) {
    if (horseGame.step(state, DT) === 'over') break;
    if (state.phase === 'betting' && lastPhase !== 'betting') {
      strengths.push(state.horses.map((horse) => horse.base.toFixed(3)).join(','));
    }
    if (state.phase === 'settling' && lastPhase !== 'settling') {
      orders.push(state.order.join(''));
    }
    lastPhase = state.phase;
  }
  assert.ok(new Set(strengths).size >= 3, '每场的实力分布几乎没变');
  assert.ok(new Set(orders).size >= 3, `名次排列几乎没变：${[...new Set(orders)].join(' ')}`);
});

test('赛马的名次是 1..N 的一个排列', () => {
  const state = horseGame.create(800, 74);
  for (let i = 0; i < 20000; i += 1) {
    if (horseGame.step(state, DT) === 'over') break;
    if (state.phase === 'settling') break;
  }
  const sorted = [...state.order].sort((a, b) => a - b);
  assert.deepEqual(sorted, state.horses.map((horse) => horse.index));
});

test('赛马的本金会涨跌（押注有输赢）', () => {
  const state = horseGame.create(800, 74);
  const balances = new Set();
  for (let i = 0; i < 60000; i += 1) {
    if (horseGame.step(state, DT) === 'over') break;
    if (state.phase === 'betting' || state.phase === 'settling') balances.add(state.bankroll);
  }
  assert.ok(balances.size >= 2, '本金一直不变，说明押注没生效');
});

test('赛马会破产结束（失败机制）', () => {
  let ended = 0;
  for (let round = 0; round < 8; round += 1) {
    const state = horseGame.create(800, 74);
    for (let i = 0; i < 120000; i += 1) {
      if (horseGame.step(state, DT) === 'over') {
        ended += 1;
        break;
      }
    }
  }
  assert.ok(ended > 0, '八局里一次都没破产，押注机制可能有问题');
});

test('赛马的马不会跑出画面之外太久（摄像机锁住领先者）', () => {
  const state = horseGame.create(800, 74);
  for (let i = 0; i < 20000; i += 1) {
    if (horseGame.step(state, DT) === 'over') break;
    if (state.phase !== 'racing') continue;
    let leader = state.horses[0];
    for (const horse of state.horses) if (horse.x > leader.x) leader = horse;
    const screenX = leader.x - state.cameraX;
    assert.ok(screenX <= state.width, `领先马跑出右边界: ${screenX}`);
    assert.ok(screenX >= -20, `摄像机回退了: ${screenX}`);
  }
});

test('赛马的赔率不会高于公平赔率（庄家永远有抽水）', () => {
  const state = horseGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    if (horseGame.step(state, DT) === 'over') break;
    if (state.phase !== 'betting') continue;
    assert.ok(state.odds >= 1.2, `赔率太低: ${state.odds}`);
    assert.ok(state.bet > 0, '下注金额是 0');
    const weights = state.horses.map((horse) => horse.base ** 1.2);
    const total = weights.reduce((sum, value) => sum + value, 0);
    const chance = weights[state.picked] / total;
    const fair = ((1 - chance) / chance) * 0.8;
    assert.ok(state.odds <= fair + 0.06, `赔率 ${state.odds} 高于公平赔率 ${fair.toFixed(2)}`);
  }
});
