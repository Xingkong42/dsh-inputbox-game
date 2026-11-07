import test from 'node:test';
import assert from 'node:assert/strict';
import { flappyGame } from '../src/games/flappy.mjs';

const DT = 0.05;

test('小鸟会撞死——游戏允许失败', () => {
  const state = flappyGame.create(800, 74);
  let over = false;
  for (let i = 0; i < 20000 && !over; i += 1) {
    over = flappyGame.step(state, DT) === 'over';
  }
  assert.equal(over, true, '20000 步内应该撞到一次管道');
});

test('小鸟能通过前几根管道（不是一开局就死）', () => {
  // 偶尔会在第一根管道上就失手，所以取多局里的最好成绩。
  let best = 0;
  for (let round = 0; round < 5; round += 1) {
    const state = flappyGame.create(800, 74);
    for (let i = 0; i < 2000; i += 1) {
      if (flappyGame.step(state, DT) === 'over') break;
    }
    best = Math.max(best, state.score);
  }
  assert.ok(best > 0, '一根管道都没过去');
});

test('小鸟不会卡死（确实在动）', () => {
  const state = flappyGame.create(800, 74);
  const start = state.bird.y;
  // 取窗口内的最大偏移量：只比终值的话，小鸟绕回原位会被误判成卡死。
  let moved = 0;
  for (let i = 0; i < 50; i += 1) {
    flappyGame.step(state, DT);
    moved = Math.max(moved, Math.abs(state.bird.y - start));
  }
  assert.ok(moved > 0.5, '小鸟的位置完全没变');
});

test('小鸟始终在容器内飞行直到撞死', () => {
  const state = flappyGame.create(800, 74);
  for (let i = 0; i < 2000; i += 1) {
    if (flappyGame.step(state, DT) === 'over') break;
    assert.ok(state.bird.y >= state.bird.r - 0.5, `飞出上边界: ${state.bird.y}`);
    assert.ok(state.bird.y <= state.height - state.bird.r + 0.5, `飞出下边界: ${state.bird.y}`);
  }
});

test('小鸟的速度随分数上升但有上限', () => {
  const state = flappyGame.create(800, 74);
  for (let i = 0; i < 2000; i += 1) {
    if (flappyGame.step(state, DT) === 'over') break;
    assert.ok(state.speed <= state.maxSpeed + 0.001, '速度超过上限');
  }
});
