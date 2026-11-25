// world.js — everything about the room Saffron & Smoke happens in: the station map,
// the recipe book, the kitchen's static geometry, and the little people who work
// and wait in it. Coordinates are metres; the back wall is -z, the customers +z.

import { GeoBuilder, geoOf, hex, tint } from './geo.js';

// ---------------- data ----------------

export const ITEM_NAMES = {
  tomato: 'Tomato', dough: 'Dough', cheese: 'Cheese', beef: 'Beef',
  lettuce: 'Lettuce', egg: 'Eggs', onion: 'Onion', potato: 'Potato',
  choppedTomato: 'Chopped Tomato', choppedLettuce: 'Chopped Lettuce',
  choppedOnion: 'Chopped Onion', choppedPotato: 'Chopped Potato',
  gratedCheese: 'Grated Cheese', grilledBeef: 'Grilled Beef',
  friedPotato: 'Fried Potato', rawPizza: 'Raw Pizza', rawSoup: 'Soup Pot',
  rawOmelette: 'Omelette Mix', burger: 'Bistro Burger', pizza: 'Wood-Fired Pizza',
  soup: 'Tomato Soup', salad: 'Garden Salad', omelette: 'Cheese Omelette',
  fries: 'Fries', steak: 'Steak', burnt: 'Burnt!',
};

export const INGREDIENT_COLORS = {
  tomato: 0xd8402a, dough: 0xf0dcae, cheese: 0xf5b93f, beef: 0xa8503c,
  lettuce: 0x77b255, egg: 0xfdf6ec, onion: 0xd9c6e8, potato: 0xcfa96a,
};

/** What the chopping board does to a raw ingredient. */
export const CHOP = {
  tomato: 'choppedTomato', lettuce: 'choppedLettuce', onion: 'choppedOnion',
  potato: 'choppedPotato', cheese: 'gratedCheese',
};

/** What a burner does to what goes in the pan or pot. */
export const COOK = {
  beef: 'grilledBeef', choppedPotato: 'friedPotato',
  rawSoup: 'soup', rawOmelette: 'omelette',
};

/** What the oven does. */
export const BAKE = { rawPizza: 'pizza' };

/** Seconds on the heat for each cookable item (oven items included). */
export const COOK_SECONDS = {
  beef: 6, choppedPotato: 5, rawSoup: 8, rawOmelette: 6, rawPizza: 9,
};

/** Assembled alone on the assembly counter, these components become dishes. */
export const STANDALONE = { grilledBeef: 'steak', friedPotato: 'fries' };

/**
 * The recipe book. parts are placed on the assembly counter one by one; finish says
 * what happens next: 'counter' plates the dish at once, 'oven'/'burner' first make
 * the raw item, which must be cooked before it can be served.
 */
export const RECIPES = {
  salad: { name: 'Garden Salad', price: 9, unlock: 0, finish: 'counter', parts: ['choppedLettuce', 'choppedTomato', 'choppedOnion'] },
  burger: { name: 'Bistro Burger', price: 14, unlock: 0, finish: 'counter', parts: ['dough', 'grilledBeef', 'choppedLettuce'] },
  pizza: { name: 'Wood-Fired Pizza', price: 16, unlock: 35, finish: 'oven', raw: 'rawPizza', parts: ['dough', 'choppedTomato', 'gratedCheese'] },
  omelette: { name: 'Cheese Omelette', price: 10, unlock: 65, finish: 'burner', raw: 'rawOmelette', parts: ['egg', 'egg', 'gratedCheese'] },
  soup: { name: 'Tomato Soup', price: 11, unlock: 95, finish: 'burner', raw: 'rawSoup', parts: ['choppedTomato', 'choppedOnion', 'choppedPotato'] },
};

export const DISH_PRICES = {
  salad: 9, burger: 14, pizza: 16, omelette: 10, soup: 11, fries: 7, steak: 13,
};

export const DAY_SECONDS = 150;
export const STAR_THRESHOLDS = [150, 240, 330]; // coins for 1, 2, 3 stars

