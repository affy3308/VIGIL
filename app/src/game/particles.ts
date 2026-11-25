/**
 * particles.ts — single pooled THREE.Points system. Zero allocation after construction:
 * bursts write into ring-buffer slots, update() integrates in place.
 */

import * as THREE from "three";

export class Particles {
  private readonly max: number;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private baseCol: Float32Array;
  private life: Float32Array;
  private life0: Float32Array;
  private grav: Float32Array;
  private cursor = 0;
  /** When false, update() skips integration (particle culling tier). */
  enabled = true;
  private tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene, max: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.baseCol = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -500; // parked out of sight

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(
    x: number, y: number, z: number,
    count: number, colorHex: number,
    speed: number, life = 0.6, gravity = 10, upBias = 0.6,
  ): void {
    if (!this.enabled) count = Math.ceil(count / 3);
    this.tmpColor.setHex(colorHex);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
      // random direction on a sphere, biased upward
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.vel[i3] = Math.sin(phi) * Math.cos(theta) * s;
      this.vel[i3 + 1] = (Math.cos(phi) * 0.5 + upBias) * s;
      this.vel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
      const jitter = 0.75 + Math.random() * 0.25;
      this.baseCol[i3] = this.tmpColor.r * jitter;
      this.baseCol[i3 + 1] = this.tmpColor.g * jitter;
      this.baseCol[i3 + 2] = this.tmpColor.b * jitter;
      this.life[i] = this.life0[i] = life * (0.6 + Math.random() * 0.4);
      this.grav[i] = gravity;
    }
  }

  update(dt: number): void {
    if (!this.enabled) return;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -500;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.35;
        this.vel[i3] *= 0.7;
        this.vel[i3 + 2] *= 0.7;
      }
      const f = this.life[i] / this.life0[i];
      this.col[i3] = this.baseCol[i3] * f;
      this.col[i3 + 1] = this.baseCol[i3 + 1] * f;
      this.col[i3 + 2] = this.baseCol[i3 + 2] * f;
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
