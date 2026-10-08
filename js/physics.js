// Einfache Kollisions- und Raycast-Welt (AABBs, Rampen, Gelände)
import { LEVEL_H } from './config.js';
import { rayAABB } from './util.js';

export const F_SOLID = 1; // blockiert Bewegung
export const F_SHOTS = 2; // blockiert Schüsse
export const F_RAMP = 4; // schräge Rampe (Boden-Lieferant)

const CELL = 8;
const key = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);

export function rampY(c, x, z) {
  const r = c.ramp;
  let u = r.ax * x + r.az * z + r.c;
  if (u < 0) u = 0; else if (u > 1) u = 1;
  return r.y0 + LEVEL_H * u;
}

export class Physics {
  constructor(world) {
    this.world = world;
    this.cells = new Map();
    this.stamp = 1;
    this.tmp = [];
    this.hit = { t: 0, col: null, nx: 0, ny: 1, nz: 0 };
  }

  add(c) {
    c._lists = [];
    c._stamp = 0;
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let list = this.cells.get(k);
        if (!list) { list = []; this.cells.set(k, list); }
        list.push(c);
        c._lists.push(list);
      }
    }
    return c;
  }

  remove(c) {
    if (!c._lists) return;
    for (const list of c._lists) {
      const i = list.indexOf(c);
      if (i >= 0) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
    c._lists = null;
  }

  query(minX, minZ, maxX, maxZ, mask, out) {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(key(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c._stamp === s) continue;
          c._stamp = s;
          if (!(c.flags & mask)) continue;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Strahl gegen Kollider. Ergebnis in this.hit (wiederverwendet) oder null
  raycast(ox, oy, oz, dx, dy, dz, maxT, mask = F_SHOTS) {
    const s = ++this.stamp;
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tDeltaX = adx > 1e-9 ? CELL / adx : Infinity;
    const tDeltaZ = adz > 1e-9 ? CELL / adz : Infinity;
    let tMaxX = adx > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / adx) : Infinity;
    let tMaxZ = adz > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / adz) : Infinity;
    let bestT = maxT, best = null, bnx = 0, bny = 1, bnz = 0;
    let tCell = 0;
    for (let guard = 0; guard < 400; guard++) {
      const list = this.cells.get(key(cx, cz));
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c._stamp === s) continue;
          c._stamp = s;
          if (!(c.flags & mask)) continue;
          if (c.flags & F_RAMP) {
            const r = c.ramp;
            const k = LEVEL_H;
            const den = dy - k * (r.ax * dx + r.az * dz);
            if (Math.abs(den) < 1e-6) continue;
            const t = (r.y0 + k * (r.ax * ox + r.az * oz + r.c) - oy) / den;
            if (t < 0 || t >= bestT) continue;
            const hx = ox + dx * t, hz = oz + dz * t;
            if (hx < c.minX || hx > c.maxX || hz < c.minZ || hz > c.maxZ) continue;
            bestT = t; best = c;
            const nl = Math.hypot(k * r.ax, 1, k * r.az);
            bnx = -k * r.ax / nl; bny = 1 / nl; bnz = -k * r.az / nl;
            if (dy * bny + dx * bnx + dz * bnz > 0) { bnx = -bnx; bny = -bny; bnz = -bnz; }
          } else {
            const t = rayAABB(ox, oy, oz, dx, dy, dz, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, bestT);
            if (t < 0 || t >= bestT) continue;
            bestT = t; best = c;
            // Normale aus Trefferpunkt bestimmen
            const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
            const ex = Math.min(Math.abs(hx - c.minX), Math.abs(hx - c.maxX));
            const ey = Math.min(Math.abs(hy - c.minY), Math.abs(hy - c.maxY));
            const ez = Math.min(Math.abs(hz - c.minZ), Math.abs(hz - c.maxZ));
            if (ex <= ey && ex <= ez) { bnx = dx > 0 ? -1 : 1; bny = 0; bnz = 0; }
            else if (ey <= ez) { bnx = 0; bny = dy > 0 ? -1 : 1; bnz = 0; }
            else { bnx = 0; bny = 0; bnz = dz > 0 ? -1 : 1; }
          }
        }
      }
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDeltaX; cx += stepX; }
      else { tCell = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
      if (tCell > bestT || tCell === Infinity) break;
    }
    if (!best) return null;
    const h = this.hit;
    h.t = bestT; h.col = best; h.nx = bnx; h.ny = bny; h.nz = bnz;
    return h;
  }

  // Höchste begehbare Oberfläche unter fromY an (x, z)
  groundHeightAt(x, z, fromY) {
    let g = this.world.groundAt(x, z);
    const list = this.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, F_SOLID | F_RAMP, this.tmp);
    for (const c of list) {
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      let top;
      if (c.flags & F_RAMP) top = rampY(c, x, z);
      else top = c.maxY;
      if (top <= fromY + 0.3 && top > g) g = top;
    }
    return g;
  }

  // Bewegt eine Spielfigur (pos = Füße, vel) mit Kollision
  moveCharacter(ch, dt) {
    const v = ch.vel;
    const sp = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
    const steps = Math.min(10, Math.max(1, Math.ceil((sp * dt) / 0.22)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) this._step(ch, sdt);
  }

  _overlap(c, p, r, h) {
    return p.x - r < c.maxX && p.x + r > c.minX && p.z - r < c.maxZ && p.z + r > c.minZ &&
      p.y < c.maxY - 0.001 && p.y + h > c.minY + 0.001;
  }

  _free(list, x, y, z, r, h) {
    for (const c of list) {
      if (c.flags & F_RAMP) continue;
      if (x - r < c.maxX && x + r > c.minX && z - r < c.maxZ && z + r > c.minZ && y < c.maxY - 0.001 && y + h > c.minY + 0.001) return false;
    }
    return true;
  }

  _resolveH(ch, list, axis, wasGround) {
    const p = ch.pos, r = ch.radius, h = ch.height;
    for (const c of list) {
      if (c.flags & F_RAMP) continue;
      if (!this._overlap(c, p, r, h)) continue;
      const rise = c.maxY - p.y;
      if (rise <= 0.6 && (wasGround || ch.vel.y <= 0) && this._free(list, p.x, c.maxY + 0.002, p.z, r, h)) {
        p.y = c.maxY + 0.002;
        continue;
      }
      if (axis === 0) {
        const a = p.x + r - c.minX, b = c.maxX - (p.x - r);
        if (a < b) p.x -= a + 1e-4; else p.x += b + 1e-4;
      } else {
        const a = p.z + r - c.minZ, b = c.maxZ - (p.z - r);
        if (a < b) p.z -= a + 1e-4; else p.z += b + 1e-4;
      }
      ch.blocked = true;
    }
  }

  _step(ch, dt) {
    const p = ch.pos, v = ch.vel, r = ch.radius, h = ch.height;
    const wasGround = ch.onGround;
    ch.onGround = false;
    const prevY = p.y;
    const pad = r + Math.abs(v.x * dt) + Math.abs(v.z * dt) + 0.3;
    const list = this.query(p.x - pad, p.z - pad, p.x + pad, p.z + pad, F_SOLID | F_RAMP, this.tmp);

    p.x += v.x * dt;
    this._resolveH(ch, list, 0, wasGround);
    p.z += v.z * dt;
    this._resolveH(ch, list, 2, wasGround);

    p.y += v.y * dt;
    let landTop = -Infinity;
    for (const c of list) {
      if (c.flags & F_RAMP) continue;
      if (!this._overlap(c, p, r, h)) continue;
      if (v.y <= 0 && prevY >= c.maxY - 0.6) {
        if (c.maxY > landTop) landTop = c.maxY;
      } else if (v.y > 0 && prevY + h <= c.minY + 0.4) {
        p.y = c.minY - h - 0.002;
        v.y = 0;
      }
    }

    let g = this.world.groundAt(p.x, p.z);
    ch.groundRamp = null;
    for (const c of list) {
      if (!(c.flags & F_RAMP)) continue;
      if (p.x < c.minX || p.x > c.maxX || p.z < c.minZ || p.z > c.maxZ) continue;
      const sy = rampY(c, p.x, p.z);
      if (sy <= Math.max(p.y, prevY) + 0.8 && sy > g) {
        g = sy;
        ch.groundRamp = c;
      }
    }
    if (landTop > g) { g = landTop; ch.groundRamp = null; }

    const snap = wasGround && v.y <= 0.01 ? 0.45 : 0;
    if (p.y < g) {
      if (v.y < 0) { ch.impact = -v.y; v.y = 0; }
      p.y = g;
      ch.onGround = true;
    } else if (p.y <= g + snap && v.y <= 0.01) {
      p.y = g;
      v.y = 0;
      ch.onGround = true;
    }
    if (!ch.onGround) ch.groundRamp = null;
  }
}
