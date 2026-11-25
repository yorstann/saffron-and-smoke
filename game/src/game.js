// game.js — Saffron & Smoke itself: the chef, the stations, the tickets, the rush.
// One Game object holds the whole simulation; main.js feeds it input and time, and
// asks it to draw. Rendering is a hand-rolled WebGL batch (gl.js) fed with the
// little sculptures from food.js and world.js.

import { Batch, mat4Compose, mat4LookAt, mat4Multiply, mat4Perspective } from './gl.js';
import { geoOf, hex } from './geo.js';
import { dishGeo, foodGeo, panGeo, plateGeo, potGeo, vesselFor, isDish } from './food.js';
import {
  ASSEMBLY_OFFSETS, BAKE, CHOP, COOK, COOK_SECONDS, CUSTOMER_SLOTS, DAY_SECONDS,
  DISH_PRICES, ITEM_NAMES, RECIPES, SPOTS, STANDALONE, STAR_THRESHOLDS, STATIONS,
  buildChef, buildCustomer, buildKitchen,
} from './world.js';
import { SoundKit } from './audio.js';

const $ = (id) => document.getElementById(id);

function mulberry(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INTERACT_DIST = 1.6;
const PERFECT_WINDOW = 4; // seconds a cooked item stays perfect before it burns

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.batch = new Batch(gl);
    this.kitchen = buildKitchen();
    this.chefGeo = buildChef();
    this.customerGeos = [0, 1, 2, 3].map((i) => buildCustomer(i));
    this.shadowGeo = geoOf((b) => b.disc(0, 0, 0, 0.42, hex(0x2a1608), 14));
    this.ringGeo = geoOf((b) => b.disc(0, 0, 0, 0.5, hex(0xffc44d), 20));
    this.sound = new SoundKit();
    this.keys = new Set();
    this.interactHeld = false;
    this.interactPressed = false;
    this.walkTarget = null;
    this.time = 0;
    this.reset(1234);
    this.setMode('title');
  }

  reset(seed) {
    this.rand = mulberry(seed);
    this.chef = { x: 0.4, z: 0.9, ry: 0, phase: 0, holding: null, chopping: false };
    this.burners = STATIONS.filter((s) => s.kind === 'burner')
      .map((station) => ({ station, item: null, result: null, t: 0, state: 'idle', dinged: false }));
    this.oven = { station: STATIONS.find((s) => s.kind === 'oven'), item: null, result: null, t: 0, state: 'idle', dinged: false };
    this.boards = STATIONS.filter((s) => s.kind === 'board')
      .map((station) => ({ station, item: null, progress: 0, chopSoundT: 0 }));
    this.spots = SPOTS.map((spot) => ({ ...spot, item: null }));
    this.assembly = { station: STATIONS.find((s) => s.kind === 'assembly'), parts: [], result: null };
    this.orders = [];
    this.orderSeq = 0;
    this.coins = 0;
    this.served = 0;
    this.lost = 0;
    this.combo = 1;
    this.comboT = 0;
    this.dayT = 0;
    this.spawnT = 2.2;
    this.particles = [];
    this.toastT = 0;
    this.hudT = 0;
    this.announcedUnlocks = new Set();
  }

  setMode(mode) {
    this.mode = mode;
    document.getElementById('hud').dataset.mode = mode;
    $('titleOv').classList.toggle('hidden', mode !== 'title');
    $('endOv').classList.toggle('hidden', mode !== 'end');
    $('pauseOv').classList.toggle('hidden', mode !== 'pause');
    if (mode === 'end') this.fillEndCard();
  }

  startDay(seed) {
    this.reset(seed);
    this.setMode('play');
    this.sound.wake();
    this.showToast('Service starts!');
  }

  fillEndCard() {
    const stars = STAR_THRESHOLDS.filter((t) => this.coins >= t).length;
    $('stars').innerHTML = [0, 1, 2]
      .map((i) => (i < stars ? '★' : '<span class="off">★</span>')).join('');
    $('endStats').innerHTML =
      `The till holds <b>${this.coins} coins</b>.<br>` +
      `${this.served} dishes served · ${this.lost} customer${this.lost === 1 ? '' : 's'} walked away<br>` +
      (stars === 3 ? 'A flawless service — the bistro is glowing.'
        : stars === 2 ? 'A strong service. One more push for perfection.'
          : stars === 1 ? 'The doors stayed open. Tomorrow, faster knives.'
            : 'A rough day in the kitchen. The recipes are on the tickets — follow the parts.');
  }

  showToast(text, ms = 1600) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    this.toastT = ms / 1000;
  }

  // ---------------- orders ----------------

  dishPool() {
    const pool = [];
    for (const [id, recipe] of Object.entries(RECIPES)) {
      if (this.dayT >= recipe.unlock) pool.push(id);
    }
    pool.push('fries');
    if (this.dayT >= 115) pool.push('steak');
    return pool;
  }

  spawnOrder(forcedDish = null, forcedPatience = null) {
    const usedSlots = new Set(this.orders.map((o) => o.slot));
    const free = CUSTOMER_SLOTS.map((s, i) => i).filter((i) => !usedSlots.has(i));
    if (free.length === 0) return null;
    const slot = free[Math.floor(this.rand() * free.length)];
    const pool = this.dishPool();
    const dish = forcedDish ?? pool[Math.floor(this.rand() * pool.length)];
    const patience = forcedPatience ?? (58 + this.rand() * 26 - Math.min(10, this.dayT * 0.05));
    const order = { id: (this.orderSeq += 1), dish, slot, tMax: patience, tLeft: patience };
    this.orders.push(order);
    return order;
  }

  // ---------------- interaction ----------------

  /** The station or spot the chef is close enough to use, or null. */
  currentTarget() {
    let best = null;
    let bestDist = INTERACT_DIST;
    const consider = (x, z, ref) => {
      const d = Math.hypot(this.chef.x - x, this.chef.z - z);
      if (d < bestDist) { bestDist = d; best = ref; }
    };
    for (const st of STATIONS) consider(st.standX, st.standZ, { type: 'station', st });
    for (const spot of this.spots) consider(spot.standX, spot.standZ, { type: 'spot', spot });
    return best;
  }

  /** What pressing E would do at the target, as { label, action } or null. */
  planFor(target) {
    const held = this.chef.holding;
    if (!target) return null;
    if (target.type === 'spot') {
      const spot = target.spot;
      if (spot.item && !held) return { label: `Take ${ITEM_NAMES[spot.item]}`, action: () => { this.chef.holding = spot.item; spot.item = null; this.sound.pickup(); } };
      if (!spot.item && held) return { label: `Set down ${ITEM_NAMES[held]}`, action: () => { spot.item = held; this.chef.holding = null; this.sound.place(); } };
      return null;
    }
    const st = target.st;
    switch (st.kind) {
      case 'bin':
        if (!held) return { label: `Take ${ITEM_NAMES[st.item]}`, action: () => { this.chef.holding = st.item; this.sound.pickup(); } };
        return { label: 'Hands full', action: null };
      case 'trash':
        if (held) return { label: `Bin the ${ITEM_NAMES[held]}`, action: () => { this.chef.holding = null; this.sound.trash(); } };
        return null;
      case 'board': {
        const board = this.boards.find((bd) => bd.station === st);
        if (board.item && !held && board.progress === 0) {
          if (CHOP[board.item]) return { label: `Hold E — chop the ${ITEM_NAMES[board.item]}`, action: null };
          return { label: `Take ${ITEM_NAMES[board.item]}`, action: () => { this.chef.holding = board.item; board.item = null; this.sound.pickup(); } };
        }
        if (!board.item && held && CHOP[held]) {
          return { label: `Place ${ITEM_NAMES[held]} on the board`, action: () => { board.item = held; board.progress = 0; this.chef.holding = null; this.sound.place(); } };
        }
        if (board.item && board.progress > 0 && board.progress < 1) return { label: `Hold E — chopping ${ITEM_NAMES[board.item]}`, action: null };
        if (!board.item && held) return { label: `${ITEM_NAMES[held]} can't be chopped`, action: null };
        return null;
      }
      case 'burner':
      case 'oven': {
        const slot = st.kind === 'burner' ? this.burners.find((s) => s.station === st) : this.oven;
        const table = st.kind === 'burner' ? COOK : BAKE;
        const verb = st.kind === 'burner' ? 'Cook' : 'Bake';
        if (!slot.item && held && table[held]) {
          return { label: `${verb} the ${ITEM_NAMES[held]}`, action: () => { slot.item = held; slot.result = table[held]; slot.t = 0; slot.state = 'cooking'; slot.dinged = false; this.chef.holding = null; this.sound.place(); } };
        }
        if (slot.item && slot.state === 'ready' && !held) {
          return { label: `Take ${ITEM_NAMES[slot.result]}`, action: () => { this.chef.holding = slot.result; slot.item = null; slot.state = 'idle'; this.sound.pickup(); } };
        }
        if (slot.item && slot.state === 'burnt' && !held) {
          return { label: 'Take the burnt mess', action: () => { this.chef.holding = 'burnt'; slot.item = null; slot.state = 'idle'; this.sound.pickup(); } };
        }
        if (slot.item) return { label: `${ITEM_NAMES[slot.item]} is ${slot.state}…`, action: null };
        if (held) return { label: `${ITEM_NAMES[held]} doesn't go here`, action: null };
        return null;
      }
      case 'assembly': {
        const asm = this.assembly;
        if (asm.result && !held) {
          return { label: `Take ${ITEM_NAMES[asm.result]}`, action: () => { this.chef.holding = asm.result; asm.result = null; this.sound.pickup(); } };
        }
        if (held && !isDish(held) && held !== 'burnt' && !COOK[held] && held !== 'rawPizza') {
          return { label: `Add ${ITEM_NAMES[held]} to the dish`, action: () => { asm.parts.push(held); this.chef.holding = null; this.sound.place(); this.checkAssembly(); } };
        }
        if (!held && asm.parts.length > 0) {
          const last = asm.parts[asm.parts.length - 1];
          return { label: `Take back ${ITEM_NAMES[last]}`, action: () => { this.chef.holding = asm.parts.pop(); this.sound.pickup(); } };
        }
        return null;
      }
      case 'serve': {
        if (held && isDish(held)) {
          const order = this.orders.filter((o) => o.dish === held).sort((a, b2) => a.tLeft - b2.tLeft)[0];
          if (order) return { label: `Serve ${ITEM_NAMES[held]}`, action: () => this.serveOrder(order) };
          return { label: `No ticket wants ${ITEM_NAMES[held]}`, action: null };
        }
        if (held) return { label: 'Only finished dishes can be served', action: null };
        return null;
      }
      default:
        return null;
    }
  }

  checkAssembly() {
    const asm = this.assembly;
    const parts = [...asm.parts].sort();
    for (const [id, recipe] of Object.entries(RECIPES)) {
      if (JSON.stringify([...recipe.parts].sort()) === JSON.stringify(parts)) {
        asm.result = recipe.finish === 'counter' ? id : recipe.raw;
        asm.parts = [];
        this.sound.pop();
        this.showToast(recipe.finish === 'counter' ? `${recipe.name} plated!` : `${ITEM_NAMES[asm.result]} ready to cook`, 1200);
        return;
      }
    }
    if (asm.parts.length === 1 && STANDALONE[asm.parts[0]]) {
      const dish = STANDALONE[asm.parts[0]];
      asm.result = dish;
      asm.parts = [];
      this.sound.pop();
      this.showToast(`${ITEM_NAMES[dish]} plated!`, 1200);
    }
  }

  serveOrder(order) {
    const price = DISH_PRICES[order.dish];
    const tip = Math.round(price * 0.5 * (order.tLeft / order.tMax));
    this.combo = this.comboT > 0 ? Math.min(5, this.combo + 1) : 1;
    this.comboT = 6;
    const earned = (price + tip) * this.combo;
    this.coins += earned;
    this.served += 1;
    this.chef.holding = null;
    this.orders = this.orders.filter((o) => o !== order);
    const slotPos = CUSTOMER_SLOTS[order.slot];
    this.burst(slotPos.x, 1.6, slotPos.z - 0.6, 'spark', 10);
    this.sound.coin();
    this.showToast(`+${earned} coins${this.combo > 1 ? ` — combo ×${this.combo}!` : ''}`, 1100);
  }

  // ---------------- particles ----------------

  burst(x, y, z, kind, n) {
    for (let i = 0; i < n; i += 1) {
      this.particles.push({
        x: x + (this.rand() - 0.5) * 0.3, y, z: z + (this.rand() - 0.5) * 0.3,
        vx: (this.rand() - 0.5) * 0.7, vy: 0.8 + this.rand() * 0.9, vz: (this.rand() - 0.5) * 0.7,
        life: 0, max: 0.7 + this.rand() * 0.5, size: 0.05 + this.rand() * 0.05, kind,
      });
    }
  }

  puff(x, y, z, kind) {
    this.particles.push({
      x: x + (this.rand() - 0.5) * 0.16, y, z: z + (this.rand() - 0.5) * 0.16,
      vx: (this.rand() - 0.5) * 0.12, vy: 0.55 + this.rand() * 0.3, vz: (this.rand() - 0.5) * 0.12,
      life: 0, max: 1.1 + this.rand() * 0.6, size: 0.15 + this.rand() * 0.16, kind,
    });
  }

  // ---------------- update ----------------

  update(dt) {
    this.time += dt;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').classList.remove('show');
    }
    this.updateParticles(dt);
    if (this.mode !== 'play') return;

    this.dayT += dt;
    if (this.dayT >= DAY_SECONDS) {
      this.setMode('end');
      this.sound.setSizzle(0);
      return;
    }
    // unlock announcements
    for (const recipe of Object.values(RECIPES)) {
      if (this.dayT >= recipe.unlock && recipe.unlock > 0 && !this.announcedUnlocks.has(recipe.name)) {
        this.announcedUnlocks.add(recipe.name);
        this.showToast(`New on the menu: ${recipe.name}!`, 1800);
        this.sound.unlock();
      }
    }
    // spawning
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.orders.length < 4) this.spawnOrder();
      const base = 11 - (this.dayT / DAY_SECONDS) * 4.5;
      this.spawnT = base * (0.85 + this.rand() * 0.3);
    }
    // patience
    for (const order of [...this.orders]) {
      order.tLeft -= dt;
      if (order.tLeft <= 0) {
        this.orders = this.orders.filter((o) => o !== order);
        this.lost += 1;
        this.combo = 1;
        this.comboT = 0;
        this.sound.error();
        this.showToast('A customer walked away…', 1300);
      }
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 1;
    }
    // cooking
    let sizzle = 0;
    const tickSlot = (slot, isOven) => {
      if (!slot.item) return;
      slot.t += dt;
      const need = COOK_SECONDS[slot.item];
      if (slot.state === 'cooking') {
        sizzle += 1;
        if (this.rand() < dt * 6) this.puff(slot.station.x, (isOven ? 1.3 : 1.25), slot.station.z, 'steam');
        if (slot.t >= need) {
          slot.state = 'ready';
          slot.dinged = true;
          this.sound.ding();
        }
      } else if (slot.state === 'ready') {
        if (this.rand() < dt * 3) this.puff(slot.station.x, 1.3, slot.station.z, 'steam');
        if (slot.t >= need + PERFECT_WINDOW) {
          slot.state = 'burnt';
          this.sound.error();
        }
      } else if (slot.state === 'burnt') {
        if (this.rand() < dt * 8) this.puff(slot.station.x, 1.3, slot.station.z, 'smoke');
      }
    };
    for (const burner of this.burners) tickSlot(burner, false);
    tickSlot(this.oven, true);
    this.sound.setSizzle(sizzle);

    this.moveChef(dt);
    this.handleInteract(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.12; this.refreshHud(); }
  }

  moveChef(dt) {
    let dx = 0; let dz = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dz += 1;
    if (dx !== 0 || dz !== 0) {
      this.walkTarget = null;
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
    } else if (this.walkTarget) {
      const tx = this.walkTarget.x - this.chef.x;
      const tz = this.walkTarget.z - this.chef.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.08) this.walkTarget = null;
      else { dx = tx / dist; dz = tz / dist; }
    }
    const speed = 3.4;
    if (dx !== 0 || dz !== 0) {
      this.chef.x = Math.max(-5.9, Math.min(5.9, this.chef.x + dx * speed * dt));
      this.chef.z = Math.max(-2.75, Math.min(2.95, this.chef.z + dz * speed * dt));
      const targetRy = Math.atan2(dx, dz);
      let diff = targetRy - this.chef.ry;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.chef.ry += diff * Math.min(1, dt * 14);
      this.chef.phase += dt * 11;
    }
  }

  handleInteract(dt) {
    const target = this.currentTarget();
    const plan = this.planFor(target);
    const prompt = $('prompt');
    if (this.mode === 'play') {
      if (plan) {
        prompt.innerHTML = plan.action
          ? `<span class="key">E</span>${plan.label}`
          : plan.label;
      } else if (this.chef.holding) {
        prompt.textContent = '';
      } else {
        prompt.textContent = '';
      }
    }
    // chopping: hold E at a board with an item on it
    this.chef.chopping = false;
    if (target && target.type === 'station' && target.st.kind === 'board' && this.interactHeld) {
      const board = this.boards.find((bd) => bd.station === target.st);
      if (board.item && CHOP[board.item] && board.progress < 1) {
        this.chef.chopping = true;
        board.progress = Math.min(1, board.progress + dt / 1.15);
        board.chopSoundT -= dt;
        if (board.chopSoundT <= 0) { board.chopSoundT = 0.27; this.sound.chop(); }
        if (board.progress >= 1) {
          board.item = CHOP[board.item];
          board.progress = 0;
          this.sound.pop();
        }
      }
    }
    if (this.interactPressed) {
      this.interactPressed = false;
      if (plan && plan.action) plan.action();
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind !== 'spark') p.vy += dt * 0.25;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  // ---------------- HUD ----------------

  refreshHud() {
    $('coins').textContent = String(this.coins);
    $('served').textContent = String(this.served);
    const comboEl = $('combo');
    comboEl.textContent = `COMBO ×${this.combo}`;
    comboEl.classList.toggle('hot', this.combo >= 3);
    $('dayfill').style.width = `${Math.max(0, 100 - (this.dayT / DAY_SECONDS) * 100)}%`;
    $('daylabel').textContent = this.dayT > DAY_SECONDS - 30 ? 'LAST ORDERS!' : 'SERVICE — DAY 1';
    $('held').innerHTML = this.chef.holding
      ? `<small>CARRYING</small>${ITEM_NAMES[this.chef.holding]}`
      : '';
    // tickets
    const heldDish = this.chef.holding;
    $('tickets').innerHTML = this.orders.map((order) => {
      const recipe = RECIPES[order.dish];
      const parts = recipe ? recipe.parts : [order.dish === 'fries' ? 'friedPotato' : 'grilledBeef'];
      const frac = Math.max(0, order.tLeft / order.tMax);
      const partHtml = parts.map((p) => {
        const done = this.assembly.parts.includes(p) || this.chef.holding === p;
        return `<span class="${done ? 'done' : ''}">${done ? '✓ ' : ''}${ITEM_NAMES[p]}</span>`;
      }).join(' · ');
      const cls = ['ticket', frac < 0.25 ? 'urgent' : '', heldDish === order.dish ? 'match' : ''].join(' ');
      const barCls = frac < 0.25 ? 'low' : frac < 0.55 ? 'mid' : '';
      return `<div class="${cls}"><h3>${ITEM_NAMES[order.dish]}<span class="price">${DISH_PRICES[order.dish]}¢</span></h3>` +
        `<div class="parts">${partHtml}</div>` +
        `<div class="patience"><i class="${barCls}" style="width:${Math.round(frac * 100)}%"></i></div></div>`;
    }).join('');
    // recipe hint: first order's method
    const first = this.orders[0];
    if (first) {
      const recipe = RECIPES[first.dish];
      let method;
      if (recipe) {
        const steps = recipe.parts.map((p) => ITEM_NAMES[p]).join(' + ');
        method = recipe.finish === 'counter' ? `Assemble: ${steps}`
          : recipe.finish === 'oven' ? `Assemble ${steps}, then bake`
            : `Assemble ${steps}, then cook on a burner`;
      } else if (first.dish === 'fries') method = 'Chop a potato, then fry it on a burner';
      else method = 'Grill beef on a burner, then plate it alone';
      $('hint').innerHTML = `<b>${ITEM_NAMES[first.dish]}</b> — ${method}.`;
    } else {
      $('hint').textContent = '';
    }
  }

  // ---------------- rendering ----------------

  camera() {
    const sway = this.mode === 'play' ? Math.sin(this.time * 0.24) * 0.35 : 0;
    const eye = [sway, 9.4, 11.4];
    const target = [sway * 0.4, 0.1, -0.6];
    return { eye, target };
  }

  drawBar(x, y, z, frac, rgb, w = 0.88) {
    // background + fill, both camera-facing, drawn into the transparent batch list
    this.barList.push({ x, y, z, w, h: 0.17, rgb: [0.16, 0.1, 0.06], alpha: 0.78, frac: 1 });
    this.barList.push({ x: x - (1 - frac) * w / 2 + 0, y, z, w: Math.max(0.001, w * frac), h: 0.12, rgb, alpha: 0.97, frac });
  }

  drawItem(item, x, y, z, ry = 0) {
    const m = mat4Compose({ x, y, z, ry });
    const vessel = vesselFor(item);
    if (vessel === 'pot') this.batch.push(potGeo(), m);
    else if (vessel === 'bowl') this.batch.push(plateGeo(), m);
    else if (isDish(item)) this.batch.push(plateGeo(), m);
    if (item === 'soup') {
      this.batch.push(foodGeo('rawSoup'), m);
    } else if (isDish(item)) {
      this.batch.push(dishGeo(item), mat4Compose({ x, y: y + 0.04, z, ry }));
    } else {
      this.batch.push(foodGeo(item), m);
    }
  }

  render() {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.16, 0.1, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const { eye, target } = this.camera();
    this.view = mat4LookAt(eye, target, [0, 1, 0]);
    const proj = mat4Perspective(0.72, width / height, 0.1, 60);
    const viewProj = mat4Multiply(proj, this.view);
    const lightDir = [-0.45, 0.85, 0.55];
    const len = Math.hypot(...lightDir);
    const light = lightDir.map((v) => v / len);

    const batch = this.batch;
    batch.begin();
    this.barList = [];
    batch.push(this.kitchen, mat4Compose({}));
    // resting items on spots
    for (const spot of this.spots) {
      if (spot.item) this.drawItem(spot.item, spot.x, spot.surfaceY, spot.z);
    }
    // boards
    for (const board of this.boards) {
      if (board.item) {
        const lift = board.progress > 0 && board.progress < 1 ? Math.abs(Math.sin(this.time * 18)) * 0.02 : 0;
        this.drawItem(board.item, board.station.x, board.station.surfaceY + lift, board.station.z);
      }
      if (board.item && board.progress > 0) {
        this.drawBar(board.station.x, board.station.surfaceY + 0.82, board.station.z + 0.6, board.progress, [0.95, 0.65, 0.2], 0.95);
      }
    }
    // burners + oven
    const drawSlot = (slot, isOvenSlot) => {
      const st = slot.station;
      if (!slot.item) return;
      if (!isOvenSlot) batch.push(panGeo(), mat4Compose({ x: st.x, y: st.surfaceY + 0.1, z: st.z }));
      const itemY = isOvenSlot ? st.surfaceY + 0.12 : st.surfaceY + 0.16;
      this.drawItem(slot.state === 'burnt' ? 'burnt' : slot.item, st.x, itemY, st.z);
      const need = COOK_SECONDS[slot.item];
      const frac = Math.min(1, slot.t / need);
      const rgb = slot.state === 'ready' ? [0.45, 0.85, 0.3] : slot.state === 'burnt' ? [0.9, 0.2, 0.12] : [0.98, 0.6, 0.18];
      this.drawBar(st.x, st.surfaceY + 0.68, st.z + 0.55, slot.state === 'cooking' ? frac : 1, rgb, 1.0);
    };
    for (const burner of this.burners) drawSlot(burner, false);
    drawSlot(this.oven, true);
    // oven glow while baking
    if (this.oven.item && this.oven.state === 'cooking') {
      const flicker = 0.75 + Math.sin(this.time * 9) * 0.15;
      this.barList.push({ x: this.oven.station.x, y: 0.6, z: -2.98, w: 0.8, h: 0.62, rgb: [1.0 * flicker, 0.52 * flicker, 0.16], alpha: 0.68, flat: true });
    }
    // assembly parts and result
    const asm = this.assembly;
    asm.parts.forEach((part, i) => {
      const [ox, oz] = ASSEMBLY_OFFSETS[i % ASSEMBLY_OFFSETS.length];
      this.drawItem(part, asm.station.x + ox, asm.station.surfaceY, asm.station.z + oz);
    });
    if (asm.result) this.drawItem(asm.result, asm.station.x, asm.station.surfaceY, asm.station.z);
    // customers + patience
    for (const order of this.orders) {
      const slot = CUSTOMER_SLOTS[order.slot];
      const bob = Math.sin(this.time * 2 + order.slot * 1.7) * 0.03;
      batch.push(this.customerGeos[order.slot], mat4Compose({ x: slot.x, y: bob, z: slot.z, ry: Math.PI }));
      const frac = Math.max(0, order.tLeft / order.tMax);
      const rgb = frac < 0.25 ? [0.9, 0.25, 0.15] : frac < 0.55 ? [0.98, 0.6, 0.18] : [0.45, 0.85, 0.3];
      this.drawBar(slot.x, 2.15 + bob, slot.z, frac, rgb, 0.8);
    }
    // chef
    const moving = Math.abs(Math.sin(this.chef.phase)) ;
    const bobY = (this.keys.size > 0 || this.walkTarget) && this.mode === 'play' ? moving * 0.05 : Math.sin(this.time * 1.8) * 0.015;
    batch.push(this.chefGeo, mat4Compose({ x: this.chef.x, y: bobY, z: this.chef.z, ry: this.chef.ry }));
    if (this.chef.holding) {
      const fx = Math.sin(this.chef.ry);
      const fz = Math.cos(this.chef.ry);
      const hx = this.chef.x + fx * 0.45;
      const hz = this.chef.z + fz * 0.45;
      this.drawItem(this.chef.holding, hx, 1.14 + bobY, hz, this.chef.ry);
    }
    // target highlight ring
    const hlTarget = this.mode === 'play' ? this.currentTarget() : null;
    if (hlTarget) {
      const tx = hlTarget.type === 'station' ? hlTarget.st.x : hlTarget.spot.x;
      const tz = hlTarget.type === 'station' ? hlTarget.st.z : hlTarget.spot.z;
      const pulse = 0.9 + Math.sin(this.time * 6) * 0.08;
      this.barList.push({ x: tx, y: 0.04, z: tz, w: 1.5 * pulse, h: 0, rgb: [1, 0.78, 0.3], alpha: 0.3, disc: true });
    }
    batch.draw(viewProj, light, [1.0, 0.93, 0.8]);

    // transparent pass: blob shadows, bars, steam
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    batch.begin();
    const shadowAt = (x, z, s) => batch.push(this.shadowGeo, mat4Compose({ x, y: 0.02, z, s }), 1, 0.32);
    shadowAt(this.chef.x, this.chef.z, 1);
    for (const order of this.orders) {
      const slot = CUSTOMER_SLOTS[order.slot];
      shadowAt(slot.x, slot.z, 1.05);
    }
    // bars and flat glows
    for (const bar of this.barList) {
      if (bar.disc) continue;
      if (bar.flat) {
        // axis-aligned quad in the XY plane at fixed z (oven door glow)
        const b2 = new GeoBuilderShim();
        b2.quadRaw(bar.x, bar.y, bar.z, bar.w, bar.h, bar.rgb);
        batch.push(b2.build(), mat4Compose({}), 1, bar.alpha);
      } else {
        this.pushBillboard(batch, bar.x, bar.y, bar.z, bar.w, bar.h, bar.rgb, bar.alpha);
      }
    }
    // ring highlight (flat golden disc on the floor)
    for (const bar of this.barList) {
      if (bar.disc) batch.push(this.ringGeo, mat4Compose({ x: bar.x, y: 0.03, z: bar.z, s: bar.w }), 1, bar.alpha);
    }
    // particles
    for (const p of this.particles) {
      const lifeFrac = p.life / p.max;
      if (p.kind === 'steam') {
        const size = p.size * (1 + lifeFrac * 1.6);
        this.pushBillboard(batch, p.x, p.y, p.z, size, size, [1, 0.99, 0.96], 0.34 * (1 - lifeFrac));
      } else if (p.kind === 'smoke') {
        const size = p.size * (1 + lifeFrac * 1.8);
        this.pushBillboard(batch, p.x, p.y, p.z, size, size, [0.16, 0.13, 0.11], 0.4 * (1 - lifeFrac));
      } else {
        this.pushBillboard(batch, p.x, p.y, p.z, p.size, p.size, [1, 0.8, 0.25], 1 - lifeFrac);
      }
    }
    batch.draw(viewProj, light, [1.0, 0.93, 0.8]);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  pushBillboard(batch, x, y, z, w, h, rgb, alpha) {
    const v = this.view;
    const right = [v[0], v[4], v[8]];
    const up = [v[1], v[5], v[9]];
    const hw = w / 2; const hh = h / 2;
    const corner = (sx, sy) => [
      x + right[0] * sx * hw + up[0] * sy * hh,
      y + right[1] * sx * hw + up[1] * sy * hh,
      z + right[2] * sx * hw + up[2] * sy * hh,
    ];
    const shim = new GeoBuilderShim();
    shim.quadPoints(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), rgb);
    batch.push(shim.build(), mat4Compose({}), 1, alpha);
  }
}

/** A minimal builder for one-off quads (billboards, glows) in world space. */
class GeoBuilderShim {
  constructor() { this.positions = []; this.normals = []; this.colors = []; }
  quadPoints(a, b, c, d, rgb) {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c, a, c, d]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(rgb[0], rgb[1], rgb[2], 1);
    }
  }
  quadRaw(cx, cy, cz, w, h, rgb) {
    this.quadPoints(
      [cx - w / 2, cy - h / 2, cz], [cx + w / 2, cy - h / 2, cz],
      [cx + w / 2, cy + h / 2, cz], [cx - w / 2, cy + h / 2, cz], rgb,
    );
  }
  build() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
    };
  }
}
