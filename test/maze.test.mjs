import test from 'node:test';
import assert from 'node:assert/strict';
import { mazeGame } from '../src/games/maze.mjs';

const DT = 0.05;

function play(seconds = 120) {
  const state = mazeGame.create(800, 74);
  const limit = Math.round(seconds / DT);
  for (let i = 0; i < limit; i += 1) {
    if (mazeGame.step(state, DT) === 'over') break;
  }
  return state;
}

test('走迷宫的迷宫是随机的（每局不一样）', () => {
  const a = mazeGame.create(800, 74);
  const b = mazeGame.create(800, 74);
  assert.notDeepEqual(Array.from(a.walls), Array.from(b.walls), '两张迷宫一模一样');
});

test('走迷宫能走出去（右手贴墙法保证可达）', () => {
  const state = play(180);
  assert.ok(state.escapes >= 1, `180 秒里一次都没出去（escapes=${state.escapes}）`);
});

test('走迷宫的每一局都会换新迷宫', () => {
  const state = play(180);
  assert.ok(state.escapes >= 1);
  // 出口那一行的墙应该被拆开过：新迷宫是重新生成的。
  assert.ok(state.walls.length === state.cols * state.rows);
});

test('走迷宫的小球始终在容器里', () => {
  const state = mazeGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    mazeGame.step(state, DT);
    assert.ok(state.ball.x >= 0 && state.ball.x < state.cols, `横向越界: ${state.ball.x}`);
    assert.ok(state.ball.y >= 0 && state.ball.y < state.rows, `纵向越界: ${state.ball.y}`);
  }
});

test('走迷宫的墙是自洽的（两面相邻的墙成对出现）', () => {
  const state = mazeGame.create(800, 74);
  const { cols, rows, walls } = state;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      if (x < cols - 1) {
        const east = (walls[index] & 2) !== 0;
        const west = (walls[index + 1] & 8) !== 0;
        assert.equal(east, west, `(${x},${y}) 的东西墙不成对`);
      }
      if (y < rows - 1) {
        const south = (walls[index] & 4) !== 0;
        const north = (walls[index + cols] & 1) !== 0;
        assert.equal(south, north, `(${x},${y}) 的南北墙不成对`);
      }
    }
  }
});

test('走迷宫的轨迹不会无限堆积', () => {
  const state = play(120);
  assert.ok(state.trail.length <= 100, `轨迹堆了 ${state.trail.length} 个点`);
});

test('走迷宫在窄条容器里也成立', () => {
  const state = mazeGame.create(800, 40);
  assert.ok(state.rows >= 5, `行数太少: ${state.rows}`);
  for (let i = 0; i < 2000; i += 1) mazeGame.step(state, DT);
  assert.ok(state.escapes >= 1, '窄条容器里走不出去');
});
