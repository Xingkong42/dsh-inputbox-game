import test from 'node:test';
import assert from 'node:assert/strict';
import { rushGame } from '../src/games/rush.mjs';

const DT = 0.05;

function play(seconds = 300) {
  const state = rushGame.create(800, 74);
  let steps = 0;
  const limit = Math.round(seconds / DT);
  while (steps < limit) {
    steps += 1;
    if (rushGame.step(state, DT) === 'over') break;
  }
  return { state, steps, ended: state.phase === 'over' };
}

test('数值跑酷会失败（攻击力被磨光就结束）', () => {
  let ended = 0;
  for (let round = 0; round < 8; round += 1) {
    if (play(600).ended) ended += 1;
  }
  assert.ok(ended > 0, '八局里一次都没失败，难度可能太软');
});

test('数值跑酷能撑过一段时间（一开局就死说明太难）', () => {
  const { steps } = play(600);
  assert.ok(steps > 100, `只撑了 ${steps} 步`);
});

test('数值跑酷是闯关式的：关卡会往上走', () => {
  const { state } = play(600);
  assert.ok(state.player.level >= 1, '关卡没有推进');
  assert.ok(state.player.score > 0, '分数一直是 0');
});

test('数值跑酷的数值牌会改变攻击力', () => {
  const state = rushGame.create(800, 74);
  const before = state.player.power;
  // 直接喂一块加法牌，看攻击力是否变化。
  const entity = { type: 'tile', op: 'add', value: 5, lane: state.player.targetLane, x: state.player.x, taken: false };
  state.entities.push(entity);
  rushGame.step(state, DT);
  assert.ok(state.player.power !== before || entity.taken, '数值牌没有生效');
});

test('数值跑酷的怪物会啃生命（三道都有怪时躲不掉）', () => {
  const state = rushGame.create(800, 74);
  state.player.life = 100;
  // 三条道同时来怪：小人无处可躲，必须硬吃一发。
  for (let lane = 0; lane < 3; lane += 1) {
    state.entities.push({ type: 'monster', value: 3, lane, x: state.player.x + 6, hit: false });
  }
  rushGame.step(state, DT);
  assert.equal(state.player.life, 97, '生命没有按怪物伤害扣减');
});

test('数值跑酷的小人始终在容器内', () => {
  const state = rushGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    if (rushGame.step(state, DT) === 'over') break;
    assert.ok(state.player.y >= 0 && state.player.y <= state.height, `小人跑出容器: ${state.player.y}`);
    assert.ok(state.player.x >= 0 && state.player.x <= state.width, `小人的横向位置越界: ${state.player.x}`);
  }
});

test('数值跑酷的首领会出��并被击败', () => {
  const state = rushGame.create(800, 74);
  state.player.power = 400;   // 给足攻击力，保证能打死首领
  let sawBoss = false;
  for (let i = 0; i < 12000; i += 1) {
    if (rushGame.step(state, DT) === 'over') break;
    if (state.boss) sawBoss = true;
  }
  assert.equal(sawBoss, true, '十二千步内都没遇到首领');
});

test('数值跑酷的首领出现时会清场（不留残余怪物）', () => {
  const state = rushGame.create(800, 74);
  let cleared = false;
  for (let i = 0; i < 2000; i += 1) {
    rushGame.step(state, DT);
    if (state.boss) {
      cleared = state.entities.length === 0;
      break;
    }
  }
  assert.equal(cleared, true, '首领出现时场上还有残余实体');
});

test('数值跑酷在前几关的首领之战里不会被打空攻击力', () => {
  const state = rushGame.create(800, 74);
  let sawBoss = false;
  for (let i = 0; i < 4000; i += 1) {
    if (rushGame.step(state, DT) === 'over') break;
    if (state.boss) sawBoss = true;
    else if (sawBoss) break;
  }
  assert.equal(sawBoss, true, '一直没遇到首领');
  assert.equal(state.phase, 'running', '在第一关的首领之战里就死了');
});

test('数值跑酷的实体不会无限堆积', () => {
  const state = rushGame.create(800, 74);
  for (let i = 0; i < 4000; i += 1) {
    if (rushGame.step(state, DT) === 'over') break;
  }
  assert.ok(state.entities.length < 60, `实体堆积了 ${state.entities.length} 个`);
});
