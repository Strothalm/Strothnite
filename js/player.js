// Spielersteuerung: Bewegung, Kamera, Bauen, Schießen, Interaktion
import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, MAT_ORDER, MATERIALS, BUILD_COST } from './config.js';
import { clamp } from './util.js';
import { tex } from './textures.js';
import { itemName, itemRarity } from './loot.js';

const BUILD_KEYS = { KeyQ: 'wall', KeyF: 'floor', KeyC: 'ramp' };

export class PlayerController {
  constructor(game, ch) {
    this.game = game;
    this.ch = ch;
    this.camYaw = 0;
    this.camPitch = -0.25;
    this.buildMode = false;
    this.buildType = 'wall';
    this.buildMat = 'wood';
    this.rampRot = 0;
    this.buildCd = 0;
    this.target = null;
    this.interact = null;
    this.shakeAmt = 0;
    this.camDist = 3.3;
    this.fovCur = game.settings.fov;
    this.spectate = null;
    this.deadT = 0;
    this.weak = null;
    this.camPos = new THREE.Vector3();
    const sm = new THREE.SpriteMaterial({ map: tex('ring'), transparent: true, depthWrite: false, depthTest: false });
    this.weakSprite = new THREE.Sprite(sm);
    this.weakSprite.scale.setScalar(0.55);
    this.weakSprite.visible = false;
    this.weakSprite.renderOrder = 20;
    game.scene.add(this.weakSprite);
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  zoom() {
    const ch = this.ch;
    if (!ch.alive || !ch.ads || this.buildMode) return 1;
    const w = ch.currentWeapon();
    return w ? WEAPONS[w.id].zoom : 1;
  }

  scoped() {
    const ch = this.ch;
    const w = ch.currentWeapon();
    return ch.alive && ch.ads && !this.buildMode && w && WEAPONS[w.id].scope && ch.mode === 'ground';
  }

  look() {
    const cp = Math.cos(this.camPitch);
    return {
      yaw: this.camYaw,
      pitch: this.camPitch,
      dx: -Math.sin(this.camYaw) * cp,
      dy: Math.sin(this.camPitch),
      dz: -Math.cos(this.camYaw) * cp,
    };
  }

  aim() {
    const l = this.look();
    const ch = this.ch;
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    const off = this.scoped() ? 0 : 0.55;
    return { ox: ch.pos.x + rx * off, oy: ch.pos.y + 1.62, oz: ch.pos.z + rz * off, dx: l.dx, dy: l.dy, dz: l.dz };
  }

  selectSlot(s) {
    const ch = this.ch;
    this.setBuild(false);
    ch.selectSlot(s);
  }

  setBuild(on, type) {
    this.buildMode = on;
    this.ch.buildMode = on;
    if (type) this.buildType = type;
    if (on) { this.ch.ads = false; this.ch.cancelReload(); this.ch.using = null; this.ch.emote = false; }
    if (!on) this.game.builds.showGhost(null);
  }

  cycleMat() {
    const i = MAT_ORDER.indexOf(this.buildMat);
    this.buildMat = MAT_ORDER[(i + 1) % 3];
    this.game.audio.play('ui');
  }

  dropCurrent() {
    const ch = this.ch;
    if (ch.slot === 0) return;
    const it = ch.removeSlotItem(ch.slot - 1);
    if (!it) return;
    const l = this.look();
    this.game.loot.spawn(it, ch.pos.x + l.dx * 1.2, ch.pos.y + 0.5, ch.pos.z + l.dz * 1.2, l.dx * 2, 2.5, l.dz * 2);
  }

  doInteract() {
    const it = this.interact;
    if (!it) return;
    if (it.type === 'chest') this.game.loot.openChest(it.obj, this.ch);
    else this.game.loot.pickup(it.obj, this.ch);
  }

  checkWeakPoint(owner, pt, hit) {
    let crit = false;
    if (this.weak && this.weak.owner === owner && this.weak.pos.distanceTo(pt) < 0.6) crit = true;
    const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(n, up).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const narrow = owner.kind === 'env' && owner.type !== 'car';
    const a = Math.random() * Math.PI * 2;
    const d = 0.45 + Math.random() * 0.5;
    const pos = pt.clone()
      .addScaledVector(u, Math.cos(a) * d * (narrow ? 0.15 : 1))
      .addScaledVector(v, Math.sin(a) * d * (narrow ? 1.4 : 1))
      .addScaledVector(n, 0.08);
    const ground = this.game.world.groundAt(pos.x, pos.z);
    if (pos.y < ground + 0.3) pos.y = ground + 0.3 + Math.random() * 0.8;
    this.weak = { owner, pos };
    this.weakSprite.position.copy(pos);
    this.weakSprite.visible = true;
    return crit;
  }

  update(dt) {
    const g = this.game, inp = g.input, ch = this.ch;
    const zoom = this.zoom();
    const sens = (0.0022 * g.settings.sens) / zoom;
    this.camYaw -= inp.dx * sens;
    this.camPitch = clamp(this.camPitch - inp.dy * sens, -1.45, 1.35);

    if (!ch.alive) {
      this.updateSpectate(dt);
      return;
    }
    this.buildCd -= dt;

    if (ch.mode === 'bus') {
      if (inp.hit('Space') && g.bus.canDrop) {
        g.bus.drop(ch);
        ch.yaw = this.camYaw;
        g.audio.play('glider');
      }
      return;
    }
    ch.yaw = this.camYaw;
    ch.pitch = this.camPitch;

    const fwd = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    const str = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let wx = fx * fwd + rx * str, wz = fz * fwd + rz * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    ch.sprint = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const jump = inp.hit('Space');

    if (ch.mode !== 'ground') {
      ch.stepMovement(dt, wx, wz, jump);
      return;
    }
    if (wl > 0 || jump) ch.emote = false;

    // Platzwahl
    for (let n = 1; n <= 6; n++) if (inp.hit('Digit' + n)) this.selectSlot(n - 1);
    if (inp.wheel) {
      let s = ch.slot;
      for (let k = 0; k < 6; k++) {
        s = (s + (inp.wheel > 0 ? 1 : -1) + 6) % 6;
        if (s === 0 || ch.inventory[s - 1]) break;
      }
      this.selectSlot(s);
    }
    for (const code in BUILD_KEYS) {
      if (inp.hit(code)) {
        const t = BUILD_KEYS[code];
        if (this.buildMode && this.buildType === t) this.setBuild(false);
        else this.setBuild(true, t);
      }
    }
    if (this.buildMode) {
      if (inp.hit('KeyR')) this.rampRot = (this.rampRot + 1) % 4;
      if (inp.hit('KeyT') || inp.clickR) this.cycleMat();
      ch.ads = false;
    } else {
      if (inp.hit('KeyR')) ch.startReload();
      ch.ads = inp.mouseR && !!ch.currentWeapon() && !ch.reloading;
    }
    if (inp.hit('KeyB')) { ch.emote = !ch.emote; this.setBuild(false); }
    if (inp.hit('KeyG')) this.dropCurrent();

    this.interact = g.loot.findInteractable(ch, fx, fz);
    if (inp.hit('KeyE')) this.doInteract();

    const aim = this.aim();
    if (this.buildMode) {
      this.target = g.builds.computeTarget(ch, this.buildType, this.look(), this.rampRot);
      const affordable = ch.mats[this.buildMat] >= BUILD_COST;
      g.builds.showGhost(this.target, affordable);
      if (inp.mouseL && this.buildCd <= 0) {
        if (g.builds.tryPlace(ch, this.target, this.buildMat)) this.buildCd = 0.08;
        else if (inp.clickL && !affordable) g.hud.toast(`Nicht genug ${MATERIALS[this.buildMat].name}`);
      }
    } else {
      const it = ch.currentItem();
      if (!it) {
        if (inp.mouseL) g.combat.swingPickaxe(ch, aim);
      } else if (it.kind === 'weapon') {
        if (inp.mouseL) g.combat.tryFire(ch, aim, inp.clickL);
      } else if (it.kind === 'consumable') {
        if (inp.clickL && !ch.using) {
          if (!ch.startUse()) g.hud.toast(CONSUMABLES[it.id].kind === 'hp' ? 'Deine Lebenspunkte sind schon voll' : 'Dein Schild ist schon voll');
        }
      }
    }
    if (this.weak && (!this.weak.owner.alive || ch.slot !== 0 || this.buildMode || this.weak.pos.distanceTo(ch.pos) > 6)) {
      this.weak = null;
      this.weakSprite.visible = false;
    }
    ch.stepMovement(dt, wx, wz, jump);
    if (jump && ch.vel.y > 0) g.audio.play('jump');
  }

  updateSpectate(dt) {
    const g = this.game;
    this.deadT += dt;
    this.setBuild(false);
    this.weakSprite.visible = false;
    if (this.deadT < 2.5) return;
    const alive = g.chars.filter((c) => c.alive && c !== this.ch);
    if (!alive.length) { this.spectate = null; return; }
    if (!this.spectate || !this.spectate.alive) {
      const killer = this.ch.lastAttacker;
      this.spectate = killer && killer.alive ? killer : alive[Math.floor(Math.random() * alive.length)];
    }
    if (g.input.hit('Space')) {
      const i = alive.indexOf(this.spectate);
      this.spectate = alive[(i + 1) % alive.length];
    }
  }

  updateCamera(dt) {
    const g = this.game, cam = g.camera, ch = this.ch;
    const yaw = this.camYaw, pitch = this.camPitch;
    const cp = Math.cos(pitch);
    const fx = -Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(yaw) * cp;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let px, py, pz, dist;
    let scoped = false;
    const focus = ch.alive ? ch : this.spectate;
    if (ch.alive && ch.mode === 'bus') {
      const b = g.bus.pos;
      px = b.x; py = b.y + 4; pz = b.z; dist = 24;
    } else if (!focus) {
      px = ch.pos.x; py = ch.pos.y + 6; pz = ch.pos.z; dist = 10;
    } else if (focus.mode === 'sky') {
      px = focus.pos.x; py = focus.pos.y + 1.6; pz = focus.pos.z; dist = 7;
    } else if (focus.mode === 'glide') {
      px = focus.pos.x; py = focus.pos.y + 2.4; pz = focus.pos.z; dist = 6.5;
    } else {
      scoped = ch.alive && this.scoped();
      const ads = ch.alive && ch.ads && !this.buildMode;
      const off = scoped ? 0 : ads ? 0.5 : 0.55;
      px = focus.pos.x + rx * off; py = focus.pos.y + 1.62; pz = focus.pos.z + rz * off;
      dist = scoped ? 0 : ads ? 1.7 : 3.3;
      if (!ch.alive) dist = 4.2;
    }
    if (dist > 0.1) {
      const hit = g.combat.raycastWorld(px, py, pz, -fx, -fy, -fz, dist + 0.3);
      if (hit) dist = Math.max(0.25, hit.t - 0.3);
    }
    if (dist < this.camDist) this.camDist = dist;
    else this.camDist += (dist - this.camDist) * Math.min(1, dt * 6);
    cam.position.set(px - fx * this.camDist, py - fy * this.camDist, pz - fz * this.camDist);
    const camGround = g.world.groundAt(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < camGround) cam.position.y = camGround;
    const sh = this.shakeAmt;
    cam.rotation.set(pitch + (Math.random() - 0.5) * sh * 0.08, yaw + (Math.random() - 0.5) * sh * 0.08, 0, 'YXZ');
    this.shakeAmt = Math.max(0, sh - dt * 2.5);
    const targetFov = g.settings.fov / this.zoom();
    this.fovCur += (targetFov - this.fovCur) * Math.min(1, dt * 14);
    if (Math.abs(cam.fov - this.fovCur) > 0.01) {
      cam.fov = this.fovCur;
      cam.updateProjectionMatrix();
    }
    g.hud.setScope(scoped);
  }

  promptText() {
    const it = this.interact;
    if (!it) return null;
    if (it.type === 'chest') return { text: it.obj.ammoBox ? 'Munitionskiste öffnen' : 'Truhe öffnen', color: '#ffd25a' };
    const item = it.obj.item;
    const rar = itemRarity(item);
    const extra = item.kind === 'consumable' ? ` ×${item.count}` : '';
    return { text: `Aufheben: ${itemName(item)}${extra}`, rarity: rar };
  }
}
