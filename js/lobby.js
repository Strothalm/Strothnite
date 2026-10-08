// Lobby: 3D-Vorschau der Figur, Spind, Einstellungen
import * as THREE from 'three';
import { CharacterModel } from './character.js';
import { SKINS, RARITIES } from './config.js';

const $ = (id) => document.getElementById(id);

export class Lobby {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x203060, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9b6bff, 2.2);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.22, 40), new THREE.MeshLambertMaterial({ color: 0x14306e }));
    plat.position.y = -0.11;
    this.scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 8, 60), new THREE.MeshBasicMaterial({ color: 0x5fd0ff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.model = null;
    this.t = 0;
    this.emote = false;
    this.emoteT = 4;
    this.dragging = false;
    this.spin = 0;
    this.setSkin(game.settings.skin);
  }

  setSkin(id) {
    const skin = SKINS.find((s) => s.id === id) || SKINS[0];
    if (this.model) this.pivot.remove(this.model.root);
    this.model = new CharacterModel(skin);
    this.model.root.visible = true;
    this.model.setHeld('pickaxe', 'pickaxe');
    this.pivot.add(this.model.root);
    this.emote = true;
    this.emoteT = 2.5;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    const narrow = w < 820;
    this.pivot.position.x = narrow ? 0 : 1.15;
    this.camera.position.set(0, 1.35, narrow ? 7.6 : 6.6);
    this.camera.lookAt(0, narrow ? 0.65 : 1.0, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    this.emoteT -= dt;
    if (this.emoteT <= 0) {
      this.emote = !this.emote;
      this.emoteT = this.emote ? 3 : 5 + Math.random() * 3;
    }
    this.spin += dt * 0.35;
    this.pivot.rotation.y = Math.sin(this.spin) * 0.5;
    this.model.update(dt, { speed: 0, mode: 'ground', onGround: true, pitch: 0, hold: 'pickaxe', swing: -1, emote: this.emote });
  }

  buildLocker(onPick) {
    const grid = $('skin-grid');
    grid.innerHTML = '';
    for (const s of SKINS) {
      const b = document.createElement('button');
      b.className = 'skin-card';
      b.type = 'button';
      b.style.setProperty('--rar', RARITIES[s.rarity].color);
      b.dataset.id = s.id;
      b.innerHTML = `<span class="swatch"><i style="background:${s.shirt}"></i><i style="background:${s.pants}"></i><i style="background:${s.pack}"></i></span>
        <span class="skin-name"></span><span class="skin-rar">${RARITIES[s.rarity].name}</span><span class="skin-desc"></span>`;
      b.querySelector('.skin-name').textContent = s.name;
      b.querySelector('.skin-desc').textContent = s.desc;
      b.addEventListener('click', () => onPick(s.id));
      grid.appendChild(b);
    }
    this.markSkin(this.game.settings.skin);
  }

  markSkin(id) {
    for (const b of document.querySelectorAll('.skin-card')) b.classList.toggle('sel', b.dataset.id === id);
    const s = SKINS.find((x) => x.id === id) || SKINS[0];
    $('equipped-name').textContent = s.name;
    $('equipped-rar').textContent = RARITIES[s.rarity].name;
    $('equipped-rar').style.color = RARITIES[s.rarity].color;
  }
}