const SURFACE = 1.05; // counter-top height everywhere

/** Stations the chef can use. (x, z) is the furniture; (standX, standZ) where he stands. */
export const STATIONS = [
  { id: 'bin-tomato', kind: 'bin', item: 'tomato', x: -5.2, z: -3.55, standX: -5.2, standZ: -2.55 },
  { id: 'bin-dough', kind: 'bin', item: 'dough', x: -4.2, z: -3.55, standX: -4.2, standZ: -2.55 },
  { id: 'bin-cheese', kind: 'bin', item: 'cheese', x: -3.2, z: -3.55, standX: -3.2, standZ: -2.55 },
  { id: 'bin-beef', kind: 'bin', item: 'beef', x: -2.2, z: -3.55, standX: -2.2, standZ: -2.55 },
  { id: 'bin-lettuce', kind: 'bin', item: 'lettuce', x: -5.95, z: -1.4, standX: -4.95, standZ: -1.4 },
  { id: 'bin-egg', kind: 'bin', item: 'egg', x: -5.95, z: -0.2, standX: -4.95, standZ: -0.2 },
  { id: 'bin-onion', kind: 'bin', item: 'onion', x: -5.95, z: 1.0, standX: -4.95, standZ: 1.0 },
  { id: 'bin-potato', kind: 'bin', item: 'potato', x: -5.95, z: 2.2, standX: -4.95, standZ: 2.2 },
  { id: 'burner-0', kind: 'burner', x: -0.9, z: -3.55, standX: -0.9, standZ: -2.55, surfaceY: SURFACE },
  { id: 'burner-1', kind: 'burner', x: 0.3, z: -3.55, standX: 0.3, standZ: -2.55, surfaceY: SURFACE },
  { id: 'oven', kind: 'oven', x: 1.9, z: -3.55, standX: 1.9, standZ: -2.55, surfaceY: SURFACE },
  { id: 'board-0', kind: 'board', x: -1.7, z: -0.4, standX: -1.7, standZ: 0.55, surfaceY: SURFACE + 0.05 },
  { id: 'board-1', kind: 'board', x: -0.2, z: -0.4, standX: -0.2, standZ: 0.55, surfaceY: SURFACE + 0.05 },
  { id: 'assembly', kind: 'assembly', x: 1.6, z: -0.4, standX: 1.6, standZ: 0.55, surfaceY: SURFACE },
  { id: 'serve', kind: 'serve', x: 3.2, z: 3.15, standX: 3.2, standZ: 2.25 },
  { id: 'trash', kind: 'trash', x: -4.9, z: 2.5, standX: -4.9, standZ: 2.5 },
];

/** Plain counter spots where a carried item can be set down and picked up again. */
export const SPOTS = [
  { x: 3.6, z: -3.55, standX: 3.6, standZ: -2.55, surfaceY: SURFACE },
  { x: 4.5, z: -3.55, standX: 4.5, standZ: -2.55, surfaceY: SURFACE },
  { x: 5.4, z: -3.55, standX: 5.4, standZ: -2.55, surfaceY: SURFACE },
  { x: -2.45, z: -0.4, standX: -2.45, standZ: 0.55, surfaceY: SURFACE },
  { x: 1.15, z: 3.15, standX: 1.15, standZ: 2.25, surfaceY: SURFACE },
  { x: 5.35, z: 3.15, standX: 5.35, standZ: 2.25, surfaceY: SURFACE },
];

/** Where customers stand, behind the serving counter. */
export const CUSTOMER_SLOTS = [
  { x: 0.9, z: 4.25 }, { x: 2.3, z: 4.25 }, { x: 3.7, z: 4.25 }, { x: 5.1, z: 4.25 },
];

export const ASSEMBLY_OFFSETS = [[-0.3, 0.16], [0.3, 0.16], [0, -0.26]];

// ---------------- the kitchen shell ----------------

