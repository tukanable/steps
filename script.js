const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const distEl = document.getElementById('dist');
const bestEl = document.getElementById('best');
const stepreadEl = document.getElementById('stepread');
const stepEl = document.getElementById('step');
const playBtn = document.getElementById('play');
const restartBtn = document.getElementById('restart');
const subEl = document.getElementById('subtitle');
const narration = document.getElementById('narration');

let W, H, cx, cy;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2;
  cy = H / 2;
}
window.addEventListener('resize', resize);
resize();

// --- модель ---
// 1000 путников, рандомный старт, у каждого ФИКСИРОВАННАЯ скорость.
// Каждый кадр шаг = S * dt * step. Шаг фиксированный -> под дистанцию не
// подогнать -> путник вечно ПЕРЕСКАКИВАЕТ цель, остановиться не может.
// Чем больше шаг, тем больше перескок/разброс; при огромном шаге —
// улетает в бесконечность.
const N = 1000;
const NEAR = 60;

// --- таймлайн шага, привязанный к словам озвучки (timeline.js) ---
const TL = window.TIMELINE;
const A = TL.anchors;
// keyframes: [время_сек, множитель_шага]
const KF = [
  [0,               5 ],  // старт: шаг 5 — путники идут к цели
  [A.uvelichim,     7 ],  // "увеличим шаг" — начинаем разгон
  [A.pereskakivaet, 11],  // "перескакивает" — перескок бьёт лучами через цель
  [A.ne_mozhet,     14],  // "но не может"
  [A.razbros,       20],  // "разброс" — облако широко разлетается
  [A.beskonechnost, 35],  // "бесконечность" — разгон
  [TL.duration,     80],  // улёт в бесконечность
];
function stepFromTime(t) {
  if (t <= KF[0][0]) return KF[0][1];
  for (let i = 1; i < KF.length; i++) {
    if (t <= KF[i][0]) {
      const [t0, s0] = KF[i - 1], [t1, s1] = KF[i];
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return s0 + (s1 - s0) * k;
    }
  }
  return KF[KF.length - 1][1];
}

let particles;
let stepScale = 1;
let mode = 'idle';        // 'idle' (ручной) | 'play' (озвучка) | 'stop' (стоп-кадр)
let globalBest;
let simTime;
let t0;

function reset(freshField = true) {
  if (freshField) {
    particles = new Array(N);
    const Rmax = Math.min(W, H) * 0.42;
    for (let i = 0; i < N; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Rmax * (0.55 + Math.random() * 0.45);
      particles[i] = {
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        S: 250 + Math.random() * 550,
        turn: (Math.random() - 0.5) * 0.5,
        lagBias: 0.5 + Math.random(),
      };
    }
  }
  globalBest = Infinity;
  simTime = 0;
  t0 = null;
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, W, H);
}

function step(p, dt) {
  const dx = cx - p.x;
  const dy = cy - p.y;
  const dist = Math.max(1e-6, Math.hypot(dx, dy));
  let ux = dx / dist, uy = dy / dist;
  const c = Math.cos(p.turn), s = Math.sin(p.turn);
  const rx = ux * c - uy * s;
  const ry = ux * s + uy * c;
  const move = p.S * dt * stepScale;   // фиксированный шаг -> перескок
  p.x += rx * move;
  p.y += ry * move;
}

function simulate(realDt) {
  simTime += realDt;
  let alive = 0;

  for (let i = 0; i < N; i++) {
    const p = particles[i];
    let dt = Math.min(realDt + Math.random() * 2e-4, 0.3);

    step(p, dt);

    const dist = Math.hypot(cx - p.x, cy - p.y);
    if (dist < globalBest) globalBest = dist;
    if (dist <= NEAR) alive++;
  }
  return alive;
}

// --- субтитры ---
let curSent = -1;
function updateSubtitle(t) {
  let idx = -1;
  for (let i = 0; i < TL.sentences.length; i++) {
    if (t >= TL.sentences[i].t) idx = i; else break;
  }
  if (idx !== curSent) {
    curSent = idx;
    if (idx >= 0) {
      subEl.textContent = TL.sentences[idx].text;
      subEl.classList.add('show');
    } else {
      subEl.classList.remove('show');
    }
  }
}

// --- отрисовка ---
function drawTarget() {
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ff5d5d';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,93,93,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const ax = cx + 120, ay = cy - 90;
  const tx = cx + 22,  ty = cy - 17;
  ctx.strokeStyle = '#cdd6e6';
  ctx.fillStyle = '#cdd6e6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  const a = Math.atan2(ty - ay, tx - ax);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - 12 * Math.cos(a - 0.4), ty - 12 * Math.sin(a - 0.4));
  ctx.lineTo(tx - 12 * Math.cos(a + 0.4), ty - 12 * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();

  ctx.font = '16px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Цель', ax + 6, ay - 6);
}

function drawParticles() {
  ctx.fillStyle = '#5db4ff';
  for (let i = 0; i < N; i++) {
    const p = particles[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

// финал — просто остановка (стоп-кадр). Последний субтитр остаётся.
function enterStop() {
  if (mode === 'stop') return;
  mode = 'stop';
  playBtn.disabled = false;
  playBtn.textContent = '▶ Play';
}

// --- главный цикл ---
function loop(now) {
  if (t0 === null) t0 = now;
  let realDt = (now - t0) / 1000;
  t0 = now;
  realDt = Math.min(realDt, 0.05);

  if (mode === 'play') {
    const at = narration.currentTime;
    stepScale = stepFromTime(at);
    updateSubtitle(at);
    if (narration.ended || at >= TL.duration - 0.02) enterStop();
  } else if (mode === 'idle') {
    stepScale = parseFloat(stepEl.value);
  }

  if (mode !== 'stop') {
    const alive = simulate(realDt);
    distEl.textContent = 'у цели: ' + alive + ' / ' + N;
    bestEl.textContent = 'ближе всего: ' + globalBest.toFixed(4) + ' px';
    stepreadEl.textContent = 'шаг ×' + stepScale.toFixed(2);
  }

  ctx.fillStyle = 'rgba(11,14,20,0.16)';
  ctx.fillRect(0, 0, W, H);
  drawParticles();
  drawTarget();

  requestAnimationFrame(loop);
}

// --- управление ---
function play() {
  reset(true);
  mode = 'play';
  curSent = -1;
  subEl.style.display = '';
  subEl.classList.remove('show');
  playBtn.disabled = true;
  narration.currentTime = 0;
  narration.play();
}
playBtn.addEventListener('click', play);

restartBtn.addEventListener('click', () => {
  try { narration.pause(); } catch (e) {}
  mode = 'idle';
  playBtn.disabled = false;
  playBtn.textContent = '▶ Play';
  subEl.style.display = '';
  subEl.classList.remove('show');
  reset(true);
});

narration.addEventListener('ended', () => { if (mode === 'play') enterStop(); });

reset(true);
requestAnimationFrame(loop);
