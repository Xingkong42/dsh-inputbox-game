import test from 'node:test';
import assert from 'node:assert/strict';
import { pongGame } from '../src/games/pong.mjs';

const DT = 0.05;

test('Pong 会分出胜负——游戏允许失败', () => {
  const state = pongGame.create(800, 74);
  let over = false;
  for (let i = 0; i < 40000 && !over; i += 1) {
    over = pongGame.step(state, DT) === 'over';
  }
  assert.equal(over, true, '40000 步内应该有一方先到 5 分');
});

test('Pong 的球始终在上下边界之间', () => {
  const state = pongGame.create(800, 74);
  for (let i = 0; i < 5000; i += 1) {
    pongGame.step(state, DT);
    const { ball } = state;
    assert.ok(ball.y >= ball.r - 0.001, `球穿出上边界: ${ball.y}`);
    assert.ok(ball.y <= state.height - ball.r + 0.001, `球穿出下边界: ${ball.y}`);
  }
});

test('Pong 的挡板有速度上限（不会作弊瞬移）', () => {
  const state = pongGame.create(800, 74);
  const limit = state.paddleSpeed * DT + 0.001;
  for (let i = 0; i < 5000; i += 1) {
    const beforeLeft = state.left.y;
    const beforeRight = state.right.y;
    pongGame.step(state, DT);
    assert.ok(Math.abs(state.left.y - beforeLeft) <= limit, '左挡板瞬移了');
    assert.ok(Math.abs(state.right.y - beforeRight) <= limit, '右挡板瞬移了');
  }
});

test('Pong 的比分会动（AI 会漏接）', () => {
  const state = pongGame.create(800, 74);
  let scored = false;
  for (let i = 0; i < 40000; i += 1) {
    if (pongGame.step(state, DT) === 'over') break;
    if (state.left.score > 0 || state.right.score > 0) scored = true;
  }
  assert.equal(scored, true, '两边都一分未得，说明 AI 太强了');
});

test('Pong 的球速在发球速度与上限之间', () => {
  const state = pongGame.create(800, 74);
  for (let i = 0; i < 20000; i += 1) {
    pongGame.step(state, DT);
    // 每次击球加速，但失分后重新发球会回到基准速度。
    assert.ok(state.speed <= state.maxSpeed + 0.001, '球速超过上限');
    assert.ok(state.speed >= state.baseSpeed - 0.001, '球速低于发球速度');
  }
});
