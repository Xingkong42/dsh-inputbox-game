<p align="center">
  <img src="assets/icon-180.png" width="96" alt="dsh-inputbox-game">
</p>

# dsh-inputbox-game

**English** | [中文](#中文)

> 任务代码可以让 AI 完成，那游戏也可以让 AI 来玩，人类只管看就行。
> 该插件把任务执行期间的输入框变成小游戏娱乐场——看 AI 全自动玩游戏，人类无需操作。

> If code can be written by AI, a game can be played by it too — you just watch.
> This plugin turns the chat composer into a mini-game arcade while a task is running:
> six games play themselves, and you never touch the keyboard.

![设置页](assets/screenshot-1-settings.png)

## 安装 / Install

```sh
dsh plugin --profile <profile> add dsh-inputbox-game
```

桌面端也可以直接走应用内的 **设置 → 插件** 搜索 `dsh-inputbox-game` 安装，
**无需命令行**。

从源码装（免 npm）：

```sh
dsh plugin --profile <profile> add github:Xingkong42/dsh-inputbox-game
```

> `dsh web` 用的 profile 名请换成宿主实际使用的那个；桌面端请用应用内的插件管理器，
> 命令行装到的是另一个 profile。

## 它做了什么 / What it does

1. 任务开始运行后，插件开始计时。
2. 任务**连续运行**超过设定时长（默认 3 分钟）后，对话输入框整块变成一块小游戏棋盘。
3. 游戏全自动运行：没有人操作，也不需要你盯着。
4. **点击输入框之外**即可让游戏开始——输入框正被聚焦时不会接管（不能打断正在打字的人），
   这时输入框上方会提示一句「点击输入框之外开始游戏」。
5. 点击输入框本身，正常编辑立即恢复。

[赛马](assets/screenshot-6-horse.png) · [跳跃跑酷](assets/screenshot-7-runner.png) ·
[生态箱](assets/screenshot-5-ecology.png) · [小鸟](assets/screenshot-4-flappy.png) ·
[乒乓](assets/screenshot-3-pong.png) · [贪吃蛇](assets/screenshot-2-snake.png)

## 六款游戏 / The six games

| 游戏 | 玩法 | 失败点 |
|---|---|---|
| 贪吃蛇 | 贪心追食物，越吃越长 | 把自己围死 |
| 乒乓 | 两侧 AI 挡板预测落点对打 | 一方先到 5 分 |
| 小鸟 | 小鸟自动拍翅穿越管道缺口 | 撞管道 |
| 生态箱 | 群体吃资源、繁殖，躲陨石与寒潮干旱 | 群体灭绝 |
| 赛马 | 五匹马自动比赛，你押一注 | 本金破产 |
| 跳跃跑酷 | 小人自动起跳越过障碍与深坑 | 掉进坑里 |
| 数值跑酷 | 三条道自动选路，吃数值牌涨攻击力，撞怪掉攻击力，逐关打首领 | 攻击力被磨光 |

每局结束后随机换一个游戏继续（失败重开也可能是同一个）；
也可以在设置里关掉轮换，或者只留下其中一两款。

## 设置 / Settings

**设置 → 插件 → 输入框小游戏**（桌面端在插件页的同名页签）：

- **多久后接管**：立即 / 30 秒 / 1 / 2 / 3 / 5 / 10 分钟
- **轮换间隔**：关闭 / 1 / 2 / 3 / 5 / 10 分钟
- **游戏池**：勾选轮换时能选到的游戏
- **恢复默认**

![设置页](assets/screenshot-1-settings.png)

也可以在 profile 的补丁层里给这台机器定一份默认值（设置页的选择会覆盖它）：

```yaml
- insert:
    - id: dsh-inputbox-game
      name: 'dsh-inputbox-game'
      config:
        thresholdMs: 180000     # 任务连续运行多久后接管输入框，0 = 立即
        rotationMs: 180000      # 多久轮换一次游戏，0 = 不轮换
        games: [snake, pong, flappy, life, horse, runner]
```

## 原理 / How it works

- **浏览器半面**：读取客户端已经发布的「本会话是否正在运行」，自己累计连续运行时长，
  到点后用 `conversation.input.overlay` 槽位接管输入框卡片；覆盖层 `pointer-events:none`，
  点击会穿透到编辑器，于是「聚焦输入框即恢复」不需要任何额外交互。
- **宿主半面**：只做一件事——把配置通过一条只读 HTTP 路由下发给浏览器半面。
- **七个游戏引擎**是纯逻辑、无 DOM 的独立模块，实现同一个契约
  （`create / step / draw / hud`），因此可以逐个做单元测试。
- 配色全部取自主题变量 `--dsw-alias-*`，跟随宿主的明暗主题。

## 开发 / Development

```sh
npm run build     # 由 src/games/*.mjs 重建 client.js（零依赖构建脚本）
npm test          # 41 项 Node 单元测试
```

游戏引擎在 `src/games/`，浏览器半面的模板在 `client.template.js`。
设计与实现记录见 [DESIGN.md](DESIGN.md)。

## License

MIT
