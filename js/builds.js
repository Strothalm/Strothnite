// Bausystem: Wände, Böden, Rampen im Raster – inkl. Statik
import * as THREE from 'three';
import { TILE as T, LEVEL_H as H, MATERIALS, BUILD_COST } from './config.js';
import { F_SOLID, F_SHOTS, F_RAMP } from './physics.js';
import { InstPool } from './pool.js';
import { tex } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WT = 0.26; // Wanddicke
const FT = 0.26; // Bodendicke
const WALLISH = { wall: 1, door: 1, window: 1 };
const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
const DIR_VEC = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Teil-Boxen in lokalen Koordinaten (s entlang der Wand, y nach oben)
const SUBBOXES = {
  wall: [[-T / 2, T / 2, 0, H]],
  door: [[-T / 2, -0.7, 0, H], [0.7, T / 2, 0, H], [-0.7, 0.7, 2.6, H]],
  window: [[-T / 2, T / 2, 0, 1.1], [-T / 2, T / 2, 2.7, H], [-T / 2, -0.8, 1.1, 2.7], [0.8, T / 2, 1.1, 2.7]],
};

function planarUV(geo) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    if (nz >= nx && nz >= ny) uv.setXY(i, (x + T / 2) / T, y / H);
    else if (nx >= ny) uv.setXY(i, z + 0.5, y / H);
    else uv.setXY(i, (x + T / 2) / T, z + 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

function wallGeo(type) {
  const parts = SUBBOXES[type].map(([s0, s1, y0, y1]) => {
    const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, WT);
    g.translate((s0 + s1) / 2, (y0 + y1) / 2, 0);
    return g;
  });
  const g = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  return planarUV(g);
}

function rampGeo() {
  const L = Math.hypot(T, H);
  const ang = Math.atan2(H, T);
  const g = new THREE.BoxGeometry(L, 0.22, T);
  g.rotateZ(ang);
  g.translate(0, H / 2 - 0.11 / Math.cos(ang), 0);
  return g;
}

