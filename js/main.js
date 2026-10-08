// Strothnite – Hauptprogramm: Lobby, Match-Aufbau, Spielschleife
import * as THREE from 'three';
import { SKINS, BOT_NAMES, TIPS, DIFFICULTY } from './config.js';
import { mulberry32 } from './util.js';
import { Physics } from './physics.js';
import { World } from './world.js';
import { BuildSystem } from './builds.js';
import { Effects } from './effects.js';
import { LootSystem } from './loot.js';
import { Combat } from './combat.js';
import { Storm } from './storm.js';
import { BattleBus } from './bus.js';
import { Character } from './entity.js';
import { BotBrain } from './bot.js';
import { PlayerController } from './player.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { Lobby } from './lobby.js';

const $ = (id) => document.getElementById(id);
const STORE = 'strothnite-settings-v1';

const DEFAULTS = {
  name: 'Strothi', skin: 'johann', sens: 1, fov: 80, volume: 0.6, shadows: true, quality: 1,
  fps: false, bots: 49, difficulty: 'mittel',
};

function loadSettings(extra) {
  let s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch (e) { /* Speicher nicht verfügbar */ }
  if (extra) s = { ...s, ...extra };
  if (!DIFFICULTY[s.difficulty]) s.difficulty = 'mittel';
  return s;
}

