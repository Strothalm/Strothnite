// Spieloberfläche: Leben, Schild, Inventar, Minimap, Meldungen
import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, RARITIES, MATERIALS, MAP_VIEW, BUILD_COST } from './config.js';
import { fmtTime, clamp } from './util.js';

const $ = (id) => document.getElementById(id);

const R = (x, y, w, h, c, rx = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${c}"/>`;
const SVG = (inner) => `<svg viewBox="0 0 64 32" aria-hidden="true">${inner}</svg>`;
const G1 = '#f4f6f8', G2 = '#c9d0d8';

export const ICONS = {
  pickaxe: SVG('<path d="M14 29 L42 7" stroke="#d9a86a" stroke-width="4.5" stroke-linecap="round"/><path d="M27 6 Q42 -1 57 11 Q45 8 37 13 Z" fill="#e3ebf3"/><circle cx="41" cy="8" r="3" fill="#47c2ff"/>'),
  ar: SVG(R(2, 12, 12, 8, G2, 2) + R(13, 10, 31, 8, G1) + R(43, 12, 19, 3, G1) + R(28, 17, 6, 10, G2) + R(18, 17, 5, 8, G1) + R(24, 6, 11, 4, G2)),
  smg: SVG(R(6, 12, 9, 4, G2) + R(14, 10, 25, 8, G1) + R(38, 12, 13, 3, G1) + R(25, 17, 5, 12, G2) + R(16, 17, 5, 7, G1)),
  pistol: SVG(R(16, 9, 32, 7, G1, 2) + R(18, 15, 9, 13, G2, 2) + R(27, 16, 6, 3, G1)),
  shotgun: SVG(R(2, 12, 15, 8, '#d9a86a', 2) + R(16, 10, 46, 4, G1) + R(33, 14, 16, 5, G2, 2) + R(17, 14, 5, 8, G1)),
  sniper: SVG(R(2, 13, 11, 8, G2, 2) + R(12, 13, 37, 6, G1) + R(48, 14, 15, 3, G1) + R(21, 6, 20, 5, G2, 2) + R(19, 18, 5, 8, G1)),
  rocket: SVG(R(4, 9, 56, 10, '#b9c48a', 5) + R(25, 18, 5, 9, G1) + R(30, 4, 6, 6, G2)),
  bandage: SVG(R(14, 9, 36, 14, '#efe5cf', 4) + R(28, 9, 8, 14, '#d4c29a') + R(18, 13, 6, 6, '#d4c29a', 3) + R(40, 13, 6, 6, '#d4c29a', 3)),
  medkit: SVG(R(16, 6, 32, 22, '#f4f4f4', 3) + R(27, 10, 10, 14, '#e23b3b') + R(23, 14, 18, 6, '#e23b3b') + R(26, 3, 12, 4, '#cfcfcf', 1)),
  shieldSmall: SVG(R(27, 4, 10, 5, '#ffffff', 1) + R(24, 9, 16, 20, '#3aa0ff', 5) + R(27, 12, 4, 13, '#a8d8ff', 2)),
  shieldBig: SVG(R(26, 2, 12, 5, '#ffffff', 1) + R(18, 7, 28, 23, '#3aa0ff', 7) + R(22, 11, 5, 15, '#a8d8ff', 2)),
  wood: SVG(R(14, 6, 36, 20, '#b07a45', 3) + R(14, 12, 36, 2, '#7a4a22') + R(14, 19, 36, 2, '#7a4a22')),
  stone: SVG(R(12, 6, 19, 9, '#a8a49a', 2) + R(33, 6, 19, 9, '#8f8b83', 2) + R(20, 17, 22, 9, '#b8b4aa', 2)),
  metal: SVG(R(14, 6, 36, 20, '#aab6c2', 3) + R(18, 6, 4, 20, '#d0d8e0') + R(30, 6, 4, 20, '#d0d8e0') + R(42, 6, 4, 20, '#d0d8e0')),
  wall: SVG(R(18, 3, 28, 26, '#7fc4ff', 2) + R(18, 3, 28, 26, 'none')),
  floor: SVG('<path d="M6 20 L32 12 L58 20 L32 28 Z" fill="#7fc4ff"/>'),
  ramp: SVG('<path d="M10 28 L54 6 L54 28 Z" fill="#7fc4ff"/>'),
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.bigmap = $('bigmap');
    this.bigCanvas = $('bigmap-canvas');
    this.bigCtx = this.bigCanvas.getContext('2d');
    this.slots = [...document.querySelectorAll('#hotbar .slot')];
    this.slotSig = ['', '', '', '', '', ''];
    this.cache = {};
    this.dmgPool = [];
    this.dmgActive = [];
    this.dirPool = [...document.querySelectorAll('#dmgdir .arc')];
    this.dirActive = [];
    this.timers = {};
    this.objHpT = 0;
    this.fpsT = 0; this.fpsN = 0;
    this.v = new THREE.Vector3();
    for (const m of ['wood', 'stone', 'metal']) $(`mat-${m}`).querySelector('.ico').innerHTML = ICONS[m];
    for (const t of ['wall', 'floor', 'ramp']) $(`bp-${t}`).querySelector('.ico').innerHTML = ICONS[t];
    this.slots[0].querySelector('.ico').innerHTML = ICONS.pickaxe;
  }

  show(on) { this.root.hidden = !on; }

  set(el, key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    fn(el, val);
  }

  timed(id, secs) {
    const el = $(id);
    el.classList.add('show');
    this.timers[id] = secs;
  }

  toast(text) {
    $('toast').textContent = text;
    this.timed('toast', 1.8);
  }

  banner(text, color = '#ffffff') {
    const el = $('banner');
    el.textContent = text;
    el.style.color = color;
    this.timed('banner', 3.5);
  }

  centerMsg(html) {
    $('center-msg').innerHTML = html;
    this.timed('center-msg', 3);
  }

  killfeed(text, mine) {
    const el = document.createElement('div');
    el.className = 'kf' + (mine ? ' mine' : '');
    el.textContent = text;
    const kf = $('killfeed');
    kf.prepend(el);
    while (kf.children.length > 6) kf.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  hitmarker(head, kill) {
    const el = $('hitmarker');
    el.classList.remove('head', 'kill');
    if (head) el.classList.add('head');
    if (kill) el.classList.add('kill');
    this.timed('hitmarker', 0.16);
  }

  matGain(mat, n) {
    if (n <= 0) return;
    const el = $(`mat-${mat}`).querySelector('.gain');
    el.textContent = '+' + n;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  showObjHp(o) {
    this.objHp = o;
    this.objHpT = 1.4;
  }

  damageNumber(point, dmg, kind) {
    let el = this.dmgPool.pop();
    if (!el) {
      el = document.createElement('div');
      el.className = 'dmgnum';
      $('dmg-layer').appendChild(el);
    }
    el.textContent = dmg;
    el.className = 'dmgnum ' + kind;
    el.style.display = 'block';
    this.dmgActive.push({ el, x: point.x + (Math.random() - 0.5) * 0.4, y: point.y + 0.3, z: point.z + (Math.random() - 0.5) * 0.4, t: 0 });
  }

  damageDir(attacker) {
    if (!attacker) return;
    let el = this.dirPool.find((d) => !this.dirActive.some((a) => a.el === d));
    if (!el) el = this.dirActive.shift().el;
    this.dirActive.push({ el, ax: attacker.pos.x, az: attacker.pos.z, t: 0 });
    el.style.opacity = 1;
  }

  hurtFlash() {
    this.timed('hurt', 0.25);
  }

  setScope(on) {
    this.set($('scope'), 'scope', on, (el, v) => { el.hidden = !v; });
  }

  hotbarHTML(i) {
    const p = this.game.playerCh;
    const it = i === 0 ? null : p.inventory[i - 1];
    if (i === 0) return null;
    if (!it) return { sig: 'empty', html: '', rarity: -1 };
    if (it.kind === 'weapon') {
      return { sig: `w${it.id}${it.rarity}`, html: ICONS[it.id], rarity: it.rarity, count: '' };
    }
    return { sig: `c${it.id}${it.count}`, html: ICONS[it.id], rarity: CONSUMABLES[it.id].rarity, count: it.count };
  }

  update(dt) {
    const g = this.game, p = g.playerCh, ctrl = g.player;
    // Leben und Schild
    this.set($('hp-fill'), 'hp', Math.ceil(p.hp), (el, v) => { el.style.width = v + '%'; $('hp-num').textContent = v; });
    this.set($('shield-fill'), 'sh', Math.ceil(p.shield), (el, v) => { el.style.width = v + '%'; $('shield-num').textContent = v; });
    // Material
    for (const m of ['wood', 'stone', 'metal']) {
      this.set($(`mat-${m}`), 'm' + m, p.mats[m], (el, v) => { el.querySelector('.n').textContent = v; });
      const sel = ctrl.buildMode && ctrl.buildMat === m;
      this.set($(`mat-${m}`), 'ms' + m, sel, (el, v) => el.classList.toggle('sel', v));
    }
    // Inventar
    for (let i = 0; i < 6; i++) {
      const s = this.slots[i];
      const sel = !ctrl.buildMode && p.slot === i;
      this.set(s, 'sel' + i, sel, (el, v) => el.classList.toggle('sel', v));
      if (i === 0) continue;
      const h = this.hotbarHTML(i);
      if (h.sig !== this.slotSig[i]) {
        this.slotSig[i] = h.sig;
        s.querySelector('.ico').innerHTML = h.html;
        s.querySelector('.cnt').textContent = h.count || '';
        s.style.setProperty('--rar', h.rarity >= 0 ? RARITIES[h.rarity].color : 'transparent');
        s.classList.toggle('filled', h.rarity >= 0);
      }
    }
    const w = p.currentWeapon();
    const it = p.currentItem();
    let ammoText = '';
    if (w) {
      const def = WEAPONS[w.id];
      ammoText = `<b>${w.mag}</b><span>${p.ammo[def.ammo]}</span>`;
    }
    this.set($('ammo-info'), 'ammo', ammoText, (el, v) => { el.innerHTML = v; el.hidden = !v; });
    const name = ctrl.buildMode ? 'Baumodus' : it ? (it.kind === 'weapon' ? `${WEAPONS[it.id].name}` : CONSUMABLES[it.id].name) : 'Spitzhacke';
    const nameColor = it ? RARITIES[it.kind === 'weapon' ? it.rarity : CONSUMABLES[it.id].rarity].color : '#ffffff';
    this.set($('item-name'), 'iname', name + nameColor, (el) => { el.textContent = name; el.style.color = ctrl.buildMode ? '#7fc4ff' : nameColor; });
    // Baumodus-Leiste
    this.set($('buildbar'), 'bm', ctrl.buildMode, (el, v) => { el.hidden = !v; });
    if (ctrl.buildMode) {
      for (const t of ['wall', 'floor', 'ramp']) {
        this.set($(`bp-${t}`), 'bp' + t, ctrl.buildType === t, (el, v) => el.classList.toggle('sel', v));
      }
      const ok = p.mats[ctrl.buildMat] >= BUILD_COST;
      this.set($('build-mat'), 'bmat', ctrl.buildMat + ok, (el) => {
        el.textContent = `${MATERIALS[ctrl.buildMat].name} · ${BUILD_COST} pro Teil`;
        el.classList.toggle('bad', !ok);
      });
    }
    // Fadenkreuz
    let cross = 'dot';
    if (!ctrl.buildMode && w) cross = w.id === 'shotgun' ? 'circle' : w.id === 'rocket' ? 'rocket' : 'plus';
    if (ctrl.buildMode) cross = 'build';
    const hidden = !p.alive || p.mode !== 'ground' || ctrl.scoped();
    this.set($('crosshair'), 'cross', cross + hidden, (el) => { el.className = 'ch-' + cross; el.hidden = hidden; });
    if (w) {
      const def = WEAPONS[w.id];
      let spread = (p.ads ? def.adsSpread : def.spread) + p.bloom;
      if (Math.hypot(p.vel.x, p.vel.z) > 1) spread *= 1.35;
      const px = clamp(spread * 380, 4, 60);
      $('crosshair').style.setProperty('--gap', px.toFixed(1) + 'px');
    } else $('crosshair').style.setProperty('--gap', '6px');

    // Interaktion
    const pr = p.alive && p.mode === 'ground' ? ctrl.promptText() : null;
    const prKey = pr ? pr.text + (pr.rarity ?? '') : '';
    this.set($('prompt'), 'prompt', prKey, (el) => {
      el.hidden = !pr;
      if (pr) {
        el.innerHTML = `<kbd>E</kbd><span></span>`;
        const sp = el.querySelector('span');
        sp.textContent = pr.text;
        sp.style.color = pr.rarity !== undefined ? RARITIES[pr.rarity].color : pr.color;
      }
    });

    // Benutzen / Nachladen
    let prog = null;
    if (p.using) prog = { f: p.using.t / p.using.total, label: `${CONSUMABLES[p.using.id].name} · ${(p.using.total - p.using.t).toFixed(1)} s` };
    else if (p.reloading && w) {
      const def = WEAPONS[w.id];
      prog = { f: def.perShell ? p.reloadT / def.reload : p.reloadT / def.reload, label: 'Nachladen …' };
    }
    $('useprog').hidden = !prog;
    if (prog) {
      $('useprog-fill').style.width = (clamp(prog.f, 0, 1) * 100).toFixed(1) + '%';
      this.set($('useprog-label'), 'upl', prog.label, (el, v) => { el.textContent = v; });
    }

    // Sturm, Zähler
    const si = g.storm.info();
    this.set($('storm-label'), 'stl', si.text, (el, v) => { el.textContent = v; });
    this.set($('storm-time'), 'stt', si.time > 0 ? fmtTime(si.time) : '', (el, v) => { el.textContent = v; });
    this.set($('storm-info'), 'sts', si.shrinking, (el, v) => el.classList.toggle('shrinking', v));
    const alive = g.aliveCount;
    this.set($('alive-count'), 'alive', alive, (el, v) => { el.textContent = v; });
    this.set($('kill-count'), 'kills', p.kills, (el, v) => { el.textContent = v; });
    const outside = p.alive && p.mode !== 'bus' && g.storm.isOutside(p.pos.x, p.pos.z);
    this.set($('storm-overlay'), 'sto', outside, (el, v) => el.classList.toggle('show', v));

    // Bus-Hinweis
    let hint = '';
    if (p.alive && p.mode === 'bus') hint = g.bus.canDrop ? '<kbd>Leertaste</kbd> Aus dem Bus springen' : 'Der Strothi-Bus fliegt los …';
    else if (p.alive && p.mode === 'sky') hint = '<kbd>W A S D</kbd> steuern · <kbd>Leertaste</kbd> Gleiter öffnen';
    else if (!p.alive && ctrl.spectate) hint = `Du schaust zu: <b></b> · <kbd>Leertaste</kbd> Nächster Spieler`;
    this.set($('bus-hint'), 'hint', hint + (ctrl.spectate ? ctrl.spectate.name : ''), (el) => {
      el.innerHTML = hint;
      el.hidden = !hint;
      const b = el.querySelector('b');
      if (b && ctrl.spectate) b.textContent = ctrl.spectate.name;
    });

    // Bauteil-Lebenspunkte
    this.objHpT -= dt;
    const oh = $('objhp');
    if (this.objHpT > 0 && this.objHp && this.objHp.alive) {
      oh.hidden = false;
      const o = this.objHp;
      $('objhp-fill').style.width = clamp((o.hp / o.maxHp) * 100, 0, 100).toFixed(0) + '%';
      $('objhp-num').textContent = `${Math.max(0, Math.ceil(o.hp))} / ${o.maxHp}`;
    } else oh.hidden = true;

    // Timer für Meldungen
    for (const id in this.timers) {
      this.timers[id] -= dt;
      if (this.timers[id] <= 0) {
        $(id).classList.remove('show');
        delete this.timers[id];
      }
    }

    this.updateDamageNumbers(dt);
    this.updateDirs(dt);
    this.drawMinimap();
    if (!this.bigmap.hidden) this.drawBigMap();

    if (g.settings.fps) {
      this.fpsT += dt; this.fpsN++;
      if (this.fpsT >= 0.5) {
        $('fps').textContent = Math.round(this.fpsN / this.fpsT) + ' FPS';
        this.fpsT = 0; this.fpsN = 0;
      }
    }
    $('fps').hidden = !g.settings.fps;
  }

  updateDamageNumbers(dt) {
    const cam = this.game.camera;
    const W = window.innerWidth, H = window.innerHeight;
    let w = 0;
    for (const d of this.dmgActive) {
      d.t += dt;
      if (d.t > 0.9) {
        d.el.style.display = 'none';
        this.dmgPool.push(d.el);
        continue;
      }
      this.v.set(d.x, d.y + d.t * 0.8, d.z).project(cam);
      if (this.v.z > 1) d.el.style.opacity = 0;
      else {
        const sx = (this.v.x * 0.5 + 0.5) * W, sy = (-this.v.y * 0.5 + 0.5) * H;
        const sc = d.t < 0.1 ? 1.4 - d.t * 4 : 1;
        d.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
        d.el.style.opacity = d.t > 0.6 ? (0.9 - d.t) / 0.3 : 1;
      }
      this.dmgActive[w++] = d;
    }
    this.dmgActive.length = w;
  }

  updateDirs(dt) {
    const ctrl = this.game.player;
    const p = this.game.playerCh;
    const fx = -Math.sin(ctrl.camYaw), fz = -Math.cos(ctrl.camYaw);
    const rx = Math.cos(ctrl.camYaw), rz = -Math.sin(ctrl.camYaw);
    let w = 0;
    for (const d of this.dirActive) {
      d.t += dt;
      if (d.t > 1.4) { d.el.style.opacity = 0; continue; }
      const dx = d.ax - p.pos.x, dz = d.az - p.pos.z;
      const rel = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      d.el.style.transform = `rotate(${rel.toFixed(3)}rad)`;
      d.el.style.opacity = d.t > 0.9 ? (1.4 - d.t) / 0.5 : 1;
      this.dirActive[w++] = d;
    }
    this.dirActive.length = w;
  }

  drawCircleOverlay(ctx, W, toPx, scale) {
    const st = this.game.storm;
    const [cx, cy] = toPx(st.cx, st.cz);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, W);
    ctx.arc(cx, cy, Math.max(0, st.r * scale), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(128, 40, 210, 0.42)';
    ctx.fill('evenodd');
    ctx.restore();
    if (st.state !== 'done') {
      const [nx, ny] = toPx(st.nx, st.nz);
      ctx.beginPath();
      ctx.arc(nx, ny, Math.max(1, st.nr * scale), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  drawArrow(ctx, x, y, yaw, size, color) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const a = Math.atan2(fz, fx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.65);
    ctx.lineTo(-size * 0.35, 0);
    ctx.lineTo(-size * 0.7, -size * 0.65);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  drawMinimap() {
    const g = this.game;
    const cvs = this.mm, ctx = this.mmCtx;
    const W = cvs.width;
    const p = g.playerCh.alive || !g.player.spectate ? g.playerCh : g.player.spectate;
    const pos = p.mode === 'bus' ? g.bus.pos : p.pos;
    const viewR = p.mode === 'bus' || p.mode === 'sky' ? 220 : 110;
    const mc = g.world.mapCanvas;
    const s = mc.width / (2 * MAP_VIEW);
    ctx.fillStyle = '#1f6fbf';
    ctx.fillRect(0, 0, W, W);
    ctx.drawImage(mc, (pos.x - viewR + MAP_VIEW) * s, (pos.z - viewR + MAP_VIEW) * s, 2 * viewR * s, 2 * viewR * s, 0, 0, W, W);
    const scale = W / (2 * viewR);
    const toPx = (x, z) => [(x - (pos.x - viewR)) * scale, (z - (pos.z - viewR)) * scale];
    this.drawCircleOverlay(ctx, W, toPx, scale);
    const st = g.storm;
    if (p.mode === 'ground' && st.state !== 'done' && Math.hypot(pos.x - st.nx, pos.z - st.nz) > st.nr) {
      const [nx, ny] = toPx(st.nx, st.nz);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(W / 2, W / 2);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (g.bus.active) this.drawBusPath(ctx, toPx);
    this.drawArrow(ctx, W / 2, W / 2, p === g.playerCh ? g.player.camYaw : p.yaw, W * 0.05, '#ffd400');
  }

  drawBusPath(ctx, toPx) {
    const b = this.game.bus;
    const [ax, ay] = toPx(b.a.x, b.a.z);
    const [bx, by] = toPx(b.b.x, b.b.z);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    const [px, py] = toPx(b.pos.x, b.pos.z);
    ctx.fillStyle = '#2f8cff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  toggleMap(on) {
    this.bigmap.hidden = on === undefined ? !this.bigmap.hidden : !on;
  }

  drawBigMap() {
    const g = this.game;
    const cvs = this.bigCanvas, ctx = this.bigCtx;
    const W = cvs.width;
    const mc = g.world.mapCanvas;
    ctx.drawImage(mc, 0, 0, W, W);
    const scale = W / (2 * MAP_VIEW);
    const toPx = (x, z) => [(x + MAP_VIEW) * scale, (z + MAP_VIEW) * scale];
    this.drawCircleOverlay(ctx, W, toPx, scale);
    if (g.bus.active) this.drawBusPath(ctx, toPx);
    ctx.font = `700 ${Math.round(W / 42)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    for (const poi of g.world.pois) {
      const [x, y] = toPx(poi.x, poi.z);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(poi.name.toUpperCase(), x, y - 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(poi.name.toUpperCase(), x, y - 4);
    }
    const p = g.playerCh;
    const pos = p.mode === 'bus' ? g.bus.pos : p.pos;
    const [px, py] = toPx(pos.x, pos.z);
    this.drawArrow(ctx, px, py, g.player.camYaw, W * 0.018, '#ffd400');
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mmSize = this.mm.clientWidth || 190;
    this.mm.width = this.mm.height = Math.round(mmSize * dpr);
    const bs = this.bigCanvas.clientWidth || 640;
    this.bigCanvas.width = this.bigCanvas.height = Math.round(bs * dpr);
  }
}
