/**
 * enemies.ts — the tide of foes. Every kind changes how the player has to move,
 * not just how much it soaks:
 *   cultist — fast melee swarm, dies quickly, surrounds
 *   brute   — slow tank; winds up, then charges in a straight line
 *   spitter — keeps its distance and lobs warp bolts
 *   chaos   — fallen Astartes: methodical advance, three-bolt bursts
 *   ork     — greenskin: breaks into a WAAAGH sprint and never stops
 *   gaunt   — hive spawn: very fast, pounces in leaps
 *   necron  — relentless android: gauss rods, rises once more after falling
 *   tau     — fire caste: longest range, punishing shots, brittle, kites
 *   eldar   — aspect kin: constant wide strafing, shuriken fans
 *   boss    — "Вестник Погибели": charge + radial warp bursts (wave 10)
 *
 * Fixed pool of Enemy slots; meshes are built lazily per slot and reused across runs.
 * Shared geometries/materials per kind; hit feedback is scale-pulse + particles.
 */

import * as THREE from "three";
import { ARENA } from "./config";
import { pushOutObstacles, type Obstacle } from "./world";

export type EnemyKind =
  | "cultist" | "brute" | "spitter" | "boss"
  | "chaos" | "ork" | "gaunt" | "necron" | "tau" | "eldar" | "votann"
  | "bossDemon" | "bossGargant" | "bossWraith" | "bossFex"
  | "bossPhaeron" | "bossCrisis" | "bossTan";

/** Every campaign finale kind shares the boss AI (charge + radial burst). */
export function isBoss(kind: EnemyKind): boolean {
  return kind === "boss" || kind === "bossDemon" || kind === "bossGargant" ||
    kind === "bossWraith" || kind === "bossFex" || kind === "bossPhaeron" ||
    kind === "bossCrisis" || kind === "bossTan";
}

/** Hostile projectile flavours — mapped to visuals/speed by the game. */
export type ProjKind = "spit" | "bolt" | "gauss" | "pulse" | "shuriken";

export interface EnemySpec {
  hp: number;
  speed: number;
  dmg: number;
  radius: number;
  score: number;
  attackRange: number;
  attackCd: number;
}

export const SPECS: Record<EnemyKind, EnemySpec> = {
  cultist: { hp: 42, speed: 6.2, dmg: 10, radius: 0.55, score: 10, attackRange: 1.35, attackCd: 0.9 },
  brute: { hp: 190, speed: 3.1, dmg: 24, radius: 1.05, score: 40, attackRange: 1.9, attackCd: 1.6 },
  spitter: { hp: 64, speed: 4.2, dmg: 12, radius: 0.6, score: 25, attackRange: 13, attackCd: 2.6 },
  chaos: { hp: 165, speed: 4.6, dmg: 9, radius: 0.7, score: 60, attackRange: 15, attackCd: 2.5 },
  ork: { hp: 135, speed: 5.0, dmg: 20, radius: 0.8, score: 35, attackRange: 1.8, attackCd: 1.1 },
  gaunt: { hp: 34, speed: 8.2, dmg: 8, radius: 0.5, score: 12, attackRange: 1.3, attackCd: 0.8 },
  necron: { hp: 180, speed: 2.7, dmg: 16, radius: 0.65, score: 55, attackRange: 14, attackCd: 3.2 },
  tau: { hp: 60, speed: 4.6, dmg: 20, radius: 0.6, score: 45, attackRange: 21, attackCd: 2.9 },
  eldar: { hp: 75, speed: 7.4, dmg: 7, radius: 0.55, score: 50, attackRange: 13, attackCd: 2.1 },
  votann: { hp: 215, speed: 3.9, dmg: 11, radius: 0.75, score: 70, attackRange: 13, attackCd: 2.2 },
  boss: { hp: 2300, speed: 3.4, dmg: 32, radius: 1.7, score: 500, attackRange: 2.8, attackCd: 1.4 },
  bossDemon: { hp: 2600, speed: 3.9, dmg: 30, radius: 1.6, score: 650, attackRange: 2.7, attackCd: 1.3 },
  bossGargant: { hp: 4400, speed: 2.5, dmg: 42, radius: 2.1, score: 800, attackRange: 3.4, attackCd: 1.6 },
  bossPhaeron: { hp: 3600, speed: 3.0, dmg: 36, radius: 1.7, score: 800, attackRange: 3.0, attackCd: 1.3 },
  bossCrisis: { hp: 3200, speed: 4.2, dmg: 32, radius: 1.7, score: 800, attackRange: 3.0, attackCd: 1.2 },
  bossTan: { hp: 4200, speed: 2.8, dmg: 44, radius: 2.0, score: 900, attackRange: 3.2, attackCd: 1.5 },
  bossWraith: { hp: 3400, speed: 3.3, dmg: 34, radius: 1.7, score: 800, attackRange: 3.0, attackCd: 1.3 },
  bossFex: { hp: 3900, speed: 3.8, dmg: 38, radius: 1.9, score: 1000, attackRange: 3.0, attackCd: 1.4 },
};

const POOL_SIZE = 48;

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  radius: number;
  score: number;
  attackCd: number;
  state: "chase" | "windup" | "charge" | "recover";
  stateT: number;
  chargeX: number;
  chargeZ: number;
  strafeDir: number;
  spitCd: number;
  burstCd: number;
  flashT: number;
  baseScale: number;
  /** Necron reanimation: already rose once. */
  revived: boolean;
  /** Floating HP bar (child of mesh). */
  bar: THREE.Group;
  barFg: THREE.Mesh;
}

/** Per-kind shared assets. */
interface KindAssets {
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  build(): THREE.Group;
}

function makeCultistAssets(): KindAssets {
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x3d2b2b, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8f7a66, roughness: 0.8 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const robeGeo = new THREE.ConeGeometry(0.5, 1.6, 16);
  const hoodGeo = new THREE.SphereGeometry(0.26, 16, 12);
  const headGeo = new THREE.SphereGeometry(0.2, 14, 10);
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const clawGeo = new THREE.CapsuleGeometry(0.05, 0.42, 4, 8);
  const bladeGeo = new THREE.ConeGeometry(0.045, 0.22, 8);
  return {
    geos: [robeGeo, hoodGeo, headGeo, eyeGeo, clawGeo, bladeGeo],
    mats: [robeMat, skinMat, eyeMat],
    build() {
      const g = new THREE.Group();
      const robe = new THREE.Mesh(robeGeo, robeMat);
      robe.position.y = 0.8;
      const hood = new THREE.Mesh(hoodGeo, robeMat);
      hood.position.set(0, 1.66, -0.03);
      hood.scale.set(1, 1.1, 1.05);
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.set(0, 1.62, 0.06);
      const eL = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.08, 1.65, 0.22);
      const eR = new THREE.Mesh(eyeGeo, eyeMat);
      eR.position.set(0.08, 1.65, 0.22);
      const cL = new THREE.Mesh(clawGeo, skinMat);
      cL.position.set(-0.4, 1.0, 0.25);
      cL.rotation.x = -0.8;
      const cR = new THREE.Mesh(clawGeo, skinMat);
      cR.position.set(0.4, 1.0, 0.25);
      cR.rotation.x = -0.8;
      const bL = new THREE.Mesh(bladeGeo, eyeMat);
      bL.position.set(-0.4, 0.82, 0.44);
      bL.rotation.x = 2.2;
      const bR = new THREE.Mesh(bladeGeo, eyeMat);
      bR.position.set(0.4, 0.82, 0.44);
      bR.rotation.x = 2.2;
      g.add(robe, hood, head, eL, eR, cL, cR, bL, bR);
      return g;
    },
  };
}

