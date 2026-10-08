// Bot-KI: landen, plündern, kämpfen, heilen, bauen, dem Sturm ausweichen
import { WEAPONS, DIFFICULTY, MAT_ORDER } from './config.js';
import { wrapAngle, clamp } from './util.js';

const WEAPON_SCORE = { ar: 5, shotgun: 5, smg: 4, sniper: 3, pistol: 2, rocket: 4 };

export class BotBrain {
  constructor(game, ch, diff) {
    this.game = game;
    this.ch = ch;
    ch.brain = this;
    this.d = DIFFICULTY[diff] || DIFFICULTY.mittel;
    this.state = 'land';
    this.enemy = null;
    this.enemyVisible = false;
    this.lastSeen = null;
    this.lostT = 0;
    this.reactT = 0;
    this.thinkT = Math.random() * 0.3;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.checkT = 0;
    this.detour = null;
    this.target = null;
    this.goal = null; // {type, obj}
    this.goalT = 0;
    this.buildCd = 0;
    this.roamT = 0;
    this.ignore = new Set();
    this.aggro = 0.35 + Math.random() * 0.65; // Kampflust: wie weit entfernte Gegner angegriffen werden
    this.chooseDrop();
  }

  chooseDrop() {
    const g = this.game;
    const r = Math.random();
    let x, z;
    if (r < 0.62) {
      const p = g.world.pois[Math.floor(Math.random() * g.world.pois.length)];
      const a = Math.random() * Math.PI * 2, d = Math.random() * (p.r + 10);
      x = p.x + Math.cos(a) * d;
      z = p.z + Math.sin(a) * d;
    } else {
      const q = g.world.landPoint(280);
      x = q.x; z = q.z;
    }
    this.drop = { x, z };
    this.jumpAt = g.bus.closestT(x, z) + (Math.random() - 0.5) * 0.06;
  }

  onDamaged(attacker, opts) {
    if (!attacker || attacker === this.ch || opts.storm) return;
    if (!this.enemy || Math.random() < 0.6) {
      if (this.enemy !== attacker) this.reactT = this.d.reaction * 0.6;
      this.enemy = attacker;
      this.lastSeen = { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z };
      this.lostT = 0;
    }
    const ch = this.ch;
    if (this.buildCd <= 0 && ch.mode === 'ground' && Math.random() < this.d.buildChance) {
      this.buildCd = 2.5 + Math.random() * 2;
      const mat = this.bestMat();
      if (mat) {
        const yaw = Math.atan2(-(attacker.pos.x - ch.pos.x), -(attacker.pos.z - ch.pos.z));
        const look = { yaw, pitch: 0 };
        const b = this.game.builds;
        b.tryPlace(ch, b.computeTarget(ch, 'wall', look), mat);
        if (Math.random() < 0.4) b.tryPlace(ch, b.computeTarget(ch, 'ramp', look), mat);
      }
    }
  }

  bestMat() {
    let best = null, n = 9;
    for (const m of MAT_ORDER) if (this.ch.mats[m] > n) { n = this.ch.mats[m]; best = m; }
    return best;
  }

  usableWeapons() {
    const ch = this.ch;
    const out = [];
    ch.inventory.forEach((it, i) => {
      if (it && it.kind === 'weapon') {
        const def = WEAPONS[it.id];
        if (it.mag > 0 || ch.ammo[def.ammo] > 0) out.push({ it, slot: i + 1, def });
      }
    });
    return out;
  }

  pickWeapon(dist) {
    const list = this.usableWeapons();
    if (!list.length) return null;
    let best = null, bestS = -Infinity;
    for (const w of list) {
      const [a, b] = w.def.pref;
      let s = WEAPON_SCORE[w.it.id] + w.it.rarity * 0.6;
      if (dist < a) s -= (a - dist) * 0.3;
      if (dist > b) s -= (dist - b) * 0.08;
      if (dist >= a && dist <= b) s += 3;
      if (w.it.mag === 0) s -= 2;
      if (s > bestS) { bestS = s; best = w; }
    }
    return best;
  }

