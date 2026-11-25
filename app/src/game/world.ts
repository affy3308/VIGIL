/**
 * world.ts — the cathedral-bastion arena. All geometry is parametric and procedural:
 * stone floor / stained glass / rose window are canvas textures, pillars and walls are
 * primitives. Owns the moody lighting rig and the flickering braziers.
 */

import * as THREE from "three";
import { ARENA } from "./config";

/** Biome identities: one per campaign level, in LEVELS order. */
export interface BiomeDef {
  name: string;
  floorStyle: "stone" | "metal" | "ash" | "warp";
  bg: number;
  fog: number;
  ambient: number;
  hemiSky: number;
  hemiGround: number;
  moon: number;
  /** Window glow gradient stops (bottom → top). */
  window: [string, string, string];
  brazier: number;
  /** Map obstacle blocks tint. */
  obstacle: number;
}

export const BIOMES: BiomeDef[] = [
  {
    name: "МОНАСТЫРЬ-СОБОР", floorStyle: "stone",
    bg: 0x05060a, fog: 0x07080d, ambient: 0x3a4152, hemiSky: 0x44506e, hemiGround: 0x14100c,
    moon: 0x9db4d4, window: ["#1d4a56", "#2e7d8c", "#9adbe2"], brazier: 0xff7a26, obstacle: 0x2a2e3a,
  },
  {
    name: "УДАРНЫЙ КРЕЙСЕР", floorStyle: "metal",
    bg: 0x04060a, fog: 0x060a10, ambient: 0x2e3a4a, hemiSky: 0x3a4e6e, hemiGround: 0x0e0c0a,
    moon: 0x8ab4e2, window: ["#5e3a10", "#a87a1c", "#ffd27a"], brazier: 0xffb060, obstacle: 0x2e3440,
  },
  {
    name: "АРМАГЕДДОН", floorStyle: "ash",
    bg: 0x080505, fog: 0x0d0806, ambient: 0x4a3630, hemiSky: 0x6e4638, hemiGround: 0x140f0a,
    moon: 0xff9a6a, window: ["#5e2c10", "#a85a1c", "#ffd27a"], brazier: 0xff8a40, obstacle: 0x33302a,
  },
  {
    name: "ГРОБНИЦА", floorStyle: "stone",
    bg: 0x030604, fog: 0x050c06, ambient: 0x24382c, hemiSky: 0x2e5e3a, hemiGround: 0x0a120a,
    moon: 0x7ac48a, window: ["#0e4a2a", "#1c8c4a", "#7affb0"], brazier: 0x59ff8a, obstacle: 0x26302a,
  },
  {
    name: "РАВНИНЫ ТАУ", floorStyle: "ash",
    bg: 0x0a0805, fog: 0x100c08, ambient: 0x4a4034, hemiSky: 0x8c7a5e, hemiGround: 0x141008,
    moon: 0xffd8a8, window: ["#3a4e5e", "#6a9ab8", "#c8e8ff"], brazier: 0x6ab8ff, obstacle: 0x3a3630,
  },
  {
    name: "ЗАЛЫ ВОТАННОВ", floorStyle: "metal",
    bg: 0x0a0504, fog: 0x120806, ambient: 0x4a2e20, hemiSky: 0x8c4a28, hemiGround: 0x140a06,
    moon: 0xff9a5a, window: ["#5e1c10", "#b84a1c", "#ffb060"], brazier: 0xff8a30, obstacle: 0x36302a,
  },
  {
    name: "МИР-КОРАБЛЬ", floorStyle: "stone",
    bg: 0x05080a, fog: 0x080e10, ambient: 0x3a4a4e, hemiSky: 0x5e8a8c, hemiGround: 0x101414,
    moon: 0xb8e8e2, window: ["#14505e", "#2a9ab0", "#a8fff2"], brazier: 0x7df0ff, obstacle: 0x3a4442,
  },
  {
    name: "ЖИВОЙ КОРАБЛЬ", floorStyle: "warp",
    bg: 0x070410, fog: 0x0d0612, ambient: 0x452e55, hemiSky: 0x5e3a7a, hemiGround: 0x140a1a,
    moon: 0xb48ad4, window: ["#4a145e", "#8c2fa8", "#e2a8ff"], brazier: 0xc86aff, obstacle: 0x3a2438,
  },
];