function makeBruteAssets(): KindAssets {
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x5e4a3a, roughness: 0.85 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.8 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const bodyGeo = new THREE.SphereGeometry(0.85, 20, 16);
  const headGeo = new THREE.SphereGeometry(0.32, 16, 12);
  const jawGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.28, 10);
  const armGeo = new THREE.CapsuleGeometry(0.24, 1.0, 6, 12);
  const fistGeo = new THREE.SphereGeometry(0.3, 14, 10);
  const plateGeo = new THREE.SphereGeometry(0.85, 20, 12);
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const hornGeo = new THREE.ConeGeometry(0.12, 0.5, 10);
  const studGeo = new THREE.SphereGeometry(0.08, 8, 6);
  return {
    geos: [bodyGeo, headGeo, jawGeo, armGeo, fistGeo, plateGeo, eyeGeo, hornGeo, studGeo],
    mats: [fleshMat, ironMat, eyeMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, fleshMat);
      body.position.y = 1.3;
      body.scale.set(0.92, 0.98, 0.68);
      const plate = new THREE.Mesh(plateGeo, ironMat);
      plate.position.y = 2.05;
      plate.scale.set(0.98, 0.34, 0.72);
      for (const sx of [-0.5, 0, 0.5]) {
        const stud = new THREE.Mesh(studGeo, ironMat);
        stud.position.set(sx, 2.3, 0.35);
        g.add(stud);
      }
      const head = new THREE.Mesh(headGeo, fleshMat);
      head.position.set(0, 2.2, 0.45);
      head.scale.set(0.9, 0.75, 0.85);
      const jaw = new THREE.Mesh(jawGeo, fleshMat);
      jaw.position.set(0, 2.02, 0.5);
      jaw.rotation.x = Math.PI / 2.3;
      const eL = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.12, 2.24, 0.71);
      const eR = new THREE.Mesh(eyeGeo, eyeMat);
      eR.position.set(0.12, 2.24, 0.71);
      const aL = new THREE.Mesh(armGeo, fleshMat);
      aL.position.set(-0.95, 1.2, 0);
      const aR = new THREE.Mesh(armGeo, fleshMat);
      aR.position.set(0.95, 1.2, 0);
      const fL = new THREE.Mesh(fistGeo, ironMat);
      fL.position.set(-0.95, 0.5, 0.05);
      const fR = new THREE.Mesh(fistGeo, ironMat);
      fR.position.set(0.95, 0.5, 0.05);
      const hL = new THREE.Mesh(hornGeo, ironMat);
      hL.position.set(-0.3, 2.55, 0.4);
      hL.rotation.z = 0.4;
      const hR = new THREE.Mesh(hornGeo, ironMat);
      hR.position.set(0.3, 2.55, 0.4);
      hR.rotation.z = -0.4;
      g.add(body, plate, head, jaw, eL, eR, aL, aR, fL, fR, hL, hR);
      return g;
    },
  };
}

function makeSpitterAssets(): KindAssets {
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x4a5e3a, roughness: 0.8 });
  const sacMat = new THREE.MeshStandardMaterial({ color: 0x7fae3a, roughness: 0.4, emissive: 0x2c4a10, emissiveIntensity: 0.9 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd4ff4a });
  const bodyGeo = new THREE.SphereGeometry(0.55, 20, 16);
  const sacGeo = new THREE.SphereGeometry(0.34, 16, 12);
  const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.9, 8);
  const eyeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  return {
    geos: [bodyGeo, sacGeo, legGeo, eyeGeo],
    mats: [fleshMat, sacMat, eyeMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, fleshMat);
      body.position.y = 0.95;
      body.scale.set(1, 0.85, 1.25);
      const sac = new THREE.Mesh(sacGeo, sacMat);
      sac.position.set(0, 1.0, 0.5);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 1.35, 0.45);
      g.add(body, sac, eye);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(legGeo, fleshMat);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        leg.position.set(Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5);
        leg.rotation.z = Math.cos(a) * 0.5;
        leg.rotation.x = -Math.sin(a) * 0.5;
        g.add(leg);
      }
      return g;
    },
  };
}

function makeBossAssets(): KindAssets {
  const brute = makeBruteAssets();
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x6e1420, roughness: 0.3, metalness: 0.7, emissive: 0x3a0a10, emissiveIntensity: 1.2 });
  const crownGeo = new THREE.TorusGeometry(0.55, 0.09, 10, 24);
  const spikeGeo = new THREE.ConeGeometry(0.09, 0.45, 10);
  return {
    geos: [...brute.geos, crownGeo, spikeGeo],
    mats: [...brute.mats, crownMat],
    build() {
      const g = brute.build();
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.set(0, 2.72, 0.4);
      crown.rotation.x = Math.PI / 2;
      g.add(crown);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(spikeGeo, crownMat);
        spike.position.set(Math.cos(a) * 0.55, 2.85, 0.4 + Math.sin(a) * 0.55);
        g.add(spike);
      }
      g.scale.setScalar(2.0);
      return g;
    },
  };
}

/** HP-bar height above the origin per kind (boss excluded — it has the big HUD bar). */
const BAR_HEIGHT: Partial<Record<EnemyKind, number>> = {
  cultist: 2.3, brute: 3.1, spitter: 2.0, chaos: 2.5, ork: 2.2, gaunt: 1.5,
  necron: 2.5, tau: 2.3, eldar: 2.8, votann: 2.4,
};

/** «Князь Варпа» — a thing of horns and ragged wings torn out of the Immaterium. */
function makeDemonAssets(): KindAssets {
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x5e2a6e, roughness: 0.55, emissive: 0x2a0a3a, emissiveIntensity: 0.8 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e1226, roughness: 0.4, metalness: 0.7 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xe26aff });
  const bodyGeo = new THREE.SphereGeometry(0.85, 20, 16);
  const headGeo = new THREE.SphereGeometry(0.34, 16, 12);
  const armGeo = new THREE.CapsuleGeometry(0.22, 1.1, 6, 12);
  const clawGeo = new THREE.ConeGeometry(0.1, 0.6, 8);
  const hornGeo = new THREE.ConeGeometry(0.14, 0.95, 10);
  const wingGeo = new THREE.BoxGeometry(0.08, 1.7, 1.15);
  const eyeGeo = new THREE.SphereGeometry(0.08, 8, 6);
  return {
    geos: [bodyGeo, headGeo, armGeo, clawGeo, hornGeo, wingGeo, eyeGeo],
    mats: [fleshMat, ironMat, glowMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, fleshMat);
      body.position.y = 1.35;
      body.scale.set(0.95, 1.05, 0.7);
      const head = new THREE.Mesh(headGeo, fleshMat);
      head.position.set(0, 2.4, 0.35);
      const eL = new THREE.Mesh(eyeGeo, glowMat);
      eL.position.set(-0.13, 2.46, 0.62);
      const eR = new THREE.Mesh(eyeGeo, glowMat);
      eR.position.set(0.13, 2.46, 0.62);
      const hL = new THREE.Mesh(hornGeo, ironMat);
      hL.position.set(-0.32, 2.72, 0.3);
      hL.rotation.z = 0.55;
      const hR = new THREE.Mesh(hornGeo, ironMat);
      hR.position.set(0.32, 2.72, 0.3);
      hR.rotation.z = -0.55;
      const wL = new THREE.Mesh(wingGeo, ironMat);
      wL.position.set(-0.85, 1.9, -0.55);
      wL.rotation.z = 0.5;
      wL.rotation.y = 0.35;
      const wR = new THREE.Mesh(wingGeo, ironMat);
      wR.position.set(0.85, 1.9, -0.55);
      wR.rotation.z = -0.5;
      wR.rotation.y = -0.35;
      const aL = new THREE.Mesh(armGeo, fleshMat);
      aL.position.set(-0.95, 1.3, 0.1);
      const aR = new THREE.Mesh(armGeo, fleshMat);
      aR.position.set(0.95, 1.3, 0.1);
      const cL = new THREE.Mesh(clawGeo, glowMat);
      cL.position.set(-0.95, 0.55, 0.3);
      cL.rotation.x = 2.4;
      const cR = new THREE.Mesh(clawGeo, glowMat);
      cR.position.set(0.95, 0.55, 0.3);
      cR.rotation.x = 2.4;
      g.add(body, head, eL, eR, hL, hR, wL, wR, aL, aR, cL, cR);
      g.scale.setScalar(2.0);
      return g;
    },
  };
}

