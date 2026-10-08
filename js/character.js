// Blockige Spielfigur mit Animationen
import * as THREE from 'three';
import { boxGeo, cylGeo, lam, makeGunMesh, makePickaxe, makeConsumableMesh } from './models.js';
import { lerp } from './util.js';

function add(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

let bubbleMat = null;

function makeGlider(color) {
  const g = new THREE.Group();
  const canopyGeo = new THREE.SphereGeometry(1.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.3);
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(canopyGeo, mat);
  canopy.scale.set(1.35, 0.45, 0.85);
  canopy.position.y = 2.75;
  canopy.castShadow = true;
  g.add(canopy);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.52, 14, 2, 0, Math.PI * 2, 0.55, 0.12), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  stripe.scale.copy(canopy.scale);
  stripe.position.copy(canopy.position);
  g.add(stripe);
  const strut = lam('#333333');
  for (const s of [-1, 1]) {
    const b = add(g, boxGeo(0.04, 1.2, 0.04), strut, s * 0.75, 2.05, 0);
    b.rotation.z = s * 0.45;
  }
  add(g, boxGeo(1.0, 0.05, 0.05), strut, 0, 2.15, 0.05);
  return g;
}

export class CharacterModel {
  constructor(skin) {
    this.skin = skin;
    const S = skin;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.95;
    this.root.add(this.body);

    this.legL = new THREE.Group();
    this.legL.position.set(0.13, 0, 0);
    this.legR = new THREE.Group();
    this.legR.position.set(-0.13, 0, 0);
    this.body.add(this.legL, this.legR);
    for (const leg of [this.legL, this.legR]) {
      add(leg, boxGeo(0.21, 0.82, 0.24), lam(S.pants), 0, -0.41, 0);
      add(leg, boxGeo(0.23, 0.14, 0.32), lam(S.shoes), 0, -0.88, 0.04);
    }

    this.torso = new THREE.Group();
    this.body.add(this.torso);
    add(this.torso, boxGeo(0.54, 0.64, 0.3), lam(S.shirt), 0, 0.32, 0);
    add(this.torso, boxGeo(0.56, 0.08, 0.32), lam(shade(S.pants, 0.6)), 0, 0.03, 0);
    add(this.torso, boxGeo(0.4, 0.46, 0.18), lam(S.pack), 0, 0.34, -0.24);
    add(this.torso, boxGeo(0.3, 0.1, 0.05), lam(shade(S.pack, 0.7)), 0, 0.44, -0.34);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.66, 0);
    this.torso.add(this.head);
    this.buildHead(S);

    this.armL = new THREE.Group();
    this.armL.position.set(0.36, 0.58, 0);
    this.armR = new THREE.Group();
    this.armR.position.set(-0.36, 0.58, 0);
    this.torso.add(this.armL, this.armR);
    const handCol = S.hat === 'helmet' ? '#8d949e' : S.hat === 'astro' ? '#f2f2f2' : S.skin;
    for (const arm of [this.armL, this.armR]) {
      add(arm, boxGeo(0.17, 0.52, 0.19), lam(S.sleeve), 0, -0.25, 0);
      add(arm, boxGeo(0.15, 0.14, 0.17), lam(handCol), 0, -0.58, 0);
    }
    this.handR = new THREE.Group();
    this.handR.position.set(0, -0.6, 0.03);
    this.armR.add(this.handR);

    this.glider = makeGlider(S.glider);
    this.glider.visible = false;
    this.root.add(this.glider);

