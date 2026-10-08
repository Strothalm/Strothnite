// Spielfigur-Logik (Spieler und Bots): Leben, Inventar, Bewegung
import * as THREE from 'three';
import { GRAVITY, WEAPONS, CONSUMABLES, MAX_MATS, MAX_AMMO } from './config.js';
import { CharacterModel } from './character.js';
import { approach, clamp } from './util.js';

let nextId = 1;

export class Character {
  constructor(game, { name, isPlayer = false, skin }) {
    this.game = game;
    this.id = nextId++;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skin = skin;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.38;
    this.height = 1.85;
    this.hp = 100;
    this.shield = 0;
    this.alive = true;
    this.mode = 'bus';
    this.onGround = false;
    this.groundRamp = null;
    this.impact = 0;
    this.inWater = false;
    this.inventory = [null, null, null, null, null];
    this.slot = 0; // 0 = Spitzhacke, 1..5 = Inventar
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.mats = { wood: 0, stone: 0, metal: 0 };
    this.fireCd = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.bloom = 0;
    this.using = null;
    this.swingT = -1;
    this.swingCd = 0;
    this.recoil = 0;
    this.kills = 0;
    this.ads = false;
    this.sprint = false;
    this.emote = false;
    this.jumpCd = 0;
    this.lastDamageT = -99;
    this.lastAttacker = null;
    this.placement = 0;
    this.stepT = 0;
    this.deadT = 0;
    this.model = new CharacterModel(skin);
    this.model.root.visible = false;
    game.scene.add(this.model.root);
  }

  get eyeY() { return this.pos.y + 1.6; }

  currentItem() {
    return this.slot === 0 ? null : this.inventory[this.slot - 1];
  }

  currentWeapon() {
    const it = this.currentItem();
    return it && it.kind === 'weapon' ? it : null;
  }

  selectSlot(s) {
    if (s === this.slot) return;
    this.slot = s;
    this.cancelReload();
    this.using = null;
    this.swingT = -1;
    this.emote = false;
    this.fireCd = Math.max(this.fireCd, 0.22);
    this.bloom = 0;
  }

  cancelReload() {
    this.reloading = false;
    this.reloadT = 0;
  }

  freeSlot() {
    for (let i = 0; i < 5; i++) if (!this.inventory[i]) return i;
    return -1;
  }

  // Gegenstand ins Inventar legen. Gibt true zurück, wenn vollständig aufgenommen
  addItem(item) {
    if (item.kind === 'ammo') {
      this.ammo[item.type] = Math.min(MAX_AMMO, this.ammo[item.type] + item.count);
      return true;
    }
    if (item.kind === 'mats') {
      const space = MAX_MATS - this.mats[item.type];
      const take = Math.min(space, item.count);
      this.mats[item.type] += take;
      item.count -= take;
      return item.count <= 0;
    }
    if (item.kind === 'consumable') {
      const stack = CONSUMABLES[item.id].stack;
      for (const it of this.inventory) {
        if (it && it.kind === 'consumable' && it.id === item.id && it.count < stack) {
          const take = Math.min(stack - it.count, item.count);
          it.count += take;
          item.count -= take;
          if (item.count <= 0) return true;
        }
      }
    }
    const i = this.freeSlot();
    if (i < 0) return false;
    this.inventory[i] = { ...item };
    item.count = 0;
    if (this.slot === 0 && item.kind === 'weapon' && !this.isPlayer) this.selectSlot(i + 1);
    return true;
  }

  removeSlotItem(idx) {
    const it = this.inventory[idx];
    this.inventory[idx] = null;
    if (this.slot === idx + 1) {
      this.cancelReload();
      this.using = null;
    }
    return it;
  }

  hasWeapons() {
    return this.inventory.some((it) => it && it.kind === 'weapon');
  }

  hasUsableWeapon() {
    return this.inventory.some((it) => it && it.kind === 'weapon' && (it.mag > 0 || this.ammo[WEAPONS[it.id].ammo] > 0));
  }