/** «Гаргант» — a walking mountain of riveted scrap, all exhaust stacks and a buzzsaw arm. */
function makeGargantAssets(): KindAssets {
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6e4a26, roughness: 0.6, metalness: 0.55 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x2a2e26, roughness: 0.5, metalness: 0.7 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4a20 });
  const torsoGeo = new THREE.BoxGeometry(2.2, 1.6, 1.4);
  const headGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
  const legGeo = new THREE.BoxGeometry(0.5, 1.5, 0.6);
  const armGeo = new THREE.BoxGeometry(0.42, 1.5, 0.42);
  const sawGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.14, 18);
  const stackGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.0, 8);
  const eyeGeo = new THREE.BoxGeometry(0.5, 0.1, 0.08);
  return {
    geos: [torsoGeo, headGeo, legGeo, armGeo, sawGeo, stackGeo, eyeGeo],
    mats: [hullMat, plateMat, glowMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, hullMat);
      torso.position.y = 2.2;
      const head = new THREE.Mesh(headGeo, plateMat);
      head.position.set(0, 3.2, 0.35);
      const visor = new THREE.Mesh(eyeGeo, glowMat);
      visor.position.set(0, 3.22, 0.76);
      const lL = new THREE.Mesh(legGeo, plateMat);
      lL.position.set(-0.6, 0.75, 0);
      const lR = new THREE.Mesh(legGeo, plateMat);
      lR.position.set(0.6, 0.75, 0);
      const aL = new THREE.Mesh(armGeo, hullMat);
      aL.position.set(-1.35, 2.0, 0);
      const aR = new THREE.Mesh(armGeo, hullMat);
      aR.position.set(1.35, 2.0, 0);
      const saw = new THREE.Mesh(sawGeo, plateMat);
      saw.position.set(1.35, 1.1, 0);
      saw.rotation.x = Math.PI / 2;
      const sL = new THREE.Mesh(stackGeo, plateMat);
      sL.position.set(-0.6, 3.3, -0.5);
      const sR = new THREE.Mesh(stackGeo, plateMat);
      sR.position.set(0.6, 3.3, -0.5);
      g.add(torso, head, visor, lL, lR, aL, aR, saw, sL, sR);
      g.scale.setScalar(1.9);
      return g;
    },
  };
}

/** «Призрачный Лорд» — tall wraithbone knight with a cold spirit-core in the chest. */
function makeWraithAssets(): KindAssets {
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c0, roughness: 0.45, metalness: 0.15 });
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x2a7a8c, roughness: 0.3, emissive: 0x14505e, emissiveIntensity: 1.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x7df0ff });
  const torsoGeo = new THREE.CapsuleGeometry(0.55, 1.5, 8, 14);
  const headGeo = new THREE.SphereGeometry(0.3, 16, 12);
  const crestGeo = new THREE.ConeGeometry(0.12, 0.85, 8);
  const finGeo = new THREE.BoxGeometry(0.08, 1.25, 0.5);
  const armGeo = new THREE.CapsuleGeometry(0.14, 1.4, 6, 10);
  const coreGeo = new THREE.SphereGeometry(0.19, 12, 10);
  const bladeGeo = new THREE.BoxGeometry(0.07, 1.5, 0.3);
  return {
    geos: [torsoGeo, headGeo, crestGeo, finGeo, armGeo, coreGeo, bladeGeo],
    mats: [boneMat, gemMat, glowMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, boneMat);
      torso.position.y = 2.2;
      const core = new THREE.Mesh(coreGeo, glowMat);
      core.position.set(0, 2.45, 0.45);
      const head = new THREE.Mesh(headGeo, boneMat);
      head.position.set(0, 3.45, 0.1);
      const crest = new THREE.Mesh(crestGeo, gemMat);
      crest.position.set(0, 3.8, -0.05);
      crest.rotation.x = -0.35;
      const fL = new THREE.Mesh(finGeo, gemMat);
      fL.position.set(-0.72, 3.0, 0);
      fL.rotation.z = 0.35;
      const fR = new THREE.Mesh(finGeo, gemMat);
      fR.position.set(0.72, 3.0, 0);
      fR.rotation.z = -0.35;
      const aL = new THREE.Mesh(armGeo, boneMat);
      aL.position.set(-0.8, 1.9, 0.1);
      const aR = new THREE.Mesh(armGeo, boneMat);
      aR.position.set(0.8, 1.9, 0.1);
      const blade = new THREE.Mesh(bladeGeo, gemMat);
      blade.position.set(0.85, 1.0, 0.25);
      g.add(torso, core, head, crest, fL, fR, aL, aR, blade);
      g.scale.setScalar(2.1);
      return g;
    },
  };
}

/** «Карнифекс» — a living siege engine: chitin ridges, four scythe-limbs, no mercy. */
function makeFexAssets(): KindAssets {
  const chitinMat = new THREE.MeshStandardMaterial({ color: 0x3a1e2e, roughness: 0.7 });
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x6e3a4a, roughness: 0.75 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cfa8, roughness: 0.5 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9fff5a });
  const bodyGeo = new THREE.SphereGeometry(0.95, 20, 16);
  const ridgeGeo = new THREE.ConeGeometry(0.22, 0.7, 8);
  const headGeo = new THREE.SphereGeometry(0.4, 16, 12);
  const bladeArmGeo = new THREE.ConeGeometry(0.12, 1.4, 8);
  const legGeo = new THREE.CylinderGeometry(0.2, 0.14, 1.2, 8);
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 6);
  return {
    geos: [bodyGeo, ridgeGeo, headGeo, bladeArmGeo, legGeo, eyeGeo],
    mats: [chitinMat, fleshMat, boneMat, glowMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, chitinMat);
      body.position.y = 1.55;
      body.scale.set(1.05, 0.95, 1.3);
      const head = new THREE.Mesh(headGeo, fleshMat);
      head.position.set(0, 2.35, 0.7);
      head.scale.set(0.9, 0.8, 1.1);
      const eL = new THREE.Mesh(eyeGeo, glowMat);
      eL.position.set(-0.16, 2.42, 1.05);
      const eR = new THREE.Mesh(eyeGeo, glowMat);
      eR.position.set(0.16, 2.42, 1.05);
      g.add(body, head, eL, eR);
      for (let i = 0; i < 4; i++) {
        const ridge = new THREE.Mesh(ridgeGeo, chitinMat);
        ridge.position.set(0, 2.35 - i * 0.28, 0.1 - i * 0.42);
        g.add(ridge);
      }
      for (const [sx, sy] of [[-0.95, 1.9], [0.95, 1.9], [-1.05, 1.2], [1.05, 1.2]] as const) {
        const arm = new THREE.Mesh(bladeArmGeo, boneMat);
        arm.position.set(sx, sy, 0.35);
        arm.rotation.z = sx > 0 ? -1.1 : 1.1;
        arm.rotation.x = 0.5;
        g.add(arm);
      }
      for (const sx of [-0.55, 0.55]) {
        const leg = new THREE.Mesh(legGeo, fleshMat);
        leg.position.set(sx, 0.6, -0.3);
        g.add(leg);
      }
      g.scale.setScalar(2.1);
      return g;
    },
  };
}

/** Hearthkyn of the Leagues — squat, wide, armoured like a vault door. */
function makeVotannAssets(): KindAssets {
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.55, metalness: 0.6 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x8c5a20, roughness: 0.5, metalness: 0.5 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa028 });
  const bodyGeo = new THREE.BoxGeometry(0.95, 1.0, 0.65);
  const helmGeo = new THREE.SphereGeometry(0.3, 14, 10);
  const visorGeo = new THREE.BoxGeometry(0.34, 0.09, 0.06);
  const legGeo = new THREE.BoxGeometry(0.24, 0.6, 0.28);
  const gunGeo = new THREE.BoxGeometry(0.14, 0.14, 0.8);
  const packGeo = new THREE.BoxGeometry(0.6, 0.5, 0.25);
  const shoulderGeo = new THREE.SphereGeometry(0.22, 10, 8);
  return {
    geos: [bodyGeo, helmGeo, visorGeo, legGeo, gunGeo, packGeo, shoulderGeo],
    mats: [armorMat, suitMat, glowMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, armorMat);
      body.position.y = 1.15;
      const helm = new THREE.Mesh(helmGeo, suitMat);
      helm.position.set(0, 1.85, 0.05);
      const visor = new THREE.Mesh(visorGeo, glowMat);
      visor.position.set(0, 1.87, 0.32);
      const lL = new THREE.Mesh(legGeo, suitMat);
      lL.position.set(-0.25, 0.3, 0);
      const lR = new THREE.Mesh(legGeo, suitMat);
      lR.position.set(0.25, 0.3, 0);
      const gun = new THREE.Mesh(gunGeo, suitMat);
      gun.position.set(0.45, 1.25, 0.35);
      const pack = new THREE.Mesh(packGeo, armorMat);
      pack.position.set(0, 1.35, -0.42);
      const sL = new THREE.Mesh(shoulderGeo, suitMat);
      sL.position.set(-0.58, 1.5, 0);
      const sR = new THREE.Mesh(shoulderGeo, suitMat);
      sR.position.set(0.58, 1.5, 0);
      g.add(body, helm, visor, lL, lR, gun, pack, sL, sR);
      return g;
    },
  };
}