    this.held = null;
    this.heldKey = '';
    this.walkPhase = 0;
    this.t = Math.random() * 10;
    this.deathT = 0;
  }

  buildHead(S) {
    const h = this.head;
    const eye = lam('#16161a');
    const face = (y = 0.22, z = 0.181) => {
      add(h, boxGeo(0.06, 0.075, 0.02), eye, 0.085, y, z);
      add(h, boxGeo(0.06, 0.075, 0.02), eye, -0.085, y, z);
    };
    const mouth = (y = 0.1) => add(h, boxGeo(0.12, 0.025, 0.02), lam('#7a2a2a'), 0, y, 0.181);
    switch (S.hat) {
      case 'helmet':
        add(h, boxGeo(0.42, 0.44, 0.42), lam(S.shirt), 0, 0.2, 0);
        add(h, boxGeo(0.3, 0.05, 0.02), lam('#111111'), 0, 0.24, 0.212);
        add(h, boxGeo(0.06, 0.2, 0.32), lam(S.pack), 0, 0.5, -0.02);
        break;
      case 'banana':
        add(h, boxGeo(0.36, 0.62, 0.36), lam(S.skin), 0, 0.3, 0);
        add(h, boxGeo(0.08, 0.16, 0.08), lam(S.hair), 0, 0.68, -0.04);
        face(0.34);
        mouth(0.2);
        break;
      case 'mask':
        add(h, boxGeo(0.38, 0.4, 0.38), lam(S.hair), 0, 0.19, 0);
        add(h, boxGeo(0.3, 0.09, 0.02), lam(S.skin), 0, 0.23, 0.191);
        face(0.23, 0.2);
        add(h, boxGeo(0.06, 0.2, 0.03), lam(S.pack), 0.1, 0.25, -0.2);
        break;
      case 'hood':
        add(h, boxGeo(0.42, 0.45, 0.42), lam(S.hair), 0, 0.21, 0);
        add(h, boxGeo(0.28, 0.28, 0.02), lam('#0d0a12'), 0, 0.18, 0.211);
        add(h, boxGeo(0.05, 0.04, 0.02), lam('#c06bff', '#9b30ff'), 0.06, 0.21, 0.222);
        add(h, boxGeo(0.05, 0.04, 0.02), lam('#c06bff', '#9b30ff'), -0.06, 0.21, 0.222);
        break;
      case 'astro': {
        add(h, boxGeo(0.36, 0.38, 0.36), lam(S.skin), 0, 0.19, 0);
        add(h, boxGeo(0.38, 0.1, 0.38), lam(S.hair), 0, 0.4, 0);
        face();
        mouth();
        if (!bubbleMat) bubbleMat = new THREE.MeshPhongMaterial({ color: 0xcfefff, transparent: true, opacity: 0.28, shininess: 100, depthWrite: false });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), bubbleMat);
        b.position.y = 0.2;
        h.add(b);
        const ring = add(h, cylGeo(0.3, 0.3, 0.08, 14), lam('#e0e0e0'), 0, -0.02, 0);
        ring.castShadow = false;
        break;
      }
      case 'ears':
        add(h, boxGeo(0.38, 0.38, 0.36), lam(S.skin), 0, 0.19, 0);
        add(h, boxGeo(0.12, 0.12, 0.08), lam(S.skin), 0.14, 0.43, 0);
        add(h, boxGeo(0.12, 0.12, 0.08), lam(S.skin), -0.14, 0.43, 0);
        add(h, boxGeo(0.17, 0.1, 0.06), lam('#ffd3e8'), 0, 0.12, 0.2);
        add(h, boxGeo(0.06, 0.04, 0.02), lam('#16161a'), 0, 0.15, 0.235);
        face(0.25, 0.191);
        break;
      case 'cap':
        add(h, boxGeo(0.36, 0.38, 0.36), lam(S.skin), 0, 0.19, 0);
        add(h, boxGeo(0.39, 0.11, 0.39), lam(S.cap), 0, 0.41, 0);
        add(h, boxGeo(0.32, 0.03, 0.18), lam(S.cap), 0, 0.37, 0.26);
        add(h, boxGeo(0.38, 0.2, 0.08), lam(S.hair), 0, 0.28, -0.16);
        face();
        mouth();
        break;
      default:
        add(h, boxGeo(0.36, 0.38, 0.36), lam(S.skin), 0, 0.19, 0);
        add(h, boxGeo(0.39, 0.12, 0.39), lam(S.hair), 0, 0.41, 0);
        add(h, boxGeo(0.39, 0.26, 0.1), lam(S.hair), 0, 0.28, -0.15);
        add(h, boxGeo(0.39, 0.06, 0.06), lam(S.hair), 0, 0.36, 0.17);
        face();
        mouth();
    }
  }

  setHeld(kind, id, rarity = 0) {
    const key = `${kind}|${id}|${rarity}`;
    if (key === this.heldKey) return;
    this.heldKey = key;
    if (this.held) this.handR.remove(this.held);
    this.held = null;
    let m = null;
    if (kind === 'weapon') m = makeGunMesh(id, rarity);
    else if (kind === 'pickaxe') m = makePickaxe();
    else if (kind === 'consumable') {
      m = makeConsumableMesh(id);
      m.rotation.x = -Math.PI / 2;
    }
    if (m) {
      if (kind !== 'consumable') m.rotation.x = Math.PI / 2;
      m.position.set(0, -0.04, 0.02);
      this.handR.add(m);
      this.held = m;
    }
  }

  // st: speed, mode, onGround, pitch, hold, swing, using, emote, dead, recoil
  update(dt, st) {
    this.t += dt;
    const { body, legL, legR, armL, armR, head, torso } = this;
    const sp = st.speed || 0;
    const moveAmt = Math.min(1, sp / 6);
    if (st.onGround) this.walkPhase += dt * (3 + sp * 1.35);
    const swing = Math.sin(this.walkPhase) * 0.8 * moveAmt;

    body.rotation.set(0, 0, 0);
    body.position.y = 0.95;
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);
    this.glider.visible = st.mode === 'glide';

    if (st.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT * 2.5);
      body.rotation.x = -k * Math.PI / 2;
      body.position.y = 0.95 - 0.65 * k;
      armL.rotation.set(-0.3, 0, 0.6);
      armR.rotation.set(-0.3, 0, -0.6);
      return;
    }

    if (st.mode === 'sky') {
      body.rotation.x = 1.25;
      body.position.y = 1.2;
      const f = Math.sin(this.t * 9) * 0.05;
      armL.rotation.set(-0.4, 0, 1.25 + f);
      armR.rotation.set(-0.4, 0, -1.25 - f);
      legL.rotation.set(0.3, 0, 0.28);
      legR.rotation.set(0.3, 0, -0.28);
      head.rotation.x = -0.9;
      return;
    }
    if (st.mode === 'glide') {
      armL.rotation.set(-Math.PI + 0.1, 0, 0.32);
      armR.rotation.set(-Math.PI + 0.1, 0, -0.32);
      const f = Math.sin(this.t * 3) * 0.15;
      legL.rotation.x = 0.25 + f;
      legR.rotation.x = 0.1 - f;
      return;
    }

    if (st.emote) {
      const t = this.t * 6.5;
      body.position.y = 0.95 + Math.abs(Math.sin(t)) * 0.07;
      body.rotation.y = Math.sin(t * 0.5) * 0.4;
      armL.rotation.set(-Math.PI * 0.55 + Math.sin(t) * 0.9, 0, 0.35 + Math.cos(t) * 0.45);
      armR.rotation.set(-Math.PI * 0.55 - Math.sin(t) * 0.9, 0, -0.35 - Math.cos(t) * 0.45);
      legL.rotation.x = -Math.max(0, Math.sin(t)) * 0.7;
      legR.rotation.x = -Math.max(0, -Math.sin(t)) * 0.7;
      head.rotation.z = Math.sin(t) * 0.2;
      return;
    }

    if (st.onGround) {
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      torso.rotation.x = moveAmt * 0.08;
    } else {
      legL.rotation.x = -0.6;
      legR.rotation.x = 0.35;
    }
    const p = st.pitch || 0;
    head.rotation.x = -p * 0.5;
    if (st.hold === 'weapon' || st.hold === 'build') {
      const rc = st.recoil || 0;
      armR.rotation.set(-Math.PI / 2 - p - rc * 0.25, 0, 0.04);
      armL.rotation.set(-Math.PI / 2 - p + 0.12 - rc * 0.2, 0, -0.55);
    } else if (st.hold === 'pickaxe') {
      if (st.swing >= 0) {
        const s = st.swing;
        const a = s < 0.3 ? lerp(-0.7, -2.9, s / 0.3) : lerp(-2.9, -0.25, Math.min(1, (s - 0.3) / 0.45));
        armR.rotation.set(a, 0, 0.12);
        torso.rotation.y = s < 0.3 ? -0.2 : 0.15;
      } else {
        armR.rotation.set(-0.55 - swing * 0.2, 0, 0.12);
      }
      armL.rotation.set(-swing * 0.8, 0, 0.08);
    } else if (st.hold === 'consumable' && st.using) {
      const b = Math.sin(this.t * 10) * 0.08;
      armR.rotation.set(-1.15 + b, 0, 0.25);
      armL.rotation.set(-1.15 - b, 0, -0.25);
    } else {
      armL.rotation.set(-swing, 0, 0.08);
      armR.rotation.set(swing, 0, -0.08);
    }
  }
}