const DATIV = {
  Sturmgewehr: 'einem Sturmgewehr', Maschinenpistole: 'einer Maschinenpistole', Pistole: 'einer Pistole',
  'Pump-Shotgun': 'einer Pump-Shotgun', 'Scharfschützengewehr': 'einem Scharfschützengewehr',
  Raketenwerfer: 'einem Raketenwerfer', Spitzhacke: 'der Spitzhacke',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function botSkin(r) {
  const base = SKINS[Math.floor(r() * SKINS.length)];
  if (r() < 0.45) return base;
  const hue = Math.floor(r() * 360);
  return {
    ...base,
    shirt: `hsl(${hue}, 55%, 46%)`,
    sleeve: r() < 0.5 ? `hsl(${hue}, 55%, 46%)` : base.skin,
    pants: `hsl(${(hue + 160 + Math.floor(r() * 60)) % 360}, 28%, 30%)`,
    pack: `hsl(${(hue + 40) % 360}, 60%, 50%)`,
    glider: `hsl(${(hue + 90) % 360}, 70%, 55%)`,
  };
}

class Game {
  constructor(data) {
    this.canvas = $('game');
    this.settings = loadSettings(data && data.settings);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.audio = new AudioSys();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(this.canvas, (locked) => this.onLockChange(locked));
    this.lobby = new Lobby(this);
    this.hud = new HUD(this);
    this.state = 'lobby';
    this.paused = false;
    this.time = 0;
    this.chars = [];
    document.body.classList.add('in-lobby');
    this.bindUI();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    window.claude?.hot?.snapshot?.(() => ({ settings: this.settings }));
  }

  saveSettings() {
    try { localStorage.setItem(STORE, JSON.stringify(this.settings)); } catch (e) { /* Speicher nicht verfügbar */ }
  }

  // ---------- Oberfläche ----------
  bindUI() {
    const s = this.settings;
    for (const b of document.querySelectorAll('.tabs button')) {
      b.addEventListener('click', () => {
        this.audio.init();
        this.audio.play('ui');
        for (const o of document.querySelectorAll('.tabs button')) o.classList.toggle('active', o === b);
        for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.id !== 'tab-' + b.dataset.tab;
      });
    }
    this.lobby.buildLocker((id) => {
      this.settings.skin = id;
      this.saveSettings();
      this.lobby.setSkin(id);
      this.lobby.markSkin(id);
      this.audio.init();
      this.audio.play('pickup');
    });
    const nameIn = $('player-name');
    nameIn.value = s.name;
    nameIn.addEventListener('input', () => {
      this.settings.name = nameIn.value.trim().slice(0, 16) || 'Strothi';
      this.saveSettings();
    });
    const bind = (id, key, parse, fmt) => {
      for (const el of document.querySelectorAll(`[data-setting="${key}"]`)) {
        const isBox = el.type === 'checkbox';
        if (isBox) el.checked = !!s[key]; else el.value = s[key];
        const out = el.parentElement.querySelector('output');
        if (out && fmt) out.textContent = fmt(s[key]);
        el.addEventListener('input', () => {
          const v = isBox ? el.checked : parse(el.value);
          this.settings[key] = v;
          for (const other of document.querySelectorAll(`[data-setting="${key}"]`)) {
            if (other === el) continue;
            if (other.type === 'checkbox') other.checked = !!v; else other.value = v;
            const o2 = other.parentElement.querySelector('output');
            if (o2 && fmt) o2.textContent = fmt(v);
          }
          if (out && fmt) out.textContent = fmt(v);
          this.applySettings();
          this.saveSettings();
        });
      }
      void id;
    };
    bind('sens', 'sens', parseFloat, (v) => Number(v).toFixed(2));
    bind('fov', 'fov', parseFloat, (v) => Math.round(v) + '°');
    bind('volume', 'volume', parseFloat, (v) => Math.round(v * 100) + ' %');
    bind('quality', 'quality', parseFloat, (v) => Math.round(v * 100) + ' %');
    bind('shadows', 'shadows', (v) => v);
    bind('fps', 'fps', (v) => v);
    bind('bots', 'bots', (v) => parseInt(v, 10));
    bind('difficulty', 'difficulty', (v) => v);

    $('play-btn').addEventListener('click', () => this.startMatch());
    $('resume-btn').addEventListener('click', () => this.resume());
    $('leave-btn').addEventListener('click', () => this.toLobby());
    $('end-lobby').addEventListener('click', () => this.toLobby());
    $('end-spectate').addEventListener('click', () => {
      $('end').hidden = true;
      this.hud.show(true);
      this.input.lock();
    });
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mobile-note').hidden = false;
  }

  applySettings() {
    const s = this.settings;
    this.audio.setVolume(s.volume);
    this.renderer.shadowMap.enabled = !!s.shadows;
    if (this.sun) this.sun.castShadow = !!s.shadows;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * (this.state === 'match' ? this.settings.quality : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.lobby.resize(w, h);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.hud.resize();
  }

  setLoading(label, f) {
    $('loading-label').textContent = label;
    $('loading-fill').style.width = Math.round(f * 100) + '%';
  }

  // ---------- Match ----------
  async startMatch() {
    if (this.state !== 'lobby') return;
    this.audio.init();
    this.audio.play('ui');
    this.state = 'loading';
    $('lobby').hidden = true;
    document.body.classList.remove('in-lobby');
    $('loading').hidden = false;
    $('loading-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const seed = (Math.random() * 1e9) | 0;
    this.rand = mulberry32(seed);
    this.time = 0;
    this.chars = [];
    this.matchOver = false;
    this.endShown = false;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color('#cfeaff');
    scene.fog = new THREE.Fog(0xcfe6ff, 200, 700);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, 2500);
    this.camera.rotation.order = 'YXZ';
    scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5d7a3e, 1.35));
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.castShadow = !!this.settings.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    this.renderer.shadowMap.enabled = !!this.settings.shadows;

    this.physics = new Physics(null);
    this.world = new World(this, seed);
    this.physics.world = this.world;
    this.effects = new Effects(this);
    this.builds = new BuildSystem(this);
    const steps = this.world.steps();
    for (let i = 0; i < steps.length; i++) {
      this.setLoading(steps[i][0], i / (steps.length + 1));
      await nextFrame();
      steps[i][1]();
    }
    this.setLoading('Spieler steigen in den Bus …', steps.length / (steps.length + 1));
    await nextFrame();
    this.loot = new LootSystem(this);
    this.loot.populate(this.world.lootSpots);
    this.combat = new Combat(this);
    this.storm = new Storm(this);
    this.bus = new BattleBus(this);

    const skin = SKINS.find((x) => x.id === this.settings.skin) || SKINS[0];
    this.playerCh = new Character(this, { name: this.settings.name || 'Strothi', isPlayer: true, skin });
    this.chars.push(this.playerCh);
    this.player = new PlayerController(this, this.playerCh);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const n = Math.max(1, Math.min(99, this.settings.bots | 0));
    for (let i = 0; i < n; i++) {
      const ch = new Character(this, { name: names[i % names.length] + (i >= names.length ? i : ''), skin: botSkin(this.rand) });
      new BotBrain(this, ch, this.settings.difficulty);
      this.chars.push(ch);
    }
    this.aliveCount = this.chars.length;
    this.totalPlayers = this.chars.length;
    this.player.camYaw = Math.atan2(-this.bus.dir.x, -this.bus.dir.z);
    this.player.camPitch = -0.35;

    this.setLoading('Los geht’s!', 1);
    await nextFrame();
    $('loading').hidden = true;
    this.state = 'match';
    this.resize();
    this.hud.cache = {};
    this.hud.slotSig = ['', '', '', '', '', ''];
    $('killfeed').innerHTML = '';
    this.hud.show(true);
    this.input.enabled = true;
    this.paused = true;
    this.showPause(true, true);
    this.audio.play('busHorn');
  }

  showPause(on, first) {
    $('pause').hidden = !on;
    if (on) {
      $('pause-title').textContent = first ? 'Bereit zum Abflug?' : 'Pausiert';
      $('resume-btn').textContent = first ? 'In den Bus steigen' : 'Weiterspielen';
    }
  }

  resume() {
    this.audio.init();
    this.showPause(false);
    this.paused = false;
    this.input.lock();
  }

  onLockChange(locked) {
    if (this.state !== 'match') return;
    if (!locked && !this.input.lockFailed && $('end').hidden) {
      this.paused = true;
      this.showPause(true, false);
      this.hud.toggleMap(false);
    }
  }

  toLobby() {
    this.input.unlock();
    this.input.enabled = false;
    this.audio.stopLoops();
    this.hud.show(false);
    this.hud.toggleMap(false);
    $('pause').hidden = true;
    $('end').hidden = true;
    this.disposeMatch();
    this.state = 'lobby';
    this.paused = false;
    $('lobby').hidden = false;
    document.body.classList.add('in-lobby');
    this.resize();
  }

  disposeMatch() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    this.renderer.renderLists.dispose();
    this.scene = null;
    this.chars = [];
    this.sun = null;
  }

  onPlayerDamaged(attacker, s, h, opts) {
    if (attacker && attacker !== this.playerCh) this.hud.damageDir(attacker);
    this.hud.hurtFlash();
    if (h > 0 || s > 0) this.audio.play('hurt');
    if (!opts.storm) this.player.shake(0.25);
  }

  onKilled(victim, killer, weaponName) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.placement = this.aliveCount;
    this.aliveCount--;
    victim.using = null;
    victim.cancelReload();
    victim.emote = false;
    victim.deadT = 0;
    this.loot.dropAll(victim);
    this.effects.eliminate(victim);
    if (killer && killer !== victim) killer.kills++;
    let text;
    if (weaponName === 'Sturm') text = `${victim.name} ist im Sturm untergegangen`;
    else if (weaponName === 'Sturz') text = `${victim.name} ist zu tief gefallen`;
    else if (killer && killer !== victim) text = `${killer.name} hat ${victim.name} mit ${DATIV[weaponName] || weaponName} eliminiert`;
    else text = `${victim.name} hat sich selbst eliminiert`;
    this.hud.killfeed(text, (killer && killer.isPlayer) || victim.isPlayer);
    if (killer && killer.isPlayer && victim !== killer) {
      this.hud.centerMsg(`Du hast <b>${esc(victim.name)}</b> eliminiert<small>${killer.kills} ${killer.kills === 1 ? 'Eliminierung' : 'Eliminierungen'}</small>`);
      this.audio.play('elim');
    }
    if (victim.isPlayer) {
      this.player.setBuild(false);
      this.audio.play('defeat');
      setTimeout(() => this.showEnd(false, killer, weaponName), 1800);
    }
    if (this.aliveCount <= 1 && !this.matchOver) {
      this.matchOver = true;
      const winner = this.chars.find((c) => c.alive);
      if (winner) winner.placement = 1;
      if (winner && winner.isPlayer) {
        setTimeout(() => this.showEnd(true), 1200);
      } else if (winner) {
        this.hud.banner(`${winner.name} hat gewonnen!`, '#ffd400');
        if (!this.playerCh.alive) setTimeout(() => this.showEnd(false, this.playerCh.lastAttacker, null, winner), 2200);
      }
    }
  }

  showEnd(victory, killer, weaponName, winner) {
    if (this.state !== 'match') return;
    const p = this.playerCh;
    this.endShown = true;
    $('end').hidden = false;
    this.hud.show(false);
    this.hud.toggleMap(false);
    $('end').classList.toggle('victory', victory);
    $('end-place').textContent = '#' + (victory ? 1 : p.placement);
    $('end-title').textContent = victory ? 'STROTH ROYALE' : 'Ausgeschieden';
    let sub = '';
    if (victory) sub = 'Du bist der letzte Strothi auf der Insel!';
    else if (winner) sub = `${winner.name} hat das Match gewonnen.`;
    else if (weaponName === 'Sturm') sub = 'Der Sturm hat dich erwischt.';
    else if (weaponName === 'Sturz') sub = 'Du bist zu tief gefallen.';
    else if (killer && killer !== p) sub = `Eliminiert von ${killer.name}${weaponName && DATIV[weaponName] ? ' mit ' + DATIV[weaponName] : ''}.`;
    else sub = 'Du hast dich selbst eliminiert.';
    $('end-sub').textContent = sub;
    $('end-kills').textContent = p.kills;
    $('end-players').textContent = this.totalPlayers;
    $('end-time').textContent = `${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`;
    $('end-spectate').hidden = victory || this.aliveCount <= 1;
    this.input.unlock();
    if (victory) {
      this.audio.play('victory');
      this.effects.confetti(p.pos.x, p.pos.y, p.pos.z);
      p.emote = true;
    }
  }

  updateSun() {
    const f = this.camera.position;
    const tx = Math.round(f.x / 4) * 4, tz = Math.round(f.z / 4) * 4;
    const ty = this.world.terrainHeight(tx, tz);
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + this.sunDir.x * 200, ty + this.sunDir.y * 200, tz + this.sunDir.z * 200);
  }

  updateMatch(dt) {
    this.time += dt;
    const inp = this.input;
    if (inp.hit('KeyM')) this.hud.toggleMap();
    if (inp.hit('Escape') && this.input.lockFailed) {
      this.paused = true;
      this.showPause(true, false);
      return;
    }
    this.bus.update(dt);
    this.storm.update(dt);
    this.player.update(dt);
    for (const ch of this.chars) if (ch.brain && ch.alive) ch.brain.update(dt);

    const cam = this.camera.position;
    const scoped = this.player.scoped();
    for (const ch of this.chars) {
      if (ch.alive) ch.updateTimers(dt);
      else ch.deadT += dt;
      const dist = Math.abs(ch.pos.x - cam.x) + Math.abs(ch.pos.z - cam.z);
      const vis = ch.mode !== 'bus' && (ch.alive || ch.deadT < 1.1) && dist < 520 && !(ch.isPlayer && scoped);
      ch.model.root.visible = vis;
      if (vis) ch.syncModel(dt);
      // Schritte von Gegnern in der Nähe
      if (!ch.isPlayer && ch.alive && ch.mode === 'ground' && ch.onGround && dist < 40) {
        const sp = Math.hypot(ch.vel.x, ch.vel.z);
        if (sp > 2) {
          ch.stepT -= dt * sp;
          if (ch.stepT <= 0) { ch.stepT = 2.6; this.audio.play('step', ch.pos); }
        }
      }
    }
    this.combat.update(dt);
    this.builds.update(dt);
    this.loot.update(dt);
    this.effects.update(dt);
    this.player.updateCamera(dt);
    this.world.update(dt, this.camera);
    this.updateSun();
    const h = Math.max(0, cam.y - 20);
    this.scene.fog.near = 160 + h;
    this.scene.fog.far = 620 + h * 2.4;

    this.audio.setListener(cam.x, cam.y, cam.z, this.player.camYaw);
    const p = this.playerCh;
    let chest = 0;
    if (p.alive && p.mode === 'ground') {
      for (const c of this.loot.chests) {
        if (c.opened || c.ammoBox) continue;
        const d = Math.hypot(c.x - p.pos.x, c.y - p.pos.y, c.z - p.pos.z);
        if (d < 14) chest = Math.max(chest, (1 - d / 14) ** 2);
      }
    }
    this.audio.setLoop('chest', chest * 0.5);
    this.audio.setLoop('wind', p.alive && p.mode === 'sky' ? 0.35 : p.alive && p.mode === 'glide' ? 0.15 : 0);
    this.audio.setLoop('storm', p.alive && p.mode !== 'bus' && this.storm.isOutside(p.pos.x, p.pos.z) ? 0.5 : 0);
    this.hud.update(dt);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.state === 'match' && this.scene) {
      if (!this.paused) this.updateMatch(dt);
      else {
        this.player.updateCamera(0);
        this.world.update(0, this.camera);
        this.hud.update(0);
      }
      this.renderer.render(this.scene, this.camera);
    } else {
      this.lobby.update(dt);
      this.renderer.render(this.lobby.scene, this.lobby.camera);
    }
    this.input.endFrame();
  }
}

function start(data) {
  try {
    window.strothnite = new Game(data || {});
  } catch (err) {
    console.error(err);
    const el = document.getElementById('fatal');
    if (el) {
      el.hidden = false;
      el.querySelector('p').textContent = 'Strothnite konnte nicht starten: ' + (err && err.message ? err.message : err);
    }
  }
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
