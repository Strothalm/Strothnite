// Beute: Truhen, Munitionskisten, Gegenstände am Boden
import * as THREE from 'three';
import {
  WEAPONS, RARITIES, RARITY_WEIGHTS, WEAPON_WEIGHTS, CONSUMABLES, CONSUMABLE_WEIGHTS, AMMO, MATERIALS,
} from './config.js';
import { weightedPick, clamp, pick } from './util.js';
import { makeItemMesh, boxGeo, lam } from './models.js';
import { tex } from './textures.js';

export const makeWeapon = (id, rarity) => ({ kind: 'weapon', id, rarity, mag: WEAPONS[id].mag, count: 1 });
export const makeConsumable = (id, count) => ({ kind: 'consumable', id, count: count ?? CONSUMABLES[id].drop });
export const makeAmmo = (type, count) => ({ kind: 'ammo', type, count: count ?? AMMO[type].drop });
export const makeMats = (type, count) => ({ kind: 'mats', type, count });

export function itemName(it) {
  if (it.kind === 'weapon') return WEAPONS[it.id].name;
  if (it.kind === 'consumable') return CONSUMABLES[it.id].name;
  if (it.kind === 'ammo') return AMMO[it.type].name;
  return MATERIALS[it.type].name;
}

export function itemRarity(it) {
  if (it.kind === 'weapon') return it.rarity;
  if (it.kind === 'consumable') return CONSUMABLES[it.id].rarity;
  return 0;
}

export function rollWeapon(r, bonus = 0) {
  const id = weightedPick(r, WEAPON_WEIGHTS);
  const def = WEAPONS[id];
  let rar = weightedPick(r, RARITY_WEIGHTS.map((w, i) => [i, w * (1 + i * 0.7 * bonus)]));
  rar = clamp(rar, def.rarities[0], def.rarities[1]);
  return makeWeapon(id, rar);
}

