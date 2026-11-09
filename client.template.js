/**
 * 输入框小游戏台 / Composer mini-game stage.
 *
 * 行为：
 * - 读取 `useSessionStatus` 发布的「本会话是否正在运行」；
 * - 自己累计「连续运行」的时长，超过阈值（默认 3 分钟）后接管对话输入框；
 * - 接管期间输入框整块变成一块自动运行的小游戏棋盘（不需要任何人为操作）；
 * - 输入框一获得焦点立刻恢复正常编辑；失去焦点后若任务仍在运行，稍后重新接管。
 *
 * 落点：`conversation.input.overlay`（会话级列表槽位，渲染在输入框卡片内部）。
 * 宿主把该槽位放在 `div.overlayAnchor` 里——一个 `position:absolute; inset:0 0 auto;
 * height:0` 的锚点，而输入框卡片本身是 `position:relative`。因此本插件用一个
 * `position:absolute` 的子节点就能精确盖住整张卡片。
 *
 * 整个覆盖层 `pointer-events:none`：点击会穿透到下面的编辑器，于是「聚焦输入框
 * 即恢复正常」不需要任何额外交互。
 *
 * 游戏源码在 src/games/*.mjs，由 scripts/build-client.mjs 内联进本模板生成的
 * client.js；这里只写外壳（计时、测量、焦点、HUD、导演）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-inputbox-game',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;

    /*__GAMES__*/

    /** 本插件的客户端文案命名空间。 */
    const NAMESPACE = 'dsh-inputbox-game';

    /** 任务连续运行多久之后接管输入框（毫秒），可由设置页/宿主配置覆盖。 */
    const DEFAULT_THRESHOLD_MS = 180000;

    /** 多久轮换一次游戏（毫秒），0 表示不轮换。 */
    const DEFAULT_ROTATION_MS = 180000;

    /** 失焦之后延迟多久再重新接管（毫秒），避免与用户的下一次点击打架。 */
    const RESUME_DELAY_MS = 700;

    /** 撞死之后定格多久再自动重开（毫秒）。 */
    const OVER_DELAY_MS = 1400;

    /** 游戏循环的心跳（毫秒）。 */
    const TICK_MS = 50;

    const TICK_SECONDS = TICK_MS / 1000;

    /** 设置在 localStorage 里的键。 */
    const STORAGE_KEY = 'dsh-inputbox-game.settings.v1';

    const en = {
      'game.snake': 'Snake',
      'game.pong': 'Pong',
      'game.flappy': 'Flappy',
      'game.life': 'Ecology',
      'game.horse': 'Horse race',
      'game.runner': 'Runner',
      'game.rush': 'Number rush',
      'game.maze': 'Maze',
      'hint.restore': 'Click the composer to keep typing',
      'hint.startOutside': 'Click outside the input box to start the game',
      'hint.score': 'Score {score}',
      'hint.generation': 'Generation {score}',
      'hint.rally': 'Longest rally {score}',
      'hint.versus': 'Score {score}',
      'hint.population': 'Population {score}',
      'hint.bankroll': 'Bankroll {score}',
      'hint.distance': '{score} m',
      'hud.bet': 'Bet on #{n} · {odds}x',
      'hud.lead': 'No.{n} leads',
      'hud.win': 'Won +{n}',
      'hud.lose': 'Lost -{n}',
      'hint.best': 'Best {score}',
      'game.over': 'Crashed · restarting',
      'event.meteor': 'Meteor',
      'event.freeze': 'Cold snap',
      'event.drought': 'Drought',
      'event.boom': 'Population boom',
      'settings.title': 'Composer mini-games',
      'settings.intro': 'While a task keeps running, the composer turns into an auto-playing mini game. Click outside the input box to start it; focusing the composer brings the normal editor back.',
      'settings.threshold': 'Take over after',
      'settings.threshold.hint': 'How long a task must run before the composer turns into a game.',
      'settings.rotation': 'Rotate games',
      'settings.rotation.hint': 'How often the stage switches to another game. A crash always restarts a random game.',
      'settings.games': 'Games',
      'settings.games.hint': 'Which games the stage may pick from.',
      'settings.reset': 'Restore defaults',
      'settings.immediate': 'Immediately',
      'settings.seconds': '{n}s',
      'settings.minutes': '{n} min',
      'settings.minutes.off': 'Off',
    };
    const zh = {
      'game.snake': '贪吃蛇',
      'game.pong': '乒乓',
      'game.flappy': '小鸟',
      'game.life': '生态箱',
      'game.horse': '赛马',
      'game.runner': '跳跃跑酷',
      'game.rush': '数值跑酷',
      'game.maze': '走迷宫',
      'hint.restore': '点击输入框即可恢复编辑',
      'hint.startOutside': '点击输入框之外开始游戏',
      'hint.score': '得分 {score}',
      'hint.generation': '第 {score} 代',
      'hint.rally': '最长回合 {score}',
      'hint.versus': '比分 {score}',
      'hint.population': '群体 {score}',
      'hint.bankroll': '本金 {score}',
      'hint.distance': '{score} 米',
      'hud.bet': '押 {n} 号 · {odds} 倍',
      'hud.lead': '{n} 号领先',
      'hud.win': '押中 +{n}',
      'hud.lose': '没押中 -{n}',
      'hint.best': '最高 {score}',
      'game.over': '撞到了 · 马上重新开始',
      'event.meteor': '陨石',
      'event.freeze': '寒潮',
      'event.drought': '干旱',
      'event.boom': '群体爆发',
      'settings.title': '输入框小游戏',
      'settings.intro': '任务运行期间，输入框会变成一个自动运行的小游戏；点击输入框之外开始游戏，点击输入框即可恢复正常编辑。',
      'settings.threshold': '多久后接管',
      'settings.threshold.hint': '任务连续运行超过这个时间，输入框才变成小游戏。',
      'settings.rotation': '轮换间隔',
      'settings.rotation.hint': '每隔多久换一个游戏。撞死时总是随机重开一局。',
      'settings.games': '游戏池',
      'settings.games.hint': '轮换时可以选到哪些游戏。',
      'settings.reset': '恢复默认',
      'settings.immediate': '立即',
      'settings.seconds': '{n} 秒',
      'settings.minutes': '{n} 分钟',
      'settings.minutes.off': '关闭',
    };

    /* ------------------------------------------------------------------ *
     * 设置：宿主 Config 作默认值，设置页的选择存在 localStorage 里并覆盖它。
     * ------------------------------------------------------------------ */

    const settingsStore = (() => {
      const listeners = new Set();
      let hostDefaults = null;

      const stored = () => {
        try {
          const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
          return {};
        }
      };

      const read = () => ({
        thresholdMs: DEFAULT_THRESHOLD_MS,
        rotationMs: DEFAULT_ROTATION_MS,
        games: GAMES.map((game) => game.id),
        ...(hostDefaults || {}),
        ...stored(),
      });

      const notify = () => {
        for (const listener of listeners) listener();
      };

      return {
        read,
        write(patch) {
          const next = { ...stored(), ...patch };
          try {
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch (error) {
            // 隐私模式或存储被禁用：这次不落盘，内存里的值照常生效。
          }
          notify();
        },
        clear() {
          try {
            globalThis.localStorage?.removeItem(STORAGE_KEY);
          } catch (error) {
            // 忽略
          }
          notify();
        },
        setHostDefaults(value) {
          if (!value || typeof value !== 'object') return;
          hostDefaults = value;
          notify();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    })();

    function useSettings() {
      const [settings, setSettings] = useState(() => settingsStore.read());
      useEffect(() => settingsStore.subscribe(() => setSettings(settingsStore.read())), []);
      return [settings, settingsStore];
    }

    /* ------------------------------------------------------------------ *
     * 绘制辅助
     * ------------------------------------------------------------------ */

    function readTheme(canvas) {
      const styles = getComputedStyle(canvas);
      const read = (name, fallback) => {
        const value = styles.getPropertyValue(name).trim();
        return value.length > 0 ? value : fallback;
      };
      return {
        brand: read('--dsw-alias-brand-primary', '#247bbf'),
        grid: read('--dsw-alias-border-l1', 'rgba(127,127,127,0.3)'),
        food: read('--dsw-alias-state-warn-primary', '#e0913c'),
        error: read('--dsw-alias-state-error-primary', '#e5484d'),
        success: read('--dsw-alias-state-success-primary', '#3fb950'),
        label: read('--dsw-alias-label-secondary', '#8b949e'),
      };
    }

    function drawScene(canvas, game, state, width, height, t) {
      const dpr = globalThis.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const theme = readTheme(canvas);
      const labels = {
        meteor: translateText(t, 'event.meteor', undefined, 'Meteor'),
        freeze: translateText(t, 'event.freeze', undefined, 'Freeze'),
        drought: translateText(t, 'event.drought', undefined, 'Drought'),
        boom: translateText(t, 'event.boom', undefined, 'Population boom'),
      };
      game.draw(ctx, state, width, height, theme, labels);
    }

    function formatDuration(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    /** 翻译助手：拿不到文案时退回一个中性说法，绝不把 key 露给用户。 */
    function translateText(t, key, vars, fallback) {
      let value;
      try {
        value = typeof t === 'function' ? t(key, vars) : undefined;
      } catch (error) {
        value = undefined;
      }
      return typeof value === 'string' && value.length > 0 && value !== key ? value : fallback;
    }

    /* ------------------------------------------------------------------ *
     * 舞台组件
     * ------------------------------------------------------------------ */

    function MiniGameStage(props) {
      const { sessionId, useSessionStatus, t, schedule } = props;

      const [settings] = useSettings();
      // 注意：0 是合法值（「立即接管」），不能用 || 兜底。
      const thresholdMs = Number.isFinite(Number(settings.thresholdMs))
        ? Number(settings.thresholdMs)
        : DEFAULT_THRESHOLD_MS;
      const rotationMs = Math.max(0, Number(settings.rotationMs) || 0);
      const enabledKey = Array.isArray(settings.games) ? settings.games.join(',') : '';

      const pool = useMemo(() => {
        const ids = enabledKey.length > 0 ? enabledKey.split(',') : [];
        const list = GAMES.filter((game) => ids.includes(game.id));
        return list.length > 0 ? list : GAMES;
      }, [enabledKey]);

      const running = useSessionStatus((snapshot) => (
        sessionId === undefined ? false : snapshot.get(sessionId)?.running === true
      ));

      const [clock, setClock] = useState(() => Date.now());
      const [focused, setFocused] = useState(false);
      const [blurAt, setBlurAt] = useState(0);
      const [rect, setRect] = useState(null);
      const [phase, setPhase] = useState('playing');
      const [gameId, setGameId] = useState(GAMES[0].id);
      const [hud, setHud] = useState({ score: 0, unit: 'score' });

      const startedRef = useRef(0);
      const rectRef = useRef(null);
      const anchorRef = useRef(null);
      const canvasRef = useRef(null);
      const bestRef = useRef({});
      const poolRef = useRef(pool);
      poolRef.current = pool;

      // 连续运行的起点：任务一开始运行就记下，停下来就清零。
      useEffect(() => {
        if (running) {
          if (startedRef.current === 0) startedRef.current = Date.now();
        } else {
          startedRef.current = 0;
        }
        setClock(Date.now());
      }, [running]);

      // 心跳：驱动「已运行多久」和失焦后的恢复延迟。
      useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => setClock(Date.now()), 250);
        return () => clearInterval(timer);
      }, [running]);

      // 焦点：聚焦输入框就恢复正常编辑。
      useEffect(() => {
        const isComposerField = (node) => {
          if (!node || typeof node !== 'object' || typeof node.tagName !== 'string') return false;
          const editable = node.isContentEditable === true
            || node.tagName === 'TEXTAREA'
            || node.tagName === 'INPUT';
          if (!editable) return false;
          return typeof node.closest === 'function' && node.closest('[data-composer-card]') !== null;
        };
        const sync = () => {
          const inside = isComposerField(document.activeElement);
          setFocused(inside);
          if (inside) {
            setBlurAt(0);
          } else {
            setBlurAt((previous) => (previous === 0 ? Date.now() : previous));
          }
        };
        const onFocusOut = () => {
          setTimeout(sync, 0);
        };
        document.addEventListener('focusin', sync, true);
        document.addEventListener('focusout', onFocusOut, true);
        return () => {
          document.removeEventListener('focusin', sync, true);
          document.removeEventListener('focusout', onFocusOut, true);
        };
      }, []);

      const elapsed = running && startedRef.current > 0 ? Math.max(0, clock - startedRef.current) : 0;
      const overdue = elapsed >= thresholdMs;
      const settled = blurAt === 0 || clock - blurAt >= RESUME_DELAY_MS;
      const visible = running && overdue && !focused && settled;
      // 画布只有在量到尺寸之后才会挂上，所以游戏循环要等 ready 为真才起跑。
      const ready = visible && rect !== null;

      // 当前游戏被用户在设置里关掉了：换一个。
      useEffect(() => {
        if (pool.some((game) => game.id === gameId)) return;
        const next = pickRandomGame(pool, Math.random);
        if (next) setGameId(next.id);
      }, [pool, gameId]);

      // 量一次输入框卡片：棋盘铺满整张卡片（宽 × 高），也就是整个输入框。
      useEffect(() => {
        if (!visible) {
          rectRef.current = null;
          setRect(null);
          return undefined;
        }
        const measure = () => {
          const marker = anchorRef.current;
          if (!marker) return;
          // 量宿主的 overlay 锚点（我们那个 0×0 占位 div 的父元素），**不要**量占位
          // div 本身——它宽度恒为 0，早先正是因此只画出了左侧一小条。
          const host = marker.parentElement;
          if (!host) return;
          const hostRect = host.getBoundingClientRect();
          const card = typeof host.closest === 'function'
            ? host.closest('[data-composer-card]')
            : null;
          const cardRect = card ? card.getBoundingClientRect() : hostRect;
          const width = Math.max(cardRect.width, 160);
          const height = Math.max(cardRect.height, 64);
          const next = { left: 0, top: 0, width, height };
          const previous = rectRef.current;
          if (previous && Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5) {
            return;
          }
          rectRef.current = next;
          setRect(next);
        };
        measure();
        const marker = anchorRef.current;
        const host = marker ? marker.parentElement : null;
        const card = host && typeof host.closest === 'function'
          ? host.closest('[data-composer-card]')
          : null;
        let observer = null;
        if (card && typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(measure);
          observer.observe(card);
        }
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
          if (observer) observer.disconnect();
          window.removeEventListener('resize', measure);
          window.removeEventListener('scroll', measure, true);
        };
      }, [visible]);

      // 游戏循环：自动跑，不需要任何人为操作。
      useEffect(() => {
        if (!ready) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const game = GAMES.find((entry) => entry.id === gameId) || GAMES[0];
        const start = rectRef.current || { width: 640, height: 72 };
        let state = game.create(start.width, start.height);
        let size = { width: start.width, height: start.height };
        let hudElapsed = 0;
        let overUntil = 0;
        let rotateAt = Date.now() + rotationMs;
        setPhase('playing');

        const tick = () => {
          const now = Date.now();
          const current = rectRef.current;
          if (current && (Math.abs(current.width - size.width) > 0.5 || Math.abs(current.height - size.height) > 0.5)) {
            size = { width: current.width, height: current.height };
            if (typeof game.resize === 'function') {
              game.resize(state, size.width, size.height);
            } else {
              state = game.create(size.width, size.height);
            }
          }

          if (overUntil > 0) {
            // 撞死后的定格：让「游戏结束」被看见，再重开一局。
            if (now >= overUntil) {
              overUntil = 0;
              const next = pickRandomGame(poolRef.current, Math.random);
              if (next && next.id !== gameId) {
                setGameId(next.id);
              } else {
                state = game.create(size.width, size.height);
                setPhase('playing');
              }
            }
          } else if (game.step(state, TICK_SECONDS) === 'over') {
            const result = game.hud(state);
            if (typeof result.score === 'number') {
              const previous = bestRef.current[game.id] || 0;
              bestRef.current[game.id] = Math.max(previous, result.score);
            }
            overUntil = now + OVER_DELAY_MS;
            setPhase('over');
          }

          // 定时轮换：换一个游戏（不挑中当前这个）。
          if (rotationMs > 0 && now >= rotateAt) {
            rotateAt = now + rotationMs;
            const next = pickRandomGame(poolRef.current, Math.random, gameId);
            if (next && next.id !== gameId) {
              setGameId(next.id);
              setPhase('playing');
            }
          }

          drawScene(canvas, game, state, size.width, size.height, t);
          hudElapsed += TICK_SECONDS;
          if (hudElapsed >= 0.25) {
            hudElapsed = 0;
            setHud(game.hud(state));
          }
        };

        const dispose = schedule(tick, TICK_MS);
        return () => {
          if (typeof dispose === 'function') dispose();
          else clearInterval(dispose);
        };
      }, [ready, gameId, enabledKey, rotationMs, schedule]);

      const translate = (key, vars, fallback) => {
        let value;
        try {
          value = typeof t === 'function' ? t(key, vars) : undefined;
        } catch (error) {
          value = undefined;
        }
        return typeof value === 'string' && value.length > 0 && value !== key ? value : fallback;
      };

      const game = GAMES.find((entry) => entry.id === gameId) || GAMES[0];
      const gameName = translate(`game.${game.id}`, {}, game.name?.en ?? game.id);
      const scoreText = translate(`hint.${hud.unit || 'score'}`, { score: hud.score }, `${hud.score}`);
      const detail = hud.detail;
      const detailText = detail && typeof detail === 'object' && detail.kind
        ? translate(`hud.${detail.kind}`, detail, '')
        : typeof detail === 'string' ? detail : '';
      const best = bestRef.current[game.id];
      const bestText = typeof best === 'number' && best > 0
        ? translate('hint.best', { score: best }, `Best ${best}`)
        : '';
      const hudRight = [scoreText, detailText, bestText].filter((part) => part && part.length > 0).join(' · ');

      const board = ready
        ? h('div', {
            'aria-hidden': 'true',
            style: {
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden',
              borderRadius: 'var(--dsw-radius-md)',
              background: 'var(--dsw-specific-input-major)',
              boxShadow: 'inset 0 0 0 1px var(--dsw-alias-border-l1)',
            },
          },
            h('canvas', {
              ref: canvasRef,
              style: {
                display: 'block',
                width: '100%',
                height: '100%',
                opacity: phase === 'over' ? 0.35 : 1,
                transition: 'opacity 120ms linear',
              },
            }),
            // 顶栏：游戏名 + 已运行时长（左） · 得分 / 最高分（右）
            h('div', {
              style: {
                position: 'absolute',
                top: 6,
                left: 10,
                right: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
                lineHeight: '14px',
                color: 'var(--dsw-alias-label-secondary)',
                pointerEvents: 'none',
              },
            },
              h('span', null, `${gameName} · ${formatDuration(elapsed)}`),
              h('span', null, hudRight)),
            // 底栏：怎么把输入框拿回来
            h('div', {
              style: {
                position: 'absolute',
                bottom: 6,
                left: 10,
                fontSize: 11,
                lineHeight: '14px',
                color: 'var(--dsw-alias-label-secondary)',
                pointerEvents: 'none',
              },
            }, translate('hint.restore', {}, 'Click the composer to keep typing')),
            // 撞死提示
            phase === 'over'
              ? h('div', {
                  style: {
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--dsw-alias-state-error-primary)',
                    pointerEvents: 'none',
                  },
                }, translate('game.over', {}, 'Crashed · restarting'))
              : null)
        : null;

      return h('div', { ref: anchorRef, style: { width: 0, height: 0 } }, board);
    }

    /* ------------------------------------------------------------------ *
     * 设置页（注册在设置 → 插件 下面）
     * ------------------------------------------------------------------ */

    const MINUTE = 60000;

    function SettingsPage(props) {
      const { t } = props;
      const [settings, store] = useSettings();

      const translate = (key, vars, fallback) => {
        let value;
        try {
          value = typeof t === 'function' ? t(key, vars) : undefined;
        } catch (error) {
          value = undefined;
        }
        return typeof value === 'string' && value.length > 0 && value !== key ? value : fallback;
      };

      // 两种行式：
      //
      // · 横向行（标签在左、控件在右）——控件必须**窄**（一个下拉框）。
      //   文字列给 flex:1 + min-width:0，能正常折行，不会被挤成竖排一列字。
      // · 纵向块（标签在上、控件在下）——控件本身很宽时用这个，比如游戏池那排复选框。
      //
      // 之前游戏池用的是横向行：复选框列表把右侧撑满，左边的文字列被压到
      // 几像素宽，于是「轮换时可以选到哪些游戏。」变成一列竖着的单字。
      const row = (label, hint, control) => h('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 0',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        },
      },
        h('div', { style: { flex: '1 1 auto', minWidth: 0, paddingRight: 24 } },
          h('div', { style: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } }, label),
          h('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' } }, hint)),
        h('div', { style: { flex: '0 0 auto' } }, control));

      const block = (label, hint, control) => h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '14px 0',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        },
      },
        h('div', { style: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } }, label),
        h('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' } }, hint),
        h('div', { style: { marginTop: 2 } }, control));

      const select = (value, options, onChange) => h('select', {
        value: String(value),
        onChange: (event) => onChange(Number(event.target.value)),
        style: {
          fontSize: 12,
          lineHeight: '18px',
          padding: '3px 6px',
          borderRadius: 'var(--dsw-radius-sm)',
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-2)',
          color: 'var(--dsw-alias-label-primary)',
        },
      }, options.map((option) => h('option', { key: String(option.value), value: String(option.value) }, option.label)));

      const thresholdOptions = [
        { value: 0, label: translate('settings.immediate', {}, 'Immediately') },
        { value: 30000, label: translate('settings.seconds', { n: 30 }, '30s') },
      ].concat([1, 2, 3, 5, 10].map((minutes) => ({
        value: minutes * MINUTE,
        label: translate('settings.minutes', { n: minutes }, `${minutes} min`),
      })));
      const rotationOptions = [{ value: 0, label: translate('settings.minutes.off', {}, 'Off') }]
        .concat([1, 2, 3, 5, 10].map((minutes) => ({
          value: minutes * MINUTE,
          label: translate('settings.minutes', { n: minutes }, `${minutes} min`),
        })));

      const enabled = Array.isArray(settings.games) ? settings.games : [];
      // 复选框列表：每个选项整体不折行（nowrap），列表本身换行（flex-wrap）。
      // 这样八个游戏会排成两三行，而不是把每项里的字挤成竖排。
      const gameBoxes = h('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px' },
      }, GAMES.map((entry) => h('label', {
        key: entry.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--dsw-alias-label-primary)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        },
      },
        h('input', {
          type: 'checkbox',
          checked: enabled.includes(entry.id),
          onChange: (event) => {
            const next = event.target.checked
              ? [...enabled, entry.id]
              : enabled.filter((id) => id !== entry.id);
            store.write({ games: next });
          },
        }),
        h('span', null, translate(`game.${entry.id}`, {}, entry.name?.en ?? entry.id)))));

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0, padding: '0 0 8px' } },
        h('div', {
          style: {
            fontSize: 12,
            lineHeight: '18px',
            color: 'var(--dsw-alias-label-tertiary)',
            padding: '10px 0 2px',
          },
        }, translate('settings.intro', {}, '')),
        row(
          translate('settings.threshold', {}, 'Take over after'),
          translate('settings.threshold.hint', {}, ''),
          select(settings.thresholdMs, thresholdOptions, (value) => store.write({ thresholdMs: value })),
        ),
        row(
          translate('settings.rotation', {}, 'Rotate games'),
          translate('settings.rotation.hint', {}, ''),
          select(settings.rotationMs, rotationOptions, (value) => store.write({ rotationMs: value })),
        ),
        // 游戏池用纵向块：它比其它控件宽得多，横排会把左边挤扁。
        block(
          translate('settings.games', {}, 'Games'),
          translate('settings.games.hint', {}, ''),
          gameBoxes,
        ),
        h('div', { style: { paddingTop: '14px' } },
          h('button', {
            type: 'button',
            onClick: () => store.clear(),
            style: {
              fontSize: 12,
              lineHeight: '18px',
              padding: '4px 10px',
              borderRadius: 'var(--dsw-radius-sm)',
              border: '1px solid var(--dsw-alias-border-l2)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-primary)',
              cursor: 'pointer',
            },
          }, translate('settings.reset', {}, 'Restore defaults'))));
    }

    /* ------------------------------------------------------------------ *
     * 「点击输入框之外开始游戏」的提示。
     *
     * 输入框被聚焦时游戏**不会**接管——那是故意的，不能打断正在打字的人。
     * 于是「干等着看游戏开始」的人可能一直看不到：光标一直停在输入框里，
     * 条件永远不满足。任务已经跑够时间、而输入框正被聚焦时，
     * 就在输入框上方挂这一句，让他知道该怎么让它开始。
     * ------------------------------------------------------------------ */

    function StartHint(props) {
      const { sessionId, useSessionStatus, t } = props;
      const running = useSessionStatus((snapshot) => (
        sessionId === undefined ? false : snapshot.get(sessionId)?.running === true
      ));
      const [settings] = useSettings();
      const thresholdMs = Number.isFinite(Number(settings.thresholdMs))
        ? Number(settings.thresholdMs)
        : DEFAULT_THRESHOLD_MS;
      const [clock, setClock] = useState(() => Date.now());
      const [focused, setFocused] = useState(false);
      const startedRef = useRef(0);

      useEffect(() => {
        if (running) {
          if (startedRef.current === 0) startedRef.current = Date.now();
        } else {
          startedRef.current = 0;
        }
        setClock(Date.now());
      }, [running]);

      useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => setClock(Date.now()), 250);
        return () => clearInterval(timer);
      }, [running]);

      useEffect(() => {
        const isComposerField = (node) => {
          if (!node || typeof node !== 'object' || typeof node.tagName !== 'string') return false;
          const editable = node.isContentEditable === true
            || node.tagName === 'TEXTAREA'
            || node.tagName === 'INPUT';
          if (!editable) return false;
          return typeof node.closest === 'function' && node.closest('[data-composer-card]') !== null;
        };
        const sync = () => setFocused(isComposerField(document.activeElement));
        const onFocusOut = () => {
          setTimeout(sync, 0);
        };
        document.addEventListener('focusin', sync, true);
        document.addEventListener('focusout', onFocusOut, true);
        return () => {
          document.removeEventListener('focusin', sync, true);
          document.removeEventListener('focusout', onFocusOut, true);
        };
      }, []);

      const elapsed = running && startedRef.current > 0 ? Math.max(0, clock - startedRef.current) : 0;
      if (!running || elapsed < thresholdMs || !focused) return null;
      return h('div', {
        role: 'status',
        style: {
          display: 'flex',
          justifyContent: 'center',
          padding: '2px 0',
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-tertiary)',
        },
      }, translateText(t, 'hint.startOutside', undefined, 'Click outside the input box to start the game'));
    }

    /* ------------------------------------------------------------------ *
     * 注册
     * ------------------------------------------------------------------ */

    /** 宿主配置（cordis.patch.yml 里的 config）通过这条只读路由下发给浏览器半面。 */
    const CONFIG_ROUTE = '/api/dsh-inputbox-game/config';

    function loadHostConfig() {
      try {
        const promise = globalThis.fetch?.(CONFIG_ROUTE, { cache: 'no-store' });
        if (!promise || typeof promise.then !== 'function') return;
        promise
          .then((response) => (response && response.ok ? response.json() : null))
          .then((value) => settingsStore.setHostDefaults(value))
          .catch(() => {
            // 拿不到宿主配置就用内置默认值，设置页照常工作。
          });
      } catch (error) {
        // 忽略
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NAMESPACE, { zh, en }), 'dsh-inputbox-game: copy');
        } catch (error) {
          console.error('[dsh-inputbox-game] locale registration failed:', error);
        }
        const t = ctx.locale.bind(NAMESPACE);

        // 定时器：优先用客户端的 timer 服务，没有再退回浏览器定时器。
        const timerService = ctx.get('timer');
        const schedule = timerService && typeof timerService.interval === 'function'
          ? (callback, delay) => timerService.interval(callback, delay)
          : (callback, delay) => setInterval(callback, delay);

        loadHostConfig();

        // 输入框舞台：接管时把整张输入框卡片变成小游戏棋盘。
        let overlayDisposer;
        try {
          overlayDisposer = ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
            name: 'conversation.input.overlay',
            id: 'dsh-inputbox-game',
            // 先于宿主自带的斜杠菜单、命令面板、反馈对话框注册：同一层叠上下文里
            // 后渲染的浮层才盖在上面，我们的棋盘不会挡住它们。
            order: -1,
            locale: NAMESPACE,
            inject: () => ({ t, schedule }),
          }, MiniGameStage));
        } catch (error) {
          console.error('[dsh-inputbox-game] slot registration failed:', error);
        }

        // 设置页：设置 → 插件 → 「输入框小游戏」。
        try {
          ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
            name: 'settings.plugins.tab',
            id: 'dsh-inputbox-game',
            order: 55,
            label: () => translateText(t, 'settings.title', undefined, 'Composer mini-games'),
            locale: NAMESPACE,
            inject: () => ({ t }),
          }, SettingsPage));
        } catch (error) {
          console.error('[dsh-inputbox-game] settings tab registration failed:', error);
        }

        // 设置页只放在 设置 → 插件 里，不往「通用」里塞。
        //
        // 「点击输入框之外开始游戏」的提示：输入框上方的一条整宽说明，
        // 只在任务已经跑够时间、而输入框正被聚焦时出现。
        try {
          ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
            name: 'conversation.input.dock',
            id: 'dsh-inputbox-game-start-hint',
            order: 15,
            locale: NAMESPACE,
            inject: () => ({ t }),
          }, StartHint));
        } catch (error) {
          console.error('[dsh-inputbox-game] start hint registration failed:', error);
        }
        return overlayDisposer;
      },
    };
  },
});