  findEnemy() {
    const ch = this.ch, g = this.game;
    const view = this.d.view * (0.45 + 0.55 * this.aggro);
    const cands = [];
    const fx = -Math.sin(ch.yaw), fz = -Math.cos(ch.yaw);
    for (const o of g.chars) {
      if (o === ch || !o.alive || o.mode === 'bus') continue;
      const dx = o.pos.x - ch.pos.x, dz = o.pos.z - ch.pos.z, dy = o.pos.y - ch.pos.y;
      const d = Math.hypot(dx, dz, dy * 0.5);
      if (d > view) continue;
      const dot = d > 0.1 ? (dx * fx + dz * fz) / d : 1;
      const recent = ch.lastAttacker === o && g.time - ch.lastDamageT < 3;
      if (!recent && d > 14 && dot < -0.2) continue;
      cands.push([d, o]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const o = cands[i][1];
      if (g.combat.lineOfSight(ch.pos.x, ch.pos.y + 1.6, ch.pos.z, o.pos.x, o.pos.y + 1.2, o.pos.z)) return o;
    }
    return null;
  }

  wantsItem(it) {
    const ch = this.ch;
    if (it.kind === 'ammo' || it.kind === 'mats') return true;
    if (ch.freeSlot() >= 0) return true;
    if (it.kind === 'consumable') return ch.inventory.some((x) => x && x.kind === 'consumable' && x.id === it.id);
    if (it.kind === 'weapon') {
      let worst = Infinity;
      for (const x of ch.inventory) if (x && x.kind === 'weapon') worst = Math.min(worst, x.rarity + WEAPON_SCORE[x.id] * 0.3);
      return it.rarity + WEAPON_SCORE[it.id] * 0.3 > worst + 0.5;
    }
    return false;
  }

  grabItem(gi) {
    const ch = this.ch;
    const it = gi.item;
    if ((it.kind === 'weapon' || it.kind === 'consumable') && ch.freeSlot() < 0) {
      const stacks = it.kind === 'consumable' && ch.inventory.some((x) => x && x.kind === 'consumable' && x.id === it.id);
      if (!stacks) {
        // schlechteste Waffe ersetzen
        let wi = -1, worst = Infinity;
        ch.inventory.forEach((x, i) => {
          if (x && x.kind === 'weapon') {
            const s = x.rarity + WEAPON_SCORE[x.id] * 0.3;
            if (s < worst) { worst = s; wi = i; }
          }
        });
        if (wi < 0) return;
        ch.selectSlot(wi + 1);
      }
    }
    this.game.loot.pickup(gi, ch);
  }

  findGoal() {
    const ch = this.ch, g = this.game;
    const needWeapon = !this.usableWeapons().length;
    let best = null, bestD = needWeapon ? 80 : 40;
    for (const c of g.loot.chests) {
      if (c.opened || this.ignore.has(c) || (c.claimedBy && c.claimedBy !== ch && c.claimedBy.alive)) continue;
      const dy = Math.abs(c.y - ch.pos.y);
      if (dy > 2.2) continue;
      const d = Math.hypot(c.x - ch.pos.x, c.z - ch.pos.z) + dy * 3;
      if (d < bestD) { bestD = d; best = { type: 'chest', obj: c }; }
    }
    const lim = needWeapon ? 80 : 35;
    for (const gi of g.loot.items) {
      if (!gi.alive || !gi.landed || this.ignore.has(gi)) continue;
      const dx = gi.x - ch.pos.x, dz = gi.z - ch.pos.z;
      if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
      if (!this.wantsItem(gi.item)) continue;
      const dy = Math.abs(gi.y - ch.pos.y);
      if (dy > 2.2) continue;
      let d = Math.hypot(dx, dz) + dy * 3;
      if (gi.item.kind === 'weapon' && needWeapon) d *= 0.4;
      if (d < bestD) { bestD = d; best = { type: 'item', obj: gi }; }
    }
    if (!best && ch.mats.wood + ch.mats.stone + ch.mats.metal < 90) {
      let bd = 30;
      for (const o of g.world.envObjs) {
        if (!o.alive || o.type === 'car') continue;
        const dx = o.x - ch.pos.x, dz = o.z - ch.pos.z;
        if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; best = { type: 'harvest', obj: o }; }
      }
    }
    return best;
  }