const WOOD = hex(0x7a4a2b);
const WOOD_DARK = hex(0x5d3820);
const STONE = hex(0xd9c6a5);
const CREAM = hex(0xf3e8d2);
const SAGE = hex(0x9db89a);
const STEEL = hex(0x9aa4ae);
const COPPER = hex(0xb87333);

function crate(b, x, y, z, rgb, ry = 0) {
  b.box(x, y + 0.14, z, 0.72, 0.28, 0.62, WOOD, ry);
  b.box(x, y + 0.3, z, 0.78, 0.05, 0.68, WOOD_DARK, ry);
  // a little pile of the ingredient inside
  b.sphere(x - 0.15, y + 0.32, z - 0.08, 0.13, rgb, 9, 6, 0.85);
  b.sphere(x + 0.14, y + 0.32, z + 0.1, 0.13, rgb, 9, 6, 0.85);
  b.sphere(x + 0.02, y + 0.38, z - 0.02, 0.13, tint(rgb, 1.08), 9, 6, 0.85);
}

export function buildKitchen() {
  return geoOf((b) => {
    // floor: warm checkerboard tiles
    const tileA = hex(0xefe0c4);
    const tileB = hex(0xe3c9a4);
    for (let ix = 0; ix < 13; ix += 1) {
      for (let iz = 0; iz < 11; iz += 1) {
        const x = -6 + ix;
        const z = -4.75 + iz * 0.95 + 0.475;
        b.box(x, -0.05, z, 0.98, 0.1, 0.93, (ix + iz) % 2 === 0 ? tileA : tileB);
      }
    }
    // walls
    b.box(0, 2.1, -4.95, 13.4, 4.2, 0.4, CREAM); // back
    b.box(0, 0.55, -4.72, 13.4, 1.1, 0.06, SAGE); // back splash band
    b.box(0, 3.6, -4.72, 13.4, 0.5, 0.06, hex(0xe8b96f)); // warm stripe
    b.box(-6.7, 2.1, 0.2, 0.4, 4.2, 10.6, tint(CREAM, 0.96)); // left
    b.box(6.7, 2.1, 0.2, 0.4, 4.2, 10.6, tint(CREAM, 0.96)); // right

    // back counter run
    b.box(0, 0.475, -3.55, 12.6, 0.95, 1.0, WOOD);
    b.box(0, 1.0, -3.55, 12.8, 0.1, 1.18, STONE);
    for (let i = 0; i < 6; i += 1) {
      b.box(-5.2 + i * 2.1, 0.5, -3.02, 1.5, 0.62, 0.04, WOOD_DARK);
    }
    // ingredient crates along the back counter
    for (const st of STATIONS) {
      if (st.kind === 'bin' && st.z < -3) crate(b, st.x, SURFACE + 0.006, st.z, hex(INGREDIENT_COLORS[st.item]));
    }
    // pantry rack on the left wall, two shelves of crates
    b.box(-6.15, 0.5, 0.4, 0.5, 1.0, 4.6, WOOD_DARK);
    b.box(-6.15, 1.62, 0.4, 0.5, 0.08, 4.6, WOOD);
    b.box(-6.15, 2.6, 0.4, 0.5, 0.08, 4.6, WOOD);
    b.box(-6.15, 3.05, 0.4, 0.5, 0.9, 4.6, WOOD_DARK);
    const leftBins = STATIONS.filter((s) => s.kind === 'bin' && s.x < -5);
    leftBins.forEach((st, i) => {
      const y = i % 2 === 0 ? 0.98 : 1.666;
      crate(b, -6.12, y, st.z, hex(INGREDIENT_COLORS[st.item]), Math.PI / 2);
    });

    // stove top and burners
    b.box(-0.3, 1.07, -3.55, 2.1, 0.05, 0.95, hex(0x35302c));
    for (const st of STATIONS) {
      if (st.kind === 'burner') {
        b.cyl(st.x, 1.1, st.z, 0.27, 0.27, 0.03, hex(0x191512), 18);
        b.cyl(st.x, 1.1, st.z, 0.13, 0.13, 0.035, hex(0x4a423a), 12);
      }
    }
    // range hood
    b.box(-0.3, 2.75, -3.75, 2.3, 0.5, 0.8, STEEL);
    b.box(-0.3, 3.6, -3.85, 0.7, 1.3, 0.6, tint(STEEL, 0.9));

    // oven: its body tucks inside the counter run (only the door and handle show),
    // kept clear of the counter's own faces so nothing z-fights
    b.box(1.9, 0.5, -3.52, 1.15, 1.0, 0.86, STEEL);
    b.box(1.9, 0.58, -3.02, 0.9, 0.72, 0.05, hex(0x2c2622));
    b.box(1.9, 1.02, -2.97, 0.8, 0.05, 0.05, hex(0xd8dee3)); // oven door handle

    // island: boards, assembly end, plate stack
    b.box(0, 0.475, -0.4, 5.6, 0.95, 1.1, WOOD);
    b.box(0, 1.0, -0.4, 5.8, 0.1, 1.3, STONE);
    for (const st of STATIONS) {
      if (st.kind === 'board') {
        b.box(st.x, 1.086, st.z, 0.85, 0.06, 0.7, hex(0xe8d3a0));
        b.box(st.x + 0.3, 1.13, st.z + 0.22, 0.3, 0.03, 0.07, STEEL); // knife resting by the board
      }
    }
    b.box(1.6, 1.076, -0.4, 1.15, 0.04, 0.95, hex(0xcbb489));
    // plate stack at the assembly end
    for (let i = 0; i < 3; i += 1) b.cyl(2.35, 1.08 + i * 0.035, -0.72, 0.24, 0.2, 0.03, hex(0xf6f1e7), 16);

    // serving counter (open pass — no canopy, so the kitchen stays in full view)
    b.box(3.25, 0.475, 3.15, 5.9, 0.95, 0.95, WOOD);
    b.box(3.25, 1.0, 3.15, 6.1, 0.1, 1.1, STONE);

    // shelves with jars on the back wall, right side
    for (const sy of [2.35, 3.0]) {
      b.box(4.9, sy, -4.6, 2.4, 0.07, 0.4, WOOD);
      const jarCols = [0xd8402a, 0xe8963c, 0x77b255, 0xf5b93f];
      jarCols.forEach((c, i) => {
        b.cyl(4.05 + i * 0.55, sy + 0.16, -4.6, 0.11, 0.11, 0.26, hex(c), 8);
        b.cyl(4.05 + i * 0.55, sy + 0.31, -4.6, 0.12, 0.12, 0.04, WOOD_DARK, 8);
      });
    }
    // hanging pans, left of the hood
    for (const [px, pr] of [[-3.6, 0.3], [-2.85, 0.24], [-4.3, 0.2]]) {
      b.sphere(px, 2.7, -4.62, pr, hex(0x4a423c), 14, 8, 0.22);
      b.box(px, 3.05, -4.62, 0.05, 0.35, 0.03, hex(0x4a423c));
    }
    // menu board
    b.box(-4.6, 2.85, -4.7, 2.3, 1.15, 0.06, hex(0x33302b));
    for (let i = 0; i < 3; i += 1) b.box(-4.6, 3.15 - i * 0.28, -4.66, 1.8 - i * 0.25, 0.07, 0.02, hex(0xf3e8d2));
    // wall clock
    b.cyl(-0.3, 3.35, -4.68, 0.3, 0.3, 0.05, hex(0xfdf6ec), 20);
    b.box(-0.3, 3.42, -4.64, 0.04, 0.2, 0.02, hex(0x33302b));
    b.box(-0.24, 3.35, -4.64, 0.16, 0.04, 0.02, hex(0x33302b));

    // rug under the chef's run
    b.box(0, 0.012, 0.9, 5.6, 0.024, 2.7, hex(0xa03a2a));
    b.box(0, 0.016, 0.9, 5.2, 0.012, 2.3, hex(0xb84a34));

    // corner plants
    for (const [px, pz] of [[-6.0, 4.3], [6.1, -4.1], [-6.0, -4.1]]) {
      b.cyl(px, 0.25, pz, 0.3, 0.22, 0.5, hex(0xb0562f), 10);
      b.sphere(px, 0.75, pz, 0.42, hex(0x5d8a4a), 10, 7, 0.85);
      b.sphere(px + 0.25, 0.6, pz + 0.15, 0.28, hex(0x6f9c58), 9, 6, 0.85);
    }
    // trash bin (the furniture; its station is separate data)
    b.cyl(-4.9, 0.4, 2.5, 0.34, 0.28, 0.8, hex(0x707880), 12);
    b.cyl(-4.9, 0.82, 2.5, 0.36, 0.36, 0.05, hex(0x596068), 12);
  });
}

