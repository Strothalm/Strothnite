// Der Strothi-Bus: fliegt über die Insel, von hier springen alle ab
import * as THREE from 'three';
import { BUS } from './config.js';
import { tex } from './textures.js';
import { lam, boxGeo, cylGeo } from './models.js';

export class BattleBus {
  constructor(game) {
    this.game = game;
    const ang = Math.random() * Math.PI * 2;
    const off = (Math.random() - 0.5) * 220;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const px = -dz, pz = dx;
    this.dir = new THREE.Vector3(dx, 0, dz);
    this.a = new THREE.Vector3(-dx * BUS.half + px * off, BUS.height, -dz * BUS.half + pz * off);
    this.b = new THREE.Vector3(dx * BUS.half + px * off, BUS.height, dz * BUS.half + pz * off);
    this.len = this.a.distanceTo(this.b);
    this.t = 0;
    this.pos = this.a.clone();
    this.active = true;
    this.mesh = this.build();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    game.scene.add(this.mesh);
  }

  build() {
    const g = new THREE.Group();
    const sideMat = new THREE.MeshLambertMaterial({ map: tex('bus') });
    const plain = lam('#2a6fdb');
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3, 8), [sideMat, sideMat, plain, plain, plain, plain]);
    body.material = [
      new THREE.MeshLambertMaterial({ map: tex('bus') }),
      new THREE.MeshLambertMaterial({ map: tex('bus') }),
      plain, lam('#1f4fa8'), lam('#d9e8ff'), plain,
    ];
    body.position.y = 1.5;
    g.add(body);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    add(boxGeo(2.6, 1.0, 0.1), lam('#1b2a44'), 0, 2.2, 4.01);
    add(boxGeo(2.9, 0.35, 0.3), lam('#e8e8e8'), 0, 0.5, 4.05);
    for (const [x, z] of [[-1.4, 2.6], [1.4, 2.6], [-1.4, -2.6], [1.4, -2.6]]) {
      const wheel = add(cylGeo(0.55, 0.55, 0.4, 12), lam('#1a1a1a'), x, 0.1, z);
      wheel.rotation.z = Math.PI / 2;
    }
    // Ballon
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(4.8, 20, 14), new THREE.MeshLambertMaterial({ color: 0x2f8cff }));
    balloon.scale.y = 1.15;
    balloon.position.y = 12;
    g.add(balloon);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(4.86, 4.86, 1.4, 20, 1, true), lam('#ffd400'));
    band.position.y = 12;
    g.add(band);
    for (const [x, z] of [[-1.2, 3.5], [1.2, 3.5], [-1.2, -3.5], [1.2, -3.5]]) {
      const rope = add(boxGeo(0.06, 7, 0.06), lam('#444444'), x * 1.4, 6.3, z * 0.8);
      rope.rotation.x = z > 0 ? 0.32 : -0.32;
      rope.rotation.z = x > 0 ? -0.18 : 0.18;
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  get progress() { return this.t; }
  get canDrop() { return this.t > 0.06; }

  // t-Wert, an dem der Bus einem Punkt am nächsten ist
  closestT(x, z) {
    const ax = this.a.x, az = this.a.z;
    const bx = this.b.x - ax, bz = this.b.z - az;
    const t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz);
    return Math.min(0.97, Math.max(0.08, t));
  }

  drop(ch) {
    ch.mode = 'sky';
    ch.pos.set(this.pos.x, this.pos.y - 3, this.pos.z);
    ch.vel.set(this.dir.x * 8, -6, this.dir.z * 8);
    ch.model.root.visible = true;
    ch.yaw = Math.atan2(-this.dir.x, -this.dir.z);
  }

  update(dt) {
    if (!this.active) return;
    this.t += (BUS.speed * dt) / this.len;
    this.pos.lerpVectors(this.a, this.b, Math.min(1, this.t));
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.sin(this.t * 40) * 0.4;
    if (this.t >= 1) {
      for (const ch of this.game.chars) if (ch.mode === 'bus' && ch.alive) this.drop(ch);
      this.active = false;
      this.game.scene.remove(this.mesh);
    }
  }
}