  safePoint() {
    const st = this.game.storm;
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * Math.max(5, st.nr * 0.7);
    return { x: st.nx + Math.cos(a) * d, z: st.nz + Math.sin(a) * d };
  }

  think() {
    const ch = this.ch, g = this.game;
    const e = this.findEnemy();
    if (e) {
      if (this.enemy !== e) this.reactT = this.d.reaction * (0.7 + Math.random() * 0.6);
      this.enemy = e;
      this.enemyVisible = true;
      this.lostT = 0;
      this.lastSeen = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
    } else {
      this.enemyVisible = false;
      if (this.enemy) {
        this.lostT += 0.25;
        if (this.lostT > 5 || !this.enemy.alive) this.enemy = null;
      }
    }
    const armed = this.usableWeapons().length > 0;
    const st = g.storm;
    const outNow = st.distOutside(ch.pos.x, ch.pos.z) > -4;
    const dNext = Math.hypot(ch.pos.x - st.nx, ch.pos.z - st.nz);
    const urgentZone = (st.state === 'shrink' || st.timer < 35 || st.phase > 0) && dNext > st.nr * 0.85 && st.state !== 'done';
    const heals = ch.inventory.findIndex((it) => it && it.kind === 'consumable' && ch.canUse(it.id));

    const eDist = this.enemy ? Math.hypot(this.enemy.pos.x - ch.pos.x, this.enemy.pos.z - ch.pos.z) : Infinity;
    if (this.enemy && armed && (this.enemyVisible || this.lostT < 3) && !(outNow && st.dps >= 5)) this.state = 'fight';
    else if (outNow) {
      if (this.state !== 'zone' || !this.target) this.target = this.safePoint();
      this.state = 'zone';
    } else if (this.enemy && !armed && this.enemyVisible && eDist < 30 && this.enemy.hasUsableWeapon()) {
      this.state = 'flee';
      this.fleeFrom = { x: this.enemy.pos.x, z: this.enemy.pos.z };
    } else if (heals >= 0 && !this.enemyVisible && (ch.hp < 70 || ch.shield < 50)) {
      this.state = 'heal';
      this.healSlot = heals + 1;
    } else if (outNow || urgentZone) {
      if (this.state !== 'zone' || !this.target) this.target = this.safePoint();
      this.state = 'zone';
    } else {
      if (!this.goal || (this.goal.type === 'chest' && this.goal.obj.opened) || (this.goal.type === 'item' && !this.goal.obj.alive) || (this.goal.type === 'harvest' && !this.goal.obj.alive)) {
        if (this.goal && this.goal.type === 'chest') this.goal.obj.claimedBy = null;
        this.goal = this.findGoal();
        this.goalT = 0;
        if (this.goal && this.goal.type === 'chest') this.goal.obj.claimedBy = ch;
      }
      if (this.goal) this.state = 'loot';
      else {
        this.state = 'roam';
        if (!this.target || this.roamT <= 0) {
          const sp = this.safePoint();
          const d = Math.hypot(sp.x - ch.pos.x, sp.z - ch.pos.z);
          if (d > 70) {
            const f = 60 / d;
            sp.x = ch.pos.x + (sp.x - ch.pos.x) * f;
            sp.z = ch.pos.z + (sp.z - ch.pos.z) * f;
          }
          this.target = sp;
          this.roamT = 10 + Math.random() * 10;
        }
      }
    }
  }

