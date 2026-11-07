import test from 'node:test';
import assert from 'node:assert/strict';
import { runnerGame } from '../src/games/runner.mjs';

const DT = 0.05;

test('跑酷会撞死（游戏允许失败）', () => {
  const state = runnerGame.create(800, 74);
  let over = false;
  for (let i = 0; i < 20000 && !over; i += 1) {
    over = runnerGame.step(state, DT) === 'over';
  }
  assert.equal(over, true, '两万步内应该撞死一次');
});

test('跑酷不是一开局就死（至少跑出一段距离）', () => {
  const state = runnerGame.create(800, 74);
  for (let i = 0; i < 2000; i += 1) {
    if (runnerGame.step(state, DT) === 'over') break;
  }
  assert.ok(state.distance > 100, `只跑了 ${Math.round(state.distance)} 距离`);
});

test('跑酷会自己起跳', () => {
  const state = runnerGame.create(800, 74);
  for (let i = 0; i < 6000; i += 1) {
    if (runnerGame.step(state, DT) === 'over') break;
  }
  assert.ok(state.jumps > 0, '一次都没跳过');
});

test('跑酷的小人始终在容器里（除坠落瞬间）', () => {
  const state = runnerGame.create(800, 74);
  for (let i = 0; i < 6000; i += 1) {
    const result = runnerGame.step(state, DT);
    if (result === 'over') break;
    assert.ok(state.player.x >= 0 && state.player.x <= state.width, '横向出界');
    assert.ok(state.player.y <= state.height + 25, '纵向出界');
  }
});

test('跑酷的速度随距离上升但有上限', () => {
  const state = runnerGame.create(800, 74);
  for (let i = 0; i < 8000; i += 1) {
    if (runnerGame.step(state, DT) === 'over') break;
    assert.ok(state.speed <= 320.001, '速度超过上限');
  }
});

test('跑酷的障碍会被清掉（不会无限堆积）', () => {
  const state = runnerGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    if (runnerGame.step(state, DT) === 'over') break;
  }
  assert.ok(state.obstacles.length < 60, `障碍堆积了 ${state.obstacles.length} 个`);
});