const glowMats = new Map();
function glowMat(rarity) {
  if (!glowMats.has(rarity)) {
    glowMats.set(rarity, new THREE.MeshBasicMaterial({
      map: tex('glow'), color: RARITIES[rarity].color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  }
  return glowMats.get(rarity);
}
const beamMats = new Map();
function beamMat(rarity) {
  if (!beamMats.has(rarity)) {
    beamMats.set(rarity, new THREE.MeshBasicMaterial({
      color: RARITIES[rarity].color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  }
  return beamMats.get(rarity);
}

export class LootSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.chests = [];
    this.discGeo = new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(0, 1.2, 0);
    this.goldMat = new THREE.MeshLambertMaterial({ map: tex('gold'), emissive: 0x3a2800 });
    this.trimMat = lam('#7a4f12');
    this.ammoBoxMat = lam('#4f6a3a');
    this.pickupT = 0;
    this.lodT = 0;
    this.time = 0;
  }

  populate(spots) {
    const r = this.game.rand;
    for (const s of spots) {
      if (s.type === 'chest') this.addChest(s.x, s.y, s.z, s.yaw, false);
      else if (s.type === 'ammo') this.addChest(s.x, s.y, s.z, s.yaw, true);
      else {
        const x = r();
        if (x < 0.45) {
          const w = rollWeapon(r, 0);
          this.spawn(w, s.x, s.y, s.z);
          this.spawn(makeAmmo(WEAPONS[w.id].ammo), s.x + 0.6, s.y, s.z + 0.3);
        } else if (x < 0.75) {
          this.spawn(makeConsumable(weightedPick(r, CONSUMABLE_WEIGHTS)), s.x, s.y, s.z);
        } else {
          this.spawn(makeAmmo(pick(r, ['light', 'medium', 'medium', 'heavy', 'shells', 'shells'])), s.x, s.y, s.z);
        }
      }
    }
  }

  addChest(x, y, z, yaw, ammoBox) {
    const g = new THREE.Group();
    const lid = new THREE.Group();
    if (ammoBox) {
      const b = new THREE.Mesh(boxGeo(0.9, 0.42, 0.5), this.ammoBoxMat);
      b.position.y = 0.21;
      g.add(b);
      const l = new THREE.Mesh(boxGeo(0.92, 0.1, 0.52), lam('#3d5230'));
      l.position.set(0, 0, 0.26);
      lid.add(l);
      lid.position.set(0, 0.46, -0.26);
      const st = new THREE.Mesh(boxGeo(0.92, 0.06, 0.52), lam('#e8c21a'));
      st.position.y = 0.3;
      g.add(st);
    } else {
      const b = new THREE.Mesh(boxGeo(1.05, 0.6, 0.62), this.goldMat);
      b.position.y = 0.3;
      g.add(b);
      const t = new THREE.Mesh(boxGeo(1.08, 0.08, 0.65), this.trimMat);
      t.position.y = 0.58;
      g.add(t);
      const l = new THREE.Mesh(boxGeo(1.07, 0.26, 0.64), this.goldMat);
      l.position.set(0, 0.13, 0.32);
      lid.add(l);
      lid.position.set(0, 0.62, -0.32);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: 0xffd25a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
      glow.scale.set(2.6, 2.0, 1);
      glow.position.y = 0.7;
      g.add(glow);
      g.userData.glow = glow;
    }
    g.add(lid);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.game.scene.add(g);
    const c = { x, y, z, yaw, group: g, lid, opened: false, ammoBox, openT: 0, claimedBy: null };
    this.chests.push(c);
    return c;
  }

  spawn(item, x, y, z, vx = 0, vy = 0, vz = 0) {
    const mesh = makeItemMesh(item);
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(mesh);
    mesh.scale.setScalar(item.kind === 'weapon' ? 1.25 : 1.5);
    if (item.kind === 'weapon') mesh.rotation.y = Math.PI / 2;
    g.add(inner);
    const rar = itemRarity(item);
    if (item.kind === 'weapon' || item.kind === 'consumable') {
      const disc = new THREE.Mesh(this.discGeo, glowMat(rar));
      disc.position.y = 0.03;
      g.add(disc);
      if (rar >= 1) g.add(new THREE.Mesh(this.beamGeo, beamMat(rar)));
    }
    g.position.set(x, y, z);
    this.game.scene.add(g);
    const gi = { item, group: g, inner, x, y, z, vx, vy, vz, landed: vx === 0 && vy === 0 && vz === 0, phase: Math.random() * 6, alive: true, age: 0 };
    this.items.push(gi);
    return gi;
  }

  removeItem(gi) {
    gi.alive = false;
    this.game.scene.remove(gi.group);
  }

  burst(items, x, y, z) {
    const n = items.length;
    items.forEach((it, i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const s = 1.8 + Math.random() * 1.6;
      this.spawn(it, x, y + 0.6, z, Math.cos(a) * s, 4 + Math.random() * 2, Math.sin(a) * s);
    });
  }

  openChest(c, ch) {
    if (c.opened) return;
    c.opened = true;
    c.openT = 0.001;
    if (c.group.userData.glow) c.group.userData.glow.visible = false;
    const r = this.game.rand;
    const items = [];
    if (c.ammoBox) {
      items.push(makeAmmo(pick(r, ['light', 'medium', 'heavy', 'shells'])), makeAmmo(pick(r, ['light', 'medium', 'shells', 'rockets'])));
    } else {
      const w = rollWeapon(r, 1);
      items.push(w, makeAmmo(WEAPONS[w.id].ammo));
      items.push(makeConsumable(weightedPick(r, CONSUMABLE_WEIGHTS)));
      items.push(makeMats(pick(r, ['wood', 'wood', 'stone', 'metal']), 30));
      if (r() < 0.35) items.push(makeAmmo(pick(r, ['light', 'medium', 'shells'])));
    }
    this.burst(items, c.x, c.y, c.z);
    this.game.audio.play(c.ammoBox ? 'ammoBox' : 'chestOpen', ch && ch.isPlayer ? null : c);
    this.game.effects.burst(c.x, c.y + 0.8, c.z, 16, c.ammoBox ? ['#e8c21a', '#ffffff'] : ['#ffd25a', '#fff3b0', '#ffffff'], 4, 0.8, 0.07, 0.3, 2);
  }

  // Gegenstand aufnehmen (mit Tausch bei vollem Inventar)
  pickup(gi, ch) {
    if (!gi.alive) return false;
    const it = gi.item;
    if (it.kind === 'ammo' || it.kind === 'mats') {
      const done = ch.addItem(it);
      if (done) this.removeItem(gi);
      return done;
    }
    if (ch.addItem(it)) {
      this.removeItem(gi);
      if (ch.isPlayer) this.game.audio.play('pickup');
      return true;
    }
    const idx = ch.slot - 1;
    if (idx < 0) {
      if (ch.isPlayer) this.game.hud.toast('Inventar voll – wähle einen Platz zum Tauschen');
      return false;
    }
    const old = ch.removeSlotItem(idx);
    ch.inventory[idx] = { ...it };
    this.removeItem(gi);
    if (old) this.spawn(old, ch.pos.x, ch.pos.y + 0.2, ch.pos.z, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
    if (ch.isPlayer) this.game.audio.play('pickup');
    return true;
  }

  dropAll(ch) {
    const items = [];
    for (let i = 0; i < 5; i++) if (ch.inventory[i]) items.push(ch.inventory[i]);
    for (const t in ch.ammo) {
      let n = ch.ammo[t];
      if (n > 0) items.push(makeAmmo(t, n));
    }
    for (const m in ch.mats) {
      if (ch.mats[m] > 0) items.push(makeMats(m, ch.mats[m]));
    }
    ch.inventory = [null, null, null, null, null];
    for (const t in ch.ammo) ch.ammo[t] = 0;
    for (const m in ch.mats) ch.mats[m] = 0;
    if (items.length) this.burst(items, ch.pos.x, Math.max(ch.pos.y, this.game.world.groundAt(ch.pos.x, ch.pos.z)), ch.pos.z);
  }

  // Bestes interaktives Objekt vor der Figur
  findInteractable(ch, dx, dz) {
    let best = null, bestS = Infinity;
    const px = ch.pos.x, py = ch.pos.y, pz = ch.pos.z;
    for (const c of this.chests) {
      if (c.opened) continue;
      const ex = c.x - px, ez = c.z - pz, ey = c.y - py;
      if (Math.abs(ey) > 2 || Math.abs(ex) > 3.2 || Math.abs(ez) > 3.2) continue;
      const d = Math.hypot(ex, ez);
      if (d > 3) continue;
      const dot = d > 0.01 ? (ex * dx + ez * dz) / d : 1;
      const s = d - dot * 1.5;
      if (s < bestS) { bestS = s; best = { type: 'chest', obj: c }; }
    }
    for (const gi of this.items) {
      if (!gi.alive || !gi.landed) continue;
      if (gi.item.kind === 'ammo' || gi.item.kind === 'mats') continue;
      const ex = gi.x - px, ez = gi.z - pz, ey = gi.y - py;
      if (Math.abs(ey) > 2 || Math.abs(ex) > 3 || Math.abs(ez) > 3) continue;
      const d = Math.hypot(ex, ez);
      if (d > 2.6) continue;
      const dot = d > 0.01 ? (ex * dx + ez * dz) / d : 1;
      const s = d - dot * 1.5;
      if (s < bestS) { bestS = s; best = { type: 'item', obj: gi }; }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    const phys = this.game.physics;
    let w = 0;
    for (let i = 0; i < this.items.length; i++) {
      const gi = this.items[i];
      if (!gi.alive) continue;
      this.items[w++] = gi;
      gi.age += dt;
      if (!gi.landed) {
        gi.vy -= 20 * dt;
        gi.x += gi.vx * dt;
        gi.z += gi.vz * dt;
        gi.y += gi.vy * dt;
        const g = phys.groundHeightAt(gi.x, gi.z, gi.y + 0.4);
        if (gi.y <= g && gi.vy < 0) {
          gi.y = g;
          gi.landed = true;
        }
        gi.group.position.set(gi.x, gi.y, gi.z);
      }
      if (gi.group.visible) {
        gi.inner.position.y = 0.45 + Math.sin(this.time * 2.5 + gi.phase) * 0.08;
        gi.inner.rotation.y += dt * 1.2;
      }
    }
    this.items.length = w;

    for (const c of this.chests) {
      if (c.openT > 0 && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 4);
        c.lid.rotation.x = -c.openT * 1.9;
      }
      if (!c.opened && c.group.visible && c.group.userData.glow) {
        const gl = c.group.userData.glow;
        gl.material.opacity = 0.45 + Math.sin(this.time * 4 + c.x) * 0.15;
        if (Math.random() < dt * 1.5) {
          this.game.effects.particle(c.x + (Math.random() - 0.5) * 1.2, c.y + 0.4 + Math.random() * 0.6, c.z + (Math.random() - 0.5) * 1.2, 0, 1.2, 0, 0.8, 0.06, '#fff3b0', 0);
        }
      }
    }

    // automatisches Aufheben von Munition und Material
    this.pickupT -= dt;
    if (this.pickupT <= 0) {
      this.pickupT = 0.1;
      for (const ch of this.game.chars) {
        if (!ch.alive || ch.mode !== 'ground') continue;
        for (const gi of this.items) {
          if (!gi.alive || !gi.landed || gi.age < 0.4) continue;
          const k = gi.item.kind;
          if (k !== 'ammo' && k !== 'mats') continue;
          if (Math.abs(gi.x - ch.pos.x) > 1.4 || Math.abs(gi.z - ch.pos.z) > 1.4 || Math.abs(gi.y - ch.pos.y) > 1.6) continue;
          const before = gi.item.count;
          const done = ch.addItem(gi.item);
          if (done) this.removeItem(gi);
          if (ch.isPlayer && (done || gi.item.count !== before)) this.game.audio.play('pickupSmall');
        }
      }
    }

    // Sichtbarkeit nach Entfernung
    this.lodT -= dt;
    if (this.lodT <= 0) {
      this.lodT = 0.4;
      const cam = this.game.camera.position;
      for (const gi of this.items) {
        if (!gi.alive) continue;
        const d = Math.abs(gi.x - cam.x) + Math.abs(gi.z - cam.z);
        gi.group.visible = d < 170;
      }
      for (const c of this.chests) {
        const d = Math.abs(c.x - cam.x) + Math.abs(c.z - cam.z);
        c.group.visible = d < 220;
      }
    }
  }
}
