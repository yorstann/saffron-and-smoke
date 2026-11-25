// food.js — the edible cast of Saffron & Smoke, modelled as little flat-shaded
// sculptures. Every item is a cached geometry built once from geo.js primitives,
// drawn sitting on a surface at its local origin. Dishes arrive on a plate.

import { GeoBuilder, hex, tint } from './geo.js';

const cache = new Map();

function build(key, draw) {
  if (!cache.has(key)) {
    const builder = new GeoBuilder();
    draw(builder);
    cache.set(key, builder.build());
  }
  return cache.get(key);
}

/** A plain white plate with a soft rim, radius 0.27. */
export function plateGeo() {
  return build('plate', (b) => {
    b.cyl(0, 0.015, 0, 0.27, 0.19, 0.03, hex(0xf6f1e7), 18);
    b.cyl(0, 0.035, 0, 0.21, 0.23, 0.012, hex(0xe9e0cd), 18);
  });
}

/** A grey serving bowl, radius 0.24. */
function bowlGeo() {
  return build('bowl', (b) => {
    b.cyl(0, 0.05, 0, 0.24, 0.13, 0.1, hex(0x8d99a6), 14);
    b.cyl(0, 0.105, 0, 0.225, 0.225, 0.012, hex(0xaeb9c4), 14);
  });
}

/** A dark frying pan, radius 0.21, with a handle pointing +x. */
export function panGeo() {
  return build('pan', (b) => {
    b.cyl(0, 0.03, 0, 0.21, 0.17, 0.06, hex(0x2e2a28), 16);
    b.box(0.3, 0.045, 0, 0.22, 0.03, 0.06, hex(0x2e2a28));
  });
}

/** A steel saucepan for the soup, radius 0.2. */
export function potGeo() {
  return build('pot', (b) => {
    b.cyl(0, 0.09, 0, 0.2, 0.16, 0.18, hex(0x9aa4ae), 16);
    b.box(-0.26, 0.13, 0, 0.1, 0.03, 0.05, hex(0x6e777f));
    b.box(0.26, 0.13, 0, 0.1, 0.03, 0.05, hex(0x6e777f));
  });
}

const TOMATO = hex(0xd8402a);
const DOUGH = hex(0xf0dcae);
const CHEESE = hex(0xf5b93f);
const BEEF = hex(0xa8503c);
const LETTUCE = hex(0x77b255);
const EGGSHELL = hex(0xfdf6ec);
const ONION = hex(0xd9c6e8);
const POTATO = hex(0xcfa96a);

/** Chopped pile: a handful of little cubes in the ingredient's colour. */
function choppedPile(b, rgb, seed) {
  const spots = [[-0.09, -0.05], [0.08, -0.08], [0, 0.07], [-0.05, 0.1], [0.11, 0.05], [0.02, -0.12]];
  spots.forEach(([x, z], i) => {
    const s = 0.085 + ((seed + i * 7) % 3) * 0.012;
    b.box(x, 0.03, z, s, 0.06, s, tint(rgb, 1.02 + (i % 3) * 0.05), i * 0.7);
  });
}

