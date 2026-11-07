import Schema from '@deepseek-ai/schemastery';

/**
 * 宿主半面（Host half）。
 *
 * 这个插件的绝大部分行为在浏览器半面（client.js）里：
 * - 读取 `useSessionStatus` 发布的「会话是否正在运行」；
 * - 自己累计连续运行时长，超过阈值就把输入框接管成小游戏；
 * - 监听输入框焦点，聚焦即恢复普通编辑。
 *
 * 宿主侧只做一件事：把本插件的配置通过一条只读 HTTP 路由下发给浏览器半面，
 * 于是用户可以在 profile 补丁层（cordis.patch.yml）里给这台机器定一份默认值，
 * 而设置页里的选择仍然可以覆盖它。
 */

/** 配置默认值：浏览器半面在没有宿主配置时也用这一套。 */
const CONFIG_DEFAULTS = {
  /** 任务连续运行多久之后接管输入框（毫秒）。 */
  thresholdMs: 180000,
  /** 多久轮换一次游戏（毫秒），0 表示不轮换。 */
  rotationMs: 180000,
  /** 可以选到的游戏。 */
  games: ['snake', 'pong', 'flappy', 'life', 'horse', 'runner'],
};

/**
 * 配置声明。
 *
 * 必须是**原生 schemastery schema**：Loader 的 `isNativeConfigSchema` 只看
 * `schema['~standard'].vendor === 'schemastery'`，手写的 Standard Schema 会被判成
 * "unsupported"，还会在启动报告里留下一条
 * "Config is not a native Schemastery schema" 的诊断。
 * 所以这里老老实实用 schemastery 声明。
 */
export const Config = Schema.object({
  thresholdMs: Schema.natural()
    .description('任务连续运行多久之后接管输入框（毫秒），0 表示任务一开始就接管')
    .default(CONFIG_DEFAULTS.thresholdMs),
  rotationMs: Schema.natural()
    .description('多久轮换一次游戏（毫秒），0 表示不轮换')
    .default(CONFIG_DEFAULTS.rotationMs),
  games: Schema.array(Schema.string())
    .description('可以选到的游戏 id')
    .default(CONFIG_DEFAULTS.games),
});

export function apply(ctx, config) {
  const webServer = ctx.get('webServer');
  if (!webServer) return;
  const payload = {
    thresholdMs: config?.thresholdMs ?? CONFIG_DEFAULTS.thresholdMs,
    rotationMs: config?.rotationMs ?? CONFIG_DEFAULTS.rotationMs,
    games: Array.isArray(config?.games) && config.games.length > 0
      ? config.games
      : CONFIG_DEFAULTS.games,
  };
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/dsh-inputbox-game/config',
    handler: (req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(payload));
    },
  }), 'dsh-inputbox-game: config route');
}
