/**
 * player.ts — parametric heroes of the Vigil, chapter «Exorcists».
 * Three body patterns share one contract: Mk VII power armour (with an
 * optional bladeguard sword-and-shield loadout), Indomitus terminator plate,
 * and the Castraferrum-pattern dreadnought hull.
 * Faces +Z when rotation.y === 0; the barrel tip is exposed via getMuzzle().
 */

import * as THREE from "three";

export interface PlayerVisual {
  tint: number;
  trim: number;
  scale: number;
  model: "marine" | "terminator" | "dreadnought";
  /** "gun" — правый кулак держит болтер; "swordshield" — меч и штурмовой щит. */
  gear?: "gun" | "swordshield";
}

export interface PlayerModel {
  group: THREE.Group;
  /** World-space barrel tip, written into `out` (no allocation). */
  getMuzzle(out: THREE.Vector3): THREE.Vector3;
  /** Walk-cycle swing + idle breathing. */
  animate(t: number, moving: boolean): void;
  dispose(): void;
}

const DEFAULT_VISUAL: PlayerVisual = { tint: 0x6e1a20, trim: 0xd8d3c3, scale: 1, model: "marine" };

const BONE = 0xd8d3c3;

interface BodyParts {
  muzzleLocal: THREE.Vector3;
  legL: THREE.Group;
  legR: THREE.Group;
  bobMul: number;
}