// ---------------- people ----------------

export function buildChef() {
  return geoOf((b) => {
    const skin = hex(0xe8b08a);
    const white = hex(0xfdfaf2);
    b.box(-0.11, 0.03, 0.02, 0.16, 0.06, 0.26, hex(0x33302b)); // shoes
    b.box(0.11, 0.03, 0.02, 0.16, 0.06, 0.26, hex(0x33302b));
    b.box(-0.11, 0.27, 0, 0.17, 0.42, 0.19, hex(0x3c4a63)); // legs
    b.box(0.11, 0.27, 0, 0.17, 0.42, 0.19, hex(0x3c4a63));
    b.cyl(0, 0.78, 0, 0.27, 0.31, 0.56, white, 12); // jacket
    b.box(0, 0.74, 0.26, 0.42, 0.52, 0.07, hex(0xe8963c)); // saffron apron
    b.cyl(-0.38, 0.8, 0.04, 0.07, 0.08, 0.46, white, 8); // arms
    b.cyl(0.38, 0.8, 0.04, 0.07, 0.08, 0.46, white, 8);
    b.sphere(-0.4, 0.56, 0.06, 0.075, skin, 8, 6); // hands
    b.sphere(0.4, 0.56, 0.06, 0.075, skin, 8, 6);
    b.cyl(0, 1.1, 0, 0.15, 0.17, 0.1, hex(0xc8452c), 10); // scarf
    b.sphere(0, 1.32, 0, 0.21, skin, 12, 9); // head
    b.cyl(0, 1.52, 0, 0.23, 0.23, 0.1, white, 12); // hat band
    b.sphere(0, 1.6, 0, 0.2, white, 12, 7, 0.75); // hat top
  });
}

