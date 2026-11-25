// main.js — boots Saffron & Smoke, wires the keyboard and mouse to the Game, runs
// the frame loop, and stages the deterministic screenshot scenes the bounty asks
// for: ?shot=start|play|rush|end&seed=N renders one fixed frame (the same seed
// always gives the same picture) and raises window.__shotReady when it is painted.

import { Game } from './game.js';

const canvas = document.getElementById('gl');
const game = new Game(canvas);

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------------- input ----------------

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  game.sound.wake();
  if (event.code === 'KeyE' || event.code === 'Space') {
    if (!game.interactHeld) game.interactPressed = true;
    game.interactHeld = true;
  }
  if ((event.code === 'KeyP' || event.code === 'Escape') && (game.mode === 'play' || game.mode === 'pause')) {
    game.setMode(game.mode === 'play' ? 'pause' : 'play');
  }
  if (event.code === 'Enter' && game.mode === 'title') game.startDay((Math.random() * 1e9) | 0);
  game.keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyE' || event.code === 'Space') game.interactHeld = false;
  game.keys.delete(event.code);
});
window.addEventListener('pointerdown', (event) => {
  game.sound.wake();
  if (game.mode !== 'play') return;
  // project the click onto the kitchen floor and walk there
  const { eye, target } = game.camera();
  const nx = (event.clientX / window.innerWidth) * 2 - 1;
  const ny = 1 - (event.clientY / window.innerHeight) * 2;
  const fovTan = Math.tan(0.72 / 2);
  const aspect = window.innerWidth / window.innerHeight;
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const dir = norm([
    fwd[0] + right[0] * nx * fovTan * aspect + up[0] * ny * fovTan,
    fwd[1] + right[1] * nx * fovTan * aspect + up[1] * ny * fovTan,
    fwd[2] + right[2] * nx * fovTan * aspect + up[2] * ny * fovTan,
  ]);
  if (dir[1] < -0.05) {
    const t = -eye[1] / dir[1];
    const x = eye[0] + dir[0] * t;
    const z = eye[2] + dir[2] * t;
    game.walkTarget = {
      x: Math.max(-5.9, Math.min(5.9, x)),
      z: Math.max(-2.75, Math.min(2.95, z)),
    };
  }
});
document.getElementById('playBtn').addEventListener('click', () => game.startDay((Math.random() * 1e9) | 0));
document.getElementById('againBtn').addEventListener('click', () => game.startDay((Math.random() * 1e9) | 0));

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); }

// ---------------- screenshot staging ----------------

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '1', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

function stageCommon() {
  game.reset(seed * 7919 + 17);
  game.time = 1.7; // a fixed clock: steam, bobs and sway pose identically every run
}

function stageStart() {
  stageCommon();
  game.setMode('title');
  game.chef.x = 0.3; game.chef.z = 1.1; game.chef.ry = 0.15;
  game.spots[3].item = 'tomato';
  game.spots[0].item = 'cheese';
  game.boards[1].item = 'choppedLettuce';
  game.refreshHud();
}

function stagePlay() {
  stageCommon();
  game.setMode('play');
  game.dayT = 63;
  game.coins = 128; game.served = 6; game.combo = 3; game.comboT = 4;
  // three tickets up, three customers waiting
  game.spawnOrder('burger', 60); game.orders[game.orders.length - 1].tLeft = 38;
  game.spawnOrder('pizza', 70); game.orders[game.orders.length - 1].tLeft = 47;
  game.spawnOrder('salad', 55); game.orders[game.orders.length - 1].tLeft = 24;
  // the chef is mid-chop at the first board
  game.chef.x = -1.7; game.chef.z = 0.55; game.chef.ry = Math.PI;
  game.boards[0].item = 'tomato';
  game.boards[0].progress = 0.62;
  game.boards[1].item = 'choppedLettuce';
  // a patty is grilling, a pizza is baking
  game.burners[0].item = 'beef'; game.burners[0].result = 'grilledBeef';
  game.burners[0].t = 4.1; game.burners[0].state = 'cooking';
  game.oven.item = 'rawPizza'; game.oven.result = 'pizza';
  game.oven.t = 5.2; game.oven.state = 'cooking';
  // a burger is half-assembled; a finished pizza waits on the pass
  game.assembly.parts = ['dough', 'grilledBeef'];
  game.spots[4].item = 'pizza';
  game.spots[0].item = 'cheese';
  for (let i = 0; i < 26; i += 1) game.puff(-0.9, 1.3, -3.55, 'steam');
  game.updateParticles(0.5);
  game.refreshHud();
}

function stageRush() {
  stageCommon();
  game.setMode('play');
  game.dayT = 118;
  game.coins = 264; game.served = 13; game.combo = 5; game.comboT = 5;
  game.spawnOrder('soup', 62); game.orders[game.orders.length - 1].tLeft = 30;
  game.spawnOrder('burger', 58); game.orders[game.orders.length - 1].tLeft = 44;
  game.spawnOrder('omelette', 66); game.orders[game.orders.length - 1].tLeft = 52;
  game.spawnOrder('steak', 60); game.orders[game.orders.length - 1].tLeft = 18;
  // both burners and the oven are working
  game.burners[0].item = 'beef'; game.burners[0].result = 'grilledBeef';
  game.burners[0].t = 5.6; game.burners[0].state = 'ready';
  game.burners[1].item = 'rawOmelette'; game.burners[1].result = 'omelette';
  game.burners[1].t = 3.2; game.burners[1].state = 'cooking';
  game.oven.item = 'rawPizza'; game.oven.result = 'pizza';
  game.oven.t = 7.4; game.oven.state = 'cooking';
  game.boards[0].item = 'potato'; game.boards[0].progress = 0.4;
  game.assembly.parts = ['choppedTomato', 'choppedOnion'];
  game.spots[1].item = 'gratedCheese';
  // the chef strides across the kitchen carrying a finished burger
  game.chef.x = 0.7; game.chef.z = 1.35; game.chef.ry = 0.9;
  game.chef.holding = 'burger';
  game.chef.phase = 2.2;
  for (let i = 0; i < 40; i += 1) {
    game.puff(-0.9, 1.3, -3.55, 'steam');
    game.puff(0.3, 1.3, -3.55, 'steam');
    game.puff(1.9, 1.35, -3.55, 'steam');
  }
  game.updateParticles(0.6);
  game.refreshHud();
}

function stageEnd() {
  stageCommon();
  game.coins = 342; game.served = 14; game.lost = 1; game.dayT = 150;
  game.chef.x = 0.2; game.chef.z = 1.0; game.chef.ry = 0.1;
  game.spots[4].item = 'pizza';
  game.spots[3].item = 'tomato';
  game.setMode('end');
  game.refreshHud();
}

function runShot(name) {
  if (name === 'play') stagePlay();
  else if (name === 'rush') stageRush();
  else if (name === 'end') stageEnd();
  else stageStart();
  let frames = 0;
  const paint = () => {
    game.render();
    frames += 1;
    if (frames >= 3) {
      window.__shotReady = true;
      document.getElementById('status').textContent = `staged scene ${name}`;
    } else {
      requestAnimationFrame(paint);
    }
  };
  requestAnimationFrame(paint);
}

// ---------------- the live loop ----------------

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.mode !== 'pause') game.update(dt);
  game.render();
  requestAnimationFrame(loop);
}

if (shot) runShot(shot);
else requestAnimationFrame(loop);
