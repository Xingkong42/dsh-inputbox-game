/**
 * Pong：两块 AI 挡板自动对打。
 *
 * 扁宽的输入框正是 Pong 的原生形状，所以这是四个游戏里最贴合容器的一个。
 *
 * 两块挡板都用「预测落点」驱动：先按当前球速模拟几次墙面反射，算出球会落到
 * 哪一格，再把挡板往那儿挪。但预测会带一个随机漂移（模拟反应误差），而且挡板
 * 有速度上限——所以 AI 偶尔会漏接，于是比分会来回动，游戏会分出胜负。
 */

/** 拿到多少分算一局结束。 */
const WIN_SCORE = 5;

function clampPong(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function createBall(state, toward) {
  const angle = (25 + Math.random() * 20) * (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 180);
  const speed = state.baseSpeed;
  return {
    x: state.width / 2,
    y: state.height / 2,
    vx: Math.cos(angle) * speed * toward,
    vy: Math.sin(angle) * speed,
    r: state.ballR,
    prevX: state.width / 2,
  };
}

/**
 * 预测球到达 targetX 时的纵坐标。
 *
 * 只考虑上下墙的反射，不考虑挡板——够用了：预测本来就是用来让 AI 「大致」
 * 站在正确位置，误差正是这个游戏的一部分。
 */
function predictLanding(state, targetX) {
  const { ball, height } = state;
  let x = ball.x;
  let y = ball.y;
  let vx = ball.vx;
  let vy = ball.vy;
  const r = ball.r;
  for (let i = 0; i < 4000; i += 1) {
    x += vx;
    y += vy;
    if (y < r) {
      y = r + (r - y);
      vy = Math.abs(vy);
    } else if (y > height - r) {
      y = (height - r) - (y - (height - r));
      vy = -Math.abs(vy);
    }
    if (vx < 0 && x <= targetX) return y;
    if (vx > 0 && x >= targetX) return y;
    if (vx === 0) return y;
  }
  return y;
}

function movePaddle(state, paddle, targetX, approaching, dt) {
  // 球正朝自己飞的时候去追落点；球朝反方向飞的时候回到中间待命。
  const predicted = approaching ? predictLanding(state, targetX) : state.height / 2;
  paddle.error = paddle.error * 0.96 + (Math.random() * 2 - 1) * state.errorAmplitude;
  const target = predicted + paddle.error;
  const maxStep = state.paddleSpeed * dt;
  const delta = target - paddle.y;
  paddle.y += clampPong(delta, -maxStep, maxStep);
  const half = state.paddleH / 2;
  paddle.y = clampPong(paddle.y, half, state.height - half);
}

function bounce(state, ball, paddle, direction) {
  const offset = clampPong((ball.y - paddle.y) / (state.paddleH / 2), -1, 1);
  const angle = clampPong(offset * 0.85, 0.28, Math.PI - 0.28);
  const speed = Math.min(state.maxSpeed, state.speed + 7);
  state.speed = speed;
  ball.vx = Math.cos(angle) * speed * direction;
  ball.vy = Math.sin(angle) * speed;
  state.rally += 1;
  state.bestRally = Math.max(state.bestRally, state.rally);
}

export const pongGame = {
  id: 'pong',
  name: { en: 'Pong', zh: '乒乓' },

  create(width, height) {
    const state = {
      width,
      height,
      paddleH: clampPong(height * 0.28, 12, 36),
      paddleW: clampPong(height * 0.07, 4, 8),
      ballR: clampPong(height * 0.05, 3, 7),
      baseSpeed: clampPong(height * 3.2, 150, 340),
      maxSpeed: clampPong(height * 6.2, 320, 720),
      paddleSpeed: clampPong(height * 4.6, 170, 520),
      errorAmplitude: clampPong(height * 0.16, 5, 22),
      speed: 0,
      rally: 0,
      bestRally: 0,
      left: { y: height / 2, score: 0, error: 0 },
      right: { y: height / 2, score: 0, error: 0 },
      ball: null,
    };
    state.speed = state.baseSpeed;
    state.ball = createBall(state, 1);
    return state;
  },

  step(state, dt) {
    const { ball } = state;
    const halfPaddle = state.paddleH / 2;

    movePaddle(state, state.left, state.paddleW, ball.vx < 0, dt);
    movePaddle(state, state.right, state.width - state.paddleW, ball.vx > 0, dt);

    ball.prevX = ball.x;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // 上下墙
    if (ball.y < ball.r) {
      ball.y = ball.r + (ball.r - ball.y);
      ball.vy = Math.abs(ball.vy);
    } else if (ball.y > state.height - ball.r) {
      ball.y = (state.height - ball.r) - (ball.y - (state.height - ball.r));
      ball.vy = -Math.abs(ball.vy);
    }

    // 左挡板
    if (ball.vx < 0 && ball.prevX >= state.paddleW && ball.x <= state.paddleW) {
      if (Math.abs(ball.y - state.left.y) <= halfPaddle + ball.r) {
        bounce(state, ball, state.left, 1);
      }
    }
    // 右挡板
    if (ball.vx > 0 && ball.prevX <= state.width - state.paddleW && ball.x >= state.width - state.paddleW) {
      if (Math.abs(ball.y - state.right.y) <= halfPaddle + ball.r) {
        bounce(state, ball, state.right, -1);
      }
    }

    // 得分
    if (ball.x < -ball.r) {
      state.right.score += 1;
      if (state.right.score >= WIN_SCORE) return 'over';
      state.speed = state.baseSpeed;
      state.rally = 0;
      state.ball = createBall(state, 1);
      return 'running';
    }
    if (ball.x > state.width + ball.r) {
      state.left.score += 1;
      if (state.left.score >= WIN_SCORE) return 'over';
      state.speed = state.baseSpeed;
      state.rally = 0;
      state.ball = createBall(state, -1);
      return 'running';
    }

    return 'running';
  },

  resize(state, width, height) {
    const ratio = height / state.height;
    state.width = width;
    state.height = height;
    state.left.y *= ratio;
    state.right.y *= ratio;
    state.ball.x = width / 2;
    state.ball.y *= ratio;
  },

  draw(ctx, state, width, height, theme) {
    ctx.fillStyle = theme.grid;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, Math.round(height / 2) - 0.5, width, 1);
    ctx.globalAlpha = 1;

    const paddleWidth = state.paddleW;
    const paddleHeight = state.paddleH;
    const halfPaddle = paddleHeight / 2;
    ctx.fillStyle = theme.brand;
    ctx.fillRect(0, state.left.y - halfPaddle, paddleWidth, paddleHeight);
    ctx.fillRect(width - paddleWidth, state.right.y - halfPaddle, paddleWidth, paddleHeight);

    const { ball } = state;
    ctx.fillStyle = theme.food;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  },

  hud(state) {
    return { score: `${state.left.score} : ${state.right.score}`, detail: state.bestRally };
  },
};
