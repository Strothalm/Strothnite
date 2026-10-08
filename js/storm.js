// Der Sturm: schrumpfender Kreis mit steigendem Schaden
import * as THREE from 'three';
import { STORM_PHASES } from './config.js';
import { tex } from './textures.js';
import { lerp, randRange } from './util.js';

export class Storm {
  constructor(game) {
    this.game = game;
    this.phase = 0;
    this.state = 'wait';
    this.timer = STORM_PHASES[0].wait;
    this.cx = 0; this.cz = 0; this.r = 620;
    this.fromX = 0; this.fromZ = 0; this.fromR = 620;
    this.nx = 0; this.nz = 0; this.nr = STORM_PHASES[0].radius;
    this.dps = 1;
    this.tickT = 1;
    this.pickNext(true);

    const geo = new THREE.CylinderGeometry(1, 1, 420, 96, 1, true);
    geo.translate(0, 150, 0);
    const t = tex('storm');
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(40, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: t }, time: { value: 0 }, color: { value: new THREE.Color('#9b3cff') } },
      vertexShader: [
        'varying vec2 vUv;',
        'varying float vY;',
        'void main() {',
        '  vUv = uv;',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vY = wp.y;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D map;',
        'uniform float time;',
        'uniform vec3 color;',
        'varying vec2 vUv;',
        'varying float vY;',
        'void main() {',
        '  float a = texture2D(map, vec2(vUv.x * 40.0 + time * 0.05, vUv.y * 2.0 - time * 0.12)).r;',
        '  float b = texture2D(map, vec2(vUv.x * 23.0 - time * 0.03, vUv.y * 3.0 + time * 0.07)).r;',
        '  float alpha = 0.28 + 0.22 * (a * b);',
        '  vec3 c = color * (0.75 + 0.5 * a);',
        '  gl_FragColor = vec4(c, alpha);',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 8;
    this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
    this.sync();
  }

  pickNext(first) {
    const ph = STORM_PHASES[this.phase];
    const w = this.game.world;
    const maxOff = first ? 140 : Math.max(0, this.r - ph.radius) * 0.9;
    const baseX = first ? 0 : this.cx, baseZ = first ? 0 : this.cz;
    let bx = baseX, bz = baseZ;
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxOff;
      const x = baseX + Math.cos(a) * d, z = baseZ + Math.sin(a) * d;
      if (w.terrainHeight(x, z) > 1 || ph.radius > 60) { bx = x; bz = z; break; }
    }
    this.nx = bx; this.nz = bz; this.nr = ph.radius;
    if (first) { this.cx = 0; this.cz = 0; this.r = 620; }
  }

  sync() {
    this.mesh.position.set(this.cx, 0, this.cz);
    const r = Math.max(0.5, this.r);
    this.mesh.scale.set(r, 1, r);
  }

  isOutside(x, z) {
    return Math.hypot(x - this.cx, z - this.cz) > this.r;
  }

  distOutside(x, z) {
    return Math.hypot(x - this.cx, z - this.cz) - this.r;
  }

  info() {
    if (this.state === 'done') return { text: 'Letzter Kreis', time: 0, shrinking: true };
    if (this.state === 'wait') return { text: this.phase === 0 ? 'Sturm bildet sich' : 'Sturm schrumpft in', time: this.timer, shrinking: false };
    return { text: 'Sturm schrumpft', time: this.timer, shrinking: true };
  }

  update(dt) {
    this.mat.uniforms.time.value += dt;
    if (this.state === 'wait') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'shrink';
        this.timer = STORM_PHASES[this.phase].shrink;
        this.fromX = this.cx; this.fromZ = this.cz; this.fromR = this.r;
        this.dps = STORM_PHASES[this.phase].dps;
        this.game.hud.banner('Der Sturm zieht sich zusammen!', '#c06bff');
        this.game.audio.play('stormWarn');
      }
    } else if (this.state === 'shrink') {
      this.timer -= dt;
      const ph = STORM_PHASES[this.phase];
      const f = 1 - Math.max(0, this.timer) / ph.shrink;
      this.cx = lerp(this.fromX, this.nx, f);
      this.cz = lerp(this.fromZ, this.nz, f);
      this.r = lerp(this.fromR, this.nr, f);
      if (this.timer <= 0) {
        this.phase++;
        if (this.phase >= STORM_PHASES.length) {
          this.state = 'done';
          this.phase = STORM_PHASES.length - 1;
        } else {
          this.state = 'wait';
          this.timer = STORM_PHASES[this.phase].wait;
          this.pickNext(false);
          this.game.hud.banner('Neues Sturmauge auf der Karte!', '#ffffff');
        }
      }
    }
    this.sync();

    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 1;
      for (const ch of this.game.chars) {
        if (!ch.alive || ch.mode === 'bus') continue;
        if (this.isOutside(ch.pos.x, ch.pos.z)) {
          ch.takeDamage(this.dps, null, 'Sturm', { ignoreShield: true, storm: true });
        }
      }
    }
  }
}
