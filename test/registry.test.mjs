import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRandomGame } from '../src/games/registry.mjs';

const GAMES = [
  { id: 'snake' },
  { id: 'pong' },
  { id: 'flappy' },
  { id: 'life' },
];

test('随机挑游戏：一定有结果', () => {
  for (let i = 0; i < 100; i += 1) {
    const picked = pickRandomGame(GAMES, Math.random);
    assert.ok(picked);
    assert.ok(GAMES.includes(picked));
  }
});

test('随机挑游戏：可以挑到同一个（失败后重开同款）', () => {
  const picked = pickRandomGame(GAMES, () => 0);
  assert.equal(picked.id, 'snake');
});

test('随机挑游戏：排除当前游戏时不会挑中它', () => {
  for (let i = 0; i < 100; i += 1) {
    const picked = pickRandomGame(GAMES, Math.random, 'pong');
    assert.notEqual(picked.id, 'pong');
  }
});

test('随机挑游戏：只有一个游戏时退回它自己', () => {
  const picked = pickRandomGame([{ id: 'snake' }], Math.random, 'snake');
  assert.equal(picked.id, 'snake');
});

test('随机挑游戏：空池子返回 undefined', () => {
  assert.equal(pickRandomGame([], Math.random), undefined);
});