  // Schaden anwenden. Gibt { shield, health, killed } zurück
  takeDamage(amount, attacker, weaponName, opts = {}) {
    if (!this.alive || this.mode === 'bus') return null;
    let sDmg = 0;
    let hDmg = 0;
    if (!opts.ignoreShield && this.shield > 0) {
      sDmg = Math.min(this.shield, amount);
      this.shield -= sDmg;
      amount -= sDmg;
    }
    hDmg = Math.min(this.hp, amount);
    this.hp -= hDmg;
    this.lastDamageT = this.game.time;
    if (attacker && attacker !== this) this.lastAttacker = attacker;
    this.using = null;
    this.emote = false;
    if (this.brain) this.brain.onDamaged(attacker, opts);
    if (this.isPlayer) this.game.onPlayerDamaged(attacker, sDmg, hDmg, opts);
    const killed = this.hp <= 0;
    if (killed) this.game.onKilled(this, attacker, weaponName);
    return { shield: sDmg, health: hDmg, killed, broke: sDmg > 0 && this.shield <= 0 };
  }

  canUse(id) {
    const c = CONSUMABLES[id];
    if (c.kind === 'hp') return this.hp < c.cap;
    return this.shield < c.cap;
  }

  applyConsumable(id) {
    const c = CONSUMABLES[id];
    if (c.kind === 'hp') this.hp = Math.max(this.hp, Math.min(c.cap, this.hp + c.amount));
    else this.shield = Math.max(this.shield, Math.min(c.cap, this.shield + c.amount));
  }