/** «Фаэрон» — necron overlord: living metal, a warscythe and eternity of spite. */
function makePhaeronAssets(): KindAssets {
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 0.35, metalness: 0.9 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0x8c7428, roughness: 0.4, metalness: 0.8 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x59ff8a });
  const torsoGeo = new THREE.BoxGeometry(0.85, 1.3, 0.5);
  const headGeo = new THREE.BoxGeometry(0.42, 0.5, 0.45);
  const crestGeo = new THREE.BoxGeometry(0.1, 0.6, 0.5);
  const ribGeo = new THREE.BoxGeometry(0.75, 0.08, 0.42);
  const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 1.2, 8);
  const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 1.2, 8);
  const scytheGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6);
  const bladeGeo = new THREE.BoxGeometry(0.06, 0.9, 0.3);
  const eyeGeo = new THREE.BoxGeometry(0.3, 0.06, 0.05);
  return {
    geos: [torsoGeo, headGeo, crestGeo, ribGeo, legGeo, armGeo, scytheGeo, bladeGeo, eyeGeo],
    mats: [metalMat, goldMat, glowMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, metalMat);
      torso.position.y = 1.9;
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(ribGeo, goldMat);
        rib.position.set(0, 1.55 + i * 0.28, 0.06);
        g.add(rib);
      }
      const head = new THREE.Mesh(headGeo, metalMat);
      head.position.set(0, 2.85, 0.05);
      const crest = new THREE.Mesh(crestGeo, goldMat);
      crest.position.set(0, 3.25, -0.05);
      const eyes = new THREE.Mesh(eyeGeo, glowMat);
      eyes.position.set(0, 2.88, 0.28);
      const lL = new THREE.Mesh(legGeo, metalMat);
      lL.position.set(-0.22, 0.6, 0);
      const lR = new THREE.Mesh(legGeo, metalMat);
      lR.position.set(0.22, 0.6, 0);
      const aL = new THREE.Mesh(armGeo, metalMat);
      aL.position.set(-0.55, 1.8, 0);
      const aR = new THREE.Mesh(armGeo, metalMat);
      aR.position.set(0.6, 1.9, 0.15);
      aR.rotation.z = -0.4;
      const scythe = new THREE.Mesh(scytheGeo, metalMat);
      scythe.position.set(0.95, 1.9, 0.3);
      scythe.rotation.z = 0.25;
      const blade = new THREE.Mesh(bladeGeo, glowMat);
      blade.position.set(1.15, 3.1, 0.3);
      blade.rotation.z = 0.9;
      g.add(torso, head, crest, eyes, lL, lR, aL, aR, scythe, blade);
      g.scale.setScalar(1.9);
      return g;
    },
  };
}

/** «Кризис» — a tau commander in a battlesuit: sleek plates, jetpack, too many guns. */
function makeCrisisAssets(): KindAssets {
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 0.45, metalness: 0.4 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x2e3a4a, roughness: 0.5, metalness: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x6ab8ff });
  const torsoGeo = new THREE.BoxGeometry(1.0, 1.1, 0.7);
  const headGeo = new THREE.BoxGeometry(0.34, 0.3, 0.4);
  const shoulderGeo = new THREE.BoxGeometry(0.55, 0.7, 0.6);
  const legGeo = new THREE.BoxGeometry(0.28, 1.0, 0.34);
  const cannonGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.1, 10);
  const finGeo = new THREE.BoxGeometry(0.08, 0.9, 0.4);
  const eyeGeo = new THREE.BoxGeometry(0.2, 0.06, 0.05);
  return {
    geos: [torsoGeo, headGeo, shoulderGeo, legGeo, cannonGeo, finGeo, eyeGeo],
    mats: [plateMat, suitMat, glowMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, plateMat);
      torso.position.y = 1.75;
      const head = new THREE.Mesh(headGeo, suitMat);
      head.position.set(0, 2.45, 0.15);
      const eye = new THREE.Mesh(eyeGeo, glowMat);
      eye.position.set(0, 2.46, 0.36);
      const sL = new THREE.Mesh(shoulderGeo, plateMat);
      sL.position.set(-0.8, 2.1, 0);
      const sR = new THREE.Mesh(shoulderGeo, plateMat);
      sR.position.set(0.8, 2.1, 0);
      const lL = new THREE.Mesh(legGeo, suitMat);
      lL.position.set(-0.3, 0.55, 0);
      const lR = new THREE.Mesh(legGeo, suitMat);
      lR.position.set(0.3, 0.55, 0);
      const cannon = new THREE.Mesh(cannonGeo, suitMat);
      cannon.position.set(0.85, 1.45, 0.35);
      cannon.rotation.x = Math.PI / 2;
      const fL = new THREE.Mesh(finGeo, plateMat);
      fL.position.set(-0.55, 2.5, -0.4);
      fL.rotation.z = 0.3;
      const fR = new THREE.Mesh(finGeo, plateMat);
      fR.position.set(0.55, 2.5, -0.4);
      fR.rotation.z = -0.3;
      g.add(torso, head, eye, sL, sR, lL, lR, cannon, fL, fR);
      g.scale.setScalar(1.95);
      return g;
    },
  };
}

/** «Великий Тан» — the Ancestor's wrath in exo-armour: a walking vault with a hammer. */
function makeTanAssets(): KindAssets {
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.5, metalness: 0.65 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xa86a20, roughness: 0.4, metalness: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa028 });
  const torsoGeo = new THREE.BoxGeometry(1.7, 1.5, 1.1);
  const helmGeo = new THREE.SphereGeometry(0.42, 14, 10);
  const visorGeo = new THREE.BoxGeometry(0.5, 0.12, 0.08);
  const legGeo = new THREE.BoxGeometry(0.45, 1.0, 0.5);
  const armGeo = new THREE.BoxGeometry(0.4, 1.3, 0.4);
  const hammerGeo = new THREE.BoxGeometry(0.7, 0.5, 0.5);
  const haftGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8);
  const shoulderGeo = new THREE.BoxGeometry(0.6, 0.45, 0.7);
  return {
    geos: [torsoGeo, helmGeo, visorGeo, legGeo, armGeo, hammerGeo, haftGeo, shoulderGeo],
    mats: [armorMat, trimMat, glowMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, armorMat);
      torso.position.y = 1.9;
      const helm = new THREE.Mesh(helmGeo, trimMat);
      helm.position.set(0, 2.9, 0.15);
      const visor = new THREE.Mesh(visorGeo, glowMat);
      visor.position.set(0, 2.92, 0.52);
      const sL = new THREE.Mesh(shoulderGeo, trimMat);
      sL.position.set(-1.15, 2.5, 0);
      const sR = new THREE.Mesh(shoulderGeo, trimMat);
      sR.position.set(1.15, 2.5, 0);
      const lL = new THREE.Mesh(legGeo, armorMat);
      lL.position.set(-0.5, 0.5, 0);
      const lR = new THREE.Mesh(legGeo, armorMat);
      lR.position.set(0.5, 0.5, 0);
      const aL = new THREE.Mesh(armGeo, armorMat);
      aL.position.set(-1.15, 1.6, 0);
      const aR = new THREE.Mesh(armGeo, armorMat);
      aR.position.set(1.15, 1.6, 0);
      const haft = new THREE.Mesh(haftGeo, trimMat);
      haft.position.set(1.3, 1.7, 0.3);
      const hammer = new THREE.Mesh(hammerGeo, armorMat);
      hammer.position.set(1.3, 2.7, 0.3);
      g.add(torso, helm, visor, sL, sR, lL, lR, aL, aR, haft, hammer);
      g.scale.setScalar(1.85);
      return g;
    },
  };
}

