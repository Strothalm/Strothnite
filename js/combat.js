// Schießen, Spitzhacke, Raketen, Schaden
import * as THREE from 'three';
import { WEAPONS, PICKAXE, MATERIALS, MAX_MATS } from './config.js';
import { raySphere, rayAABB } from './util.js';
import { F_SHOTS, F_SOLID } from './physics.js';
import { tex } from './textures.js';

const _u = new THREE.Vector3();
const _v = new THREE.Vector3();

function spreadDir(dx, dy, dz, spread, out) {
  if (spread <= 0) return out.set(dx, dy, dz);
  // Basis senkrecht zur Richtung
  if (Math.abs(dy) < 0.9) _u.set(-dz, 0, dx).normalize();
  else _u.set(1, 0, 0);
  _v.set(dy * _u.z - dz * _u.y, dz * _u.x - dx * _u.z, dx * _u.y - dy * _u.x).normalize();
  const r = spread * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  return out.set(dx + _u.x * ca + _v.x * sa, dy + _u.y * ca + _v.y * sa, dz + _u.z * ca + _v.z * sa).normalize();
}

export function falloff(def, d) {
  const [a, b, m] = def.falloff;
  if (d <= a) return 1;
  if (d >= b) return m;
  return 1 - (1 - m) * ((d - a) / (b - a));
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.rockets = [];
    this.dir = new THREE.Vector3();
    this.tmpList = [];
    this.rocketGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8).rotateX(Math.PI / 2);
    this.rocketMat = new THREE.MeshLambertMaterial({ color: 0x5f6b3a });
  }

  raycastChars(ox, oy, oz, dx, dy, dz, maxT, exclude) {
    let best = null, bestT = maxT, head = false;
    for (const ch of this.game.chars) {
      if (!ch.alive || ch === exclude || ch.mode === 'bus') continue;
      const p = ch.pos;
      if (raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + 1, p.z, 1.5) < 0) continue;
      const th = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + 1.68, p.z, 0.27);
      if (th >= 0 && th < bestT) { bestT = th; best = ch; head = true; }
      const tb = rayAABB(ox, oy, oz, dx, dy, dz, p.x - 0.34, p.y, p.z - 0.34, p.x + 0.34, p.y + 1.47, p.z + 0.34, bestT);
      if (tb >= 0 && tb < bestT) { bestT = tb; best = ch; head = false; }
    }
    return best ? { ch: best, t: bestT, head } : null;
  }

  raycastWorld(ox, oy, oz, dx, dy, dz, maxT) {
    const h = this.game.physics.raycast(ox, oy, oz, dx, dy, dz, maxT, F_SHOTS);
    let res = null;
    if (h) res = { t: h.t, owner: h.col.owner, nx: h.nx, ny: h.ny, nz: h.nz, terrain: false };
    const tt = this.game.world.raycastTerrain(ox, oy, oz, dx, dy, dz, res ? res.t : maxT);
    if (tt >= 0 && (!res || tt < res.t)) res = { t: tt, owner: null, nx: 0, ny: 1, nz: 0, terrain: true };
    return res;
  }

  // Ist die Sichtlinie zwischen zwei Punkten frei?
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return true;
    return !this.raycastWorld(ax, ay, az, dx / L, dy / L, dz / L, L - 0.2);
  }

  muzzleOf(ch, dx, dy, dz) {
    const rx = Math.cos(ch.yaw), rz = -Math.sin(ch.yaw);
    return new THREE.Vector3(ch.pos.x + rx * 0.34 + dx * 0.9, ch.pos.y + 1.42 + dy * 0.9, ch.pos.z + rz * 0.34 + dz * 0.9);
  }

  // aim: {ox,oy,oz,dx,dy,dz}
  tryFire(ch, aim, pressed) {
    const it = ch.currentWeapon();
    if (!it || ch.fireCd > 0 || ch.using) return false;
    const def = WEAPONS[it.id];
    if (!def.auto && !pressed) return false;
    if (ch.reloading) {
      if (def.perShell && it.mag > 0) ch.cancelReload();
      else return false;
    }
    if (it.mag <= 0) {
      if (!ch.startReload() && ch.isPlayer && pressed) this.game.audio.play('empty');
      return false;
    }
    it.mag--;
    ch.fireCd = 1 / def.rate;
    ch.emote = false;
    const moving = Math.hypot(ch.vel.x, ch.vel.z) > 1;
    let spread = (ch.ads ? def.adsSpread : def.spread) + ch.bloom;
    if (moving) spread *= 1.35;
    if (!ch.onGround) spread *= 1.6;
    if (def.scope && ch.ads) spread = 0;
    ch.bloom = Math.min(def.maxBloom, ch.bloom + def.bloom);
    ch.recoil = 1;
    const muzzle = this.muzzleOf(ch, aim.dx, aim.dy, aim.dz);
    const big = it.id === 'shotgun' || it.id === 'sniper' || it.id === 'rocket';
    this.game.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, big);
    this.game.audio.play(def.sound, ch.isPlayer ? null : ch.pos);
    if (def.projectile) {
      spreadDir(aim.dx, aim.dy, aim.dz, spread, this.dir);
      // Rakete in Richtung des Zielpunkts lenken
      const tgt = this.aimPoint(ch, aim, def.range);
      const vx = tgt.x - muzzle.x, vy = tgt.y - muzzle.y, vz = tgt.z - muzzle.z;
      const L = Math.hypot(vx, vy, vz) || 1;
      this.spawnRocket(ch, muzzle, vx / L, vy / L, vz / L, def, it.rarity);
    } else {
      const pellets = def.pellets || 1;
      const per = def.dmg[it.rarity] / pellets;
      const charHits = new Map();
      const objHits = new Map();
      for (let i = 0; i < pellets; i++) {
        spreadDir(aim.dx, aim.dy, aim.dz, spread, this.dir);
        this.hitscan(ch, aim, this.dir, muzzle, def, per, charHits, objHits);
      }
      for (const [target, h] of charHits) this.damageChar(target, Math.round(h.dmg), ch, def.name, h.head, h.point);
      for (const [owner, h] of objHits) this.damageOwner(owner, h.dmg, ch, h.point, false);
    }
    if (it.mag <= 0 && ch.ammo[def.ammo] > 0) {
      ch.fireCd = Math.max(ch.fireCd, 0.15);
      setTimeout(() => { if (ch.alive && ch.currentWeapon() === it) ch.startReload(); }, 150);
    }
    return true;
  }

  aimPoint(ch, aim, range) {
    const w = this.raycastWorld(aim.ox, aim.oy, aim.oz, aim.dx, aim.dy, aim.dz, range);
    const c = this.raycastChars(aim.ox, aim.oy, aim.oz, aim.dx, aim.dy, aim.dz, w ? w.t : range, ch);
    const t = c ? c.t : w ? w.t : range;
    return new THREE.Vector3(aim.ox + aim.dx * t, aim.oy + aim.dy * t, aim.oz + aim.dz * t);
  }

  hitscan(ch, aim, d, muzzle, def, dmg, charHits, objHits) {
    const { ox, oy, oz } = aim;
    let w = this.raycastWorld(ox, oy, oz, d.x, d.y, d.z, def.range);
    let c = this.raycastChars(ox, oy, oz, d.x, d.y, d.z, w ? w.t : def.range, ch);
    let t = c ? c.t : w ? w.t : def.range;
    let hx = ox + d.x * t, hy = oy + d.y * t, hz = oz + d.z * t;
    let dist = t;
    if (ch.isPlayer) {
      // Hindernisse zwischen Spieler und Ziel prüfen (Kamera sitzt hinter der Schulter)
      const ex = ch.pos.x, ey = ch.pos.y + 1.45, ez = ch.pos.z;
      const vx = hx - ex, vy = hy - ey, vz = hz - ez;
      const L = Math.hypot(vx, vy, vz);
      if (L > 0.6) {
        const ux = vx / L, uy = vy / L, uz = vz / L;
        const w2 = this.raycastWorld(ex, ey, ez, ux, uy, uz, L - 0.35);
        if (w2) {
          c = null;
          w = w2;
          hx = ex + ux * w2.t; hy = ey + uy * w2.t; hz = ez + uz * w2.t;
          dist = w2.t;
        } else dist = L;
      }
    }
    this.game.effects.tracer(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz, ch.isPlayer ? 0xfff0b0 : 0xffd090);
    const f = falloff(def, dist);
    if (c) {
      const pt = new THREE.Vector3(hx, hy, hz);
      const h = charHits.get(c.ch) || { dmg: 0, head: false, point: pt };
      h.dmg += dmg * f * (c.head ? def.head : 1);
      h.head = h.head || c.head;
      charHits.set(c.ch, h);
    } else if (w) {
      const owner = w.owner;
      const kind = owner ? owner.mat : 'dirt';
      this.game.effects.impact(hx + w.nx * 0.05, hy + w.ny * 0.05, hz + w.nz * 0.05, kind);
      if (owner) {
        const h = objHits.get(owner) || { dmg: 0, point: new THREE.Vector3(hx, hy, hz) };
        h.dmg += dmg * f;
        objHits.set(owner, h);
      }
    }
  }

  damageChar(target, dmg, attacker, weaponName, head, point) {
    // Bots untereinander etwas weniger tödlich, damit mehr Gegner für den Spieler übrig bleiben
    if (attacker && !attacker.isPlayer && !target.isPlayer && attacker !== target) dmg = Math.max(1, Math.round(dmg * 0.55));
    const res = target.takeDamage(dmg, attacker, weaponName, { head });
    if (!res) return null;
    this.game.effects.hitSparks(point.x, point.y, point.z, res.shield > 0);
    if (attacker && attacker.isPlayer) {
      const kind = head ? 'head' : res.shield > 0 ? 'shield' : 'health';
      this.game.hud.damageNumber(point, dmg, kind);
      this.game.hud.hitmarker(head, res.killed);
      this.game.audio.play(head ? 'headshot' : 'hit');
      if (res.broke) this.game.audio.play('shieldBreak');
    }
    return res;
  }

  damageOwner(owner, dmg, attacker, point, isPickaxe) {
    if (!owner || !owner.alive) return false;
    const hpBefore = owner.hp;
    let destroyed = false;
    if (owner.kind === 'piece') destroyed = this.game.builds.damagePiece(owner, dmg);
    else if (owner.kind === 'env') destroyed = this.game.world.damageEnv(owner, dmg);
    if (isPickaxe && owner.harvestable && attacker) {
      const amount = Math.max(1, Math.round(Math.min(dmg, Math.max(0, hpBefore)) * MATERIALS[owner.mat].yield));
      const before = attacker.mats[owner.mat];
      attacker.mats[owner.mat] = Math.min(MAX_MATS, before + amount);
      if (attacker.isPlayer) this.game.hud.matGain(owner.mat, attacker.mats[owner.mat] - before);
    }
    if (attacker && attacker.isPlayer) {
      this.game.hud.damageNumber(point, Math.round(dmg), 'struct');
      if (owner.kind === 'piece' || owner.kind === 'env') this.game.hud.showObjHp(owner);
    }
    return destroyed;
  }

  swingPickaxe(ch, aim) {
    if (ch.swingCd > 0 || ch.using) return false;
    ch.swingCd = PICKAXE.cooldown;
    ch.swingT = 0;
    ch.emote = false;
    const { ox, oy, oz, dx, dy, dz } = aim;
    const range = PICKAXE.range + (aim.extra || 0);
    const w = this.raycastWorld(ox, oy, oz, dx, dy, dz, range);
    const c = aim.noChars ? null : this.raycastChars(ox, oy, oz, dx, dy, dz, w ? w.t : range + 0.3, ch);
    const pos = ch.isPlayer ? null : ch.pos;
    if (c) {
      const t = c.t;
      const pt = new THREE.Vector3(ox + dx * t, oy + dy * t, oz + dz * t);
      this.damageChar(c.ch, PICKAXE.dmgChar, ch, PICKAXE.name, false, pt);
      this.game.audio.play('pickaxe', pos);
      return true;
    }
    if (w) {
      const pt = new THREE.Vector3(ox + dx * w.t, oy + dy * w.t, oz + dz * w.t);
      if (w.owner) {
        let crit = false;
        if (ch.isPlayer) crit = this.game.player.checkWeakPoint(w.owner, pt, w);
        else crit = Math.random() < 0.3;
        const dmg = PICKAXE.dmgObj * (crit ? 2 : 1);
        this.game.effects.impact(pt.x + w.nx * 0.1, pt.y + w.ny * 0.1, pt.z + w.nz * 0.1, w.owner.mat);
        this.damageOwner(w.owner, dmg, ch, pt, true);
        this.game.audio.play(crit ? 'crit' : 'pickaxe', pos);
      } else {
        this.game.effects.impact(pt.x, pt.y + 0.05, pt.z, 'dirt');
        this.game.audio.play('pickaxeDirt', pos);
      }
      return true;
    }
    this.game.audio.play('swing', pos);
    return true;
  }

  spawnRocket(ch, muzzle, dx, dy, dz, def, rarity) {
    const m = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(0.9);
    glow.position.z = -0.4;
    m.add(glow);
    m.position.copy(muzzle);
    m.lookAt(muzzle.x + dx, muzzle.y + dy, muzzle.z + dz);
    this.game.scene.add(m);
    this.rockets.push({ owner: ch, x: muzzle.x, y: muzzle.y, z: muzzle.z, dx, dy, dz, speed: def.speed, life: 6, def, rarity, mesh: m, age: 0, trail: 0 });
  }

  explode(x, y, z, owner, def, rarity) {
    const R = def.splash;
    this.game.effects.explosion(x, y, z, R);
    this.game.audio.play('explosion', { x, y, z });
    if (this.game.player) this.game.player.shake(Math.max(0, 1 - Math.hypot(x - this.game.camera.position.x, y - this.game.camera.position.y, z - this.game.camera.position.z) / 40) * 0.8);
    const base = def.dmg[rarity];
    for (const ch of this.game.chars) {
      if (!ch.alive || ch.mode === 'bus') continue;
      const d = Math.hypot(ch.pos.x - x, ch.pos.y + 1 - y, ch.pos.z - z);
      if (d > R) continue;
      let dmg = base * (1 - 0.6 * (d / R));
      if (ch === owner) dmg *= 0.5;
      const pt = new THREE.Vector3(ch.pos.x, ch.pos.y + 1.2, ch.pos.z);
      this.damageChar(ch, Math.round(dmg), owner, def.name, false, pt);
    }
    const list = this.game.physics.query(x - R, z - R, x + R, z + R, F_SHOTS | F_SOLID, this.tmpList);
    const owners = new Set();
    for (const c of list) {
      if (!c.owner || !c.owner.alive) continue;
      const cx = Math.max(c.minX, Math.min(x, c.maxX)), cy = Math.max(c.minY, Math.min(y, c.maxY)), cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const d = Math.hypot(cx - x, cy - y, cz - z);
      if (d <= R) owners.add(c.owner);
    }
    for (const o of owners) {
      if (o.kind === 'piece') this.game.builds.damagePiece(o, def.structDmg);
      else if (o.kind === 'env') this.game.world.damageEnv(o, def.structDmg * 0.6);
    }
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.rockets.length; i++) {
      const r = this.rockets[i];
      r.age += dt;
      r.life -= dt;
      const step = r.speed * dt;
      const wh = this.raycastWorld(r.x, r.y, r.z, r.dx, r.dy, r.dz, step);
      const ch = this.raycastChars(r.x, r.y, r.z, r.dx, r.dy, r.dz, wh ? wh.t : step, r.age < 0.15 ? r.owner : null);
      if (ch || wh || r.life <= 0) {
        const t = ch ? ch.t : wh ? wh.t : 0;
        this.explode(r.x + r.dx * t, r.y + r.dy * t, r.z + r.dz * t, r.owner, r.def, r.rarity);
        this.game.scene.remove(r.mesh);
        r.mesh.children[0].material.dispose();
        continue;
      }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step;
      r.mesh.position.set(r.x, r.y, r.z);
      r.trail -= dt;
      if (r.trail <= 0) {
        r.trail = 0.03;
        this.game.effects.smoke(r.x - r.dx * 0.4, r.y - r.dy * 0.4, r.z - r.dz * 0.4, 1.0, 0.7, 0xcccccc);
      }
      this.rockets[w++] = r;
    }
    this.rockets.length = w;
  }
}