  // Bewegung: wish = gewünschte Richtung (Welt, Länge 0..1)
  stepMovement(dt, wishX, wishZ, jump) {
    const v = this.vel;
    const world = this.game.world;
    if (this.mode === 'bus') return;
    this.jumpCd -= dt;
    if (this.mode === 'sky') {
      const diving = this.pitch < -0.55 && (wishX || wishZ);
      const maxH = diving ? 14 : 17;
      v.x = approach(v.x, wishX * maxH, 22 * dt);
      v.z = approach(v.z, wishZ * maxH, 22 * dt);
      v.y = approach(v.y, diving ? -36 : -21, 30 * dt);
      const agl = this.pos.y - this.game.physics.groundHeightAt(this.pos.x, this.pos.z, this.pos.y);
      if (agl < 48 || (jump && agl < 110 && this.jumpCd <= 0)) {
        this.mode = 'glide';
        this.jumpCd = 0.3;
        this.game.audio.play('glider', this.isPlayer ? null : this.pos);
      }
    } else if (this.mode === 'glide') {
      v.x = approach(v.x, wishX * 11, 14 * dt);
      v.z = approach(v.z, wishZ * 11, 14 * dt);
      v.y = approach(v.y, -5.5, 30 * dt);
    } else {
      let speed = 6.4;
      if (this.sprint && !this.ads && !this.using) speed = 8.3;
      if (this.ads) speed = 4.2;
      if (this.using) speed *= 0.75;
      if (this.inWater) speed *= 0.6;
      const acc = this.onGround ? 70 : 14;
      v.x = approach(v.x, wishX * speed, acc * dt);
      v.z = approach(v.z, wishZ * speed, acc * dt);
      if (jump && this.onGround && this.jumpCd <= 0) {
        v.y = 8.3;
        this.onGround = false;
        this.jumpCd = 0.25;
        this.emote = false;
      }
      v.y -= GRAVITY * dt;
      if (v.y < -55) v.y = -55;
    }
    this.blocked = false;
    this.impact = 0;
    const wasMode = this.mode;
    this.game.physics.moveCharacter(this, dt);
    // Inselrand begrenzen
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > 440) {
      this.pos.x *= 440 / d;
      this.pos.z *= 440 / d;
    }
    if (this.pos.y > 400) this.pos.y = 400;
    this.inWater = world.terrainHeight(this.pos.x, this.pos.z) < -0.5 && this.pos.y < 0.2;
    if ((wasMode === 'sky' || wasMode === 'glide') && this.onGround) {
      this.mode = 'ground';
      this.vel.set(0, 0, 0);
      this.game.audio.play('land', this.isPlayer ? null : this.pos);
    } else if (wasMode === 'ground' && this.impact > 19 && !this.inWater) {
      const dmg = Math.round((this.impact - 19) * 5);
      if (dmg > 0) this.takeDamage(dmg, null, 'Sturz', { ignoreShield: true, fall: true });
    }
  }

  updateTimers(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.swingCd = Math.max(0, this.swingCd - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const w = this.currentWeapon();
    if (w) {
      const def = WEAPONS[w.id];
      this.bloom = Math.max(0, this.bloom - dt * (def.maxBloom ? def.maxBloom * 2.2 : 1));
    }
    if (this.swingT >= 0) {
      this.swingT += dt / 0.42;
      if (this.swingT >= 1) this.swingT = -1;
    }
    // Nachladen
    if (this.reloading) {
      const it = this.currentWeapon();
      if (!it) { this.cancelReload(); }
      else {
        const def = WEAPONS[it.id];
        this.reloadT += dt;
        if (def.perShell) {
          if (this.reloadT >= def.reload) {
            this.reloadT = 0;
            if (this.ammo[def.ammo] > 0 && it.mag < def.mag) {
              it.mag++;
              this.ammo[def.ammo]--;
              if (this.isPlayer) this.game.audio.play('shell');
            }
            if (it.mag >= def.mag || this.ammo[def.ammo] <= 0) this.cancelReload();
          }
        } else if (this.reloadT >= def.reload) {
          const need = def.mag - it.mag;
          const take = Math.min(need, this.ammo[def.ammo]);
          it.mag += take;
          this.ammo[def.ammo] -= take;
          this.cancelReload();
          if (this.isPlayer) this.game.audio.play('reloadDone');
        }
      }
    }
    // Verbrauchsgegenstand benutzen
    if (this.using) {
      const it = this.currentItem();
      if (!it || it.kind !== 'consumable' || it.id !== this.using.id) { this.using = null; }
      else {
        this.using.t += dt;
        if (this.using.t >= this.using.total) {
          this.applyConsumable(it.id);
          it.count--;
          if (it.count <= 0) this.removeSlotItem(this.slot - 1);
          this.using = null;
          if (this.isPlayer) this.game.audio.play('healDone');
        }
      }
    }
  }

  startReload() {
    const it = this.currentWeapon();
    if (!it || this.reloading) return false;
    const def = WEAPONS[it.id];
    if (it.mag >= def.mag || this.ammo[def.ammo] <= 0) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.using = null;
    if (this.isPlayer) this.game.audio.play('reload');
    return true;
  }

  startUse() {
    const it = this.currentItem();
    if (!it || it.kind !== 'consumable' || this.using) return false;
    if (!this.canUse(it.id)) return false;
    this.using = { id: it.id, t: 0, total: CONSUMABLES[it.id].time };
    this.cancelReload();
    if (this.isPlayer) this.game.audio.play('healStart');
    return true;
  }

  syncModel(dt) {
    const m = this.model;
    if (!m.root.visible) return;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw + Math.PI;
    const it = this.currentItem();
    let hold = 'pickaxe';
    if (this.buildMode) { hold = 'build'; m.setHeld(null, null); }
    else if (!it) m.setHeld('pickaxe', 'pickaxe');
    else if (it.kind === 'weapon') { hold = 'weapon'; m.setHeld('weapon', it.id, it.rarity); }
    else if (it.kind === 'consumable') { hold = 'consumable'; m.setHeld('consumable', it.id); }
    m.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      mode: this.mode,
      onGround: this.onGround || this.mode !== 'ground',
      pitch: clamp(this.pitch, -1, 1),
      hold,
      swing: this.swingT,
      using: !!this.using,
      emote: this.emote,
      dead: !this.alive,
      recoil: this.recoil,
    });
  }
}
