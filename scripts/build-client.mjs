/**
 * 零依赖构建脚本：把 src/games/*.mjs 内联进 client.template.js，产出 client.js。
 *
 * 为什么不用打包工具：
 * - 安装时不需要跑构建，profile 里也不会多出构建脚本审批；
 * - 产物 client.js 直接进包，随时可读可改；
 * - 引擎源码仍然是独立的 ESM 文件，Node 可以直接 import 做单测。
 *
 * 用法：node scripts/build-client.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 内联顺序 = 默认轮播顺序。 */
const GAME_FILES = ['snake', 'pong', 'flappy', 'life', 'horse', 'runner', 'rush'];

const parts = [];
for (const name of GAME_FILES) {
  const source = await readFile(join(root, 'src', 'games', `${name}.mjs`), 'utf8');
  parts.push(`// ---- src/games/${name}.mjs ----\n${source.replace(/^export\s+/gm, '')}`);
}
const registry = await readFile(join(root, 'src', 'games', 'registry.mjs'), 'utf8');
parts.push(`// ---- src/games/registry.mjs ----\n${registry.replace(/^export\s+/gm, '')}`);
parts.push(`const GAMES = [${GAME_FILES.map((name) => `${name}Game`).join(', ')}];`);

const template = await readFile(join(root, 'client.template.js'), 'utf8');
if (!template.includes('/*__GAMES__*/')) {
  throw new Error('client.template.js 里找不到 /*__GAMES__*/ 占位符');
}
const output = template.replace('/*__GAMES__*/', () => parts.join('\n\n'));

await writeFile(join(root, 'client.js'), output, 'utf8');
console.log(`client.js 已生成：${GAME_FILES.length} 个游戏（${GAME_FILES.join(', ')}）`);