  // Bewegung zu einem Punkt mit einfacher Hindernisbehandlung
  steer(tx, tz, dt, stopDist = 1.2) {
    const ch = this.ch;
    let dx = tx - ch.pos.x, dz = tz - ch.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < stopDist) return { x: 0, z: 0, d };
    dx /= d; dz /= d;
    if (this.detour) {
      this.detour.t -= dt;
      if (this.detour.t <= 0) this.detour = null;
      else { dx = this.detour.x; dz = this.detour.z; }
    }
    return { x: dx, z: dz, d };
  }

  checkStuck(dt, moving, ty) {
    const ch = this.ch;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    const moved = Math.hypot(ch.pos.x - this.lastX, ch.pos.z - this.lastZ);
    this.lastX = ch.pos.x;
    this.lastZ = ch.pos.z;
    if (!moving || moved > 0.8) { this.stuckT = 0; return; }
    this.stuckT += 0.5;
    if (this.stuckT >= 0.5) this.wantJump = true;
    if (this.stuckT >= 1.5) {
      // Hindernis vor uns abbauen oder Rampe bauen
      const fx = -Math.sin(ch.yaw), fz = -Math.cos(ch.yaw);
      const hit = this.game.combat.raycastWorld(ch.pos.x, ch.pos.y + 1.2, ch.pos.z, fx, 0, fz, 2.5);
      if (ty !== undefined && ty > ch.pos.y + 2.5 && this.bestMat() && Math.random() < 0.5) {
        const b = this.game.builds;
        b.tryPlace(ch, b.computeTarget(ch, 'ramp', { yaw: ch.yaw, pitch: 0 }), this.bestMat());
      } else if (hit && hit.owner && hit.owner.kind === 'piece') {
        this.breakT = 2.5;
      } else {
        const a = Math.random() < 0.5 ? 1 : -1;
        this.detour = { x: -fz * a, z: fx * a, t: 1.2 + Math.random() };
      }
      if (this.stuckT > 6 && this.goal) {
        this.ignore.add(this.goal.obj);
        if (this.goal.type === 'chest') this.goal.obj.claimedBy = null;
        this.goal = null;
        this.stuckT = 0;
      }
    }
  }

  faceTowards(yaw, pitch, dt) {
    const ch = this.ch;
    const rate = this.d.turn * dt;
    const dy = wrapAngle(yaw - ch.yaw);
    ch.yaw = wrapAngle(ch.yaw + clamp(dy, -rate, rate));
    ch.pitch += clamp(pitch - ch.pitch, -rate, rate);
    return Math.abs(dy);
  }

  update(dt) {
    const ch = this.ch, g = this.game;
    if (!ch.alive) return;
    if (ch.mode === 'bus') {
      if (g.bus.active && g.bus.t >= this.jumpAt) g.bus.drop(ch);
      return;
    }
    if (ch.mode === 'sky' || ch.mode === 'glide') {
      const dx = this.drop.x - ch.pos.x, dz = this.drop.z - ch.pos.z;
      const d = Math.hypot(dx, dz);
      let wx = 0, wz = 0;
      if (d > 2) {
        const f = Math.min(1, d / 25);
        wx = (dx / d) * f; wz = (dz / d) * f;
        ch.yaw = Math.atan2(-dx, -dz);
      }
      ch.pitch = d > 80 ? -0.8 : 0;
      ch.stepMovement(dt, wx, wz, false);
      return;
    }
    this.buildCd -= dt;
    this.roamT -= dt;
    this.ammoT = (this.ammoT ?? 15) - dt;
    if (this.ammoT <= 0) {
      this.ammoT = 20;
      for (const it of ch.inventory) {
        if (it && it.kind === 'weapon') {
          const def = WEAPONS[it.id];
          if (ch.ammo[def.ammo] < def.mag) ch.ammo[def.ammo] += def.mag;
        }
      }
    }
    this.reactT -= dt;
    this.thinkT -= dt;
    this.wantJump = false;
    if (this.thinkT <= 0) {
      this.thinkT = 0.22 + Math.random() * 0.1;
      this.think();
    }
    ch.sprint = false;
    ch.ads = false;
    let wish = { x: 0, z: 0 };
    let ty;

    // Wand vor uns abbauen
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (ch.slot !== 0) ch.selectSlot(0);
      const fx = -Math.sin(ch.yaw), fz = -Math.cos(ch.yaw);
      g.combat.swingPickaxe(ch, { ox: ch.pos.x, oy: ch.pos.y + 1.2, oz: ch.pos.z, dx: fx, dy: 0, dz: fz, noChars: true });
      const hit = g.combat.raycastWorld(ch.pos.x, ch.pos.y + 1.2, ch.pos.z, fx, 0, fz, 2.6);
      if (!hit || !hit.owner) this.breakT = 0;
      ch.stepMovement(dt, 0, 0, false);
      return;
    }

    if (this.state === 'fight' && this.enemy) {
      wish = this.fight(dt);
    } else if (this.state === 'flee' && this.fleeFrom) {
      let dx = ch.pos.x - this.fleeFrom.x, dz = ch.pos.z - this.fleeFrom.z;
      const l = Math.hypot(dx, dz) || 1;
      const s = this.steer(ch.pos.x + (dx / l) * 10, ch.pos.z + (dz / l) * 10, dt, 0.5);
      wish = s;
      ch.sprint = true;
      if (Math.random() < dt * 0.8) this.wantJump = true;
    } else if (this.state === 'heal') {
      if (ch.slot !== this.healSlot) ch.selectSlot(this.healSlot);
      if (!ch.using && ch.fireCd <= 0) {
        if (!ch.startUse()) this.state = 'roam';
      }
    } else if (this.state === 'zone' && this.target) {
      const s = this.steer(this.target.x, this.target.z, dt, 4);
      wish = s;
      ch.sprint = true;
      if (s.d < 4) this.target = null;
    } else if (this.state === 'loot' && this.goal) {
      this.goalT += dt;
      const o = this.goal.obj;
      const tx = o.x, tz = o.z;
      ty = o.y;
      const s = this.steer(tx, tz, dt, this.goal.type === 'harvest' ? 2.2 : 1.3);
      wish = s;
      ch.sprint = s.d > 10;
      if (s.d < (this.goal.type === 'harvest' ? 2.4 : 1.8) && Math.abs(ty - ch.pos.y) < 2) {
        if (this.goal.type === 'chest') {
          g.loot.openChest(o, ch);
          this.goal = null;
        } else if (this.goal.type === 'item') {
          this.grabItem(o);
          if (o.alive) this.ignore.add(o);
          this.goal = null;
        } else {
          if (ch.slot !== 0) ch.selectSlot(0);
          const dx = o.x - ch.pos.x, dz = o.z - ch.pos.z, d = Math.hypot(dx, dz) || 1;
          ch.yaw = Math.atan2(-dx, -dz);
          g.combat.swingPickaxe(ch, { ox: ch.pos.x, oy: ch.pos.y + 1.0, oz: ch.pos.z, dx: dx / d, dy: 0, dz: dz / d, extra: 1.5, noChars: true });
          if (!o.alive || ch.mats.wood + ch.mats.stone + ch.mats.metal > 160) this.goal = null;
        }
      }
      if (this.goalT > 25 && this.goal) {
        this.ignore.add(this.goal.obj);
        if (this.goal.type === 'chest') this.goal.obj.claimedBy = null;
        this.goal = null;
      }
    } else if (this.state === 'roam' && this.target) {
      const s = this.steer(this.target.x, this.target.z, dt, 3);
      wish = s;
      if (s.d < 3) this.target = null;
    }

    const moving = wish.x !== 0 || wish.z !== 0;
    if (moving && this.state !== 'fight') ch.yaw = Math.atan2(-wish.x, -wish.z);
    if (this.state !== 'fight') {
      ch.pitch *= 0.9;
      // passende Waffe in der Hand halten
      if (this.state !== 'heal' && this.state !== 'loot' && ch.slot === 0) {
        const w = this.pickWeapon(30);
        if (w) ch.selectSlot(w.slot);
      }
      if (ch.currentWeapon() && ch.currentWeapon().mag < WEAPONS[ch.currentWeapon().id].mag * 0.5 && !ch.reloading) ch.startReload();
    }
    this.checkStuck(dt, moving, ty);
    ch.stepMovement(dt, wish.x, wish.z, this.wantJump || (moving && ch.blocked && Math.random() < 0.05));
  }

  fight(dt) {
    const ch = this.ch, g = this.game, e = this.enemy;
    if (!e.alive) { this.enemy = null; return { x: 0, z: 0 }; }
    const tp = this.enemyVisible ? e.pos : this.lastSeen;
    const dx = tp.x - ch.pos.x, dz = tp.z - ch.pos.z;
    const dist = Math.hypot(dx, dz);
    const w = this.pickWeapon(dist);
    if (!w) { this.state = 'loot'; return { x: 0, z: 0 }; }
    if (ch.slot !== w.slot) ch.selectSlot(w.slot);
    // Zielen
    const lead = Math.min(0.4, dist / 250);
    const ax = tp.x + (this.enemyVisible ? e.vel.x * lead : 0);
    const az = tp.z + (this.enemyVisible ? e.vel.z * lead : 0);
    const aimHead = this.d.aimErr < 0.04 && Math.random() < 0.3;
    const ay = tp.y + (aimHead ? 1.65 : 1.15) + (this.enemyVisible ? e.vel.y * lead : 0);
    const ex = ax - ch.pos.x, ey = ay - (ch.pos.y + 1.6), ez = az - ch.pos.z;
    const hd = Math.hypot(ex, ez);
    const yaw = Math.atan2(-ex, -ez);
    const pitch = Math.atan2(ey, hd);
    const off = this.faceTowards(yaw, pitch, dt);
    if (this.enemyVisible && this.reactT <= 0 && off < 0.2 && w.it.mag > 0) {
      const spd = Math.hypot(e.vel.x, e.vel.z);
      const err = this.d.aimErr * (1 + spd / 9) * (e.mode !== 'ground' ? 1.4 : 1);
      const yawE = ch.yaw + (Math.random() * 2 - 1) * err;
      const pitE = ch.pitch + (Math.random() * 2 - 1) * err * 0.7;
      const cp = Math.cos(pitE);
      const aim = { ox: ch.pos.x, oy: ch.pos.y + 1.6, oz: ch.pos.z, dx: -Math.sin(yawE) * cp, dy: Math.sin(pitE), dz: -Math.cos(yawE) * cp };
      ch.ads = w.it.id === 'sniper' || (w.it.id === 'ar' && dist > 30);
      g.combat.tryFire(ch, aim, true);
    } else if (w.it.mag === 0 && !ch.reloading) ch.startReload();
    // Bewegung
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 0.5 + Math.random() * 1.1;
      this.strafe = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.25) this.wantJump = true;
    }
    const [pmin, pmax] = w.def.pref;
    const fx = dist > 0.1 ? dx / dist : 0, fz = dist > 0.1 ? dz / dist : 0;
    let mx = -fz * this.strafe * 0.8, mz = fx * this.strafe * 0.8;
    if (!this.enemyVisible) { mx = fx; mz = fz; ch.sprint = true; }
    else if (dist > pmax) { mx += fx; mz += fz; }
    else if (dist < pmin) { mx -= fx; mz -= fz; }
    const l = Math.hypot(mx, mz) || 1;
    if (!this.enemyVisible && dist < 2) return { x: 0, z: 0 };
    return { x: mx / l, z: mz / l };
  }
}