export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.pieces = new Set();
    this.keyMap = new Map();
    this.nodeMap = new Map();
    this.cellMap = new Map();
    this.growing = [];
    this.collapse = [];
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpC = new THREE.Color();
    this.tmpV = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.yAxis = new THREE.Vector3(0, 1, 0);

    const floorGeo = new THREE.BoxGeometry(T, FT, T);
    floorGeo.translate(0, -FT / 2, 0);
    this.geos = {
      wall: wallGeo('wall'),
      door: wallGeo('door'),
      window: wallGeo('window'),
      floor: floorGeo,
      ramp: rampGeo(),
    };
    this.mats = {};
    for (const m of ['wood', 'stone', 'metal']) {
      this.mats[m] = new THREE.MeshLambertMaterial({ map: tex(m) });
    }
    const caps = { wall: 7000, door: 400, window: 3000, floor: 5000, ramp: 2000 };
    this.pools = {};
    for (const t of Object.keys(this.geos)) {
      for (const m of ['wood', 'stone', 'metal']) {
        const pool = new InstPool(this.geos[t], this.mats[m], caps[t]);
        this.pools[t + ':' + m] = pool;
        game.scene.add(pool.mesh);
      }
    }

    // Bauvorschau (blaue Blaupause)
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x48a8ff, transparent: true, opacity: 0.32, depthWrite: false });
    this.ghostLineMat = new THREE.LineBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.9 });
    this.ghosts = {};
    for (const t of ['wall', 'floor', 'ramp']) {
      const m = new THREE.Mesh(this.geos[t], this.ghostMat);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.geos[t]), this.ghostLineMat));
      m.visible = false;
      m.renderOrder = 5;
      game.scene.add(m);
      this.ghosts[t] = m;
    }
  }

  keyOf(type, ix, iz, y0, axis) {
    const yq = Math.round(y0 * 20);
    if (WALLISH[type]) return `W${axis}|${ix}|${iz}|${yq}`;
    if (type === 'floor') return `F|${ix}|${iz}|${yq}`;
    return `R|${ix}|${iz}|${yq}`;
  }

  transformOf(p) {
    if (WALLISH[p.type]) {
      if (p.axis === 'x') return [(p.ix + 0.5) * T, p.y0, p.iz * T, 0];
      return [p.ix * T, p.y0, (p.iz + 0.5) * T, Math.PI / 2];
    }
    const x = (p.ix + 0.5) * T, z = (p.iz + 0.5) * T;
    if (p.type === 'floor') return [x, p.y0, z, 0];
    return [x, p.y0, z, RAMP_ROT[p.dir]];
  }

  matrixOf(p, out) {
    const [x, y, z, ry] = this.transformOf(p);
    this.tmpQ.setFromAxisAngle(this.yAxis, ry);
    this.tmpV.set(x, y, z);
    return out.compose(this.tmpV, this.tmpQ, this.one);
  }

  collidersOf(p) {
    const cols = [];
    const yq = (y) => Math.round(y * 20);
    if (WALLISH[p.type]) {
      const [cx, , cz] = this.transformOf(p);
      for (const [s0, s1, a, b] of SUBBOXES[p.type]) {
        if (p.axis === 'x') {
          cols.push({ minX: cx + s0, maxX: cx + s1, minZ: cz - WT / 2, maxZ: cz + WT / 2, minY: p.y0 + a, maxY: p.y0 + b });
        } else {
          cols.push({ minX: cx - WT / 2, maxX: cx + WT / 2, minZ: cz - s1, maxZ: cz - s0, minY: p.y0 + a, maxY: p.y0 + b });
        }
      }
      for (const c of cols) c.flags = F_SOLID | F_SHOTS;
      const n = p.axis === 'x'
        ? [[p.ix, p.iz], [p.ix + 1, p.iz]]
        : [[p.ix, p.iz], [p.ix, p.iz + 1]];
      p.nodes = [];
      for (const [x, z] of n) {
        p.nodes.push(`${x}|${yq(p.y0)}|${z}`, `${x}|${yq(p.y0 + H)}|${z}`);
      }
      p.cells = p.axis === 'x'
        ? [[p.ix, p.iz], [p.ix, p.iz - 1]]
        : [[p.ix, p.iz], [p.ix - 1, p.iz]];
    } else if (p.type === 'floor') {
      const x0 = p.ix * T, z0 = p.iz * T;
      cols.push({ minX: x0, maxX: x0 + T, minZ: z0, maxZ: z0 + T, minY: p.y0 - FT, maxY: p.y0, flags: F_SOLID | F_SHOTS });
      const y = yq(p.y0);
      p.nodes = [`${p.ix}|${y}|${p.iz}`, `${p.ix + 1}|${y}|${p.iz}`, `${p.ix}|${y}|${p.iz + 1}`, `${p.ix + 1}|${y}|${p.iz + 1}`];
      p.cells = [[p.ix, p.iz]];
    } else {
      const x0 = p.ix * T, z0 = p.iz * T;
      const ramp = { y0: p.y0, ax: 0, az: 0, c: 0 };
      if (p.dir === 0) { ramp.ax = 1 / T; ramp.c = -x0 / T; }
      else if (p.dir === 1) { ramp.ax = -1 / T; ramp.c = (x0 + T) / T; }
      else if (p.dir === 2) { ramp.az = 1 / T; ramp.c = -z0 / T; }
      else { ramp.az = -1 / T; ramp.c = (z0 + T) / T; }
      cols.push({ minX: x0, maxX: x0 + T, minZ: z0, maxZ: z0 + T, minY: p.y0, maxY: p.y0 + H, flags: F_RAMP | F_SHOTS, ramp });
      const lo = yq(p.y0), hi = yq(p.y0 + H);
      const { ix, iz } = p;
      if (p.dir === 0) p.nodes = [`${ix}|${lo}|${iz}`, `${ix}|${lo}|${iz + 1}`, `${ix + 1}|${hi}|${iz}`, `${ix + 1}|${hi}|${iz + 1}`];
      else if (p.dir === 1) p.nodes = [`${ix + 1}|${lo}|${iz}`, `${ix + 1}|${lo}|${iz + 1}`, `${ix}|${hi}|${iz}`, `${ix}|${hi}|${iz + 1}`];
      else if (p.dir === 2) p.nodes = [`${ix}|${lo}|${iz}`, `${ix + 1}|${lo}|${iz}`, `${ix}|${hi}|${iz + 1}`, `${ix + 1}|${hi}|${iz + 1}`];
      else p.nodes = [`${ix}|${lo}|${iz + 1}`, `${ix + 1}|${lo}|${iz + 1}`, `${ix}|${hi}|${iz}`, `${ix + 1}|${hi}|${iz}`];
      p.cells = [[p.ix, p.iz]];
    }
    for (const c of cols) c.owner = p;
    return cols;
  }

  isGrounded(p) {
    const w = this.game.world;
    const samples = [];
    if (WALLISH[p.type]) {
      const [cx, , cz] = this.transformOf(p);
      const dx = p.axis === 'x' ? T / 2 : 0, dz = p.axis === 'x' ? 0 : T / 2;
      samples.push([cx - dx, cz - dz], [cx, cz], [cx + dx, cz + dz]);
      return samples.some(([x, z]) => p.y0 <= w.terrainHeight(x, z) + 0.4);
    }
    const x0 = p.ix * T, z0 = p.iz * T;
    if (p.type === 'floor') {
      samples.push([x0, z0], [x0 + T, z0], [x0, z0 + T], [x0 + T, z0 + T], [x0 + T / 2, z0 + T / 2]);
      return samples.some(([x, z]) => p.y0 - FT <= w.terrainHeight(x, z) + 0.4);
    }
    const [dx, dz] = DIR_VEC[p.dir];
    const lx = dx > 0 ? x0 : dx < 0 ? x0 + T : null;
    const lz = dz > 0 ? z0 : dz < 0 ? z0 + T : null;
    if (lx !== null) samples.push([lx, z0], [lx, z0 + T / 2], [lx, z0 + T]);
    else samples.push([x0, lz], [x0 + T / 2, lz], [x0 + T, lz]);
    return samples.some(([x, z]) => p.y0 <= w.terrainHeight(x, z) + 0.4);
  }

  addPiece(o) {
    const y0 = Math.round(o.y0 * 20) / 20;
    const k = this.keyOf(o.type, o.ix, o.iz, y0, o.axis);
    if (this.keyMap.has(k)) return null;
    const mat = o.mat || 'wood';
    const pool = this.pools[o.type + ':' + mat];
    const maxHp = o.harvestable ? MATERIALS[mat].mapHp : MATERIALS[mat].hp;
    const p = {
      kind: 'piece', type: o.type, ix: o.ix, iz: o.iz, y0, axis: o.axis || null, dir: o.dir ?? 0, mat, key: k,
      harvestable: !!o.harvestable, builder: o.builder || null, maxHp, hp: maxHp, alive: true, pool, idx: -1,
      cols: null, nodes: null, cells: null, grounded: false,
    };
    p.idx = pool.add(this.matrixOf(p, this.tmpM));
    if (p.idx < 0) return null;
    p.cols = this.collidersOf(p);
    for (const c of p.cols) this.game.physics.add(c);
    for (const n of p.nodes) {
      let s = this.nodeMap.get(n);
      if (!s) { s = new Set(); this.nodeMap.set(n, s); }
      s.add(p);
    }
    for (const [cx, cz] of p.cells) {
      const ck = cx + '|' + cz;
      let s = this.cellMap.get(ck);
      if (!s) { s = new Set(); this.cellMap.set(ck, s); }
      s.add(p);
    }
    p.grounded = this.isGrounded(p);
    this.keyMap.set(k, p);
    this.pieces.add(p);
    if (!o.instant) {
      p.hp = maxHp * 0.3;
      p.growRate = (maxHp * 0.7) / MATERIALS[mat].buildTime;
      this.growing.push(p);
    }
    return p;
  }

  neighbors(p) {
    const out = new Set();
    for (const n of p.nodes) {
      const s = this.nodeMap.get(n);
      if (s) for (const q of s) if (q !== p) out.add(q);
    }
    return out;
  }

  removePiece(p, { effects = true, checkSupport = true } = {}) {
    if (!p.alive) return;
    p.alive = false;
    p.pool.remove(p.idx);
    for (const c of p.cols) this.game.physics.remove(c);
    const nbs = this.neighbors(p);
    for (const n of p.nodes) {
      const s = this.nodeMap.get(n);
      if (s) { s.delete(p); if (!s.size) this.nodeMap.delete(n); }
    }
    for (const [cx, cz] of p.cells) {
      const ck = cx + '|' + cz;
      const s = this.cellMap.get(ck);
      if (s) { s.delete(p); if (!s.size) this.cellMap.delete(ck); }
    }
    this.keyMap.delete(p.key);
    this.pieces.delete(p);
    if (effects) {
      const [x, y, z] = this.transformOf(p);
      const cy = p.type === 'floor' ? y : y + H / 2;
      this.game.effects.debris(x, cy, z, p.mat, p.type === 'floor' ? 'flat' : 'wall');
      this.game.audio.play('break', { x, y: cy, z });
    }
    if (checkSupport) this.checkSupport(nbs);
  }

  checkSupport(starts) {
    const visited = new Set();
    for (const s of starts) {
      if (!s.alive || visited.has(s)) continue;
      const comp = [];
      const stack = [s];
      visited.add(s);
      let grounded = false;
      while (stack.length) {
        const p = stack.pop();
        comp.push(p);
        if (p.grounded) { grounded = true; break; }
        if (comp.length > 2500) { grounded = true; break; }
        for (const q of this.neighbors(p)) {
          if (!visited.has(q) && q.alive) { visited.add(q); stack.push(q); }
        }
      }
      if (!grounded) {
        // ganze Komponente sammeln und einstürzen lassen
        const all = new Set(comp);
        const st = [...comp];
        while (st.length) {
          const p = st.pop();
          for (const q of this.neighbors(p)) {
            if (!all.has(q) && q.alive) { all.add(q); st.push(q); }
          }
        }
        let i = 0;
        for (const p of all) {
          p.collapsing = true;
          this.collapse.push({ p, t: 0.08 + Math.min(1.2, i * 0.025) + Math.random() * 0.15 });
          i++;
        }
      }
    }
  }

  damagePiece(p, dmg) {
    if (!p.alive) return false;
    p.hp -= dmg;
    if (p.hp <= 0) {
      this.removePiece(p);
      return true;
    }
    this.updateTint(p);
    return false;
  }

  updateTint(p) {
    const f = Math.max(0, p.hp / p.maxHp);
    const v = 0.5 + 0.5 * f;
    this.tmpC.setRGB(v, v * (0.92 + 0.08 * f), v * (0.92 + 0.08 * f));
    p.pool.setColor(p.idx, this.tmpC);
  }

  // Nächstgelegene Basis (vertikaler Rasterversatz) eines bestehenden Bauwerks
  findBase(ix, iz, refY) {
    let best = null, bestD = H * 1.6;
    for (let x = ix - 1; x <= ix + 1; x++) {
      for (let z = iz - 1; z <= iz + 1; z++) {
        const s = this.cellMap.get(x + '|' + z);
        if (!s) continue;
        for (const p of s) {
          const d = Math.abs(p.y0 - refY);
          if (d < bestD) { bestD = d; best = p; }
        }
      }
    }
    if (!best) return null;
    return ((best.y0 % H) + H) % H;
  }

  // Ziel für Bauteil berechnen (für Spieler und Bots)
  computeTarget(ch, type, look, rampRot = 0) {
    const fx = -Math.sin(look.yaw), fz = -Math.cos(look.yaw);
    let dirIdx;
    if (Math.abs(fx) > Math.abs(fz)) dirIdx = fx > 0 ? 0 : 1;
    else dirIdx = fz > 0 ? 2 : 3;
    const [cdx, cdz] = DIR_VEC[dirIdx];
    const px = ch.pos.x, pz = ch.pos.z, feet = ch.pos.y;
    const cx = Math.floor(px / T), cz = Math.floor(pz / T);
    let ix = cx, iz = cz, axis = null, dir = 0, y0;
    const snap = (refY, ixx, izz) => {
      const b = this.findBase(ixx, izz, refY);
      if (b === null) return refY;
      return b + Math.round((refY - b) / H) * H;
    };
    if (type === 'wall') {
      if (dirIdx === 0) { ix = cx + 1; axis = 'z'; }
      else if (dirIdx === 1) { axis = 'z'; }
      else if (dirIdx === 2) { iz = cz + 1; axis = 'x'; }
      else { axis = 'x'; }
      y0 = snap(feet - 0.3, ix, iz) + (look.pitch > 0.55 ? H : 0);
    } else if (type === 'floor') {
      const reach = 3.4;
      const cp = Math.cos(look.pitch);
      const tx = px + fx * cp * reach, tz = pz + fz * cp * reach;
      const ty = feet + 1.6 + Math.sin(look.pitch) * reach;
      ix = Math.floor(tx / T); iz = Math.floor(tz / T);
      const ref = feet - 0.3;
      const b0 = this.findBase(ix, iz, ref);
      const b = b0 === null ? ref : b0;
      const kFeet = Math.round((ref - b) / H);
      let k = Math.floor((ty - b) / H);
      if (k < kFeet) k = kFeet;
      if (k > kFeet + 1) k = kFeet + 1;
      y0 = b + k * H;
    } else {
      ix = Math.floor((px + cdx * 2.6) / T);
      iz = Math.floor((pz + cdz * 2.6) / T);
      dir = [[0, 1, 2, 3], [2, 3, 1, 0], [1, 0, 3, 2], [3, 2, 0, 1]][rampRot & 3][dirIdx];
      let ext = feet;
      const gr = ch.groundRamp;
      if (gr && gr.ramp) {
        const nx = cdx > 0 ? ix * T : cdx < 0 ? (ix + 1) * T : px;
        const nz = cdz > 0 ? iz * T : cdz < 0 ? (iz + 1) * T : pz;
        const u = gr.ramp.ax * nx + gr.ramp.az * nz + gr.ramp.c;
        const e = gr.ramp.y0 + H * u;
        if (e > feet) ext = e;
      }
      y0 = snap(ext - 0.3, ix, iz) + (look.pitch > 0.6 ? H : 0);
    }
    y0 = Math.round(y0 * 20) / 20;
    const k = this.keyOf(type, ix, iz, y0, axis);
    let valid = !this.keyMap.has(k);
    // nicht komplett im Boden versenken
    if (valid) {
      const th = this.game.world.terrainHeight((ix + 0.5) * T, (iz + 0.5) * T);
      const top = type === 'floor' ? y0 : y0 + H;
      if (top < th - 0.3) valid = false;
      if (y0 > 260) valid = false;
    }
    return { type, ix, iz, y0, axis, dir, key: k, valid };
  }

  showGhost(tgt, affordable) {
    for (const t in this.ghosts) this.ghosts[t].visible = false;
    if (!tgt) return;
    const g = this.ghosts[tgt.type];
    const [x, y, z, ry] = this.transformOf(tgt);
    g.position.set(x, y, z);
    g.rotation.set(0, ry, 0);
    g.visible = true;
    const ok = tgt.valid && affordable;
    this.ghostMat.color.setHex(ok ? 0x48a8ff : 0xff4a4a);
    this.ghostLineMat.color.setHex(ok ? 0xbfe3ff : 0xffb0b0);
  }

  tryPlace(ch, tgt, mat) {
    if (!tgt || !tgt.valid) return null;
    if (ch.mats[mat] < BUILD_COST) return null;
    const p = this.addPiece({ type: tgt.type, ix: tgt.ix, iz: tgt.iz, y0: tgt.y0, axis: tgt.axis, dir: tgt.dir, mat, builder: ch });
    if (!p) return null;
    ch.mats[mat] -= BUILD_COST;
    const [x, y, z] = this.transformOf(p);
    this.game.audio.play('build', { x, y: y + 1, z });
    return p;
  }

  update(dt) {
    if (this.growing.length) {
      let w = 0;
      for (let i = 0; i < this.growing.length; i++) {
        const p = this.growing[i];
        if (!p.alive) continue;
        p.hp = Math.min(p.maxHp, p.hp + p.growRate * dt);
        if (p.hp < p.maxHp) this.growing[w++] = p;
      }
      this.growing.length = w;
    }
    if (this.collapse.length) {
      let w = 0;
      for (let i = 0; i < this.collapse.length; i++) {
        const c = this.collapse[i];
        c.t -= dt;
        if (c.t <= 0) {
          if (c.p.alive) this.removePiece(c.p, { checkSupport: false });
        } else this.collapse[w++] = c;
      }
      this.collapse.length = w;
    }
    for (const k in this.pools) this.pools[k].flush();
  }
}
