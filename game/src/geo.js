// geo.js — a tiny geometry bakery. A GeoBuilder collects flat-shaded triangles (each
// face gets its own normal, so everything looks crisply low-poly) from a handful of
// primitives: boxes, cylinders, spheres, cones and discs. build() hands back the
// { positions, normals, colors } arrays the batch in gl.js consumes.

export function hex(hexValue) {
  return [
    ((hexValue >> 16) & 255) / 255,
    ((hexValue >> 8) & 255) / 255,
    (hexValue & 255) / 255,
  ];
}

/** Multiply an [r,g,b] colour by a scalar, clamped — for quick shading variants. */
export function tint(rgb, factor) {
  return [
    Math.min(1, rgb[0] * factor),
    Math.min(1, rgb[1] * factor),
    Math.min(1, rgb[2] * factor),
  ];
}

export class GeoBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  tri(a, b, c, rgb) {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(rgb[0], rgb[1], rgb[2], 1);
    }
  }

  quad(a, b, c, d, rgb) {
    this.tri(a, b, c, rgb);
    this.tri(a, c, d, rgb);
  }

  /** Axis-aligned box centred at (cx, cy, cz), optionally spun around Y by ry. */
  box(cx, cy, cz, w, h, d, rgb, ry = 0) {
    const hw = w / 2; const hh = h / 2; const hd = d / 2;
    const cos = Math.cos(ry); const sin = Math.sin(ry);
    const corner = (x, y, z) => [cx + x * cos + z * sin, cy + y, cz - x * sin + z * cos];
    const p = [
      corner(-hw, -hh, -hd), corner(hw, -hh, -hd), corner(hw, -hh, hd), corner(-hw, -hh, hd),
      corner(-hw, hh, -hd), corner(hw, hh, -hd), corner(hw, hh, hd), corner(-hw, hh, hd),
    ];
    // every quad is wound counter-clockwise seen from outside, so face normals point out
    this.quad(p[4], p[7], p[6], p[5], rgb); // top
    this.quad(p[0], p[1], p[2], p[3], tint(rgb, 0.72)); // bottom
    this.quad(p[3], p[2], p[6], p[7], tint(rgb, 0.92)); // front (+z)
    this.quad(p[1], p[0], p[4], p[5], tint(rgb, 0.8)); // back (-z)
    this.quad(p[2], p[1], p[5], p[6], tint(rgb, 0.86)); // right (+x)
    this.quad(p[0], p[3], p[7], p[4], tint(rgb, 0.78)); // left (-x)
  }

  /** Cylinder along Y, centred at (cx, cy, cz). */
  cyl(cx, cy, cz, rTop, rBottom, h, rgb, seg = 12) {
    const hh = h / 2;
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = Math.cos(a0); const z0 = Math.sin(a0);
      const x1 = Math.cos(a1); const z1 = Math.sin(a1);
      this.quad(
        [cx + x0 * rBottom, cy - hh, cz + z0 * rBottom],
        [cx + x0 * rTop, cy + hh, cz + z0 * rTop],
        [cx + x1 * rTop, cy + hh, cz + z1 * rTop],
        [cx + x1 * rBottom, cy - hh, cz + z1 * rBottom],
        tint(rgb, 0.85 + 0.15 * Math.cos((a0 + a1) / 2)),
      );
      this.tri([cx, cy + hh, cz],
        [cx + x1 * rTop, cy + hh, cz + z1 * rTop],
        [cx + x0 * rTop, cy + hh, cz + z0 * rTop], tint(rgb, 1.05));
      this.tri([cx, cy - hh, cz],
        [cx + x1 * rBottom, cy - hh, cz + z1 * rBottom],
        [cx + x0 * rBottom, cy - hh, cz + z0 * rBottom], tint(rgb, 0.6));
    }
  }

  /** Sphere (optionally squashed on Y), centred at (cx, cy, cz). */
  sphere(cx, cy, cz, r, rgb, wseg = 10, hseg = 7, squashY = 1) {
    const ring = (j) => {
      const phi = (j / hseg) * Math.PI;
      return { y: Math.cos(phi) * r * squashY, rad: Math.sin(phi) * r };
    };
    for (let j = 0; j < hseg; j += 1) {
      const r0 = ring(j); const r1 = ring(j + 1);
      for (let i = 0; i < wseg; i += 1) {
        const a0 = (i / wseg) * Math.PI * 2;
        const a1 = ((i + 1) / wseg) * Math.PI * 2;
        const shade = tint(rgb, 0.82 + 0.18 * (j / hseg));
        this.quad(
          [cx + Math.cos(a0) * r0.rad, cy + r0.y, cz + Math.sin(a0) * r0.rad],
          [cx + Math.cos(a1) * r0.rad, cy + r0.y, cz + Math.sin(a1) * r0.rad],
          [cx + Math.cos(a1) * r1.rad, cy + r1.y, cz + Math.sin(a1) * r1.rad],
          [cx + Math.cos(a0) * r1.rad, cy + r1.y, cz + Math.sin(a0) * r1.rad],
          shade,
        );
      }
    }
  }

  /** Cone with its point up, base centred at (cx, cy, cz). */
  cone(cx, cy, cz, r, h, rgb, seg = 10) {
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri(
        [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
        [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r],
        [cx, cy + h, cz],
        tint(rgb, 0.85 + 0.15 * Math.cos((a0 + a1) / 2)),
      );
    }
  }

  /** Flat disc facing up at height cy. */
  disc(cx, cy, cz, r, rgb, seg = 16) {
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([cx, cy, cz],
        [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
        [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], rgb);
    }
  }

  build() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
    };
  }
}

/** Convenience: build a one-off geometry from a callback that draws into a builder. */
export function geoOf(draw) {
  const builder = new GeoBuilder();
  draw(builder);
  return builder.build();
}
