/**
 * 游戏池的公共工具。
 *
 * 这个文件没有 import，构建脚本会把它原样内联进浏览器半面；Node 单测则直接
 * import 它。两条路径共用同一份实现，避免「测的和跑的不是一个东西」。
 */

/**
 * 随机挑一个游戏。
 *
 * `excludeId` 用于「定时轮换时不挑中当前这个」；失败重开时不传，于是可能还是
 * 同一个游戏——这是有意的：失败重开同一个游戏，和失败后随机换一个，都是用户
 * 可以接受的行为。
 */
export function pickRandomGame(games, random = Math.random, excludeId) {
  if (!Array.isArray(games) || games.length === 0) return undefined;
  const pool = excludeId === undefined
    ? games
    : games.filter((game) => game.id !== excludeId);
  const candidates = pool.length > 0 ? pool : games;
  const index = Math.floor(random() * candidates.length);
  return candidates[Math.max(0, Math.min(candidates.length - 1, index))];
}