/** Calva Daemoniorum — the horned skull of the Exorcists, drawn on a canvas decal. */
function makeChapterBadge(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = "#d8d3c3";
  g.strokeStyle = "#d8d3c3";
  // horns: two thick curved strokes sweeping up and out
  for (const s of [-1, 1]) {
    g.beginPath();
    g.lineWidth = 22;
    g.lineCap = "round";
    g.moveTo(128 + s * 44, 92);
    g.quadraticCurveTo(128 + s * 96, 66, 128 + s * 104, 18);
    g.stroke();
    // horn tip
    g.beginPath();
    g.moveTo(128 + s * 104, 18);
    g.lineTo(128 + s * 96, 44);
    g.lineTo(128 + s * 86, 20);
    g.closePath();
    g.fill();
  }
  // skull dome
  g.beginPath();
  g.ellipse(128, 116, 52, 56, 0, 0, Math.PI * 2);
  g.fill();
  // jaw
  g.beginPath();
  g.moveTo(96, 150);
  g.quadraticCurveTo(96, 196, 128, 198);
  g.quadraticCurveTo(160, 196, 160, 150);
  g.closePath();
  g.fill();
  // eye sockets + nose, cut out in dark
  g.fillStyle = "rgba(10,8,8,0.92)";
  g.beginPath();
  g.ellipse(108, 118, 14, 17, -0.25, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(148, 118, 14, 17, 0.25, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(128, 138);
  g.lineTo(119, 158);
  g.lineTo(137, 158);
  g.closePath();
  g.fill();
  // teeth grooves
  g.strokeStyle = "rgba(10,8,8,0.85)";
  g.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(128 + i * 10, 178);
    g.lineTo(128 + i * 10, 196);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPlayerModel(visual: PlayerVisual = DEFAULT_VISUAL): PlayerModel {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  const armourMat = new THREE.MeshStandardMaterial({ color: visual.tint, roughness: 0.34, metalness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({ color: visual.trim, roughness: 0.32, metalness: 0.55 });
  const boneMat = new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.45, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.55, metalness: 0.6 });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x7df0ff });
  const swordGlowMat = new THREE.MeshBasicMaterial({ color: 0x9adfff });
  const badgeTex = makeChapterBadge();
  const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, side: THREE.DoubleSide });
  disposables.push(armourMat, trimMat, boneMat, darkMat, lensMat, swordGlowMat, badgeTex, badgeMat);

  const mk = (
    geo: THREE.BufferGeometry, mat: THREE.Material,
    x: number, y: number, z: number, parent: THREE.Object3D = group,
  ): THREE.Mesh => {
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /** Chapter badge decal on the outer face of the left pauldron. */
  const addBadge = (x: number, y: number, z: number, size: number, parent: THREE.Object3D = group): void => {
    const p = mk(new THREE.PlaneGeometry(size, size), badgeMat, x, y, z, parent);
    p.rotation.y = -Math.PI / 2; // faces -X, outward from the left shoulder
  };

  /** Chest aquila: skull + swept wings in bone colour. */
  const addAquila = (y: number, z: number, s: number, parent: THREE.Object3D): void => {
    mk(new THREE.SphereGeometry(0.07 * s, 10, 8), boneMat, 0, y, z, parent);
    for (const sx of [-1, 1]) {
      const wing = mk(new THREE.BoxGeometry(0.3 * s, 0.07 * s, 0.03), boneMat, sx * 0.19 * s, y + 0.02 * s, z, parent);
      wing.rotation.z = sx * 0.42;
      const wing2 = mk(new THREE.BoxGeometry(0.2 * s, 0.05 * s, 0.03), boneMat, sx * 0.24 * s, y - 0.09 * s, z, parent);
      wing2.rotation.z = sx * 0.15;
    }
  };

  /** Mk VII helmet: dome, faceplate snout, glowing lenses, brow ridge. */
  const addHelm = (y: number, z: number, s: number, crest: boolean): void => {
    const helm = mk(new THREE.SphereGeometry(0.3 * s, 22, 16), armourMat, 0, y, z);
    helm.scale.set(1, 1.06, 1.06);
    const snout = mk(new THREE.BoxGeometry(0.2 * s, 0.14 * s, 0.16 * s), darkMat, 0, y - 0.1 * s, z + 0.24 * s);
    snout.rotation.x = 0.35;
    // grill slits
    for (let i = -1; i <= 1; i++) {
      mk(new THREE.BoxGeometry(0.03, 0.1 * s, 0.02), trimMat, i * 0.055 * s, y - 0.1 * s, z + 0.32 * s).rotation.x = 0.35;
    }
    mk(new THREE.SphereGeometry(0.06 * s, 10, 8), lensMat, -0.11 * s, y + 0.03 * s, z + 0.26 * s);
    mk(new THREE.SphereGeometry(0.06 * s, 10, 8), lensMat, 0.11 * s, y + 0.03 * s, z + 0.26 * s);
    mk(new THREE.BoxGeometry(0.34 * s, 0.05 * s, 0.1 * s), trimMat, 0, y + 0.2 * s, z + 0.14 * s); // brow ridge
    if (crest) mk(new THREE.BoxGeometry(0.07, 0.26, 0.5), trimMat, 0, y + 0.34 * s, z - 0.04);
  };

  /** Backpack with twin exhaust stacks — always chapter-black. */
  const addBackpack = (y: number, z: number, w: number): void => {
    mk(new THREE.BoxGeometry(w, w * 0.9, w * 0.45, 2, 2, 2), darkMat, 0, y, z);
    for (const sx of [-1, 1]) {
      mk(new THREE.CylinderGeometry(0.09 * w * 2, 0.11 * w * 2, w * 0.62, 12), trimMat, sx * w * 0.26, y + w * 0.6, z);
      mk(new THREE.SphereGeometry(0.09 * w * 2, 10, 8), darkMat, sx * w * 0.26, y + w * 0.92, z);
    }
  };

  /** Boltgun held in the right fist; returns the local muzzle position. */
  const addBoltgun = (armR: THREE.Group, s: number): THREE.Vector3 => {
    const gun = new THREE.Group();
    gun.position.set(-0.1 * s, -0.52 * s, 0.4 * s);
    mk(new THREE.BoxGeometry(0.22 * s, 0.3 * s, 0.9 * s, 2, 2, 3), darkMat, 0, 0, 0.3 * s, gun);
    mk(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.5 * s, 12), trimMat, 0, 0.05 * s, 0.9 * s, gun).rotation.x = Math.PI / 2;
    mk(new THREE.CylinderGeometry(0.09 * s, 0.075 * s, 0.14 * s, 12), darkMat, 0, 0.05 * s, 1.12 * s, gun).rotation.x = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.16 * s, 0.28 * s, 0.3 * s), armourMat, 0, -0.26 * s, 0.15 * s, gun);
    mk(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.3 * s, 10), darkMat, 0, 0.22 * s, 0.35 * s, gun).rotation.x = Math.PI / 2;
    // sickle magazine
    mk(new THREE.BoxGeometry(0.1 * s, 0.24 * s, 0.16 * s), darkMat, 0, -0.3 * s, 0.55 * s, gun).rotation.x = 0.3;
    armR.add(gun);
    return new THREE.Vector3(-0.1 * s, -0.52 * s + 0.05 * s, 0.4 * s + 1.2 * s);
  };

  // ── Mk VII power armour ─────────────────────────────────────────
  const buildMarine = (): BodyParts => {
    const gear = visual.gear ?? "gun";

    const legL = new THREE.Group();
    legL.position.set(-0.28, 1.0, 0);
    mk(new THREE.CapsuleGeometry(0.18, 0.64, 6, 14), armourMat, 0, -0.5, 0, legL);
    mk(new THREE.SphereGeometry(0.16, 12, 10), trimMat, 0, -0.52, 0.16, legL); // knee plate
    mk(new THREE.BoxGeometry(0.38, 0.22, 0.55, 2, 2, 2), darkMat, 0, -1.0, 0.05, legL);
    mk(new THREE.BoxGeometry(0.3, 0.34, 0.1), armourMat, 0, -0.28, 0.2, legL); // shin guard
    const legR = legL.clone();
    legR.position.x = 0.28;
    group.add(legL, legR);

    const torso = new THREE.Group();
    torso.position.y = 1.0;
    const cuirass = mk(new THREE.SphereGeometry(0.58, 24, 18), armourMat, 0, 0.52, 0, torso);
    cuirass.scale.set(0.98, 0.78, 0.62);
    // ribbed abdomen
    for (let i = 0; i < 3; i++) {
      mk(new THREE.CylinderGeometry(0.38 - i * 0.02, 0.4 - i * 0.02, 0.09, 14), darkMat, 0, 0.2 - i * 0.1, 0, torso);
    }
    addAquila(0.64, 0.34, 1.0, torso); // bone eagle on the breast
    for (const sx of [-0.3, 0.3]) {
      const cable = mk(new THREE.TorusGeometry(0.16, 0.035, 8, 14, Math.PI), darkMat, sx, 0.18, 0.18, torso);
      cable.rotation.set(Math.PI / 2, 0, sx > 0 ? -0.5 : 0.5);
    }
    group.add(torso);

    // pauldrons: left carries the Calva Daemoniorum
    const padL = mk(new THREE.SphereGeometry(0.46, 24, 18), armourMat, -0.8, 1.72, 0);
    padL.scale.set(1, 0.9, 1);
    const padR = mk(new THREE.SphereGeometry(0.44, 24, 18), armourMat, 0.78, 1.72, 0);
    padR.scale.set(1, 0.92, 1);
    const rimL = mk(new THREE.TorusGeometry(0.44, 0.045, 10, 24), trimMat, -0.8, 1.66, 0);
    rimL.rotation.x = Math.PI / 2;
    const rimR = mk(new THREE.TorusGeometry(0.42, 0.045, 10, 24), trimMat, 0.78, 1.66, 0);
    rimR.rotation.x = Math.PI / 2;
    mk(new THREE.SphereGeometry(0.2, 14, 10), trimMat, 0.78, 2.04, 0); // right pauldron stud
    addBadge(-1.24, 1.74, 0, 0.62);

    addHelm(1.98, 0.05, 1, gear === "swordshield");
    addBackpack(1.65, -0.48, 0.8);

    const armR = new THREE.Group();
    armR.position.set(0.72, 1.55, 0.1);
    mk(new THREE.CapsuleGeometry(0.14, 0.44, 6, 12), armourMat, 0, -0.2, 0.15, armR);
    mk(new THREE.SphereGeometry(0.15, 12, 10), darkMat, 0, -0.46, 0.22, armR);
    group.add(armR);

    const armL = new THREE.Group();
    armL.position.set(-0.72, 1.55, 0.1);
    mk(new THREE.CapsuleGeometry(0.14, 0.44, 6, 12), armourMat, 0, -0.2, 0.1, armL);
    mk(new THREE.SphereGeometry(0.15, 12, 10), darkMat, 0, -0.46, 0.16, armL);
    group.add(armL);

    let muzzleLocal: THREE.Vector3;
    if (gear === "swordshield") {
      // master-crafted power sword, blade canted forward
      const sword = new THREE.Group();
      sword.position.set(0, -0.55, 0.3);
      sword.rotation.x = -0.5;
      mk(new THREE.BoxGeometry(0.16, 0.1, 0.34), trimMat, 0, 0, 0.1, sword); // crossguard
      mk(new THREE.SphereGeometry(0.06, 10, 8), boneMat, 0, 0, -0.12, sword); // pommel skull
      const blade = mk(new THREE.BoxGeometry(0.09, 0.035, 1.35), swordGlowMat, 0, 0, 0.85, sword);
      blade.scale.x = 1;
      mk(new THREE.BoxGeometry(0.05, 0.05, 1.3), trimMat, 0, 0.045, 0.85, sword); // power-field spine
      armR.add(sword);
      // storm shield on the left arm: plated slab with a boss and the chapter badge
      const shield = new THREE.Group();
      shield.position.set(-0.22, -0.3, 0.18);
      mk(new THREE.BoxGeometry(0.1, 1.1, 0.78, 1, 3, 3), armourMat, 0, 0, 0, shield);
      mk(new THREE.BoxGeometry(0.05, 1.2, 0.88), trimMat, -0.02, 0, 0, shield);
      mk(new THREE.SphereGeometry(0.14, 12, 10), trimMat, -0.08, 0.1, 0, shield); // shield boss
      const sb = mk(new THREE.PlaneGeometry(0.5, 0.5), badgeMat, -0.09, -0.18, 0, shield);
      sb.rotation.y = -Math.PI / 2;
      armL.add(shield);
      // hip-holstered bolt pistol still feeds the muzzle point
      mk(new THREE.BoxGeometry(0.14, 0.3, 0.2), darkMat, 0.42, 1.06, 0.18);
      muzzleLocal = new THREE.Vector3(0.42, 1.1, 0.5);
    } else {
      const mz = addBoltgun(armR, 1);
      muzzleLocal = new THREE.Vector3(0.72 + mz.x, 1.55 + mz.y, 0.1 + mz.z);
    }

    return { muzzleLocal, legL, legR, bobMul: 1 };
  };

  // ── Indomitus terminator plate: bigger, broader — a walking wall ──
  const buildTerminator = (): BodyParts => {
    const legL = new THREE.Group();
    legL.position.set(-0.36, 1.0, 0);
    mk(new THREE.CapsuleGeometry(0.24, 0.6, 6, 14), armourMat, 0, -0.5, 0, legL);
    mk(new THREE.SphereGeometry(0.2, 12, 10), trimMat, 0, -0.5, 0.2, legL);
    mk(new THREE.BoxGeometry(0.5, 0.24, 0.66, 2, 2, 2), darkMat, 0, -1.0, 0.06, legL);
    const legR = legL.clone();
    legR.position.x = 0.36;
    group.add(legL, legR);

    const torso = new THREE.Group();
    torso.position.y = 1.0;
    const cuirass = mk(new THREE.SphereGeometry(0.72, 24, 18), armourMat, 0, 0.55, 0, torso);
    cuirass.scale.set(1.05, 0.82, 0.72);
    mk(new THREE.CylinderGeometry(0.5, 0.58, 0.4, 16), darkMat, 0, 0.06, 0, torso);
    addAquila(0.72, 0.5, 0.85, torso);
    group.add(torso);

    // massive box-layered pauldrons, sloped like Indomitus plate
    for (const sx of [-1, 1]) {
      const pad = mk(new THREE.SphereGeometry(0.58, 24, 18), armourMat, sx * 1.0, 1.78, 0);
      pad.scale.set(1.1, 0.85, 1.05);
      const rim = mk(new THREE.TorusGeometry(0.55, 0.05, 10, 24), trimMat, sx * 1.0, 1.66, 0);
      rim.rotation.x = Math.PI / 2;
      mk(new THREE.BoxGeometry(0.34, 0.2, 0.6), armourMat, sx * 1.06, 2.14, 0); // upper plate
    }
    addBadge(-1.56, 1.8, 0, 0.7); // crux of the chapter on the left pauldron

    // small helmet sunk between the pauldrons
    const helm = mk(new THREE.SphereGeometry(0.27, 22, 16), armourMat, 0, 1.96, 0.12);
    helm.scale.set(1, 0.9, 1);
    mk(new THREE.SphereGeometry(0.06, 10, 8), lensMat, -0.1, 1.98, 0.36);
    mk(new THREE.SphereGeometry(0.06, 10, 8), lensMat, 0.1, 1.98, 0.36);
    mk(new THREE.BoxGeometry(0.2, 0.06, 0.06), darkMat, 0, 1.88, 0.37);

    addBackpack(1.7, -0.55, 1.1);

    // storm bolter in the right fist
    const armR = new THREE.Group();
    armR.position.set(0.95, 1.55, 0.1);
    mk(new THREE.CapsuleGeometry(0.19, 0.5, 6, 12), armourMat, 0, -0.2, 0.15, armR);
    mk(new THREE.SphereGeometry(0.2, 12, 10), darkMat, 0, -0.5, 0.22, armR);
    const gun = new THREE.Group();
    gun.position.set(-0.15, -0.55, 0.45);
    mk(new THREE.BoxGeometry(0.3, 0.34, 0.85, 2, 2, 3), darkMat, 0, 0, 0.3, gun);
    for (const sx of [-0.08, 0.08]) {
      mk(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 12), trimMat, sx, 0.06, 0.85, gun).rotation.x = Math.PI / 2;
    }
    mk(new THREE.BoxGeometry(0.2, 0.3, 0.34), armourMat, 0, -0.28, 0.15, gun);
    armR.add(gun);
    group.add(armR);

    const armL = new THREE.Group();
    armL.position.set(-0.95, 1.55, 0.1);
    mk(new THREE.CapsuleGeometry(0.19, 0.5, 6, 12), armourMat, 0, -0.2, 0.1, armL);
    const fist = mk(new THREE.SphereGeometry(0.26, 14, 10), trimMat, 0, -0.55, 0.16, armL);
    fist.scale.set(1, 1.15, 1.1);
    group.add(armL);

    return {
      muzzleLocal: new THREE.Vector3(-0.15 + 0.95, 1.55 - 0.55 + 0.06, 0.45 + 1.15),
      legL, legR, bobMul: 0.7,
    };
  };

  // ── Castraferrum dreadnought: a boxy sarcophagus on legs ──
  const buildDreadnought = (): BodyParts => {
    const legL = new THREE.Group();
    legL.position.set(-0.55, 1.3, 0);
    mk(new THREE.CapsuleGeometry(0.3, 0.7, 6, 14), darkMat, 0, -0.55, 0, legL);
    mk(new THREE.SphereGeometry(0.26, 12, 10), armourMat, 0, -0.15, 0, legL);
    mk(new THREE.BoxGeometry(0.62, 0.3, 0.9, 2, 2, 2), armourMat, 0, -1.25, 0.08, legL);
    const legR = legL.clone();
    legR.position.x = 0.55;
    group.add(legL, legR);

    // hull: slab-sided sarcophagus, slightly tapered
    const hull = mk(new THREE.BoxGeometry(1.9, 1.7, 1.5, 2, 2, 2), armourMat, 0, 2.1, 0);
    hull.scale.set(1, 1, 1);
    const hullTop = mk(new THREE.BoxGeometry(1.7, 0.4, 1.3, 2, 2, 2), armourMat, 0, 3.05, -0.05);
    hullTop.rotation.x = -0.08;
    mk(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 16), darkMat, 0, 1.2, 0); // waist ring
    // sloped front plate with the golden visage of the entombed
    const faceplate = mk(new THREE.BoxGeometry(1.0, 0.85, 0.16, 2, 2, 2), trimMat, 0, 2.15, 0.72);
    faceplate.rotation.x = 0.12;
    const visage = mk(new THREE.SphereGeometry(0.24, 14, 10), boneMat, 0, 2.2, 0.82);
    visage.scale.set(1, 1.3, 0.55);
    mk(new THREE.SphereGeometry(0.055, 8, 6), lensMat, -0.1, 2.24, 0.94);
    mk(new THREE.SphereGeometry(0.055, 8, 6), lensMat, 0.1, 2.24, 0.94);
    // scrollwork bars on the faceplate
    for (const sx of [-0.38, 0.38]) {
      mk(new THREE.BoxGeometry(0.14, 0.7, 0.06), boneMat, sx, 2.15, 0.8).rotation.x = 0.12;
    }
    // chapter badge high on the left hull
    const hb = mk(new THREE.PlaneGeometry(0.6, 0.6), badgeMat, -0.96, 2.5, 0.2);
    hb.rotation.y = -Math.PI / 2;
    // exhaust stacks + banner poles
    for (const sx of [-0.55, 0.55]) {
      mk(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 10), darkMat, sx, 3.3, -0.6);
      mk(new THREE.SphereGeometry(0.12, 10, 8), trimMat, sx, 3.72, -0.6);
    }
    mk(new THREE.BoxGeometry(1.6, 0.5, 0.5, 2, 2, 2), darkMat, 0, 2.5, -0.85);

    // right arm: twin melta barrels
    const armR = new THREE.Group();
    armR.position.set(1.15, 2.1, 0.1);
    mk(new THREE.CapsuleGeometry(0.26, 0.55, 6, 12), armourMat, 0, -0.3, 0.1, armR);
    const gun = new THREE.Group();
    gun.position.set(0, -0.75, 0.35);
    mk(new THREE.BoxGeometry(0.45, 0.42, 1.1, 2, 2, 3), darkMat, 0, 0, 0.35, gun);
    for (const sx of [-0.12, 0.12]) {
      mk(new THREE.CylinderGeometry(0.09, 0.11, 0.6, 12), trimMat, sx, 0, 1.0, gun).rotation.x = Math.PI / 2;
      mk(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 12), darkMat, sx, 0, 1.28, gun).rotation.x = Math.PI / 2;
    }
    armR.add(gun);
    group.add(armR);

    // left arm: the great power fist
    const armL = new THREE.Group();
    armL.position.set(-1.15, 2.1, 0.1);
    mk(new THREE.CapsuleGeometry(0.26, 0.55, 6, 12), armourMat, 0, -0.3, 0.05, armL);
    const fist = mk(new THREE.SphereGeometry(0.38, 14, 10), trimMat, 0, -0.85, 0.15, armL);
    fist.scale.set(1, 1.2, 1.1);
    for (let i = 0; i < 3; i++) {
      mk(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), trimMat, -0.14 + i * 0.14, -1.12, 0.32, armL).rotation.x = Math.PI / 2;
    }
    group.add(armL);

    return {
      muzzleLocal: new THREE.Vector3(1.15, 2.1 - 0.75, 0.35 + 1.35),
      legL, legR, bobMul: 0.5,
    };
  };

  const body =
    visual.model === "dreadnought" ? buildDreadnought()
    : visual.model === "terminator" ? buildTerminator()
    : buildMarine();
  group.scale.setScalar(visual.scale);

  const muzzleLocal = body.muzzleLocal.multiplyScalar(visual.scale);
  const tmp = new THREE.Vector3();

  return {
    group,
    getMuzzle(out: THREE.Vector3): THREE.Vector3 {
      out.copy(muzzleLocal).applyMatrix4(group.matrixWorld);
      return out;
    },
    animate(t: number, moving: boolean): void {
      if (moving) {
        const s = Math.sin(t * 11);
        body.legL.rotation.x = s * 0.55;
        body.legR.rotation.x = -s * 0.55;
        group.position.y = Math.abs(Math.sin(t * 11)) * 0.06 * body.bobMul;
      } else {
        body.legL.rotation.x *= 0.85;
        body.legR.rotation.x *= 0.85;
        group.position.y = Math.sin(t * 2.2) * 0.03; // idle breathing
      }
      tmp.set(0, 0, 0);
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
    },
  };
}