export function foodGeo(item) {
  return build(`food:${item}`, (b) => {
    switch (item) {
      case 'tomato':
        b.sphere(0, 0.15, 0, 0.16, TOMATO, 12, 8);
        b.cone(0, 0.27, 0, 0.06, 0.07, hex(0x4d7c3a), 6);
        break;
      case 'dough':
        b.sphere(0, 0.1, 0, 0.18, DOUGH, 12, 8, 0.62);
        break;
      case 'cheese':
        b.box(0, 0.08, 0, 0.3, 0.16, 0.3, CHEESE, 0.6);
        b.box(0, 0.17, 0, 0.2, 0.03, 0.2, tint(CHEESE, 1.08), 0.6);
        break;
      case 'beef':
        b.cyl(0, 0.05, 0, 0.17, 0.17, 0.1, BEEF, 14);
        break;
      case 'lettuce':
        b.sphere(0, 0.1, 0, 0.18, LETTUCE, 12, 8, 0.6);
        b.sphere(0.05, 0.13, 0.03, 0.12, tint(LETTUCE, 1.12), 10, 6, 0.6);
        break;
      case 'egg':
        b.sphere(-0.07, 0.09, 0, 0.1, EGGSHELL, 10, 7, 0.9);
        b.sphere(0.09, 0.09, 0.03, 0.1, EGGSHELL, 10, 7, 0.9);
        break;
      case 'onion':
        b.sphere(0, 0.13, 0, 0.14, ONION, 12, 8, 0.95);
        b.cone(0, 0.25, 0, 0.035, 0.06, hex(0xb49cc9), 6);
        break;
      case 'potato':
        b.sphere(0, 0.1, 0, 0.15, POTATO, 11, 7, 0.72);
        break;
      case 'choppedTomato': choppedPile(b, TOMATO, 3); break;
      case 'choppedLettuce': choppedPile(b, LETTUCE, 5); break;
      case 'choppedOnion': choppedPile(b, ONION, 8); break;
      case 'choppedPotato': choppedPile(b, POTATO, 11); break;
      case 'gratedCheese':
        b.cone(0, 0, 0, 0.16, 0.13, CHEESE, 12);
        b.cone(0.06, 0.02, -0.04, 0.09, 0.08, tint(CHEESE, 1.1), 9);
        break;
      case 'grilledBeef':
        b.cyl(0, 0.05, 0, 0.18, 0.18, 0.1, hex(0x6e3520), 14);
        b.box(0, 0.105, 0, 0.26, 0.012, 0.05, hex(0x4c2415), 0.4);
        b.box(0, 0.105, 0, 0.26, 0.012, 0.05, hex(0x4c2415), -0.5);
        break;
      case 'friedPotato':
        for (let i = 0; i < 7; i += 1) {
          const a = i * 0.9;
          b.box(Math.cos(a) * 0.08, 0.05 + (i % 3) * 0.02, Math.sin(a) * 0.08, 0.05, 0.16, 0.05, hex(0xf2c14e), a);
        }
        break;
      case 'rawPizza':
        b.cyl(0, 0.025, 0, 0.3, 0.3, 0.05, DOUGH, 18);
        b.cyl(0, 0.055, 0, 0.26, 0.26, 0.012, TOMATO, 18);
        b.cyl(0.08, 0.065, 0.05, 0.05, 0.05, 0.012, CHEESE, 8);
        b.cyl(-0.1, 0.065, -0.07, 0.05, 0.05, 0.012, CHEESE, 8);
        break;
      case 'rawSoup':
        b.disc(0, 0.175, 0, 0.19, hex(0xe0684e), 16);
        b.box(-0.07, 0.18, 0.04, 0.08, 0.05, 0.08, TOMATO, 0.3);
        b.box(0.08, 0.18, -0.05, 0.08, 0.05, 0.08, TOMATO, 0.8);
        b.box(0.01, 0.18, 0.09, 0.07, 0.05, 0.07, tint(TOMATO, 1.1), 0.5);
        break;
      case 'rawOmelette':
        b.disc(0, 0.115, 0, 0.2, hex(0xf7cf5a), 16);
        b.box(0.05, 0.12, 0.02, 0.12, 0.015, 0.06, CHEESE, 0.5);
        break;
      case 'burnt':
        b.sphere(0, 0.07, 0, 0.17, hex(0x1d1713), 10, 6, 0.5);
        break;
      default:
        b.sphere(0, 0.12, 0, 0.14, hex(0xcccccc), 10, 7);
    }
  });
}