/** Solid arena block (axis-aligned); `hw`/`hd` are half extents. */
export interface Obstacle {
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
}

/** Map layouts: rotated by the global map counter; the boss arena is always clear. */
export const LAYOUTS: Obstacle[][] = [
  [],
  [
    { x: -8, z: -2, hw: 2.0, hd: 2.6, h: 3.0 },
    { x: 8, z: 2, hw: 2.0, hd: 2.6, h: 3.0 },
  ],
  [
    { x: 0, z: -7, hw: 3.2, hd: 1.5, h: 2.2 },
    { x: 0, z: 7, hw: 3.2, hd: 1.5, h: 2.2 },
    { x: -12, z: 0, hw: 1.4, hd: 1.4, h: 2.6 },
    { x: 12, z: 0, hw: 1.4, hd: 1.4, h: 2.6 },
  ],
  [
    { x: -10, z: -8, hw: 1.8, hd: 1.8, h: 2.6 },
    { x: 10, z: -8, hw: 1.8, hd: 1.8, h: 2.6 },
    { x: -10, z: 8, hw: 1.8, hd: 1.8, h: 2.6 },
    { x: 10, z: 8, hw: 1.8, hd: 1.8, h: 2.6 },
    { x: 0, z: 0, hw: 1.5, hd: 1.5, h: 3.4 },
  ],
];

/** Push a circle out of every solid block; call after movement. */
export function pushOutObstacles(pos: { x: number; z: number }, radius: number, obs: readonly Obstacle[]): void {
  for (const o of obs) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const px = o.hw + radius - Math.abs(dx);
    const pz = o.hd + radius - Math.abs(dz);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) pos.x += dx > 0 ? px : -px;
    else pos.z += dz > 0 ? pz : -pz;
  }
}

/** Point test with padding — used for bullets. */
export function insideObstacle(x: number, z: number, pad: number, obs: readonly Obstacle[]): boolean {
  for (const o of obs) {
    if (Math.abs(x - o.x) < o.hw + pad && Math.abs(z - o.z) < o.hd + pad) return true;
  }
  return false;
}

