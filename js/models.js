// Kleine Modelle aus Boxen: Waffen, Spitzhacke, Gegenstände
import * as THREE from 'three';
import { RARITIES, AMMO } from './config.js';

const geoCache = new Map();
const matCache = new Map();

export function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}

export function cylGeo(r1, r2, h, seg = 8) {
  const k = `c${r1}|${r2}|${h}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(r1, r2, h, seg));
  return geoCache.get(k);
}

export function lam(color, emissive) {
  const k = `${color}|${emissive || ''}`;
  if (!matCache.has(k)) {
    const m = new THREE.MeshLambertMaterial({ color });
    if (emissive) m.emissive = new THREE.Color(emissive);
    matCache.set(k, m);
  }
  return matCache.get(k);
}

function part(group, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

const DARK = '#2b2e33';
const DARK2 = '#3d4148';

// Waffe zeigt entlang +z, Griff am Ursprung
export function makeGunMesh(id, rarity = 0) {
  const g = new THREE.Group();
  const acc = lam(RARITIES[rarity].color);
  const d = lam(DARK), d2 = lam(DARK2);
  if (id === 'ar') {
    part(g, boxGeo(0.1, 0.16, 0.62), d, 0, 0.06, 0.18);
    part(g, boxGeo(0.05, 0.05, 0.34), d2, 0, 0.09, 0.64);
    part(g, boxGeo(0.07, 0.2, 0.1), d2, 0, -0.1, 0.22);
    part(g, boxGeo(0.08, 0.14, 0.26), acc, 0, 0.03, -0.24);
    part(g, boxGeo(0.06, 0.06, 0.16), acc, 0, 0.18, 0.18);
    part(g, boxGeo(0.06, 0.14, 0.07), d, 0, -0.07, 0.0);
  } else if (id === 'smg') {
    part(g, boxGeo(0.09, 0.14, 0.42), d, 0, 0.05, 0.12);
    part(g, boxGeo(0.045, 0.045, 0.14), d2, 0, 0.07, 0.4);
    part(g, boxGeo(0.06, 0.26, 0.07), acc, 0, -0.13, 0.17);
    part(g, boxGeo(0.06, 0.14, 0.07), d, 0, -0.07, -0.02);
  } else if (id === 'pistol') {
    part(g, boxGeo(0.06, 0.1, 0.28), d, 0, 0.07, 0.08);
    part(g, boxGeo(0.055, 0.16, 0.07), acc, 0, -0.04, -0.01);
  } else if (id === 'shotgun') {
    part(g, boxGeo(0.07, 0.07, 0.86), d, 0, 0.1, 0.32);
    part(g, boxGeo(0.09, 0.09, 0.24), acc, 0, 0.03, 0.42);
    part(g, boxGeo(0.08, 0.13, 0.3), lam('#8a5a2b'), 0, 0.03, -0.18);
    part(g, boxGeo(0.06, 0.14, 0.07), d, 0, -0.07, 0.0);
  } else if (id === 'sniper') {
    part(g, boxGeo(0.08, 0.12, 0.7), d, 0, 0.05, 0.2);
    part(g, boxGeo(0.045, 0.045, 0.5), d2, 0, 0.08, 0.8);
    const sc = part(g, cylGeo(0.05, 0.05, 0.36), acc, 0, 0.19, 0.22);
    sc.rotation.x = Math.PI / 2;
    part(g, boxGeo(0.08, 0.15, 0.3), d2, 0, 0.02, -0.28);
    part(g, boxGeo(0.06, 0.14, 0.07), d, 0, -0.07, 0.0);
  } else if (id === 'rocket') {
    const t = part(g, cylGeo(0.13, 0.13, 1.2, 10), lam('#5f6b3a'), 0, 0.15, 0.2);
    t.rotation.x = Math.PI / 2;
    part(g, boxGeo(0.1, 0.1, 0.2), acc, 0, 0.32, 0.1);
    part(g, boxGeo(0.06, 0.16, 0.08), d, 0, -0.04, 0.0);
  }
  return g;
}

export function makePickaxe() {
  const g = new THREE.Group();
  part(g, boxGeo(0.06, 0.06, 0.95), lam('#7a5230'), 0, 0, 0.35);
  part(g, boxGeo(0.07, 0.5, 0.1), lam('#7f8fa3'), 0, 0.02, 0.82);
  part(g, boxGeo(0.05, 0.14, 0.08), lam('#47c2ff'), 0, 0.3, 0.82);
  return g;
}

export function makeConsumableMesh(id) {
  const g = new THREE.Group();
  if (id === 'bandage') {
    part(g, boxGeo(0.3, 0.12, 0.2), lam('#f2ead8'), 0, 0.06, 0);
    part(g, boxGeo(0.31, 0.04, 0.06), lam('#d9c7a0'), 0, 0.08, 0);
  } else if (id === 'medkit') {
    part(g, boxGeo(0.42, 0.28, 0.2), lam('#f4f4f4'), 0, 0.14, 0);
    part(g, boxGeo(0.2, 0.06, 0.21), lam('#e23b3b'), 0, 0.14, 0.001);
    part(g, boxGeo(0.06, 0.2, 0.21), lam('#e23b3b'), 0, 0.14, 0.002);
  } else if (id === 'shieldSmall') {
    part(g, cylGeo(0.08, 0.1, 0.22), lam('#3aa0ff', '#1a5fb0'), 0, 0.11, 0);
    part(g, cylGeo(0.035, 0.035, 0.08), lam('#ffffff'), 0, 0.26, 0);
  } else {
    part(g, cylGeo(0.15, 0.17, 0.34, 10), lam('#3aa0ff', '#1a5fb0'), 0, 0.17, 0);
    part(g, cylGeo(0.06, 0.08, 0.1), lam('#ffffff'), 0, 0.39, 0);
  }
  return g;
}

export function makeAmmoMesh(type) {
  const g = new THREE.Group();
  const c = AMMO[type].color;
  part(g, boxGeo(0.34, 0.2, 0.22), lam(c), 0, 0.1, 0);
  part(g, boxGeo(0.35, 0.05, 0.23), lam('#e8d27a'), 0, 0.15, 0);
  return g;
}

export function makeMatsMesh(type) {
  const g = new THREE.Group();
  if (type === 'wood') {
    const a = part(g, cylGeo(0.09, 0.09, 0.5, 7), lam('#a8743f'), 0, 0.1, -0.06);
    a.rotation.z = Math.PI / 2;
    const b = part(g, cylGeo(0.09, 0.09, 0.5, 7), lam('#8f6232'), 0, 0.1, 0.12);
    b.rotation.z = Math.PI / 2;
    const c = part(g, cylGeo(0.09, 0.09, 0.5, 7), lam('#a8743f'), 0, 0.25, 0.03);
    c.rotation.z = Math.PI / 2;
  } else if (type === 'stone') {
    part(g, boxGeo(0.28, 0.2, 0.22), lam('#9a968e'), -0.08, 0.1, 0);
    part(g, boxGeo(0.22, 0.18, 0.2), lam('#b0aca2'), 0.14, 0.09, 0.05);
  } else {
    part(g, boxGeo(0.42, 0.06, 0.3), lam('#aab6c2'), 0, 0.03, 0);
    part(g, boxGeo(0.42, 0.06, 0.3), lam('#8d99a6'), 0.02, 0.09, 0.02);
  }
  return g;
}

export function makeItemMesh(item) {
  if (item.kind === 'weapon') return makeGunMesh(item.id, item.rarity);
  if (item.kind === 'consumable') return makeConsumableMesh(item.id);
  if (item.kind === 'ammo') return makeAmmoMesh(item.type);
  return makeMatsMesh(item.type);
}