/** Finished dishes are drawn on a plate (or bowl/pot) — this builds those too. */
export function dishGeo(dish) {
  return build(`dish:${dish}`, (b) => {
    switch (dish) {
      case 'burger':
        b.cyl(0, 0.05, 0, 0.2, 0.17, 0.07, hex(0xe8b96f), 14); // bottom bun
        b.cyl(0, 0.115, 0, 0.19, 0.19, 0.06, hex(0x6e3520), 14); // patty
        b.cyl(0, 0.16, 0, 0.22, 0.22, 0.03, LETTUCE, 14); // lettuce
        b.cyl(0, 0.185, 0, 0.19, 0.19, 0.025, TOMATO, 14); // tomato slice
        b.sphere(0, 0.19, 0, 0.2, hex(0xf0c078), 14, 5, 0.55); // top bun
        break;
      case 'pizza':
        b.cyl(0, 0.03, 0, 0.31, 0.31, 0.06, hex(0xdda452), 20);
        b.cyl(0, 0.065, 0, 0.27, 0.27, 0.012, hex(0xc93a24), 20);
        for (let i = 0; i < 6; i += 1) {
          const a = i * 1.13;
          b.cyl(Math.cos(a) * 0.16, 0.075, Math.sin(a) * 0.16, 0.045, 0.045, 0.014, hex(0x9e2f1d), 8);
        }
        b.cyl(0.05, 0.075, -0.1, 0.04, 0.04, 0.014, hex(0x5d8a4a), 6);
        b.cyl(-0.14, 0.075, 0.09, 0.04, 0.04, 0.014, hex(0x5d8a4a), 6);
        break;
      case 'salad':
        b.sphere(-0.06, 0.1, 0.02, 0.13, LETTUCE, 10, 6, 0.6);
        b.sphere(0.09, 0.1, -0.05, 0.12, tint(LETTUCE, 1.1), 10, 6, 0.6);
        b.box(0.02, 0.16, 0.08, 0.09, 0.07, 0.09, TOMATO, 0.4);
        b.box(-0.1, 0.15, -0.08, 0.08, 0.06, 0.08, TOMATO, 0.9);
        b.box(0.1, 0.15, 0.1, 0.07, 0.05, 0.07, ONION, 0.2);
        break;
      case 'omelette':
        b.sphere(0, 0.05, 0, 0.19, hex(0xf7cf5a), 14, 6, 0.42);
        b.box(0.04, 0.11, 0.02, 0.14, 0.02, 0.07, hex(0x5d8a4a), 0.4);
        b.box(-0.07, 0.1, -0.05, 0.1, 0.02, 0.05, CHEESE, 0.9);
        break;
      case 'steak':
        b.cyl(0, 0.05, 0, 0.21, 0.19, 0.09, hex(0x5f2d1a), 14);
        b.box(0, 0.1, 0, 0.3, 0.014, 0.06, hex(0x3c1c0f), 0.35);
        b.box(0, 0.1, 0, 0.3, 0.014, 0.06, hex(0x3c1c0f), -0.45);
        b.sphere(0.16, 0.06, 0.12, 0.06, LETTUCE, 8, 5, 0.6);
        break;
      case 'fries':
        for (let i = 0; i < 9; i += 1) {
          const a = i * 0.75;
          b.box(Math.cos(a) * 0.09, 0.08 + (i % 3) * 0.025, Math.sin(a) * 0.09, 0.05, 0.2, 0.05, hex(0xf2c14e), a);
        }
        b.cyl(-0.17, 0.03, 0.14, 0.05, 0.04, 0.05, TOMATO, 10); // ketchup dollop pot
        break;
      default:
        b.sphere(0, 0.1, 0, 0.15, hex(0xcccccc), 10, 7);
    }
  });
}

/** Which vessel a loose item is displayed in when it sits on a counter or in hands. */
export function vesselFor(item) {
  if (item === 'rawSoup' || item === 'soup') return 'pot';
  if (item === 'rawOmelette') return 'bowl';
  return null;
}

export const DISH_IDS = ['burger', 'pizza', 'soup', 'salad', 'omelette', 'fries', 'steak'];
export function isDish(item) { return DISH_IDS.includes(item); }