/** Fallen Astartes: crimson-black plate, horned helm, spiked pauldrons. */
function makeChaosAssets(): KindAssets {
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x4a1418, roughness: 0.5, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x161014, roughness: 0.6, metalness: 0.5 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
  const torsoGeo = new THREE.CapsuleGeometry(0.42, 0.6, 6, 14);
  const padGeo = new THREE.SphereGeometry(0.36, 16, 12);
  const helmGeo = new THREE.SphereGeometry(0.26, 16, 12);
  const hornGeo = new THREE.ConeGeometry(0.07, 0.42, 8);
  const spikeGeo = new THREE.ConeGeometry(0.06, 0.3, 8);
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const legGeo = new THREE.CapsuleGeometry(0.15, 0.55, 6, 10);
  return {
    geos: [torsoGeo, padGeo, helmGeo, hornGeo, spikeGeo, eyeGeo, legGeo],
    mats: [plateMat, darkMat, eyeMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, plateMat);
      torso.position.y = 1.25;
      const padL = new THREE.Mesh(padGeo, plateMat);
      padL.position.set(-0.62, 1.62, 0);
      const padR = new THREE.Mesh(padGeo, plateMat);
      padR.position.set(0.62, 1.62, 0);
      for (const sx of [-0.62, 0.62]) {
        const spike = new THREE.Mesh(spikeGeo, darkMat);
        spike.position.set(sx, 1.98, 0);
        g.add(spike);
      }
      const helm = new THREE.Mesh(helmGeo, plateMat);
      helm.position.y = 1.94;
      const hL = new THREE.Mesh(hornGeo, darkMat);
      hL.position.set(-0.2, 2.16, 0);
      hL.rotation.z = 0.5;
      const hR = new THREE.Mesh(hornGeo, darkMat);
      hR.position.set(0.2, 2.16, 0);
      hR.rotation.z = -0.5;
      const eL = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.1, 1.96, 0.23);
      const eR = new THREE.Mesh(eyeGeo, eyeMat);
      eR.position.set(0.1, 1.96, 0.23);
      const legL = new THREE.Mesh(legGeo, darkMat);
      legL.position.set(-0.22, 0.45, 0);
      const legR = new THREE.Mesh(legGeo, darkMat);
      legR.position.set(0.22, 0.45, 0);
      const pack = new THREE.Mesh(padGeo, darkMat);
      pack.position.set(0, 1.45, -0.42);
      pack.scale.set(1.1, 0.9, 0.7);
      g.add(torso, padL, padR, helm, hL, hR, eL, eR, legL, legR, pack);
      return g;
    },
  };
}

/** Greenskin: hunched mass of muscle, huge jaw, tiny red eyes. */
function makeOrkAssets(): KindAssets {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x3e6a2a, roughness: 0.85 });
  const hideMat = new THREE.MeshStandardMaterial({ color: 0x2c2418, roughness: 0.9 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.5 });
  const bodyGeo = new THREE.SphereGeometry(0.62, 18, 14);
  const headGeo = new THREE.SphereGeometry(0.3, 14, 10);
  const jawGeo = new THREE.BoxGeometry(0.34, 0.14, 0.22, 2, 1, 2);
  const tuskGeo = new THREE.ConeGeometry(0.04, 0.16, 6);
  const armGeo = new THREE.CapsuleGeometry(0.2, 0.7, 6, 12);
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
  return {
    geos: [bodyGeo, headGeo, jawGeo, tuskGeo, armGeo, eyeGeo],
    mats: [skinMat, hideMat, eyeMat, toothMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, skinMat);
      body.position.set(0, 1.1, -0.05);
      body.scale.set(1.05, 0.95, 0.85);
      body.rotation.x = 0.35; // hunched forward
      const belt = new THREE.Mesh(jawGeo, hideMat);
      belt.position.set(0, 0.75, 0.25);
      belt.scale.set(2.4, 1.4, 2);
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.set(0, 1.62, 0.4);
      head.scale.set(1.05, 0.85, 1);
      const jaw = new THREE.Mesh(jawGeo, skinMat);
      jaw.position.set(0, 1.5, 0.52);
      const tL = new THREE.Mesh(tuskGeo, toothMat);
      tL.position.set(-0.12, 1.56, 0.62);
      const tR = new THREE.Mesh(tuskGeo, toothMat);
      tR.position.set(0.12, 1.56, 0.62);
      const eL = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.11, 1.7, 0.62);
      const eR = new THREE.Mesh(eyeGeo, eyeMat);
      eR.position.set(0.11, 1.7, 0.62);
      const aL = new THREE.Mesh(armGeo, skinMat);
      aL.position.set(-0.72, 1.0, 0.15);
      aL.rotation.x = -0.4;
      const aR = new THREE.Mesh(armGeo, skinMat);
      aR.position.set(0.72, 1.0, 0.15);
      aR.rotation.x = -0.4;
      g.add(body, belt, head, jaw, tL, tR, eL, eR, aL, aR);
      return g;
    },
  };
}

/** Hive-spawn gaunt: low chitin skitter, crested head, scythe claws. */
function makeGauntAssets(): KindAssets {
  const chitinMat = new THREE.MeshStandardMaterial({ color: 0x5e3a6a, roughness: 0.7 });
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x8a6a9a, roughness: 0.8 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xaaff3a });
  const bodyGeo = new THREE.SphereGeometry(0.4, 16, 12);
  const crestGeo = new THREE.ConeGeometry(0.14, 0.5, 8);
  const limbGeo = new THREE.CapsuleGeometry(0.05, 0.5, 4, 8);
  const clawGeo = new THREE.ConeGeometry(0.05, 0.35, 6);
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 6);
  return {
    geos: [bodyGeo, crestGeo, limbGeo, clawGeo, eyeGeo],
    mats: [chitinMat, fleshMat, eyeMat],
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, chitinMat);
      body.position.y = 0.6;
      body.scale.set(0.9, 0.75, 1.4);
      const crest = new THREE.Mesh(crestGeo, chitinMat);
      crest.position.set(0, 0.95, 0.35);
      crest.rotation.x = -0.7;
      const eL = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.09, 0.78, 0.52);
      const eR = new THREE.Mesh(eyeGeo, eyeMat);
      eR.position.set(0.09, 0.78, 0.52);
      g.add(body, crest, eL, eR);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(limbGeo, fleshMat);
        arm.position.set(sx * 0.35, 0.62, 0.3);
        arm.rotation.x = -0.9;
        const claw = new THREE.Mesh(clawGeo, chitinMat);
        claw.position.set(sx * 0.38, 0.55, 0.62);
        claw.rotation.x = 1.9;
        const legB = new THREE.Mesh(limbGeo, fleshMat);
        legB.position.set(sx * 0.3, 0.4, -0.25);
        legB.rotation.x = 0.6;
        g.add(arm, claw, legB);
      }
      const tail = new THREE.Mesh(clawGeo, chitinMat);
      tail.position.set(0, 0.55, -0.62);
      tail.rotation.x = -2.2;
      g.add(tail);
      return g;
    },
  };
}

/** Necron warrior: skeletal metal, green core, deathless. */
function makeNecronAssets(): KindAssets {
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 0.35, metalness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1e1a, roughness: 0.5, metalness: 0.7 });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x59ff8a });
  const torsoGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10);
  const pelvisGeo = new THREE.CylinderGeometry(0.26, 0.2, 0.3, 10);
  const ribGeo = new THREE.TorusGeometry(0.26, 0.03, 6, 14, Math.PI);
  const coreGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const headGeo = new THREE.SphereGeometry(0.18, 14, 10);
  const limbGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.8, 8);
  const shoulderGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
  return {
    geos: [torsoGeo, pelvisGeo, ribGeo, coreGeo, headGeo, limbGeo, shoulderGeo, eyeGeo],
    mats: [metalMat, darkMat, coreMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, metalMat);
      torso.position.y = 1.35;
      const pelvis = new THREE.Mesh(pelvisGeo, darkMat);
      pelvis.position.y = 0.8;
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(ribGeo, darkMat);
        rib.position.set(0, 1.15 + i * 0.18, 0.05);
        rib.rotation.x = Math.PI / 2;
        g.add(rib);
      }
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(0, 1.5, 0.2);
      const head = new THREE.Mesh(headGeo, metalMat);
      head.position.set(0, 1.98, 0.02);
      head.scale.set(0.85, 1.05, 0.95);
      const eL = new THREE.Mesh(eyeGeo, coreMat);
      eL.position.set(-0.07, 2.0, 0.16);
      const eR = new THREE.Mesh(eyeGeo, coreMat);
      eR.position.set(0.07, 2.0, 0.16);
      for (const sx of [-1, 1]) {
        const sh = new THREE.Mesh(shoulderGeo, darkMat);
        sh.position.set(sx * 0.32, 1.75, 0);
        const arm = new THREE.Mesh(limbGeo, metalMat);
        arm.position.set(sx * 0.36, 1.2, 0.05);
        const leg = new THREE.Mesh(limbGeo, darkMat);
        leg.position.set(sx * 0.14, 0.35, 0);
        g.add(sh, arm, leg);
      }
      g.add(torso, pelvis, core, head, eL, eR);
      return g;
    },
  };
}

