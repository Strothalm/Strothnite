// Instanz-Pool: viele gleiche Objekte in einem Draw-Call
import * as THREE from 'three';

const WHITE = new THREE.Color(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class InstPool {
  constructor(geo, mat, cap, { shadow = true, receive = true } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = receive;
    this.mesh.setColorAt(0, WHITE);
    this.cap = cap;
    this.free = [];
    this.next = 0;
    this.dirty = false;
    this.colorDirty = false;
  }

  add(matrix, color) {
    let i;
    if (this.free.length) i = this.free.pop();
    else {
      if (this.next >= this.cap) return -1;
      i = this.next++;
    }
    this.mesh.setMatrixAt(i, matrix);
    this.mesh.setColorAt(i, color || WHITE);
    if (this.next > this.mesh.count) this.mesh.count = this.next;
    this.dirty = true;
    this.colorDirty = true;
    return i;
  }

  set(i, matrix) {
    this.mesh.setMatrixAt(i, matrix);
    this.dirty = true;
  }

  setColor(i, color) {
    this.mesh.setColorAt(i, color);
    this.colorDirty = true;
  }

  remove(i) {
    if (i < 0) return;
    this.mesh.setMatrixAt(i, ZERO);
    this.free.push(i);
    this.dirty = true;
  }

  flush() {
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
    if (this.colorDirty && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.colorDirty = false;
    }
  }
}
