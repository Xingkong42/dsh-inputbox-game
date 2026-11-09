import test from 'node:test';
import assert from 'node:assert/strict';
import { rushGame } from '../src/games/rush.mjs';

const DT = 0.05;

/** 跑到首领出现为止。 */
function untilBoss(state, limit = 4000) {
  for (let i = 0; i < limit; i += 1) {
    rushGame.step(state, DT);
    if (state.boss) return true;
    if (state.phase === 'over') return false;
  }
  return false;
}

test('数值跑酷在首领战里会开火（看得见攻击动作）', () => {
  const state = rushGame.create(800, 74);
  assert.equal(untilBoss(state), true, '没等到首领');
  let shots = 0;
  for (let i = 0; i < 60; i += 1) {
    rushGame.step(state, DT);
    shots = Math.max(shots, state.fx.shots.length);
  }
  assert.ok(shots > 0, '首领在场却没有子弹');
});

test('数值跑酷的子弹会命中并炸出爆点', () => {
  const state = rushGame.create(800, 74);
  untilBoss(state);
  let bursts = 0;
  for (let i = 0; i < 200; i += 1) {
    rushGame.step(state, DT);
    bursts = Math.max(bursts, state.fx.bursts.length);
    if (state.phase === 'over') break;
  }
  assert.ok(bursts > 0, '子弹命中了却没有爆点');
});

test('数值跑酷被怪撞到会震屏并冒火星', () => {
  const state = rushGame.create(800, 74);
  state.player.life = 100;
  // 三道都有怪：小人无处可躲，必须挨一发。
  for (let lane = 0; lane < 3; lane += 1) {
    state.entities.push({ type: 'monster', value: 3, lane, x: state.player.x + 6, hit: false });
  }
  rushGame.step(state, DT);
  assert.ok(state.fx.shake > 0, '挨打没有震屏');
  assert.ok(state.fx.bursts.length > 0, '挨打没有爆点');
  assert.ok(state.fx.flash > 0, '挨打没有全屏闪光');
});

test('数值跑酷的特效会衰减（不会无限堆积）', () => {
  const state = rushGame.create(800, 74);
  untilBoss(state);
  for (let i = 0; i < 600; i += 1) {
    rushGame.step(state, DT);
    if (state.phase === 'over') break;
  }
  assert.ok(state.fx.shots.length < 40, `子弹堆了 ${state.fx.shots.length} 个`);
  assert.ok(state.fx.bursts.length < 40, `爆点堆了 ${state.fx.bursts.length} 个`);
  assert.ok(state.fx.rings.length < 20, `冲击环堆了 ${state.fx.rings.length} 个`);
  assert.equal(state.fx.shake, 0, '震动没有停下来');
});

test('数值跑酷射击的伤害与射速一致（每 0.2 秒一发，每发打 攻击力 × 0.2）', () => {
  const state = rushGame.create(800, 74);
  untilBoss(state);
  // 攻击力要等首领出现后再取：等待期间数值牌会把它涨上去。
  const power = state.player.power;
  const before = state.boss.hp;
  for (let i = 0; i < 20; i += 1) rushGame.step(state, DT);   // 1 秒
  const dealt = before - state.boss.hp;
  // 1 秒 = 5 发，每发 攻击力 × 0.2 → 总伤害 = 攻击力
  assert.ok(Math.abs(dealt - power) < 2, `一秒打了 ${dealt.toFixed(1)} 点，应为 ${power.toFixed(1)} 点`);
});