/** Tau fire warrior: smooth ochre plate, visor slit, patient killer. */
function makeTauAssets(): KindAssets {
  const armourMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.5, metalness: 0.5 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.9 });
  const visorMat = new THREE.MeshBasicMaterial({ color: 0x7ab8ff });
  const torsoGeo = new THREE.CapsuleGeometry(0.36, 0.5, 6, 14);
  const helmGeo = new THREE.SphereGeometry(0.24, 16, 12);
  const visorGeo = new THREE.BoxGeometry(0.26, 0.05, 0.06);
  const padGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 6, 10);
  const rifleGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8);
  return {
    geos: [torsoGeo, helmGeo, visorGeo, padGeo, legGeo, rifleGeo],
    mats: [armourMat, clothMat, visorMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, armourMat);
      torso.position.y = 1.2;
      const helm = new THREE.Mesh(helmGeo, armourMat);
      helm.position.set(0, 1.82, 0.02);
      helm.scale.set(1, 1.1, 1.05);
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 1.84, 0.24);
      for (const sx of [-1, 1]) {
        const pad = new THREE.Mesh(padGeo, armourMat);
        pad.position.set(sx * 0.5, 1.5, 0);
        const leg = new THREE.Mesh(legGeo, clothMat);
        leg.position.set(sx * 0.18, 0.42, 0);
        g.add(pad, leg);
      }
      const rifle = new THREE.Mesh(rifleGeo, clothMat);
      rifle.position.set(0.3, 1.25, 0.3);
      rifle.rotation.x = Math.PI / 2;
      g.add(torso, helm, visor, rifle);
      return g;
    },
  };
}

/** Eldar aspect kin: tall, slender, high-crested helm, never still. */
function makeEldarAssets(): KindAssets {
  const armourMat = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.35, metalness: 0.6 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7df0ff });
  const torsoGeo = new THREE.CapsuleGeometry(0.26, 0.7, 6, 14);
  const helmGeo = new THREE.SphereGeometry(0.19, 14, 10);
  const crestGeo = new THREE.ConeGeometry(0.09, 0.55, 8);
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const limbGeo = new THREE.CapsuleGeometry(0.08, 0.6, 5, 10);
  const gemGeo = new THREE.SphereGeometry(0.06, 8, 6);
  return {
    geos: [torsoGeo, helmGeo, crestGeo, eyeGeo, limbGeo, gemGeo],
    mats: [armourMat, boneMat, eyeMat],
    build() {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, armourMat);
      torso.position.y = 1.35;
      const gem = new THREE.Mesh(gemGeo, eyeMat);
      gem.position.set(0, 1.5, 0.26);
      const helm = new THREE.Mesh(helmGeo, boneMat);
      helm.position.set(0, 2.05, 0.02);
      helm.scale.set(0.9, 1.15, 0.95);
      const crest = new THREE.Mesh(crestGeo, boneMat);
      crest.position.set(0, 2.4, -0.05);
      crest.rotation.x = -0.35;
      const eL = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.07, 2.06, 0.17);
      const eR = new THREE.Mesh(eyeGeo, eyeMat);
      eR.position.set(0.07, 2.06, 0.17);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(limbGeo, armourMat);
        arm.position.set(sx * 0.36, 1.35, 0.05);
        const leg = new THREE.Mesh(limbGeo, boneMat);
        leg.position.set(sx * 0.14, 0.45, 0);
        g.add(arm, leg);
      }
      g.add(torso, gem, helm, crest, eL, eR);
      return g;
    },
  };
}

