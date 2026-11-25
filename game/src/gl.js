// gl.js — the small WebGL toolkit Saffron & Smoke is built on: 4x4 matrix maths, a
// shader program wrapper, and a triangle batch that collects coloured, flat-shaded
// geometry each frame and draws it in a single call. Nothing here is a library; it is
// exactly the maths this one game needs, written for it.

// ---------- matrix maths (column-major Float32Array(16), WebGL style) ----------

export function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const range = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (near + far) * range;
  out[11] = -1;
  out[14] = 2 * near * far * range;
  return out;
}

export function mat4LookAt(eye, target, up) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / len, zy / len, zz / len];
  const x = norm3(cross3(up, z));
  const y = cross3(z, x);
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -dot3(x, eye);
  out[13] = -dot3(y, eye);
  out[14] = -dot3(z, eye);
  out[15] = 1;
  return out;
}

export function mat4Translate(x, y, z) {
  const out = mat4Identity();
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

export function mat4Scale(x, y, z) {
  const out = mat4Identity();
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}

export function mat4RotateX(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  const out = mat4Identity();
  out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
  return out;
}

export function mat4RotateY(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  const out = mat4Identity();
  out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
  return out;
}

export function mat4RotateZ(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  const out = mat4Identity();
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c;
  return out;
}

/** Compose translate · rotateY · rotateX · scale from a plain spec object. */
export function mat4Compose(spec) {
  let m = mat4Translate(spec.x || 0, spec.y || 0, spec.z || 0);
  if (spec.ry) m = mat4Multiply(m, mat4RotateY(spec.ry));
  if (spec.rx) m = mat4Multiply(m, mat4RotateX(spec.rx));
  if (spec.rz) m = mat4Multiply(m, mat4RotateZ(spec.rz));
  if (spec.sx !== undefined || spec.sy !== undefined || spec.sz !== undefined) {
    m = mat4Multiply(m, mat4Scale(spec.sx ?? 1, spec.sy ?? 1, spec.sz ?? 1));
  } else if (spec.s !== undefined) {
    m = mat4Multiply(m, mat4Scale(spec.s, spec.s, spec.s));
  }
  return m;
}

export function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Rotate a direction by the upper 3x3 of m (no translation), renormalised. */
export function transformDir(m, x, y, z) {
  const vx = m[0] * x + m[4] * y + m[8] * z;
  const vy = m[1] * x + m[5] * y + m[9] * z;
  const vz = m[2] * x + m[6] * y + m[10] * z;
  const len = Math.hypot(vx, vy, vz) || 1;
  return [vx / len, vy / len, vz / len];
}

export function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function norm3(a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

// ---------- shaders ----------

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec4 aColor;
uniform mat4 uViewProj;
varying vec3 vNormal;
varying vec4 vColor;
varying float vDepth;
void main() {
  vec4 world = vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
  vNormal = aNormal;
  vColor = aColor;
  vDepth = gl_Position.w;
}
`;

const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec4 vColor;
varying float vDepth;
uniform vec3 uLightDir;
uniform vec3 uSunTint;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, uLightDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 lit = vColor.rgb * (0.42 + 0.30 * sky + 0.55 * diffuse * uSunTint);
  float fog = smoothstep(16.0, 30.0, vDepth);
  lit = mix(lit, vec3(0.98, 0.90, 0.78), fog * 0.25);
  gl_FragColor = vec4(lit, vColor.a);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

// ---------- the batch ----------

/**
 * A Batch gathers triangles (positions, normals, RGBA colours) under a current model
 * matrix. Call push(geometry, matrix, colorOverride) for every object, then draw once.
 * Geometry is a flat array of triangles: { tris: [x,y,z, ...], normals: [x,y,z, ...] }
 * built by geo.js in local space.
 */
export class Batch {
  constructor(gl) {
    this.gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.aPos = gl.getAttribLocation(program, 'aPos');
    this.aNormal = gl.getAttribLocation(program, 'aNormal');
    this.aColor = gl.getAttribLocation(program, 'aColor');
    this.uViewProj = gl.getUniformLocation(program, 'uViewProj');
    this.uLightDir = gl.getUniformLocation(program, 'uLightDir');
    this.uSunTint = gl.getUniformLocation(program, 'uSunTint');
    this.buffer = gl.createBuffer();
    this.data = new Float32Array(1 << 17);
    this.count = 0; // vertices written
  }

  begin() { this.count = 0; }

  /** Append one geometry under a model matrix. shade: optional 0..1 brightness multiplier. */
  push(geo, matrix, shade = 1, alpha = 1) {
    const { positions, normals, colors } = geo;
    const n = positions.length / 3;
    const needed = (this.count + n) * 10;
    if (needed > this.data.length) {
      const bigger = new Float32Array(Math.max(needed * 2, this.data.length * 2));
      bigger.set(this.data);
      this.data = bigger;
    }
    let o = this.count * 10;
    for (let i = 0; i < n; i += 1) {
      const p = transformPoint(matrix, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const d = transformDir(matrix, normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
      this.data[o] = p[0]; this.data[o + 1] = p[1]; this.data[o + 2] = p[2];
      this.data[o + 3] = d[0]; this.data[o + 4] = d[1]; this.data[o + 5] = d[2];
      this.data[o + 6] = colors[i * 4] * shade;
      this.data[o + 7] = colors[i * 4 + 1] * shade;
      this.data[o + 8] = colors[i * 4 + 2] * shade;
      this.data[o + 9] = colors[i * 4 + 3] * alpha;
      o += 10;
    }
    this.count += n;
  }

  draw(viewProj, lightDir, sunTint) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * 10), gl.DYNAMIC_DRAW);
    const stride = 40;
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 24);
    gl.uniformMatrix4fv(this.uViewProj, false, viewProj);
    gl.uniform3fv(this.uLightDir, lightDir);
    gl.uniform3fv(this.uSunTint, sunTint);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}