const CUSTOMER_LOOKS = [
  { shirt: 0x4a7fb5, skin: 0xe8b08a, hair: 0x3a2a1c },
  { shirt: 0xc86a9a, skin: 0x8a5a3b, hair: 0x14100c },
  { shirt: 0x5d8a4a, skin: 0xf2c9a0, hair: 0xb56a32 },
  { shirt: 0xe8b93f, skin: 0x6e4526, hair: 0x2c2c34 },
];

export function buildCustomer(index) {
  const look = CUSTOMER_LOOKS[index % CUSTOMER_LOOKS.length];
  return geoOf((b) => {
    const shirt = hex(look.shirt);
    const skin = hex(look.skin);
    b.box(-0.11, 0.25, 0, 0.17, 0.5, 0.19, hex(0x2f2a33));
    b.box(0.11, 0.25, 0, 0.17, 0.5, 0.19, hex(0x2f2a33));
    b.cyl(0, 0.82, 0, 0.28, 0.32, 0.62, shirt, 12);
    b.cyl(-0.39, 0.84, 0, 0.07, 0.08, 0.48, tint(shirt, 0.9), 8);
    b.cyl(0.39, 0.84, 0, 0.07, 0.08, 0.48, tint(shirt, 0.9), 8);
    b.sphere(0, 1.36, 0, 0.2, skin, 12, 9);
    b.sphere(0, 1.45, -0.045, 0.205, hex(look.hair), 12, 7, 0.78); // hair
  });
}
