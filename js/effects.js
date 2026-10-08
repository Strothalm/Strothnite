// Partikel, Leuchtspuren, Blitze, Explosionen
import * as THREE from 'three';
import { tex } from './textures.js';

const MAT_COLORS = {
  wood: ['#b07a45', '#8a5a2b', '#d4a26a'],
  stone: ['#9a968e', '#7d7a74', '#b8b4aa'],
  metal: ['#aab6c2', '#7f8b98', '#d0d8e0'],
};
const TREE_COLORS = ['#8a5a33', '#3f9a3b', '#2f7a3a', '#5fb548'];

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.tmpC = new THREE.Color();

    this.PCAP = 1400;
    this.pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.PCAP);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.frustumCulled = false;
    this.pmesh.setColorAt(0, new THREE.Color(1, 1, 1));
    const ma = this.pmesh.instanceMatrix.array;
    for (let i = 0; i < this.PCAP; i++) ma[i * 16 + 15] = 1;
    this.pmesh.count = this.PCAP;
    scene.add(this.pmesh);
    this.pp = new Float32Array(this.PCAP * 3);
    this.pv = new Float32Array(this.PCAP * 3);
    this.pl = new Float32Array(this.PCAP);
    this.pm = new Float32Array(this.PCAP);
    this.ps = new Float32Array(this.PCAP);
    this.pg = new Float32Array(this.PCAP);
    this.pNext = 0;

    this.TCAP = 160;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.TCAP * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.TCAP * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    this.tracers = [];

    this.glowPool = [];
    this.smokePool = [];
    for (let i = 0; i < 48; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      scene.add(s);
      this.glowPool.push(s);
    }
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('smoke'), depthWrite: false, transparent: true, color: 0x999999 }));
      s.visible = false;
      scene.add(s);
      this.smokePool.push(s);
    }
    this.sprites = [];

    this.light = new THREE.PointLight(0xffd27a, 0, 14, 2);
    scene.add(this.light);
    this.lightT = 0;

    this.beamGeo = new THREE.CylinderGeometry(0.55, 0.55, 40, 14, 1, true);
    this.beamGeo.translate(0, 20, 0);
    this.beams = [];
  }

  particle(x, y, z, vx, vy, vz, life, size, color, grav = 1) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % this.PCAP;
    this.pp[i * 3] = x; this.pp[i * 3 + 1] = y; this.pp[i * 3 + 2] = z;
    this.pv[i * 3] = vx; this.pv[i * 3 + 1] = vy; this.pv[i * 3 + 2] = vz;
    this.pl[i] = life; this.pm[i] = life; this.ps[i] = size; this.pg[i] = grav;
    this.tmpC.set(color);
    const ca = this.pmesh.instanceColor.array;
    ca[i * 3] = this.tmpC.r; ca[i * 3 + 1] = this.tmpC.g; ca[i * 3 + 2] = this.tmpC.b;
    this.pmesh.instanceColor.needsUpdate = true;
  }

  burst(x, y, z, n, colors, speed, life, size, grav = 1, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      const ce = Math.sqrt(1 - e * e);
      this.particle(x, y, z, Math.cos(a) * ce * s, e * s + up, Math.sin(a) * ce * s,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), colors[i % colors.length], grav);
    }
  }

  debris(x, y, z, mat, shape) {
    const cols = shape === 'tree' ? TREE_COLORS : MAT_COLORS[mat] || MAT_COLORS.wood;
    const n = shape === 'flat' ? 14 : 22;
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * (shape === 'flat' ? 3.5 : 2.5);
      const oy = (Math.random() - 0.5) * (shape === 'flat' ? 0.3 : 3);
      const oz = (Math.random() - 0.5) * (shape === 'flat' ? 3.5 : 2.5);
      this.particle(x + ox, y + oy, z + oz, (Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5,
        0.9 + Math.random() * 0.6, 0.2 + Math.random() * 0.3, cols[i % cols.length], 1);
    }
    this.smoke(x, y, z, 2.5, 0.8, 0xbbbbbb);
  }

  impact(x, y, z, kind) {
    const cols = MAT_COLORS[kind] || ['#d8cfa8', '#7a6a4a', '#5a9a3a'];
    this.burst(x, y, z, 5, cols, 4, 0.35, 0.08, 1, 1.5);
  }

  hitSparks(x, y, z, shield) {
    this.burst(x, y, z, 7, shield ? ['#7fd0ff', '#ffffff', '#3aa0ff'] : ['#ffffff', '#ffe2a0'], 5, 0.3, 0.07, 0.5, 1);
  }

  tracer(sx, sy, sz, ex, ey, ez, color = 0xffe8a0) {
    if (this.tracers.length >= this.TCAP) this.tracers.shift();
    const len = Math.hypot(ex - sx, ey - sy, ez - sz);
    this.tracers.push({ sx, sy, sz, ex, ey, ez, len, t: 0, dur: Math.max(0.05, len / 700), c: new THREE.Color(color) });
  }

  sprite(pool, x, y, z, color, s0, s1, op, dur) {
    const s = pool.find((p) => !p.visible);
    if (!s) return null;
    s.visible = true;
    s.position.set(x, y, z);
    s.material.color.set(color);
    s.material.opacity = op;
    s.scale.setScalar(s0);
    this.sprites.push({ s, t: 0, dur, s0, s1, op });
    return s;
  }

  flash(x, y, z, color, size, dur) {
    return this.sprite(this.glowPool, x, y, z, color, size, size * 1.4, 1, dur);
  }

  smoke(x, y, z, size, dur, color = 0x9a9a9a) {
    return this.sprite(this.smokePool, x, y, z, color, size * 0.5, size, 0.6, dur);
  }

  muzzle(x, y, z, big) {
    this.flash(x, y, z, 0xffd27a, big ? 1.2 : 0.7, 0.05);
    this.light.position.set(x, y, z);
    this.light.intensity = big ? 40 : 18;
    this.lightT = 0.05;
  }

  explosion(x, y, z, r) {
    this.flash(x, y, z, 0xffb040, r * 1.6, 0.35);
    this.flash(x, y, z, 0xfff0c0, r * 0.8, 0.2);
    for (let i = 0; i < 6; i++) {
      this.smoke(x + (Math.random() - 0.5) * r, y + Math.random() * r * 0.6, z + (Math.random() - 0.5) * r, r * 1.4, 1.2 + Math.random() * 0.6, 0x555555);
    }
    this.burst(x, y, z, 40, ['#ff9a2a', '#ffd04a', '#3a3a3a', '#ff5a1a'], 14, 0.9, 0.25, 1, 3);
    this.light.position.set(x, y, z);
    this.light.intensity = 160;
    this.light.distance = 30;
    this.lightT = 0.2;
  }

  eliminate(ch) {
    const p = ch.pos;
    const S = ch.skin;
    const cols = [S.shirt, S.pants, S.skin, '#7fd8ff', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      this.particle(p.x + (Math.random() - 0.5) * 1.2, p.y + Math.random() * 1.8, p.z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.8, 2 + Math.random() * 4, (Math.random() - 0.5) * 0.8, 1.4 + Math.random(), 0.14 + Math.random() * 0.12, cols[i % cols.length], -0.1);
    }
    const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p);
    this.game.scene.add(m);
    this.beams.push({ m, t: 0, dur: 1.6 });
  }

  confetti(x, y, z) {
    const cols = ['#ffd400', '#ff4fa3', '#3ad1ff', '#7cff4f', '#ff8a1a', '#b44cff'];
    for (let i = 0; i < 160; i++) {
      this.particle(x + (Math.random() - 0.5) * 6, y + 6 + Math.random() * 4, z + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6, 3 + Math.random() * 2, 0.12, cols[i % cols.length], 0.15);
    }
  }

  update(dt) {
    // Partikel
    const ma = this.pmesh.instanceMatrix.array;
    const pp = this.pp, pv = this.pv, pl = this.pl, pm = this.pm, ps = this.ps, pg = this.pg;
    for (let i = 0; i < this.PCAP; i++) {
      const o = i * 16;
      if (pl[i] <= 0) {
        if (ma[o] !== 0) { ma[o] = 0; ma[o + 5] = 0; ma[o + 10] = 0; }
        continue;
      }
      pl[i] -= dt;
      const k = i * 3;
      pv[k + 1] -= 18 * pg[i] * dt;
      pp[k] += pv[k] * dt;
      pp[k + 1] += pv[k + 1] * dt;
      pp[k + 2] += pv[k + 2] * dt;
      const s = pl[i] > 0 ? ps[i] * Math.min(1, (pl[i] / pm[i]) * 2.5) : 0;
      ma[o] = s; ma[o + 5] = s; ma[o + 10] = s;
      ma[o + 12] = pp[k]; ma[o + 13] = pp[k + 1]; ma[o + 14] = pp[k + 2];
    }
    this.pmesh.instanceMatrix.needsUpdate = true;

    // Leuchtspuren
    const pos = this.tracerLines.geometry.attributes.position.array;
    const col = this.tracerLines.geometry.attributes.color.array;
    let n = 0;
    const keep = [];
    for (const t of this.tracers) {
      t.t += dt;
      if (t.t >= t.dur + 0.04) continue;
      keep.push(t);
      const f = Math.min(1, t.t / t.dur);
      const head = f;
      const tail = Math.max(0, f - Math.min(1, 9 / Math.max(1, t.len)));
      const fade = 1 - Math.max(0, (t.t - t.dur) / 0.04);
      const k = n * 6;
      pos[k] = t.sx + (t.ex - t.sx) * tail; pos[k + 1] = t.sy + (t.ey - t.sy) * tail; pos[k + 2] = t.sz + (t.ez - t.sz) * tail;
      pos[k + 3] = t.sx + (t.ex - t.sx) * head; pos[k + 4] = t.sy + (t.ey - t.sy) * head; pos[k + 5] = t.sz + (t.ez - t.sz) * head;
      col[k] = t.c.r * 0.2 * fade; col[k + 1] = t.c.g * 0.2 * fade; col[k + 2] = t.c.b * 0.2 * fade;
      col[k + 3] = t.c.r * fade; col[k + 4] = t.c.g * fade; col[k + 5] = t.c.b * fade;
      n++;
    }
    this.tracers = keep;
    this.tracerLines.geometry.setDrawRange(0, n * 2);
    this.tracerLines.geometry.attributes.position.needsUpdate = true;
    this.tracerLines.geometry.attributes.color.needsUpdate = true;

    // Sprites
    let w = 0;
    for (let i = 0; i < this.sprites.length; i++) {
      const sp = this.sprites[i];
      sp.t += dt;
      const f = sp.t / sp.dur;
      if (f >= 1) { sp.s.visible = false; continue; }
      sp.s.scale.setScalar(sp.s0 + (sp.s1 - sp.s0) * f);
      sp.s.material.opacity = sp.op * (1 - f);
      this.sprites[w++] = sp;
    }
    this.sprites.length = w;

    if (this.lightT > 0) {
      this.lightT -= dt;
      if (this.lightT <= 0) { this.light.intensity = 0; this.light.distance = 14; }
    }

    w = 0;
    for (const b of this.beams) {
      b.t += dt;
      const f = b.t / b.dur;
      if (f >= 1) {
        this.game.scene.remove(b.m);
        b.m.material.dispose();
        continue;
      }
      b.m.material.opacity = 0.6 * (1 - f);
      b.m.scale.set(1 - f * 0.7, 1, 1 - f * 0.7);
      this.beams[w++] = b;
    }
    this.beams.length = w;
  }
}
