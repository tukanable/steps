const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const distEl = document.getElementById('dist');
const bestEl = document.getElementById('best');
const stepreadEl = document.getElementById('stepread');
const stepEl = document.getElementById('step');
const speedEl = document.getElementById('speed');
const speedreadEl = document.getElementById('speedread');
const countEl = document.getElementById('count');
const countreadEl = document.getElementById('countread');
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
// count путников (ползунок 1..1000), рандомный старт под углом. Путник делает
// ДИСКРЕТНЫЕ шаги фиксированной длины (= "шаг") к цели: длину не подогнать под
// дистанцию, поэтому он вечно ПЕРЕСКАКИВАЕТ цель и не может остановиться.
// "скорость" — это скорость АНИМАЦИИ (тайм-скейл): плавно проигрывает те же
// шаги медленнее/быстрее (интерполяция между шагами), чтобы рассмотреть перескок.
// Величина шага от скорости анимации НЕ зависит. Шлейф — TRAIL последних позиций.
let count = 1;              // число путников (ползунок 1..1000)
const TRAIL = 10;          // длина шлейфа за точкой (>= 5)
const NEAR = 60;
const STRIDE_DT = 1 / 60;  // опорный интервал одного шага (сим-секунды)

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
    particles = new Array(count);
    const Rmax = Math.min(W, H) * 0.42;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Rmax * (0.55 + Math.random() * 0.45);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      particles[i] = {
        x, y,
        S: 250 + Math.random() * 550,
        // выражённый угол захода — путник летит к цели ПОД УГЛОМ, по спирали
        turn: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35),
        from: { x, y },
        to: { x, y },
        phase: 1,               // >=1 -> первый шаг посчитается сразу
        trail: [{ x, y }],
      };
    }
  }
  globalBest = Infinity;
  simTime = 0;
  t0 = null;
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, W, H);
}

// следующий шаг фиксированной длины из точки (ox,oy), направление под углом turn
function strideFrom(p, ox, oy) {
  const dx = cx - ox, dy = cy - oy;
  const d = Math.max(1e-6, Math.hypot(dx, dy));
  const ux = dx / d, uy = dy / d;
  const c = Math.cos(p.turn), s = Math.sin(p.turn);
  const rx = ux * c - uy * s;
  const ry = ux * s + uy * c;
  const L = p.S * stepScale * STRIDE_DT;   // длина шага = "шаг", от скорости анимации не зависит
  return { x: ox + rx * L, y: oy + ry * L };
}

function simulate(realDt, animSpeed) {
  simTime += realDt;
  const adv = (realDt * animSpeed) / STRIDE_DT;   // сколько шагов проиграть за кадр
  let alive = 0;

  for (let i = 0; i < count; i++) {
    const p = particles[i];
    p.phase += adv;
    let guard = 0;
    while (p.phase >= 1 && guard++ < 4000) {
      p.phase -= 1;
      p.from = p.to;
      p.to = strideFrom(p, p.to.x, p.to.y);   // новый шаг фиксированной длины
    }
    // плавно интерполируем позицию внутри текущего шага
    p.x = p.from.x + (p.to.x - p.from.x) * p.phase;
    p.y = p.from.y + (p.to.y - p.from.y) * p.phase;

    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > TRAIL) p.trail.shift();

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
  for (let i = 0; i < count; i++) {
    const p = particles[i];
    const tl = p.trail;
    // шлейф — от старого к новому, растёт по яркости и размеру
    for (let j = 0; j < tl.length; j++) {
      const a = (j + 1) / (tl.length + 1);
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath();
      ctx.arc(tl[j].x, tl[j].y, 0.7 + 1.6 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // голова
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
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

  let animSpeed = 1;   // в озвучке — реальное время (синк с аудио)
  if (mode === 'play') {
    const at = narration.currentTime;
    stepScale = stepFromTime(at);
    updateSubtitle(at);
    if (narration.ended || at >= TL.duration - 0.02) enterStop();
  } else if (mode === 'idle') {
    stepScale = parseFloat(stepEl.value);
    animSpeed = parseFloat(speedEl.value);
  }

  if (mode !== 'stop') {
    const alive = simulate(realDt, animSpeed);
    distEl.textContent = 'у цели: ' + alive + ' / ' + count;
    bestEl.textContent = 'ближе всего: ' + globalBest.toFixed(4) + ' px';
    stepreadEl.textContent = '×' + stepScale.toFixed(1);
    speedreadEl.textContent = '×' + animSpeed.toFixed(2);
  }

  ctx.fillStyle = '#0b0e14';
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

countEl.addEventListener('input', () => {
  count = parseInt(countEl.value, 10);
  countreadEl.textContent = count;
  if (mode === 'stop') { mode = 'idle'; playBtn.disabled = false; }
  reset(true);
});

narration.addEventListener('ended', () => { if (mode === 'play') enterStop(); });

reset(true);
requestAnimationFrame(loop);