export class EnemyPool {
  readonly list: Enemy[] = [];
  private assets: Record<EnemyKind, KindAssets>;
  private scene: THREE.Scene;
  /** Boss warp-glow, moved onto the active boss each frame. */
  private bossLight: THREE.PointLight;
  private barGeos: THREE.BufferGeometry[] = [];
  private barMats: THREE.Material[] = [];
  /** Necrons waiting to rise again. */
  private revives: Array<{ e: Enemy; t: number }> = [];
  /** FX callback fired when a necron stands back up. */
  onRevive: ((x: number, z: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.assets = {
      cultist: makeCultistAssets(),
      brute: makeBruteAssets(),
      spitter: makeSpitterAssets(),
      boss: makeBossAssets(),
      bossDemon: makeDemonAssets(),
      bossGargant: makeGargantAssets(),
      bossWraith: makeWraithAssets(),
      bossFex: makeFexAssets(),
      bossPhaeron: makePhaeronAssets(),
      bossCrisis: makeCrisisAssets(),
      bossTan: makeTanAssets(),
      chaos: makeChaosAssets(),
      votann: makeVotannAssets(),
      ork: makeOrkAssets(),
      gaunt: makeGauntAssets(),
      necron: makeNecronAssets(),
      tau: makeTauAssets(),
      eldar: makeEldarAssets(),
    };
    // shared HP-bar assets: light frame + dark track + crimson fill anchored at the left edge
    const bgGeo = new THREE.PlaneGeometry(2.2, 0.36);
    const fgGeo = new THREE.PlaneGeometry(2.04, 0.22);
    fgGeo.translate(1.02, 0, 0); // origin at left edge → scale.x shrinks right-to-left
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x14080a, transparent: true, opacity: 0.92, depthWrite: false });
    const fgMat = new THREE.MeshBasicMaterial({ color: 0xff3530, transparent: true, opacity: 1, depthWrite: false });
    const frameGeo = new THREE.PlaneGeometry(2.3, 0.42);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xd8cfa8, transparent: true, opacity: 0.85, depthWrite: false });
    this.barGeos.push(frameGeo, bgGeo, fgGeo);
    this.barMats.push(frameMat, bgMat, fgMat);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Group();
      mesh.visible = false;
      scene.add(mesh);
      const bar = new THREE.Group();
      const frame = new THREE.Mesh(frameGeo, frameMat);
      const bg = new THREE.Mesh(bgGeo, bgMat);
      const barFg = new THREE.Mesh(fgGeo, fgMat);
      bg.position.z = 0.001;
      barFg.position.set(-1.02, 0, 0.002);
      // explicit painter order: frame → track → fill (all depthWrite-free)
      frame.renderOrder = 0;
      bg.renderOrder = 1;
      barFg.renderOrder = 2;
      bar.add(frame, bg, barFg);
      // YXZ: yaw counter-rotates the parent each frame so the bar always
      // faces the camera; the tilt then leans it back toward the lens
      // (camera sits at ~63° elevation, so the plane pitches ~27° off vertical)
      bar.rotation.order = "YXZ";
      bar.rotation.x = -0.46;
      bar.visible = false;
      mesh.add(bar);
      this.list.push({
        active: false, kind: "cultist", mesh, hp: 1, maxHp: 1, speed: 1, dmg: 1,
        radius: 0.5, score: 0, attackCd: 0, state: "chase", stateT: 0,
        chargeX: 0, chargeZ: 1, strafeDir: 1, spitCd: 0, burstCd: 0, flashT: 0, baseScale: 1,
        revived: false, bar, barFg,
      });
    }
    this.bossLight = new THREE.PointLight(0xd42040, 0, 18, 1.6);
    scene.add(this.bossLight);
  }

  spawn(kind: EnemyKind, x: number, z: number, hpMul: number, dmgMul: number): Enemy | null {
    for (const e of this.list) {
      if (e.active) continue;
      const spec = SPECS[kind];
      e.active = true;
      e.kind = kind;
      e.maxHp = e.hp = Math.round(spec.hp * hpMul);
      e.speed = spec.speed * (0.9 + Math.random() * 0.2);
      e.dmg = Math.round(spec.dmg * dmgMul);
      e.radius = spec.radius * (isBoss(kind) ? 2 : 1);
      e.score = spec.score;
      e.attackCd = 0.5;
      e.state = "chase";
      e.stateT = 0;
      e.strafeDir = Math.random() < 0.5 ? -1 : 1;
      e.spitCd = 1.2 + Math.random() * 1.4;
      e.burstCd = 5;
      e.flashT = 0;
      e.revived = false;
      // rebuild the visual only when the kind changes for this slot
      if (e.mesh.userData.kind !== kind) {
        e.mesh.clear();
        e.mesh.add(this.assets[kind].build());
        e.mesh.userData.kind = kind;
        e.mesh.add(e.bar); // clear() also detaches the HP bar — put it back
      }
      e.baseScale = kind === "boss" ? 1 : 1;
      e.mesh.position.set(x, 0, z);
      e.mesh.scale.setScalar(1);
      e.mesh.visible = true;
      // HP bar: height per kind, width by bulk, hidden until first hit
      const bh = BAR_HEIGHT[kind];
      e.bar.visible = false;
      if (bh !== undefined) {
        e.bar.position.set(0, bh, 0);
        const bw = Math.max(1, e.radius * 1.5);
        e.bar.scale.set(bw, 1, 1);
        e.barFg.scale.x = 1;
      }
      return e;
    }
    return null;
  }

  kill(e: Enemy): void {
    e.active = false;
    e.mesh.visible = false;
    e.bar.visible = false;
  }

  clear(): void {
    for (const e of this.list) this.kill(e);
    this.revives = [];
    this.bossLight.intensity = 0;
  }

  activeCount(): number {
    let n = 0;
    for (const e of this.list) if (e.active) n++;
    return n;
  }

  /** Enemies temporarily out of play but bound to return (necron reanimation). */
  pendingRevives(): number {
    return this.revives.length;
  }

  /** Necron protocol: the body drops, then rises once at half strength. */
  beginRevive(e: Enemy): void {
    e.active = false;
    e.mesh.visible = false;
    e.bar.visible = false;
    this.revives.push({ e, t: 3.5 });
  }

  boss(): Enemy | null {
    for (const e of this.list) if (e.active && isBoss(e.kind)) return e;
    return null;
  }

  /** Solid arena furniture of the current map — enemies slide around it. */
  private obs: readonly Obstacle[] = [];
  setObstacles(obs: readonly Obstacle[]): void {
    this.obs = obs;
  }

  /**
   * Advance AI for every active enemy. Callbacks let the game apply damage / spawn spit
   * without the pool owning those systems.
   */
  update(
    dt: number, t: number,
    px: number, pz: number,
    hitPlayer: (dmg: number) => void,
    spitAt: (x: number, z: number, dx: number, dz: number, dmg: number, proj: ProjKind) => void,
    onChargeRoar: () => void,
    onBossBurst: (x: number, z: number, dmg: number, kind: EnemyKind) => void,
  ): void {
    // necron reanimation protocol — the fallen stand back up at half strength
    for (let i = this.revives.length - 1; i >= 0; i--) {
      const r = this.revives[i];
      r.t -= dt;
      if (r.t > 0) continue;
      this.revives.splice(i, 1);
      const e = r.e;
      e.active = true;
      e.hp = Math.round(e.maxHp * 0.5);
      e.state = "chase";
      e.attackCd = 1;
      e.spitCd = 1.5;
      e.mesh.visible = true;
      this.onRevive?.(e.mesh.position.x, e.mesh.position.z);
    }
    let bossSeen = false;
    for (const e of this.list) {
      if (!e.active) continue;
      const m = e.mesh.position;
      let dx = px - m.x;
      let dz = pz - m.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      dx /= dist;
      dz /= dist;
      e.attackCd -= dt;
      e.flashT = Math.max(0, e.flashT - dt);
      const flash = e.flashT > 0 ? 1 + e.flashT * 1.6 : 1;
      e.mesh.scale.setScalar(e.baseScale * flash);
      // HP bar appears after the first hit and tracks health;
      // cancel the body's yaw so the bar never turns edge-on to the camera
      if (!isBoss(e.kind)) {
        e.bar.visible = e.hp < e.maxHp;
        if (e.bar.visible) {
          e.barFg.scale.x = Math.max(0.001, e.hp / e.maxHp);
          e.bar.rotation.y = -e.mesh.rotation.y;
        }
      }

      switch (e.kind) {
        case "cultist": {
          if (dist > SPECS.cultist.attackRange * 0.8) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          }
          if (dist < SPECS.cultist.attackRange && e.attackCd <= 0) {
            e.attackCd = SPECS.cultist.attackCd;
            hitPlayer(e.dmg);
          }
          // scuttle wobble
          e.mesh.rotation.y = Math.atan2(dx, dz);
          e.mesh.position.y = Math.abs(Math.sin(t * 10 + m.x)) * 0.08;
          break;
        }
        case "brute":
        case "boss":
        case "bossDemon":
        case "bossGargant":
        case "bossWraith":
        case "bossFex":
        case "bossPhaeron":
        case "bossCrisis":
        case "bossTan": {
          const spec = SPECS[e.kind];
          const bossKind = isBoss(e.kind);
          e.mesh.rotation.y = Math.atan2(dx, dz);
          if (e.state === "chase") {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
            if (dist < spec.attackRange && e.attackCd <= 0) {
              e.attackCd = spec.attackCd;
              hitPlayer(e.dmg);
            }
            // begin a charge when at mid range
            const chargeRange = bossKind ? 15 : 11;
            if (dist < chargeRange && dist > 4 && e.attackCd <= -1.2) {
              e.state = "windup";
              e.stateT = 0.7;
              onChargeRoar();
            }
          } else if (e.state === "windup") {
            e.stateT -= dt;
            e.mesh.position.y = Math.sin(t * 40) * 0.05; // trembling telegraph
            if (e.stateT <= 0) {
              e.state = "charge";
              e.stateT = 0.65;
              e.chargeX = dx;
              e.chargeZ = dz;
            }
          } else if (e.state === "charge") {
            e.stateT -= dt;
            const cs = bossKind ? 19 : 15;
            m.x += e.chargeX * cs * dt;
            m.z += e.chargeZ * cs * dt;
            if (dist < e.radius + 1.0 && e.attackCd <= 0) {
              e.attackCd = spec.attackCd;
              hitPlayer(Math.round(e.dmg * 1.3));
            }
            if (e.stateT <= 0) {
              e.state = "recover";
              e.stateT = 0.8;
              e.attackCd = Math.max(e.attackCd, 0.8);
            }
          } else {
            e.stateT -= dt;
            if (e.stateT <= 0) e.state = "chase";
          }
          if (bossKind) {
            bossSeen = true;
            this.bossLight.position.set(m.x, 3, m.z);
            this.bossLight.intensity = 10 + Math.sin(t * 6) * 3;
            e.burstCd -= dt;
            if (e.burstCd <= 0 && dist < 16) {
              e.burstCd = 6.5;
              onBossBurst(m.x, m.z, e.dmg, e.kind);
            }
          }
          break;
        }
        case "spitter": {
          e.mesh.rotation.y = Math.atan2(dx, dz);
          // hold 8–12m, strafe while waiting
          if (dist > 12) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          } else if (dist < 8) {
            m.x -= dx * e.speed * dt;
            m.z -= dz * e.speed * dt;
          } else {
            m.x += -dz * e.strafeDir * e.speed * 0.5 * dt;
            m.z += dx * e.strafeDir * e.speed * 0.5 * dt;
          }
          e.spitCd -= dt;
          if (e.spitCd <= 0 && dist < SPECS.spitter.attackRange) {
            e.spitCd = SPECS.spitter.attackCd * (0.85 + Math.random() * 0.3);
            spitAt(m.x, m.z, dx, dz, e.dmg, "spit");
          }
          // breathing sac pulse
          const s = 1 + Math.sin(t * 5 + m.z) * 0.05;
          e.mesh.scale.set(s * (e.flashT > 0 ? 1 + e.flashT : 1), s, s * (e.flashT > 0 ? 1 + e.flashT : 1));
          break;
        }
        case "chaos": {
          // fallen Astartes: methodical fire discipline — hold 8–14m, three-bolt bursts
          e.mesh.rotation.y = Math.atan2(dx, dz);
          if (dist > 14) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          } else if (dist < 8) {
            m.x -= dx * e.speed * 0.6 * dt;
            m.z -= dz * e.speed * 0.6 * dt;
          } else {
            m.x += -dz * e.strafeDir * e.speed * 0.3 * dt;
            m.z += dx * e.strafeDir * e.speed * 0.3 * dt;
          }
          e.spitCd -= dt;
          if (e.spitCd <= 0 && dist < SPECS.chaos.attackRange) {
            e.spitCd = SPECS.chaos.attackCd * (0.9 + Math.random() * 0.2);
            spitAt(m.x, m.z, dx, dz, e.dmg, "bolt");
          }
          if (dist < 1.7 && e.attackCd <= 0) {
            e.attackCd = 1.2;
            hitPlayer(Math.round(e.dmg * 1.8));
          }
          break;
        }
        case "votann": {
          // hearthkyn: grudge-holding fire line — close to 6–11m, twin-bolt volleys
          e.mesh.rotation.y = Math.atan2(dx, dz);
          if (dist > 11) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          } else if (dist < 6) {
            m.x -= dx * e.speed * 0.55 * dt;
            m.z -= dz * e.speed * 0.55 * dt;
          } else {
            m.x += -dz * e.strafeDir * e.speed * 0.25 * dt;
            m.z += dx * e.strafeDir * e.speed * 0.25 * dt;
          }
          e.spitCd -= dt;
          if (e.spitCd <= 0 && dist < SPECS.votann.attackRange) {
            e.spitCd = SPECS.votann.attackCd * (0.9 + Math.random() * 0.2);
            spitAt(m.x, m.z, dx, dz, e.dmg, "bolt");
          }
          if (dist < 1.8 && e.attackCd <= 0) {
            e.attackCd = 1.3;
            hitPlayer(Math.round(e.dmg * 2.0));
          }
          break;
        }
        case "ork": {
          // greenskin: trots closer, then a WAAAGH sprint that barely turns but never stops
          e.mesh.rotation.y = Math.atan2(dx, dz);
          if (e.state === "chase") {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
            if (dist < 11) {
              e.state = "windup";
              e.stateT = 0.35;
              onChargeRoar();
            }
          } else if (e.state === "windup") {
            e.stateT -= dt;
            if (e.stateT <= 0) {
              e.state = "charge";
              e.stateT = 1.4;
              e.chargeX = dx;
              e.chargeZ = dz;
            }
          } else if (e.state === "charge") {
            e.stateT -= dt;
            e.chargeX += (dx - e.chargeX) * dt * 1.5;
            e.chargeZ += (dz - e.chargeZ) * dt * 1.5;
            m.x += e.chargeX * 13 * dt;
            m.z += e.chargeZ * 13 * dt;
            e.mesh.position.y = Math.abs(Math.sin(t * 16)) * 0.15;
            if (e.stateT <= 0) {
              e.state = "chase";
              e.mesh.position.y = 0;
            }
          }
          if (dist < SPECS.ork.attackRange && e.attackCd <= 0) {
            e.attackCd = SPECS.ork.attackCd;
            hitPlayer(e.dmg);
          }
          break;
        }
        case "gaunt": {
          // hive spawn: skitters in, then pounces in a long arc
          e.mesh.rotation.y = Math.atan2(dx, dz);
          e.spitCd -= dt; // leap cooldown
          if (e.state === "chase") {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
            if (dist < 7 && dist > 2.5 && e.spitCd <= 0) {
              e.state = "charge";
              e.stateT = 0.38;
              e.chargeX = dx;
              e.chargeZ = dz;
              e.spitCd = 2.4;
            }
            e.mesh.position.y = Math.abs(Math.sin(t * 14 + m.x)) * 0.1;
          } else if (e.state === "charge") {
            e.stateT -= dt;
            m.x += e.chargeX * 17 * dt;
            m.z += e.chargeZ * 17 * dt;
            e.mesh.position.y = Math.sin((1 - e.stateT / 0.38) * Math.PI) * 0.9;
            if (e.stateT <= 0) {
              e.state = "chase";
              e.mesh.position.y = 0;
            }
          }
          if (dist < SPECS.gaunt.attackRange && e.attackCd <= 0) {
            e.attackCd = SPECS.gaunt.attackCd;
            hitPlayer(e.dmg);
          }
          break;
        }
        case "necron": {
          // relentless: walks straight in, no strafe, no fear; gauss rods on a slow cycle
          e.mesh.rotation.y = Math.atan2(dx, dz);
          if (dist > 10) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          }
          e.spitCd -= dt;
          if (e.spitCd <= 0 && dist < SPECS.necron.attackRange) {
            e.spitCd = SPECS.necron.attackCd * (0.9 + Math.random() * 0.2);
            spitAt(m.x, m.z, dx, dz, e.dmg, "gauss");
          }
          if (dist < 1.6 && e.attackCd <= 0) {
            e.attackCd = 1.4;
            hitPlayer(e.dmg);
          }
          break;
        }
        case "tau": {
          // fire caste: the longest reach on the field, brittle — kites hard when pressed
          e.mesh.rotation.y = Math.atan2(dx, dz);
          if (dist < 13) {
            m.x -= dx * e.speed * 1.4 * dt;
            m.z -= dz * e.speed * 1.4 * dt;
          } else if (dist > 19) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          }
          e.spitCd -= dt;
          if (e.spitCd <= 0 && dist < SPECS.tau.attackRange) {
            e.spitCd = SPECS.tau.attackCd * (0.9 + Math.random() * 0.2);
            spitAt(m.x, m.z, dx, dz, e.dmg, "pulse");
          }
          break;
        }
        case "eldar": {
          // aspect kin: never still — wide strafing runs that flip direction constantly
          e.mesh.rotation.y = Math.atan2(dx, dz);
          e.stateT -= dt;
          if (e.stateT <= 0) {
            e.stateT = 1.1 + Math.random() * 0.6;
            e.strafeDir = -e.strafeDir;
          }
          if (dist > 12) {
            m.x += dx * e.speed * dt;
            m.z += dz * e.speed * dt;
          } else if (dist < 7) {
            m.x -= dx * e.speed * dt;
            m.z -= dz * e.speed * dt;
          } else {
            m.x += -dz * e.strafeDir * e.speed * dt;
            m.z += dx * e.strafeDir * e.speed * dt;
          }
          e.spitCd -= dt;
          if (e.spitCd <= 0 && dist < SPECS.eldar.attackRange) {
            e.spitCd = SPECS.eldar.attackCd * (0.9 + Math.random() * 0.2);
            spitAt(m.x, m.z, dx, dz, e.dmg, "shuriken");
          }
          if (dist < 1.5 && e.attackCd <= 0) {
            e.attackCd = 1.0;
            hitPlayer(Math.round(e.dmg * 1.6));
          }
          break;
        }
      }

      // stay inside the arena and out of the furniture
      m.x = Math.max(-ARENA.HALF_W, Math.min(ARENA.HALF_W, m.x));
      m.z = Math.max(-ARENA.HALF_D, Math.min(ARENA.HALF_D, m.z));
      if (this.obs.length > 0) pushOutObstacles(m, e.radius, this.obs);
    }
    if (!bossSeen) this.bossLight.intensity = 0;

    // pairwise separation (N ≤ 48 → cheap; keeps the horde from stacking into one body)
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.active) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.active) continue;
        const ax = a.mesh.position.x, az = a.mesh.position.z;
        let sx = ax - b.mesh.position.x;
        let sz = az - b.mesh.position.z;
        const rr = (a.radius + b.radius) * 0.9;
        const d2 = sx * sx + sz * sz;
        if (d2 > rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        sx /= d;
        sz /= d;
        const push = (rr - d) * 0.5;
        a.mesh.position.x += sx * push;
        a.mesh.position.z += sz * push;
        b.mesh.position.x -= sx * push;
        b.mesh.position.z -= sz * push;
      }
    }
  }

  dispose(): void {
    for (const e of this.list) e.mesh.removeFromParent();
    for (const k of Object.keys(this.assets) as EnemyKind[]) {
      for (const g of this.assets[k].geos) g.dispose();
      for (const m of this.assets[k].mats) m.dispose();
    }
    for (const g of this.barGeos) g.dispose();
    for (const m of this.barMats) m.dispose();
    this.bossLight.removeFromParent();
  }
}