function makeFloorTexture(style: BiomeDef["floorStyle"]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const T = 128;
  if (style === "metal") {
    // riveted deck plates
    g.fillStyle = "#23252b";
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const shade = 34 + Math.floor(Math.random() * 12);
        g.fillStyle = `rgb(${shade},${shade + 2},${shade + 6})`;
        g.fillRect(x * T + 3, y * T + 3, T - 6, T - 6);
        g.fillStyle = "rgba(120,110,90,0.4)";
        g.fillRect(x * T + 3, y * T + 3, T - 6, 2);
        // rivets
        g.fillStyle = "rgba(12,12,14,0.9)";
        for (const [rx, ry] of [[10, 10], [T - 10, 10], [10, T - 10], [T - 10, T - 10]]) {
          g.beginPath();
          g.arc(x * T + rx, y * T + ry, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // rust streaks
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const grad = g.createLinearGradient(x, y, x, y + 60 + Math.random() * 80);
      grad.addColorStop(0, "rgba(140,70,20,0.35)");
      grad.addColorStop(1, "rgba(140,70,20,0)");
      g.fillStyle = grad;
      g.fillRect(x, y, 3 + Math.random() * 5, 60 + Math.random() * 80);
    }
  } else if (style === "ash") {
    // cracked dead earth with pale bone-dust
    g.fillStyle = "#20241e";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const shade = 26 + Math.floor(Math.random() * 22);
      g.fillStyle = `rgba(${shade},${shade + 4},${shade - 2},0.5)`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
    g.strokeStyle = "rgba(6,8,6,0.85)";
    g.lineWidth = 2;
    for (let i = 0; i < 34; i++) {
      g.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 10 + Math.random() * 34;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(160,170,140,0.28)");
      grad.addColorStop(1, "rgba(160,170,140,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (style === "warp") {
    // flesh-stone veined with glowing empyrean cracks
    g.fillStyle = "#1c1224";
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const r = 30 + Math.floor(Math.random() * 12);
        g.fillStyle = `rgb(${r + 8},${r - 4},${r + 16})`;
        g.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
      }
    }
    g.strokeStyle = "rgba(200,106,255,0.55)";
    g.lineWidth = 2.5;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 80;
        y += (Math.random() - 0.5) * 80;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 12 + Math.random() * 30;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(140,40,160,0.4)");
      grad.addColorStop(1, "rgba(140,40,160,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else {
    // cathedral flagstones
    g.fillStyle = "#20242e";
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const shade = 30 + Math.floor(Math.random() * 14);
        g.fillStyle = `rgb(${shade},${shade + 3},${shade + 10})`;
        g.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
        g.fillStyle = "rgba(90,96,112,0.5)";
        g.fillRect(x * T + 2, y * T + 2, T - 4, 2);
      }
    }
    g.strokeStyle = "rgba(5,6,9,0.8)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 60;
        y += (Math.random() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 12 + Math.random() * 42;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(70,12,12,0.5)");
      grad.addColorStop(1, "rgba(70,12,12,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWindowTexture(stops: [string, string, string]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.6, stops[1]);
  grad.addColorStop(1, stops[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // pointed arch mask
  g.fillStyle = "#05060a";
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(0, 90, 64, 40);
  g.quadraticCurveTo(128, 90, 128, 0);
  g.lineTo(128, -20);
  g.lineTo(0, -20);
  g.closePath();
  g.fill();
  // mullions
  g.fillStyle = "rgba(4,5,8,0.9)";
  g.fillRect(60, 40, 8, 216);
  g.fillRect(0, 120, 128, 7);
  g.fillRect(0, 190, 128, 7);
  g.fillRect(28, 60, 6, 196);
  g.fillRect(94, 60, 6, 196);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoseTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const cx = 128, cy = 128;
  const palette = ["#7a1420", "#a06a1c", "#2b4a6e", "#5a1a5e", "#8c2f10", "#1e5e50"];
  const SEG = 12;
  for (let ring = 0; ring < 3; ring++) {
    const r0 = 18 + ring * 34, r1 = r0 + 30;
    for (let s = 0; s < SEG; s++) {
      const a0 = (s / SEG) * Math.PI * 2 + ring * 0.26;
      const a1 = ((s + 1) / SEG) * Math.PI * 2 + ring * 0.26;
      g.beginPath();
      g.arc(cx, cy, r1, a0, a1);
      g.arc(cx, cy, r0, a1, a0, true);
      g.closePath();
      g.fillStyle = palette[(s + ring * 3) % palette.length];
      g.fill();
      g.strokeStyle = "#05060a";
      g.lineWidth = 3;
      g.stroke();
    }
  }
  g.beginPath();
  g.arc(cx, cy, 16, 0, Math.PI * 2);
  g.fillStyle = "#c9a227";
  g.fill();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Brazier {
  light: THREE.PointLight;
  flame: THREE.Mesh;
  phase: number;
}

export class World {
  readonly scene: THREE.Scene;
  /** Solid blocks of the current map layout (empty on clear arenas). */
  readonly obstacles: Obstacle[] = [];
  private obstacleMeshes: THREE.Mesh[] = [];
  private obstacleMat!: THREE.MeshStandardMaterial;
  private layout = -1;
  private braziers: Brazier[] = [];
  private roseMat: THREE.MeshBasicMaterial;
  private disposables: Array<{ dispose(): void }> = [];
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;
  private moon!: THREE.DirectionalLight;
  private floorMat!: THREE.MeshStandardMaterial;
  private winMat!: THREE.MeshBasicMaterial;
  private flameMat!: THREE.MeshBasicMaterial;
  private texCache = new Map<string, THREE.CanvasTexture>();
  private biome = 0;

  constructor() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const b0 = BIOMES[0];
    scene.background = new THREE.Color(b0.bg);
    scene.fog = new THREE.FogExp2(b0.fog, 0.012);

    // ── lighting rig ──────────────────────────────────────────────
    this.ambient = new THREE.AmbientLight(b0.ambient, 1.7);
    scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(b0.hemiSky, b0.hemiGround, 1.0);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(b0.moon, 1.5);
    this.moon.position.set(-14, 30, -10);
    scene.add(this.moon);

    // ── floor ─────────────────────────────────────────────────────
    const floorTex = this.floorTexFor(b0.floorStyle);
    const floorGeo = new THREE.PlaneGeometry(80, 60);
    this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.08 });
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.track(floorGeo, this.floorMat);

    // ── perimeter walls ───────────────────────────────────────────
    // The south wall is only a chest-high parapet: the camera sits south of the
    // player, so a full-height wall would swallow the hero near the bottom edge.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.95 });
    const wallN = new THREE.BoxGeometry(80, 14, 2);
    const wallS = new THREE.BoxGeometry(80, 4.5, 2);
    const wallE = new THREE.BoxGeometry(2, 14, 60);
    const mkWall = (geo: THREE.BoxGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(x, y, z);
      scene.add(m);
    };
    mkWall(wallN, 0, 7, -22);
    mkWall(wallS, 0, 2.25, 22);
    mkWall(wallE, -31, 7, 0);
    mkWall(wallE, 31, 7, 0);
    this.track(wallN, wallS, wallE, wallMat);

    // ── gothic pillars (two colonnades) ───────────────────────────
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.85 });
    const shaftGeo = new THREE.CylinderGeometry(0.7, 0.85, 12, 8);
    const capGeo = new THREE.BoxGeometry(2, 0.7, 2);
    const baseGeo = new THREE.BoxGeometry(2.2, 0.8, 2.2);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = -14 + i * 7;
        const x = sx * 27;
        const shaft = new THREE.Mesh(shaftGeo, pillarMat);
        shaft.position.set(x, 6, z);
        const cap = new THREE.Mesh(capGeo, pillarMat);
        cap.position.set(x, 12.3, z);
        const base = new THREE.Mesh(baseGeo, pillarMat);
        base.position.set(x, 0.4, z);
        scene.add(shaft, cap, base);
      }
    }
    this.track(pillarMat, shaftGeo, capGeo, baseGeo);

    // ── stained glass on the side walls ───────────────────────────
    const winTex = this.winTexFor(b0.window);
    const winGeo = new THREE.PlaneGeometry(4, 8);
    this.winMat = new THREE.MeshBasicMaterial({ map: winTex, transparent: false });
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(winGeo, this.winMat);
        w.position.set(sx * 29.8, 8, -10 + i * 10);
        w.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        scene.add(w);
      }
    }
    this.track(winGeo, this.winMat);

    // ── rose window above the altar (north wall) ──────────────────
    const roseTex = makeRoseTexture();
    this.roseMat = new THREE.MeshBasicMaterial({ map: roseTex, transparent: true });
    const rose = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), this.roseMat);
    rose.position.set(0, 9.5, -20.8);
    scene.add(rose);
    const roseGlow = new THREE.PointLight(0x7a3050, 12, 30, 1.6);
    roseGlow.position.set(0, 9, -18);
    scene.add(roseGlow);
    this.track(roseTex, rose.geometry, this.roseMat);

    // ── altar + the Emperor's fallen statue silhouette ────────────
    const altarMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, roughness: 0.8 });
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 4), altarMat);
    step1.position.set(0, 0.3, -19);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 3), altarMat);
    step2.position.set(0, 0.9, -19.4);
    const statueMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.4 });
    const statueBody = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 6, 8), statueMat);
    statueBody.position.set(0, 4.2, -20);
    const statueHead = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), statueMat);
    statueHead.position.set(0, 7.6, -20);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.1, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xc9a227 }),
    );
    halo.position.set(0, 7.6, -20.4);
    scene.add(step1, step2, statueBody, statueHead, halo);
    this.track(altarMat, statueMat, step1.geometry, step2.geometry, statueBody.geometry, statueHead.geometry, halo.geometry, halo.material as THREE.Material);

    // ── braziers: flickering war fires ────────────────────────────
    const standGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
    const bowlGeo = new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8);
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.8 });
    const flameGeo = new THREE.ConeGeometry(0.4, 1.0, 7);
    this.flameMat = new THREE.MeshBasicMaterial({ color: b0.brazier });
    const flameMat = this.flameMat;
    const spots: Array<[number, number]> = [
      [-ARENA.HALF_W + 2, -ARENA.HALF_D + 2],
      [ARENA.HALF_W - 2, -ARENA.HALF_D + 2],
      [-ARENA.HALF_W + 2, ARENA.HALF_D - 2],
      [ARENA.HALF_W - 2, ARENA.HALF_D - 2],
    ];
    for (const [x, z] of spots) {
      const stand = new THREE.Mesh(standGeo, ironMat);
      stand.position.set(x, 0.8, z);
      const bowl = new THREE.Mesh(bowlGeo, ironMat);
      bowl.position.set(x, 1.75, z);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, 2.4, z);
      const light = new THREE.PointLight(0xff7a26, 20, 16, 1.8);
      light.position.set(x, 2.6, z);
      scene.add(stand, bowl, flame, light);
      this.braziers.push({ light, flame, phase: Math.random() * Math.PI * 2 });
    }
    this.track(standGeo, bowlGeo, ironMat, flameGeo, flameMat);

    // ── map obstacle blocks: sarcophagi / crates / growths per biome ──
    const obsGeo = new THREE.BoxGeometry(1, 1, 1);
    this.obstacleMat = new THREE.MeshStandardMaterial({ color: b0.obstacle, roughness: 0.85 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(obsGeo, this.obstacleMat);
      m.visible = false;
      scene.add(m);
      this.obstacleMeshes.push(m);
    }
    this.track(obsGeo, this.obstacleMat);
  }

  /** Swap the arena furniture for another map; collisions read `this.obstacles`. */
  setLayout(idx: number): void {
    if (idx === this.layout) return;
    this.layout = idx;
    const preset = LAYOUTS[idx % LAYOUTS.length];
    this.obstacles.length = 0;
    for (let i = 0; i < this.obstacleMeshes.length; i++) {
      const m = this.obstacleMeshes[i];
      const o = preset[i];
      if (!o) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(o.x, o.h / 2, o.z);
      m.scale.set(o.hw * 2, o.h, o.hd * 2);
      this.obstacles.push(o);
    }
  }

  private track(...items: Array<{ dispose(): void }>): void {
    this.disposables.push(...items);
  }

  /** Lazily generated + cached floor textures, one per biome. */
  private floorTexFor(style: BiomeDef["floorStyle"]): THREE.CanvasTexture {
    const key = `floor:${style}`;
    let tex = this.texCache.get(key);
    if (!tex) {
      tex = makeFloorTexture(style);
      this.texCache.set(key, tex);
      this.disposables.push(tex);
    }
    return tex;
  }

  private winTexFor(stops: [string, string, string]): THREE.CanvasTexture {
    const key = `win:${stops[1]}`;
    let tex = this.texCache.get(key);
    if (!tex) {
      tex = makeWindowTexture(stops);
      this.texCache.set(key, tex);
      this.disposables.push(tex);
    }
    return tex;
  }

  /** Swap the ground, sky and light mood as the siege moves to a new ground. */
  setBiome(idx: number): void {
    if (idx === this.biome) return;
    this.biome = idx;
    const b = BIOMES[idx];
    (this.scene.background as THREE.Color).setHex(b.bg);
    (this.scene.fog as THREE.FogExp2).color.setHex(b.fog);
    this.ambient.color.setHex(b.ambient);
    this.hemi.color.setHex(b.hemiSky);
    this.hemi.groundColor.setHex(b.hemiGround);
    this.moon.color.setHex(b.moon);
    this.floorMat.map = this.floorTexFor(b.floorStyle);
    this.floorMat.needsUpdate = true;
    this.winMat.map = this.winTexFor(b.window);
    this.winMat.needsUpdate = true;
    this.flameMat.color.setHex(b.brazier);
    for (const br of this.braziers) br.light.color.setHex(b.brazier);
    this.obstacleMat.color.setHex(b.obstacle);
  }

  /** Idle motion: fire flicker + rose window breathing — the scene stays alive even on the title screen. */
  update(t: number): void {
    for (const b of this.braziers) {
      const f = Math.sin(t * 9 + b.phase) * 0.5 + Math.sin(t * 23 + b.phase * 2) * 0.5;
      b.light.intensity = 18 + f * 5;
      const s = 1 + f * 0.12;
      b.flame.scale.set(s, 1 + f * 0.25, s);
    }
    this.roseMat.opacity = 0.85 + Math.sin(t * 0.7) * 0.15;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
