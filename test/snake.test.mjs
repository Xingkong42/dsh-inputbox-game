import test from 'node:test';
import assert from 'node:assert/strict';
import { snakeGame } from '../src/games/snake.mjs';

const DT = 0.05;

/** 跑到结束（或步数用完），返回状态与实际步数。 */
function play(width, height, maxSteps) {
  const state = snakeGame.create(width, height);
  let steps = 0;
  while (steps < maxSteps) {
    steps += 1;
    if (snakeGame.step(state, DT) === 'over') break;
  }
  return { state, steps, over: steps < maxSteps };
}

test('贪吃蛇会撞死——游戏允许失败', () => {
  const { over } = play(800, 74, 20000);
  assert.equal(over, true, '20000 步内应该至少撞死一次');
});

test('贪吃蛇不会一开局就死（每局至少活 200 步）', () => {
  let shortest = Infinity;
  for (let round = 0; round < 5; round += 1) {
    const { steps } = play(800, 74, 20000);
    shortest = Math.min(shortest, steps);
  }
  assert.ok(shortest >= 200, `最短的一局只有 ${shortest} 步`);
});

test('贪吃蛇不会卡在固定循环里（单局不超过 30000 步）', () => {
  let longest = 0;
  for (let round = 0; round < 5; round += 1) {
    const { steps } = play(800, 74, 30000);
    longest = Math.max(longest, steps);
  }
  assert.ok(longest < 30000, `最长的一局 ${longest} 步，看着像死循环`);
});

test('贪吃蛇能吃到东西、分数会涨', () => {
  const { state } = play(800, 74, 20000);
  assert.ok(state.score > 0, '至少该吃到一次食物');
});

test('贪吃蛇的蛇身始终在棋盘内', () => {
  const state = snakeGame.create(800, 74);
  for (let i = 0; i < 5000; i += 1) {
    if (snakeGame.step(state, DT) === 'over') break;
    for (const part of state.body) {
      assert.ok(part.x >= 0 && part.x < state.cols, `x 越界: ${part.x}`);
      assert.ok(part.y >= 0 && part.y < state.rows, `y 越界: ${part.y}`);
    }
  }
});
