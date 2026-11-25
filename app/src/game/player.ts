/**
 * player.ts — parametric heroes of the Vigil. Three body patterns share one contract:
 * Mk VII power armour, Indomitus terminator plate, and the Castraferrum dreadnought.
 * Faces +Z when rotation.y === 0; the gun barrel tip is exposed via getMuzzle().
 */

import * as THREE from "three";

export interface PlayerVisual {
  tint: number;
  trim: number;
  scale: number;
  model: "marine" | "terminator" | "dreadnought";
}

export interface PlayerModel {
  group: THREE.Group;
  /** World-space barrel tip, written into `out` (no allocation). */
  getMuzzle(out: THREE.Vector3): THREE.Vector3;
  /** Walk-cycle swing + idle breathing. */
  animate(t: number, moving: boolean): void;
  dispose(): void;
}

const DEFAULT_VISUAL: PlayerVisual = { tint: 0x2e3a4a, trim: 0xc9a227, scale: 1, model: "marine" };

interface BodyParts {
  muzzleLocal: THREE.Vector3;
  legL: THREE.Group;
  legR: THREE.Group;
  bobMul: number;
}

export function buildPlayerModel(visual: PlayerVisual = DEFAULT_VISUAL): PlayerModel {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  const armourMat = new THREE.MeshStandardMaterial({ color: visual.tint, roughness: 0.38, metalness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: visual.trim, roughness: 0.3, metalness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.55, metalness: 0.6 });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x7df0ff });
  disposables.push(armourMat, trimMat, darkMat, lensMat);

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

  // ── Mk VII power armour (also the base for the assault/devastator rigs) ──
  const buildMarine = (): BodyParts => {
    const legL = new THREE.Group();
    legL.position.set(-0.28, 1.0, 0);
    mk(new THREE.CapsuleGeometry(0.18, 0.64, 6, 14), armourMat, 0, -0.5, 0, legL);
    mk(new THREE.SphereGeometry(0.15, 12, 10), trimMat, 0, -0.52, 0.16, legL);
    mk(new THREE.BoxGeometry(0.38, 0.22, 0.55, 2, 2, 2), darkMat, 0, -1.0, 0.05, legL);
    const legR = legL.clone();
    legR.position.x = 0.28;
    group.add(legL, legR);

    const torso = new THREE.Group();
    torso.position.y = 1.0;
    const cuirass = mk(new THREE.SphereGeometry(0.58, 24, 18), armourMat, 0, 0.52, 0, torso);
    cuirass.scale.set(0.98, 0.78, 0.62);
    mk(new THREE.CylinderGeometry(0.4, 0.46, 0.34, 16), darkMat, 0, 0.08, 0, torso);
    mk(new THREE.BoxGeometry(0.5, 0.28, 0.06), trimMat, 0, 0.62, 0.33, torso);
    mk(new THREE.SphereGeometry(0.09, 10, 8), trimMat, 0, 0.62, 0.36, torso);
    for (const sx of [-0.3, 0.3]) {
      const cable = mk(new THREE.TorusGeometry(0.16, 0.035, 8, 14, Math.PI), darkMat, sx, 0.18, 0.18, torso);
      cable.rotation.set(Math.PI / 2, 0, sx > 0 ? -0.5 : 0.5);
    }
    group.add(torso);

    const padL = mk(new THREE.SphereGeometry(0.44, 24, 18), armourMat, -0.78, 1.72, 0);
    padL.scale.set(1, 0.92, 1);
    const padR = mk(new THREE.SphereGeometry(0.44, 24, 18), armourMat, 0.78, 1.72, 0);
    padR.scale.set(1, 0.92, 1);
    const rim = mk(new THREE.TorusGeometry(0.42, 0.045, 10, 24), trimMat, 0.78, 1.66, 0);
    rim.rotation.x = Math.PI / 2;
    mk(new THREE.SphereGeometry(0.2, 14, 10), trimMat, 0.78, 2.02, 0);

    const helm = mk(new THREE.SphereGeometry(0.31, 22, 16), armourMat, 0, 1.98, 0.05);
    helm.scale.set(1, 1.05, 1.08);
    const snout = mk(new THREE.CylinderGeometry(0.13, 0.17, 0.2, 10), darkMat, 0, 1.86, 0.28);
    snout.rotation.x = Math.PI / 2.4;
    mk(new THREE.SphereGeometry(0.065, 10, 8), lensMat, -0.11, 2.0, 0.32);
    mk(new THREE.SphereGeometry(0.065, 10, 8), lensMat, 0.11, 2.0, 0.32);
    mk(new THREE.BoxGeometry(0.08, 0.28, 0.5), trimMat, 0, 2.28, -0.02);

    mk(new THREE.BoxGeometry(0.8, 0.7, 0.35, 2, 2, 2), darkMat, 0, 1.65, -0.48);
    mk(new THREE.CylinderGeometry(0.1, 0.12, 0.44, 12), trimMat, -0.2, 2.15, -0.48);
    mk(new THREE.CylinderGeometry(0.1, 0.12, 0.44, 12), trimMat, 0.2, 2.15, -0.48);
    mk(new THREE.SphereGeometry(0.1, 10, 8), darkMat, -0.2, 2.38, -0.48);
    mk(new THREE.SphereGeometry(0.1, 10, 8), darkMat, 0.2, 2.38, -0.48);

    const armR = new THREE.Group();
    armR.position.set(0.72, 1.55, 0.1);
    mk(new THREE.CapsuleGeometry(0.14, 0.44, 6, 12), armourMat, 0, -0.2, 0.15, armR);
    mk(new THREE.SphereGeometry(0.15, 12, 10), darkMat, 0, -0.46, 0.22, armR);
    const gun = new THREE.Group();
    gun.position.set(-0.1, -0.5, 0.4);
    mk(new THREE.BoxGeometry(0.22, 0.3, 0.9, 2, 2, 3), darkMat, 0, 0, 0.3, gun);
    mk(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12), trimMat, 0, 0.05, 0.9, gun).rotation.x = Math.PI / 2;
    mk(new THREE.CylinderGeometry(0.09, 0.075, 0.14, 12), darkMat, 0, 0.05, 1.12, gun).rotation.x = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.16, 0.28, 0.3), armourMat, 0, -0.26, 0.15, gun);
    mk(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), darkMat, 0, 0.22, 0.35, gun).rotation.x = Math.PI / 2;
    armR.add(gun);
    group.add(armR);

    const armL = new THREE.Group();
    armL.position.set(-0.72, 1.55, 0.1);
    mk(new THREE.CapsuleGeometry(0.14, 0.44, 6, 12), armourMat, 0, -0.2, 0.1, armL);
    mk(new THREE.SphereGeometry(0.15, 12, 10), darkMat, 0, -0.46, 0.16, armL);
    group.add(armL);

    return {
      muzzleLocal: new THREE.Vector3(-0.1 + 0.72, 1.55 - 0.5 + 0.05, 0.4 + 1.2),
      legL, legR, bobMul: 1,
    };
  };

  // ── Indomitus terminator plate: bigger, broader, no crest — a walking wall ──
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
    // crux terminatus on the left pauldron instead of the chest eagle
    mk(new THREE.BoxGeometry(0.4, 0.24, 0.06), trimMat, 0, 0.68, 0.44, torso);
    group.add(torso);

    // massive layered pauldrons
    for (const sx of [-1, 1]) {
      const pad = mk(new THREE.SphereGeometry(0.56, 24, 18), armourMat, sx * 0.98, 1.78, 0);
      pad.scale.set(1.1, 0.85, 1.05);
      const rim = mk(new THREE.TorusGeometry(0.53, 0.05, 10, 24), trimMat, sx * 0.98, 1.68, 0);
      rim.rotation.x = Math.PI / 2;
    }
    // small helmet sunk between the pauldrons
    const helm = mk(new THREE.SphereGeometry(0.27, 22, 16), armourMat, 0, 1.96, 0.12);
    helm.scale.set(1, 0.9, 1);
    mk(new THREE.SphereGeometry(0.06, 10, 8), lensMat, -0.1, 1.98, 0.36);
    mk(new THREE.SphereGeometry(0.06, 10, 8), lensMat, 0.1, 1.98, 0.36);
    mk(new THREE.BoxGeometry(0.2, 0.06, 0.06), darkMat, 0, 1.88, 0.37); // mouth grille

    mk(new THREE.BoxGeometry(1.1, 0.8, 0.45, 2, 2, 2), darkMat, 0, 1.7, -0.55);
    mk(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 12), trimMat, -0.28, 2.2, -0.55);
    mk(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 12), trimMat, 0.28, 2.2, -0.55);

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

  // ── Castraferrum dreadnought: a sarcophagus on legs, gun-arm right, fist left ──
  const buildDreadnought = (): BodyParts => {
    const legL = new THREE.Group();
    legL.position.set(-0.55, 1.3, 0);
    mk(new THREE.CapsuleGeometry(0.3, 0.7, 6, 14), darkMat, 0, -0.55, 0, legL);
    mk(new THREE.SphereGeometry(0.26, 12, 10), armourMat, 0, -0.15, 0, legL); // hip joint
    mk(new THREE.BoxGeometry(0.62, 0.3, 0.9, 2, 2, 2), armourMat, 0, -1.25, 0.08, legL); // foot
    const legR = legL.clone();
    legR.position.x = 0.55;
    group.add(legL, legR);

    // hull: rounded sarcophagus with the honoured fallen inside
    const hull = mk(new THREE.SphereGeometry(0.95, 24, 18), armourMat, 0, 2.0, 0);
    hull.scale.set(1.15, 1.05, 0.95);
    mk(new THREE.CylinderGeometry(0.75, 0.9, 0.7, 16), armourMat, 0, 1.25, 0); // waist ring
    // front plate + the golden visage of the entombed
    mk(new THREE.BoxGeometry(0.9, 0.7, 0.14, 2, 2, 2), trimMat, 0, 2.1, 0.82);
    const visage = mk(new THREE.SphereGeometry(0.22, 14, 10), darkMat, 0, 2.1, 0.92);
    visage.scale.set(1, 1.25, 0.6);
    mk(new THREE.SphereGeometry(0.05, 8, 6), lensMat, -0.09, 2.14, 1.04);
    mk(new THREE.SphereGeometry(0.05, 8, 6), lensMat, 0.09, 2.14, 1.04);
    // banner poles + exhaust stacks
    for (const sx of [-0.55, 0.55]) {
      mk(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 10), darkMat, sx, 3.0, -0.55);
      mk(new THREE.SphereGeometry(0.11, 10, 8), trimMat, sx, 3.38, -0.55);
    }
    mk(new THREE.BoxGeometry(1.5, 0.5, 0.5, 2, 2, 2), darkMat, 0, 2.35, -0.75);

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
