/**
 * bullets.ts — two fixed pools of projectiles (player bolt shells / enemy warp spit).
 * Meshes, geometries and materials are allocated once; firing only flips flags.
 *
 * The two sides are meant to read differently at a glance: Imperial shells fly
 * flat and true with a hot steady core, while xenos fire bobs, pulses and
 * squirms like something alive (or worse).
 */

import * as THREE from "three";

export interface Bullet {
  active: boolean;
  friendly: boolean;
  mesh: THREE.Mesh;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  pierce: number;
  radius: number;
  /** Explosion radius on impact/expiry (0 = none). */
  aoe: number;
  /** Random per-shot phase for the hostile wobble. */
  phase: number;
  /** Scale captured at fire time so the pulse can oscillate around it. */
  baseScale: [number, number, number];
}

export type BulletMat = "gold" | "plasma" | "melta" | "hostile" | "warpBolt" | "gauss" | "pulse" | "shuriken";

const MAX_FRIENDLY = 96;
const MAX_HOSTILE = 110;

export class Bullets {
  readonly friendly: Bullet[] = [];
  readonly hostile: Bullet[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: Record<BulletMat, THREE.Material>;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const boltGeo = new THREE.BoxGeometry(0.14, 0.14, 0.85);
    const spitGeo = new THREE.SphereGeometry(0.24, 8, 6);
    this.mats = {
      gold: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      plasma: new THREE.MeshBasicMaterial({ color: 0x86f4ff }),
      melta: new THREE.MeshBasicMaterial({ color: 0xff9540 }),
      hostile: new THREE.MeshBasicMaterial({ color: 0xa4ff5e }),
      warpBolt: new THREE.MeshBasicMaterial({ color: 0xff5a4a }),
      gauss: new THREE.MeshBasicMaterial({ color: 0x59ff8a }),
      pulse: new THREE.MeshBasicMaterial({ color: 0x7ab8ff }),
      shuriken: new THREE.MeshBasicMaterial({ color: 0xe8f2ff }),
    };
    this.geos.push(boltGeo, spitGeo);

    for (let i = 0; i < MAX_FRIENDLY; i++) {
      const mesh = new THREE.Mesh(boltGeo, this.mats.gold);
      mesh.visible = false;
      mesh.position.y = 1.1;
      scene.add(mesh);
      this.friendly.push({ active: false, friendly: true, mesh, vx: 0, vz: 0, life: 0, dmg: 0, pierce: 0, radius: 0.3, aoe: 0, phase: 0, baseScale: [1, 1, 1] });
    }
    for (let i = 0; i < MAX_HOSTILE; i++) {
      const mesh = new THREE.Mesh(spitGeo, this.mats.hostile);
      mesh.visible = false;
      mesh.position.y = 1.2;
      scene.add(mesh);
      this.hostile.push({ active: false, friendly: false, mesh, vx: 0, vz: 0, life: 0, dmg: 0, pierce: 0, radius: 0.4, aoe: 0, phase: 0, baseScale: [1, 1, 1] });
    }
  }

  fire(
    friendly: boolean, x: number, z: number, dx: number, dz: number,
    speed: number, dmg: number, life: number, pierce = 0,
    opts?: { aoe?: number; mat?: BulletMat; scale?: [number, number, number]; radius?: number },
  ): void {
    const pool = friendly ? this.friendly : this.hostile;
    for (const b of pool) {
      if (b.active) continue;
      b.active = true;
      b.mesh.visible = true;
      b.mesh.position.set(x, friendly ? 1.1 : 1.2, z);
      // both pools honour visual overrides: faction projectiles look the part
      b.mesh.rotation.y = Math.atan2(dx, dz);
      b.mesh.material = this.mats[opts?.mat ?? (friendly ? "gold" : "hostile")];
      const s = opts?.scale ?? [1, 1, 1];
      b.baseScale = [s[0], s[1], s[2]];
      b.mesh.scale.set(s[0], s[1], s[2]);
      b.phase = Math.random() * Math.PI * 2;
      b.vx = dx * speed;
      b.vz = dz * speed;
      b.life = life;
      b.dmg = dmg;
      b.pierce = pierce;
      b.aoe = opts?.aoe ?? 0;
      b.radius = opts?.radius ?? (friendly ? 0.3 : 0.4);
      return;
    }
  }

  kill(b: Bullet): void {
    b.active = false;
    b.mesh.visible = false;
  }

  /** Called before a bullet expires naturally (used for plasma air-bursts). */
  onExpire: ((b: Bullet) => void) | null = null;

  update(dt: number): void {
    this.t += dt;
    for (const pool of [this.friendly, this.hostile]) {
      for (const b of pool) {
        if (!b.active) continue;
        b.life -= dt;
        b.mesh.position.x += b.vx * dt;
        b.mesh.position.z += b.vz * dt;
        if (b.friendly) {
          // Imperial shells: rock-steady flight line
          b.mesh.position.y = 1.1;
        } else {
          // xenos fire: bobs like a living spore and throbs with foul light
          b.mesh.position.y = 1.2 + Math.sin(this.t * 9 + b.phase) * 0.16;
          const p = 1 + Math.sin(this.t * 12 + b.phase) * 0.13;
          b.mesh.scale.set(b.baseScale[0] * p, b.baseScale[1] * p, b.baseScale[2]);
        }
        if (b.life <= 0) {
          this.onExpire?.(b);
          this.kill(b);
        }
      }
    }
  }

  clear(): void {
    for (const pool of [this.friendly, this.hostile]) {
      for (const b of pool) this.kill(b);
    }
  }

  dispose(): void {
    for (const pool of [this.friendly, this.hostile]) {
      for (const b of pool) b.mesh.removeFromParent();
    }
    for (const g of this.geos) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
