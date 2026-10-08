// Die Insel: Gelände, Wasser, Himmel, Orte, Bäume, Felsen, Autos
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE as T, LEVEL_H as H, ISLAND_R, POIS, ROADS, MATERIALS, MAP_VIEW, WATER_FLOOR } from './config.js';
import { mulberry32, Simplex2, clamp, lerp, smoothstep, randRange, randInt, pick } from './util.js';
import { F_SOLID, F_SHOTS } from './physics.js';
import { InstPool } from './pool.js';
import { tex } from './textures.js';

const HF_HALF = 480;
const HF_STEP = 3;
const HF_N = 320; // Segmente pro Seite

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export class World {
  constructor(game, seed) {
    this.game = game;
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.noise = new Simplex2(mulberry32(seed * 7 + 3));
    this.pois = [];
    this.lakes = [];
    this.mountains = [];
    this.roads = [];
    this.lots = [];
    this.envObjs = [];
    this.shaking = [];
    this.lootSpots = [];
    this.spacing = new Map();
    this.time = 0;
  }

  steps() {
    return [
      ['Insel wird geformt …', () => { this.planPOIs(); this.buildHeightfield(); }],
      ['Gelände wird bemalt …', () => this.buildTerrainMesh()],
      ['Himmel und Meer …', () => { this.buildWater(); this.buildSky(); this.buildClouds(); }],
      ['Häuser werden gebaut …', () => this.genStructures()],
      ['Bäume werden gepflanzt …', () => this.genEnvironment()],
      ['Karte wird gezeichnet …', () => { this.genOutdoorLoot(); this.renderMinimap(); }],
    ];
  }

  // ---------- Gelände ----------
  planPOIs() {
    const r = this.rand;
    for (const def of POIS) {
      this.pois.push({ ...def, x: def.x + randRange(r, -10, 10), z: def.z + randRange(r, -10, 10), flat: false, margin: def.margin ?? 28 });
    }
    const lake = this.pois.find((p) => p.type === 'lake');
    this.lakes.push({ x: lake.x, z: lake.z, r: lake.lakeR, depth: -3.6 });
    const castle = this.pois.find((p) => p.type === 'castle');
    this.mountains = [
      { x: 110 + randRange(r, -10, 10), z: 80 + randRange(r, -10, 10), r: 40, h: 36 },
      { x: -55, z: 250, r: 36, h: 24 },
      { x: castle.x, z: castle.z, r: 55, h: 17 },
      { x: -70, z: 70, r: 26, h: 15 },
      { x: 30, z: -230, r: 34, h: 22 },
    ];
    for (const p of this.pois) {
      p.h = p.type === 'lake' ? 2 : Math.max(3.5, Math.round(this.rawHeight(p.x, p.z) * 2) / 2);
    }
    for (const p of this.pois) p.flat = true;
    const byId = (id) => this.pois.find((p) => p.id === id);
    for (const [a, b] of ROADS) this.roads.push([byId(a), byId(b)]);
  }

  rawHeight(x, z) {
    const n = this.noise;
    let h = 7 + n.fbm(x * 0.0035, z * 0.0035, 4) * 8;
    h += Math.max(0, n.fbm(x * 0.006 + 40, z * 0.006 - 13, 3)) * 12;
    for (const m of this.mountains) {
      const dx = x - m.x, dz = z - m.z;
      h += m.h * Math.exp(-(dx * dx + dz * dz) / (2 * m.r * m.r));
    }
    const d = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const R = ISLAND_R * (1 + 0.09 * n.noise(Math.cos(ang) * 1.5 + 7, Math.sin(ang) * 1.5 + 3) + 0.04 * n.noise(Math.cos(ang) * 4, Math.sin(ang) * 4));
    h = lerp(-12, h, smoothstep(R + 30, R - 45, d));
    for (const L of this.lakes) {
      const dl = Math.hypot(x - L.x, z - L.z);
      h = lerp(h, L.depth, smoothstep(L.r, L.r * 0.55, dl));
    }
    for (const p of this.pois) {
      if (!p.flat) continue;
      const dp = Math.hypot(x - p.x, z - p.z);
      const w = smoothstep(p.r + p.margin, p.r, dp);
      if (w > 0) h = lerp(h, p.h, w);
    }
    return h;
  }

  buildHeightfield() {
    const N = HF_N + 1;
    this.hf = new Float32Array(N * N);
    let maxH = -Infinity;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = this.rawHeight(-HF_HALF + i * HF_STEP, -HF_HALF + j * HF_STEP);
        this.hf[j * N + i] = h;
        if (h > maxH) maxH = h;
      }
    }
    this.maxH = maxH;
  }

  terrainHeight(x, z) {
    const fx = (x + HF_HALF) / HF_STEP, fz = (z + HF_HALF) / HF_STEP;
    if (fx < 0 || fz < 0 || fx >= HF_N || fz >= HF_N) return -12;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const N = HF_N + 1, hf = this.hf, k = j * N + i;
    const h00 = hf[k], h10 = hf[k + 1], h01 = hf[k + N], h11 = hf[k + N + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  groundAt(x, z) {
    const h = this.terrainHeight(x, z);
    return h < WATER_FLOOR ? WATER_FLOOR : h;
  }

  raycastTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    let prevT = 0;
    let diff = oy - this.terrainHeight(ox, oz);
    if (diff < 0) return 0;
    let t = 0;
    while (t < maxT) {
      const step = clamp(diff * 0.45, 0.6, 10);
      t = Math.min(maxT, t + step);
      const y = oy + dy * t;
      if (y > this.maxH + 1 && dy >= 0) return -1;
      diff = y - this.terrainHeight(ox + dx * t, oz + dz * t);
      if (diff < 0) {
        let a = prevT, b = t;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) * 0.5;
          if (oy + dy * m - this.terrainHeight(ox + dx * m, oz + dz * m) < 0) b = m; else a = m;
        }
        return b;
      }
      prevT = t;
    }
    return -1;
  }

  roadDist(x, z) {
    let d = Infinity;
    for (const [a, b] of this.roads) {
      const dd = segDist(x, z, a.x, a.z, b.x, b.z);
      if (dd < d) d = dd;
    }
    return d;
  }

  buildTerrainMesh() {
    const N = HF_N + 1;
    const pos = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        pos[k * 3] = -HF_HALF + i * HF_STEP;
        pos[k * 3 + 1] = this.hf[k];
        pos[k * 3 + 2] = -HF_HALF + j * HF_STEP;
      }
    }
    const idx = new Uint32Array(HF_N * HF_N * 6);
    let p = 0;
    for (let j = 0; j < HF_N; j++) {
      for (let i = 0; i < HF_N; i++) {
        const a = j * N + i, b = (j + 1) * N + i, c = j * N + i + 1, d = (j + 1) * N + i + 1;
        idx[p++] = a; idx[p++] = b; idx[p++] = c;
        idx[p++] = c; idx[p++] = b; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal.array;
    const col = new Float32Array(N * N * 3);
    const grassA = new THREE.Color('#62bd4a'), grassB = new THREE.Color('#3f9a3b'), dry = new THREE.Color('#a3c552');
    const sand = new THREE.Color('#ecd9a0'), wet = new THREE.Color('#c4ad78'), rock = new THREE.Color('#8f8b83');
    const dirt = new THREE.Color('#b08f5f'), pave = new THREE.Color('#a3a29e'), field = new THREE.Color('#e0c45a');
    const fieldB = new THREE.Color('#9a7a44'), dark = new THREE.Color('#2f7d34');
    const c = new THREE.Color();
    const pavedTypes = { towers: 1, depot: 1, retail: 1 };
    for (let k = 0; k < N * N; k++) {
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const ny = nrm[k * 3 + 1];
      const n1 = this.noise.noise(x * 0.02, z * 0.02);
      const n2 = this.noise.noise(x * 0.005 + 100, z * 0.005);
      c.copy(grassA).lerp(grassB, 0.5 + 0.5 * n1);
      if (n2 > 0.3) c.lerp(dry, Math.min(1, (n2 - 0.3) * 2));
      if (n2 < -0.45) c.lerp(dark, Math.min(1, (-0.45 - n2) * 2.5));
      for (const poi of this.pois) {
        const dp = Math.hypot(x - poi.x, z - poi.z);
        if (dp > poi.r + 10) continue;
        const w = smoothstep(poi.r + 10, poi.r - 4, dp);
        if (pavedTypes[poi.type]) c.lerp(pave, w * 0.9);
        else if (poi.type === 'farm') {
          const stripe = Math.floor((x * 0.7 + z * 0.3) / 5) % 2 === 0;
          c.lerp(stripe ? field : fieldB, w * 0.85);
        } else if (poi.type === 'castle') c.lerp(dirt, w * 0.5);
      }
      const rd = this.roadDist(x, z);
      if (rd < 4) c.lerp(dirt, smoothstep(4, 2.2, rd) * 0.9);
      const rockiness = Math.max(smoothstep(0.84, 0.66, ny), smoothstep(30, 42, h));
      c.lerp(rock, rockiness);
      if (h < 1.4) c.lerp(sand, smoothstep(1.4, 0.4, h));
      if (h < -0.4) c.copy(wet);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    this.game.scene.add(mesh);
    this.terrain = mesh;
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshPhongMaterial({ color: 0x2390d8, transparent: true, opacity: 0.82, shininess: 120, specular: 0x9fd8ff });
    this.water = new THREE.Mesh(g, m);
    this.water.renderOrder = 2;
    this.game.scene.add(this.water);
  }

  buildSky() {
    const g = new THREE.SphereGeometry(100, 32, 16);
    const m = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color('#2a78dc') }, bottom: { value: new THREE.Color('#d6eeff') } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: [
        'uniform vec3 top;',
        'uniform vec3 bottom;',
        'varying vec3 vDir;',
        'void main() {',
        '  float h = vDir.y;',
        '  vec3 c = mix(bottom, top, smoothstep(-0.02, 0.5, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(g, m);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.game.scene.add(this.sky);
  }

  buildClouds() {
    const r = this.rand;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a96a8, flatShading: true });
    const pool = new InstPool(geo, mat, 200, { shadow: false, receive: false });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      const cx = randRange(r, -600, 600), cz = randRange(r, -600, 600), cy = randRange(r, 185, 240);
      const puffs = randInt(r, 4, 6);
      for (let k = 0; k < puffs; k++) {
        const sc = randRange(r, 9, 18);
        v.set(cx + randRange(r, -22, 22), cy + randRange(r, -3, 5), cz + randRange(r, -12, 12));
        s.set(sc * 1.3, sc * 0.7, sc);
        pool.add(m.compose(v, q, s));
      }
    }
    pool.flush();
    this.clouds = pool.mesh;
    this.game.scene.add(this.clouds);
  }

  // ---------- Bauwerke ----------
  lotOverlap(x0, z0, x1, z1) {
    for (const l of this.lots) {
      if (x0 < l.x1 && x1 > l.x0 && z0 < l.z1 && z1 > l.z0) return true;
    }
    return false;
  }

  nearLot(x, z, m) {
    for (const l of this.lots) {
      if (x > l.x0 - m && x < l.x1 + m && z > l.z0 - m && z < l.z1 + m) return true;
    }
    return false;
  }

  tryLot(cx, cz, rad, w, d, gap = 1, tries = 70) {
    const r = this.rand;
    for (let t = 0; t < tries; t++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const ix0 = Math.round(x / T - w / 2), iz0 = Math.round(z / T - d / 2);
      const x0 = ix0 * T, z0 = iz0 * T, x1 = x0 + w * T, z1 = z0 + d * T;
      let ok = true;
      for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        if (Math.hypot(px - cx, pz - cz) > rad + 6) { ok = false; break; }
      }
      if (!ok) continue;
      if (this.lotOverlap(x0 - gap * T, z0 - gap * T, x1 + gap * T, z1 + gap * T)) continue;
      this.lots.push({ x0, z0, x1, z1 });
      return { ix0, iz0 };
    }
    return null;
  }

  addLoot(type, x, y, z) {
    this.lootSpots.push({ type, x, y, z, yaw: this.rand() * Math.PI * 2 });
  }

  buildHouse(o) {
    const B = this.game.builds;
    const r = this.rand;
    const add = (q) => B.addPiece({ ...q, harvestable: true, instant: true });
    const { ix0, iz0, w, d, floors, base } = o;
    const wallMat = o.wallMat || 'wood', floorMat = o.floorMat || 'wood', roofMat = o.roofMat || floorMat;
    const windows = o.windows ?? 0.3;
    const doorEdge = randInt(r, 0, 3);
    const doorIdx = doorEdge < 2 ? randInt(r, 0, w - 1) : randInt(r, 0, d - 1);
    const doors2 = o.manyDoors ? randInt(r, 0, 3) : -1;
    let hole = null;
    const stairCells = [];
    for (let k = 0; k < floors; k++) {
      const y0 = base + k * H;
      if (k === 0 || o.interiorFloors !== false) {
        for (let i = 0; i < w; i++) {
          for (let j = 0; j < d; j++) {
            if (hole && hole.i === i && hole.j === j) continue;
            add({ type: 'floor', ix: ix0 + i, iz: iz0 + j, y0, mat: floorMat });
          }
        }
      }
      const wt = (edge, idx) => {
        if (k === 0 && o.door !== false && ((edge === doorEdge && idx === doorIdx) || edge === doors2)) return 'door';
        return r() < windows ? 'window' : 'wall';
      };
      for (let i = 0; i < w; i++) {
        add({ type: wt(0, i), ix: ix0 + i, iz: iz0, y0, axis: 'x', mat: wallMat });
        add({ type: wt(1, i), ix: ix0 + i, iz: iz0 + d, y0, axis: 'x', mat: wallMat });
      }
      for (let j = 0; j < d; j++) {
        add({ type: wt(2, j), ix: ix0, iz: iz0 + j, y0, axis: 'z', mat: wallMat });
        add({ type: wt(3, j), ix: ix0 + w, iz: iz0 + j, y0, axis: 'z', mat: wallMat });
      }
      hole = null;
      if (k < floors - 1 && o.interiorFloors !== false && w >= 2) {
        const even = k % 2 === 0;
        const si = even ? 0 : w - 1;
        let sj = randInt(r, 0, d - 1);
        if (stairCells.length && d > 1 && stairCells[stairCells.length - 1].j === sj) sj = (sj + 1) % d;
        add({ type: 'ramp', ix: ix0 + si, iz: iz0 + sj, y0, dir: even ? 0 : 1, mat: floorMat });
        hole = { i: si, j: sj };
        stairCells.push({ k, i: si, j: sj });
      }
    }
    const top = base + floors * H;
    if (o.roof === 'gable' && d % 2 === 0 && d <= 4) {
      for (let j = 0; j < d; j++) {
        const up = j < d / 2;
        const lvl = up ? j : d - 1 - j;
        for (let i = 0; i < w; i++) add({ type: 'ramp', ix: ix0 + i, iz: iz0 + j, y0: top + lvl * H, dir: up ? 2 : 3, mat: roofMat });
      }
    } else if (o.roof !== 'none') {
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) add({ type: 'floor', ix: ix0 + i, iz: iz0 + j, y0: top, mat: roofMat });
    }
    if (o.loot === false) return;
    const levels = o.interiorFloors === false ? 1 : floors;
    for (let k = 0; k < levels; k++) {
      const y0 = base + k * H;
      const free = [];
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
          if (stairCells.some((s) => (s.k === k || s.k === k - 1) && s.i === i && s.j === j)) continue;
          free.push([i, j]);
        }
      }
      if (!free.length) continue;
      const spot = () => {
        const [i, j] = pick(r, free);
        return [(ix0 + i + 0.5) * T + randRange(r, -1, 1), y0, (iz0 + j + 0.5) * T + randRange(r, -1, 1)];
      };
      if (r() < (o.chestProb ?? 0.5)) { const [x, y, z] = spot(); this.addLoot('chest', x, y, z); }
      const nf = randInt(r, 1, 2);
      for (let n = 0; n < nf; n++) { const [x, y, z] = spot(); this.addLoot('floor', x, y, z); }
      if (r() < 0.25) { const [x, y, z] = spot(); this.addLoot('ammo', x, y, z); }
    }
  }

  wallRing(ix0, iz0, w, d, levels, base, mat, gate) {
    const B = this.game.builds;
    for (let k = 0; k < levels; k++) {
      const y0 = base + k * H;
      for (let i = 0; i < w; i++) {
        const isGate = k === 0 && gate && i === Math.floor(w / 2);
        B.addPiece({ type: isGate ? 'door' : 'wall', ix: ix0 + i, iz: iz0 + d, y0, axis: 'x', mat, harvestable: true, instant: true });
        B.addPiece({ type: 'wall', ix: ix0 + i, iz: iz0, y0, axis: 'x', mat, harvestable: true, instant: true });
      }
      for (let j = 0; j < d; j++) {
        B.addPiece({ type: k === 0 && j === Math.floor(d / 2) ? 'door' : 'wall', ix: ix0, iz: iz0 + j, y0, axis: 'z', mat, harvestable: true, instant: true });
        B.addPiece({ type: 'wall', ix: ix0 + w, iz: iz0 + j, y0, axis: 'z', mat, harvestable: true, instant: true });
      }
    }
  }

  genStructures() {
    const r = this.rand;
    for (const p of this.pois) {
      const base = p.h + 0.06;
      if (p.type === 'town') {
        const n = randInt(r, 6, 8);
        for (let i = 0; i < n; i++) {
          const w = randInt(r, 2, 3), d = randInt(r, 2, 3);
          const lot = this.tryLot(p.x, p.z, p.r, w, d, 1);
          if (!lot) continue;
          const stone = p.mat === 'stone' ? r() < 0.7 : r() < 0.3;
          this.buildHouse({
            ...lot, w, d, floors: randInt(r, 1, 2), base, wallMat: stone ? 'stone' : 'wood', floorMat: 'wood',
            roofMat: stone ? 'stone' : 'wood', roof: d === 2 && r() < 0.75 ? 'gable' : 'flat', windows: 0.3,
          });
        }
      } else if (p.type === 'towers') {
        const clock = this.tryLot(p.x, p.z, 6, 2, 2, 1);
        if (clock) this.buildHouse({ ...clock, w: 2, d: 2, floors: 6, base, wallMat: 'metal', floorMat: 'stone', windows: 0.5, roof: 'flat', chestProb: 0.6 });
        const n = 7;
        for (let i = 0; i < n; i++) {
          const w = randInt(r, 2, 3), d = randInt(r, 2, 3);
          const lot = this.tryLot(p.x, p.z, p.r, w, d, 1);
          if (!lot) continue;
          this.buildHouse({
            ...lot, w, d, floors: randInt(r, 3, 5), base, wallMat: r() < 0.6 ? 'stone' : 'metal', floorMat: 'wood',
            roofMat: 'stone', roof: 'flat', windows: 0.45, chestProb: 0.45,
          });
        }
      } else if (p.type === 'depot') {
        for (let i = 0; i < 3; i++) {
          const w = 4, d = randInt(r, 4, 5);
          const lot = this.tryLot(p.x, p.z, p.r, w, d, 2);
          if (!lot) continue;
          this.buildHouse({ ...lot, w, d, floors: 2, base, wallMat: 'metal', floorMat: 'stone', roofMat: 'metal', interiorFloors: false, roof: 'flat', windows: 0.15, manyDoors: true, chestProb: 1 });
          const lt = this.lots[this.lots.length - 1];
          for (let c = 0; c < 3; c++) this.addCrate(randRange(r, lt.x0 + 2, lt.x1 - 2), randRange(r, lt.z0 + 2, lt.z1 - 2), base);
        }
      } else if (p.type === 'retail') {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const w = 3, d = 2;
          const lot = this.tryLot(p.x, p.z, p.r, w, d, 1);
          if (!lot) continue;
          this.buildHouse({ ...lot, w, d, floors: 2, base, wallMat: 'stone', floorMat: 'wood', roofMat: 'stone', roof: 'flat', windows: 0.5 });
        }
      } else if (p.type === 'woods') {
        for (let i = 0; i < 4; i++) {
          const lot = this.tryLot(p.x, p.z, p.r, 2, 2, 2);
          if (!lot) continue;
          this.buildHouse({ ...lot, w: 2, d: 2, floors: 1, base, wallMat: 'wood', floorMat: 'wood', roof: 'gable', windows: 0.25, chestProb: 0.8 });
        }
      } else if (p.type === 'farm') {
        const barn = this.tryLot(p.x, p.z, 10, 3, 4, 1);
        if (barn) this.buildHouse({ ...barn, w: 3, d: 4, floors: 2, base, wallMat: 'wood', floorMat: 'wood', roof: 'gable', windows: 0.1, manyDoors: true, chestProb: 0.7 });
        for (let i = 0; i < 3; i++) {
          const lot = this.tryLot(p.x, p.z, p.r, 2, 2, 2);
          if (!lot) continue;
          this.buildHouse({ ...lot, w: 2, d: 2, floors: randInt(r, 1, 2), base, wallMat: r() < 0.5 ? 'wood' : 'stone', floorMat: 'wood', roof: 'gable', windows: 0.3 });
        }
      } else if (p.type === 'castle') {
        const ix0 = Math.round(p.x / T) - 3, iz0 = Math.round(p.z / T) - 3;
        this.lots.push({ x0: ix0 * T, z0: iz0 * T, x1: (ix0 + 7) * T, z1: (iz0 + 7) * T });
        this.wallRing(ix0, iz0, 7, 7, 2, base, 'stone', true);
        this.buildHouse({ ix0: ix0 + 2, iz0: iz0 + 2, w: 3, d: 2, floors: 4, base, wallMat: 'stone', floorMat: 'wood', roofMat: 'stone', roof: 'flat', windows: 0.35, chestProb: 0.8 });
        this.addLoot('chest', (ix0 + 1) * T, base, (iz0 + 5.5) * T);
        this.addLoot('chest', (ix0 + 6) * T, base, (iz0 + 1) * T);
      } else if (p.type === 'lake') {
        const ix0 = Math.round(p.x / T) - 1, iz0 = Math.round(p.z / T) - 1;
        this.lots.push({ x0: ix0 * T, z0: iz0 * T, x1: (ix0 + 2) * T, z1: (iz0 + 2) * T });
        this.buildHouse({ ix0, iz0, w: 2, d: 2, floors: 1, base, wallMat: 'wood', floorMat: 'wood', roof: 'gable', windows: 0.4, chestProb: 1 });
      }
    }
    // einzelne Häuser verteilt über die Insel
    let placed = 0;
    for (let t = 0; t < 400 && placed < 9; t++) {
      const x = randRange(r, -270, 270), z = randRange(r, -270, 270);
      if (this.poiAt(x, z, 25)) continue;
      const w = 2, d = 2;
      const ix0 = Math.round(x / T) - 1, iz0 = Math.round(z / T) - 1;
      const xs = [ix0 * T, (ix0 + w) * T], zs = [iz0 * T, (iz0 + d) * T];
      let mn = Infinity, mx = -Infinity;
      for (const xx of xs) for (const zz of zs) { const h = this.terrainHeight(xx, zz); mn = Math.min(mn, h); mx = Math.max(mx, h); }
      const hc = this.terrainHeight(x, z);
      if (mn < 1.5 || mx - mn > 1.6 || hc > 40) continue;
      if (this.lotOverlap(xs[0] - 12, zs[0] - 12, xs[1] + 12, zs[1] + 12)) continue;
      this.lots.push({ x0: xs[0], z0: zs[0], x1: xs[1], z1: zs[1] });
      this.buildHouse({ ix0, iz0, w, d, floors: randInt(r, 1, 2), base: Math.round(mx * 20) / 20 + 0.05, wallMat: r() < 0.6 ? 'wood' : 'stone', floorMat: 'wood', roof: 'gable', windows: 0.3, chestProb: 0.7 });
      placed++;
    }
  }

  poiAt(x, z, extra = 0) {
    for (const p of this.pois) if (Math.hypot(x - p.x, z - p.z) < p.r + extra) return p;
    return null;
  }

  // ---------- Umgebung ----------
  spacingOK(x, z, rad) {
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const l = this.spacing.get(i * 10000 + j);
        if (!l) continue;
        for (const o of l) if (Math.hypot(o[0] - x, o[1] - z) < rad + o[2]) return false;
      }
    }
    return true;
  }

  markSpace(x, z, rad) {
    const k = Math.floor(x / 8) * 10000 + Math.floor(z / 8);
    let l = this.spacing.get(k);
    if (!l) { l = []; this.spacing.set(k, l); }
    l.push([x, z, rad]);
  }

  envMatrix(o, out, shake = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.ry);
    if (shake) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), shake));
    return out.compose(o.pos, q, o.scale);
  }

  addEnv(o, pools, colors) {
    const m = new THREE.Matrix4();
    this.envMatrix(o, m);
    o.parts = pools.map((pool, i) => [pool, pool.add(m, colors && colors[i])]);
    for (const c of o.cols) { c.owner = o; this.game.physics.add(c); }
    o.alive = true;
    o.kind = 'env';
    o.harvestable = true;
    o.shake = 0;
    this.envObjs.push(o);
    return o;
  }

  genEnvironment() {
    const r = this.rand;
    const flat = { flatShading: true };
    // Bäume
    const pineTrunk = new THREE.CylinderGeometry(0.22, 0.34, 3, 6); pineTrunk.translate(0, 1.5, 0);
    const pineTop = mergeGeometries([
      new THREE.ConeGeometry(2.4, 3.6, 7).translate(0, 3.8, 0),
      new THREE.ConeGeometry(1.9, 3.0, 7).translate(0, 5.5, 0),
      new THREE.ConeGeometry(1.3, 2.4, 7).translate(0, 7.0, 0),
    ]);
    const roundTrunk = new THREE.CylinderGeometry(0.3, 0.42, 4.4, 6); roundTrunk.translate(0, 2.2, 0);
    const roundTop = mergeGeometries([
      new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5.8, 0),
      new THREE.IcosahedronGeometry(1.8, 1).translate(1.3, 5.0, 0.6),
      new THREE.IcosahedronGeometry(1.7, 1).translate(-1.2, 5.2, -0.7),
    ]);
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a33, ...flat });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, ...flat });
    this.pools = {
      ...(this.pools || {}),
      pineTrunk: new InstPool(pineTrunk, barkMat, 700),
      pineTop: new InstPool(pineTop, leafMat, 700),
      roundTrunk: new InstPool(roundTrunk, barkMat, 500),
      roundTop: new InstPool(roundTop, leafMat, 500),
    };
    const pineCols = [new THREE.Color('#2f7a3a'), new THREE.Color('#2a6e43'), new THREE.Color('#3b8a3a')];
    const roundCols = [new THREE.Color('#58ad3f'), new THREE.Color('#6cbf45'), new THREE.Color('#4a9a3a'), new THREE.Color('#8fbf3a')];
    let trees = 0;
    for (let t = 0; t < 9000 && trees < 640; t++) {
      const x = randRange(r, -ISLAND_R, ISLAND_R), z = randRange(r, -ISLAND_R, ISLAND_R);
      const h = this.terrainHeight(x, z);
      if (h < 1.6 || h > 48) continue;
      const slope = Math.abs(this.terrainHeight(x + 2, z) - this.terrainHeight(x - 2, z)) + Math.abs(this.terrainHeight(x, z + 2) - this.terrainHeight(x, z - 2));
      if (slope > 3.2) continue;
      const poi = this.poiAt(x, z, 4);
      let density = 0.35 + 0.65 * Math.max(0, this.noise.noise(x * 0.011 + 3, z * 0.011 - 7));
      if (poi) {
        if (poi.type === 'woods') density = 0.95;
        else if (poi.type === 'farm' || poi.type === 'lake') density *= 0.3;
        else continue;
      }
      if (r() > density) continue;
      if (this.nearLot(x, z, 3) || this.roadDist(x, z) < 4.5) continue;
      if (!this.spacingOK(x, z, 2.4)) continue;
      const pine = r() < 0.58;
      const s = randRange(r, 0.8, 1.35);
      this.markSpace(x, z, 1.4);
      const o = {
        type: 'tree', mat: 'wood', x, y: h, z, ry: r() * Math.PI * 2, pos: new THREE.Vector3(x, h - 0.15, z),
        scale: new THREE.Vector3(s, s, s), hp: Math.round((pine ? 160 : 220) * s), cols: [
          { minX: x - 0.4 * s, maxX: x + 0.4 * s, minZ: z - 0.4 * s, maxZ: z + 0.4 * s, minY: h - 1, maxY: h + 4.2 * s, flags: F_SOLID | F_SHOTS },
          { minX: x - 2.0 * s, maxX: x + 2.0 * s, minZ: z - 2.0 * s, maxZ: z + 2.0 * s, minY: h + 2.6 * s, maxY: h + 8 * s, flags: F_SHOTS },
        ],
      };
      o.maxHp = o.hp;
      this.addEnv(o, pine ? [this.pools.pineTrunk, this.pools.pineTop] : [this.pools.roundTrunk, this.pools.roundTop],
        [null, pick(r, pine ? pineCols : roundCols)]);
      trees++;
    }
    // Felsen
    const rockGeo = new THREE.DodecahedronGeometry(1.3, 0);
    this.pools.rock = new InstPool(rockGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, ...flat }), 200);
    const rockCols = [new THREE.Color('#9a968e'), new THREE.Color('#8a8780'), new THREE.Color('#a8a49a')];
    let rocks = 0;
    for (let t = 0; t < 4000 && rocks < 130; t++) {
      const x = randRange(r, -ISLAND_R, ISLAND_R), z = randRange(r, -ISLAND_R, ISLAND_R);
      const h = this.terrainHeight(x, z);
      if (h < 0.5 || this.poiAt(x, z, 2) || this.nearLot(x, z, 4) || this.roadDist(x, z) < 5) continue;
      if (!this.spacingOK(x, z, 3)) continue;
      const s = randRange(r, 0.8, 2.0);
      this.markSpace(x, z, 1.4 * s);
      const sx = s * randRange(r, 1, 1.4), sy = s * randRange(r, 0.6, 1), sz = s;
      const ex = 1.05 * Math.max(sx, sz);
      this.addEnv({
        type: 'rock', mat: 'stone', x, y: h, z, ry: r() * Math.PI * 2, pos: new THREE.Vector3(x, h + 0.2 * sy, z),
        scale: new THREE.Vector3(sx, sy, sz), hp: Math.round(260 * s), maxHp: Math.round(260 * s), cols: [
          { minX: x - ex, maxX: x + ex, minZ: z - ex, maxZ: z + ex, minY: h - 1, maxY: h + 1.35 * sy, flags: F_SOLID | F_SHOTS },
        ],
      }, [this.pools.rock], [pick(r, rockCols)]);
      rocks++;
    }
    // Büsche (Deko)
    const bushPool = new InstPool(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, ...flat }), 320);
    const bushCols = [new THREE.Color('#3f9a3b'), new THREE.Color('#4fae43'), new THREE.Color('#2f8a3a')];
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3();
    for (let t = 0, n = 0; t < 3000 && n < 300; t++) {
      const x = randRange(r, -ISLAND_R, ISLAND_R), z = randRange(r, -ISLAND_R, ISLAND_R);
      const h = this.terrainHeight(x, z);
      if (h < 1.5 || this.nearLot(x, z, 1) || this.roadDist(x, z) < 3) continue;
      const s = randRange(r, 0.8, 1.4);
      bushPool.add(mm.compose(vv.set(x, h + 0.35 * s, z), qq, ss.set(s * 1.2, s * 0.85, s * 1.2)), pick(r, bushCols));
      n++;
    }
    this.pools.bush = bushPool;
    // Autos
    const carGeo = mergeGeometries([
      colorize(new THREE.BoxGeometry(4.2, 0.9, 1.9).translate(0, 0.8, 0), '#ffffff'),
      colorize(new THREE.BoxGeometry(2.3, 0.75, 1.75).translate(-0.25, 1.62, 0), '#bcd3e0'),
      ...[[-1.35, -0.95], [1.35, -0.95], [-1.35, 0.95], [1.35, 0.95]].map(([wx, wz]) =>
        colorize(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10).rotateX(Math.PI / 2).translate(wx, 0.4, wz), '#1c1c1c')),
      colorize(new THREE.BoxGeometry(0.1, 0.25, 1.5).translate(2.12, 0.85, 0), '#fff6c0'),
    ]);
    this.pools.car = new InstPool(carGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 60);
    const carCols = ['#d63c3c', '#2f6fd6', '#f2c12e', '#f2f2f2', '#3a3a3a', '#3fae5a', '#e07a2e'].map((c) => new THREE.Color(c));
    let cars = 0;
    for (let t = 0; t < 600 && cars < 28; t++) {
      const [a, b] = pick(r, this.roads);
      const f = randRange(r, 0.1, 0.9);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const side = r() < 0.5 ? -1 : 1;
      const x = a.x + dx * f + (-dz / len) * 5.5 * side, z = a.z + dz * f + (dx / len) * 5.5 * side;
      const h = this.terrainHeight(x, z);
      if (h < 1 || this.nearLot(x, z, 3) || !this.spacingOK(x, z, 4)) continue;
      const along = Math.abs(dx) > Math.abs(dz);
      const ry = (along ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0);
      this.markSpace(x, z, 3);
      const hx = along ? 2.15 : 1.0, hz = along ? 1.0 : 2.15;
      this.addEnv({
        type: 'car', mat: 'metal', x, y: h, z, ry, pos: new THREE.Vector3(x, h - 0.05, z), scale: new THREE.Vector3(1, 1, 1),
        hp: 400, maxHp: 400, cols: [{ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, minY: h - 0.5, maxY: h + 1.95, flags: F_SOLID | F_SHOTS }],
      }, [this.pools.car], [pick(r, carCols)]);
      cars++;
    }
    for (const k in this.pools) {
      this.pools[k].flush();
      this.game.scene.add(this.pools[k].mesh);
    }
  }

  addCrate(x, z, base) {
    if (!this.pools) this.pools = {};
    if (!this.pools.crate) {
      const g = new THREE.BoxGeometry(1.8, 1.8, 1.8);
      g.translate(0, 0.9, 0);
      this.pools.crate = new InstPool(g, new THREE.MeshLambertMaterial({ map: tex('wood') }), 80);
      this.game.scene.add(this.pools.crate.mesh);
    }
    this.addEnv({
      type: 'crate', mat: 'wood', x, y: base, z, ry: 0, pos: new THREE.Vector3(x, base, z), scale: new THREE.Vector3(1, 1, 1),
      hp: 120, maxHp: 120, cols: [{ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9, minY: base, maxY: base + 1.8, flags: F_SOLID | F_SHOTS }],
    }, [this.pools.crate]);
    this.pools.crate.flush();
  }

  damageEnv(o, dmg) {
    if (!o.alive) return false;
    o.hp -= dmg;
    if (o.hp <= 0) {
      o.alive = false;
      for (const [pool, i] of o.parts) pool.remove(i);
      for (const c of o.cols) this.game.physics.remove(c);
      const cy = o.type === 'tree' ? o.y + 3 * o.scale.y : o.y + 0.8;
      this.game.effects.debris(o.x, cy, o.z, o.mat, o.type === 'tree' ? 'tree' : 'wall');
      this.game.audio.play('break', { x: o.x, y: cy, z: o.z });
      return true;
    }
    if (o.type === 'tree' || o.type === 'car' || o.type === 'crate') {
      if (!o.shake) this.shaking.push(o);
      o.shake = 0.3;
    }
    return false;
  }

  // ---------- Beute-Plätze im Freien ----------
  landPoint(maxR = 300) {
    const r = this.rand;
    for (let t = 0; t < 200; t++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * maxR;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = this.terrainHeight(x, z);
      if (h > 1.5 && h < 45) return { x, z, h };
    }
    return { x: 0, z: 0, h: this.terrainHeight(0, 0) };
  }

  genOutdoorLoot() {
    const counts = { floor: 55, chest: 16, ammo: 22 };
    for (const type in counts) {
      for (let i = 0; i < counts[type]; i++) {
        let p = null;
        for (let t = 0; t < 30; t++) {
          const q = this.landPoint(300);
          if (this.nearLot(q.x, q.z, 1.5) || !this.spacingOK(q.x, q.z, 1)) continue;
          p = q;
          break;
        }
        if (p) this.addLoot(type, p.x, this.game.physics.groundHeightAt(p.x, p.z, p.h + 2), p.z);
      }
    }
  }

  // ---------- Minimap ----------
  renderMinimap() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const scale = (MAP_VIEW * 2) / S;
    const col = new THREE.Color();
    const deep = new THREE.Color('#1f6fbf'), shallow = new THREE.Color('#4fb4e8'), sand = new THREE.Color('#ecd9a0');
    const grass = new THREE.Color('#5fb548'), rock = new THREE.Color('#9a958c'), dirt = new THREE.Color('#b8975f');
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = -MAP_VIEW + px * scale, z = -MAP_VIEW + py * scale;
        const h = this.terrainHeight(x, z);
        if (h < 0) col.copy(shallow).lerp(deep, smoothstep(0, -8, h));
        else if (h < 1.2) col.copy(sand);
        else {
          col.copy(grass);
          if (h > 26) col.lerp(rock, smoothstep(26, 40, h));
          const shade = (this.terrainHeight(x - 2, z - 2) - h) * 0.06;
          col.offsetHSL(0, 0, clamp(-shade, -0.12, 0.12));
          const rd = this.roadDist(x, z);
          if (rd < 3) col.lerp(dirt, 0.8);
        }
        const k = (py * S + px) * 4;
        img.data[k] = Math.round(Math.pow(col.r, 1 / 2.2) * 255);
        img.data[k + 1] = Math.round(Math.pow(col.g, 1 / 2.2) * 255);
        img.data[k + 2] = Math.round(Math.pow(col.b, 1 / 2.2) * 255);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(70,62,58,0.85)';
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1;
    for (const l of this.lots) {
      const x0 = (l.x0 + MAP_VIEW) / scale, z0 = (l.z0 + MAP_VIEW) / scale;
      const w = (l.x1 - l.x0) / scale, h = (l.z1 - l.z0) / scale;
      g.fillRect(x0, z0, w, h);
      g.strokeRect(x0, z0, w, h);
    }
    this.mapCanvas = c;
  }

  update(dt, camera) {
    this.time += dt;
    if (this.clouds) this.clouds.position.x = Math.sin(this.time * 0.01) * 60;
    if (this.sky && camera) this.sky.position.copy(camera.position);
    if (this.shaking.length) {
      const m = new THREE.Matrix4();
      let w = 0;
      for (const o of this.shaking) {
        if (!o.alive) { o.shake = 0; continue; }
        o.shake = Math.max(0, o.shake - dt);
        const a = Math.sin(this.time * 45) * 0.06 * (o.shake / 0.3);
        this.envMatrix(o, m, a);
        for (const [pool, i] of o.parts) pool.set(i, m);
        if (o.shake > 0) this.shaking[w++] = o;
      }
      this.shaking.length = w;
    }
    if (this.pools) for (const k in this.pools) this.pools[k].flush();
  }
}
