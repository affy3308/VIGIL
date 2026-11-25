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
  /** Central monument (statue / monolith) tint + rose-window cast. */
  monument: number;
  /** Accent colour of the biome's glowing props. */
  propGlow: number;
}

export const BIOMES: BiomeDef[] = [
  {
    name: "МОНАСТЫРЬ-СОБОР", floorStyle: "stone",
    bg: 0x05060a, fog: 0x07080d, ambient: 0x3a4152, hemiSky: 0x44506e, hemiGround: 0x14100c,
    moon: 0x9db4d4, window: ["#1d4a56", "#2e7d8c", "#9adbe2"], brazier: 0xff7a26, obstacle: 0x2a2e3a,
    monument: 0x2a2e3a, propGlow: 0xffc46a,
  },
  {
    name: "УДАРНЫЙ КРЕЙСЕР", floorStyle: "metal",
    bg: 0x04060a, fog: 0x060a10, ambient: 0x2e3a4a, hemiSky: 0x3a4e6e, hemiGround: 0x0e0c0a,
    moon: 0x8ab4e2, window: ["#5e3a10", "#a87a1c", "#ffd27a"], brazier: 0xffb060, obstacle: 0x2e3440,
    monument: 0x2e3440, propGlow: 0xff4a3a,
  },
  {
    name: "АРМАГЕДДОН", floorStyle: "ash",
    bg: 0x080505, fog: 0x0d0806, ambient: 0x4a3630, hemiSky: 0x6e4638, hemiGround: 0x140f0a,
    moon: 0xff9a6a, window: ["#5e2c10", "#a85a1c", "#ffd27a"], brazier: 0xff8a40, obstacle: 0x33302a,
    monument: 0x3a322a, propGlow: 0xff7a30,
  },
  {
    name: "ГРОБНИЦА", floorStyle: "stone",
    bg: 0x030604, fog: 0x050c06, ambient: 0x24382c, hemiSky: 0x2e5e3a, hemiGround: 0x0a120a,
    moon: 0x7ac48a, window: ["#0e4a2a", "#1c8c4a", "#7affb0"], brazier: 0x59ff8a, obstacle: 0x26302a,
    monument: 0x18201a, propGlow: 0x59ff8a,
  },
  {
    name: "РАВНИНЫ ТАУ", floorStyle: "ash",
    bg: 0x0a0805, fog: 0x100c08, ambient: 0x4a4034, hemiSky: 0x8c7a5e, hemiGround: 0x141008,
    moon: 0xffd8a8, window: ["#3a4e5e", "#6a9ab8", "#c8e8ff"], brazier: 0x6ab8ff, obstacle: 0x3a3630,
    monument: 0x8a8f92, propGlow: 0x6adfff,
  },
  {
    name: "ЗАЛЫ ВОТАННОВ", floorStyle: "metal",
    bg: 0x0a0504, fog: 0x120806, ambient: 0x4a2e20, hemiSky: 0x8c4a28, hemiGround: 0x140a06,
    moon: 0xff9a5a, window: ["#5e1c10", "#b84a1c", "#ffb060"], brazier: 0xff8a30, obstacle: 0x36302a,
    monument: 0x3a2a20, propGlow: 0xff9a30,
  },
  {
    name: "МИР-КОРАБЛЬ", floorStyle: "stone",
    bg: 0x05080a, fog: 0x080e10, ambient: 0x3a4a4e, hemiSky: 0x5e8a8c, hemiGround: 0x101414,
    moon: 0xb8e8e2, window: ["#14505e", "#2a9ab0", "#a8fff2"], brazier: 0x7df0ff, obstacle: 0x3a4442,
    monument: 0xc8d4d2, propGlow: 0x7df0ff,
  },
  {
    name: "ЖИВОЙ КОРАБЛЬ", floorStyle: "warp",
    bg: 0x070410, fog: 0x0d0612, ambient: 0x452e55, hemiSky: 0x5e3a7a, hemiGround: 0x140a1a,
    moon: 0xb48ad4, window: ["#4a145e", "#8c2fa8", "#e2a8ff"], brazier: 0xc86aff, obstacle: 0x3a2438,
    monument: 0x4a2438, propGlow: 0xe26aff,
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
  private altarMat!: THREE.MeshStandardMaterial;
  private statueMat!: THREE.MeshStandardMaterial;
  private propsGroup: THREE.Group | null = null;
  private propsDisposables: Array<{ dispose(): void }> = [];
  private propAnims: Array<(t: number) => void> = [];

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
    this.altarMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, roughness: 0.8 });
    const altarMat = this.altarMat;
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 4), altarMat);
    step1.position.set(0, 0.3, -19);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 3), altarMat);
    step2.position.set(0, 0.9, -19.4);
    this.statueMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.4 });
    const statueMat = this.statueMat;
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

    // ── biome-specific props (candles, consoles, obelisks, boils…) ──
    this.buildProps(0);
  }

  /** Rebuild the biome's decorative prop set; old props are disposed. */
  private buildProps(idx: number): void {
    for (const d of this.propsDisposables) d.dispose();
    this.propsDisposables = [];
    this.propAnims = [];
    if (this.propsGroup) this.propsGroup.removeFromParent();
    const grp = new THREE.Group();
    this.propsGroup = grp;

    const std = (color: number, rough = 0.7, metal = 0.3) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.propsDisposables.push(m);
      return m;
    };
    const glow = (color: number) => {
      const m = new THREE.MeshBasicMaterial({ color });
      this.propsDisposables.push(m);
      return m;
    };
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      this.propsDisposables.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      grp.add(m);
      return m;
    };
    const GX = 24; // keep props off the main fighting ground
    const GZ = 16;

    if (idx === 0) {
      // МОНАСТЫРЬ-СОБОР: канделябры, кадила, разбитые скамьи
      const wax = std(0xd8d3c3, 0.6, 0.05);
      const iron = std(0x14161a, 0.5, 0.8);
      const flame = glow(0xffc46a);
      const stone = std(0x23262e, 0.9, 0.05);
      for (const [cx, cz] of [[-GX, -GZ], [GX, -GZ], [-GX, GZ], [GX, GZ], [0, GZ + 2]] as Array<[number, number]>) {
        put(new THREE.CylinderGeometry(0.5, 0.7, 0.25, 10), iron, cx, 0.12, cz);
        const flames: THREE.Mesh[] = [];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const r = i === 0 ? 0 : 0.32;
          const h = 0.5 + (i % 3) * 0.22;
          put(new THREE.CylinderGeometry(0.05, 0.06, h, 6), wax, cx + Math.cos(a) * r, 0.25 + h / 2, cz + Math.sin(a) * r);
          flames.push(put(new THREE.ConeGeometry(0.05, 0.16, 6), flame, cx + Math.cos(a) * r, 0.33 + h, cz + Math.sin(a) * r));
        }
        const light = new THREE.PointLight(0xffb060, 6, 8, 1.8);
        light.position.set(cx, 1.4, cz);
        grp.add(light);
        const ph = Math.random() * 6;
        this.propAnims.push((t) => {
          const f = 0.8 + Math.sin(t * 11 + ph) * 0.25;
          light.intensity = 5 + f * 2.5;
          for (const fl of flames) fl.scale.set(f, f * 1.2, f);
        });
      }
      // hanging censers by the side colonnades
      for (const sx of [-1, 1]) {
        for (const cz of [-7, 7]) {
          put(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 5), iron, sx * 26, 10.5, cz);
          const bowl = put(new THREE.SphereGeometry(0.34, 10, 8), iron, sx * 26, 8.8, cz);
          const coal = put(new THREE.SphereGeometry(0.2, 8, 6), glow(0xff8a40), sx * 26, 8.9, cz);
          const ph = Math.random() * 6;
          this.propAnims.push((t) => {
            bowl.position.x = sx * 26 + Math.sin(t * 0.9 + ph) * 0.3;
            coal.position.x = bowl.position.x;
          });
        }
      }
      // broken pews
      for (let i = 0; i < 6; i++) {
        const pew = put(new THREE.BoxGeometry(3.4, 0.5, 0.5), stone, -9 + (i % 3) * 9, 0.35, 12 + Math.floor(i / 3) * 3.4);
        pew.rotation.y = (Math.random() - 0.5) * 0.35;
        put(new THREE.BoxGeometry(3.4, 0.7, 0.12), stone, pew.position.x, 0.75, pew.position.z - 0.28).rotation.y = pew.rotation.y;
      }
    } else if (idx === 1) {
      // УДАРНЫЙ КРЕЙСЕР: консоли, трубы, ящики, аварийные маячки
      const hull = std(0x23262e, 0.6, 0.7);
      const pipe = std(0x3a3f4a, 0.45, 0.85);
      const screen = glow(0x6adfff);
      const screen2 = glow(0xffb060);
      for (let i = 0; i < 5; i++) {
        const x = -16 + i * 8;
        put(new THREE.BoxGeometry(3, 1.5, 1), hull, x, 0.75, -18.5);
        const scr = put(new THREE.PlaneGeometry(2.4, 0.9), i % 2 ? screen : screen2, x, 1.7, -18.4);
        scr.rotation.x = -0.5;
        const ph = Math.random() * 6;
        this.propAnims.push((t) => { scr.visible = Math.sin(t * 7 + ph) > -0.85; });
      }
      for (const sx of [-1, 1]) {
        for (const py of [2.5, 3.4]) {
          const p = put(new THREE.CylinderGeometry(0.28, 0.28, 40, 10), pipe, sx * 29.5, py, 0);
          p.rotation.x = Math.PI / 2;
        }
      }
      for (let i = 0; i < 7; i++) {
        const x = -GX + Math.random() * GX * 2;
        const z = -8 + Math.random() * 20;
        if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
        const c = put(new THREE.BoxGeometry(1.4, 1.4, 1.4), std(0x4a4232, 0.8, 0.2), x, 0.7, z);
        c.rotation.y = Math.random();
      }
      for (const sx of [-1, 1]) {
        const beacon = put(new THREE.SphereGeometry(0.18, 8, 6), glow(0xff4a3a), sx * 28, 5.5, -19);
        const light = new THREE.PointLight(0xff4a3a, 8, 14, 1.8);
        light.position.set(sx * 28, 5.5, -19);
        grp.add(light);
        const ph = sx * 2;
        this.propAnims.push((t) => {
          const on = Math.sin(t * 3.5 + ph) > 0;
          light.intensity = on ? 9 : 0.5;
          beacon.scale.setScalar(on ? 1.3 : 0.8);
        });
      }
    } else if (idx === 2) {
      // АРМАГЕДДОН: скальные пики, остовы машин, бочки, кострища
      const rock = std(0x4a423a, 0.95, 0.05);
      const rust = std(0x5e3a20, 0.85, 0.35);
      for (let i = 0; i < 10; i++) {
        const x = -GX + Math.random() * GX * 2;
        const z = -GZ + Math.random() * GZ * 2;
        if (Math.abs(x) < 9 && Math.abs(z) < 9) continue;
        const h = 2 + Math.random() * 4;
        const s = put(new THREE.ConeGeometry(0.7 + Math.random() * 0.8, h, 6), rock, x, h / 2 - 0.2, z);
        s.rotation.z = (Math.random() - 0.5) * 0.25;
        s.rotation.y = Math.random() * 3;
      }
      for (const [x, z, ry] of [[-16, -10, 0.5], [15, 8, 2.2], [-12, 12, 1.1]] as Array<[number, number, number]>) {
        const wreck = put(new THREE.BoxGeometry(5, 2.2, 2.6), rust, x, 0.8, z);
        wreck.rotation.set(0.12, ry, 0.08);
        put(new THREE.BoxGeometry(1.8, 1.2, 2.0), rust, x + 2, 0.5, z + 1).rotation.y = ry + 0.7;
      }
      for (let i = 0; i < 8; i++) {
        const x = -GX + Math.random() * GX * 2;
        const z = -GZ + Math.random() * GZ * 2;
        if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
        put(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), rust, x, 0.55, z);
      }
      for (const [x, z] of [[-20, 0], [19, -12], [6, 15]] as Array<[number, number]>) {
        put(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 10), rock, x, 0.1, z);
        const fire = put(new THREE.ConeGeometry(0.6, 1.4, 7), glow(0xff7a30), x, 0.9, z);
        const light = new THREE.PointLight(0xff7a30, 10, 12, 1.8);
        light.position.set(x, 1.6, z);
        grp.add(light);
        const ph = Math.random() * 6;
        this.propAnims.push((t) => {
          const f = 0.85 + Math.sin(t * 13 + ph) * 0.3;
          fire.scale.set(f, f * 1.25, f);
          light.intensity = 8 + f * 4;
        });
      }
    } else if (idx === 3) {
      // ГРОБНИЦА: обелиски с глифами, саркофаги, монолит
      const blackstone = std(0x10140f, 0.5, 0.6);
      const glyph = glow(0x59ff8a);
      for (const [x, z] of [[-GX, -GZ], [GX, -GZ], [-GX, GZ], [GX, GZ], [-GX, 0], [GX, 0]] as Array<[number, number]>) {
        put(new THREE.CylinderGeometry(0.55, 1.0, 6.5, 4), blackstone, x, 3.25, z).rotation.y = Math.PI / 4;
        const strip = put(new THREE.BoxGeometry(0.14, 4.6, 0.14), glyph, x, 3.1, z + 0.72);
        const ph = Math.random() * 6;
        this.propAnims.push((t) => {
          const s = 0.7 + Math.sin(t * 2.2 + ph) * 0.3;
          strip.scale.set(s, 1, s);
        });
      }
      for (let i = 0; i < 4; i++) {
        const x = -15 + i * 10;
        const slab = put(new THREE.BoxGeometry(2.2, 1.0, 3.4), blackstone, x, 0.5, 13);
        slab.rotation.y = (Math.random() - 0.5) * 0.3;
        put(new THREE.BoxGeometry(1.8, 0.25, 2.9), std(0x1a3a24, 0.4, 0.5), x, 1.08, 13).rotation.y = slab.rotation.y;
      }
      // central monolith shard behind the altar line
      put(new THREE.CylinderGeometry(0.8, 1.6, 9, 4), blackstone, -20, 4.5, -18).rotation.y = Math.PI / 4;
      const monoGlow = put(new THREE.BoxGeometry(0.2, 6.5, 0.2), glyph, -20, 4.2, -17.1);
      this.propAnims.push((t) => { monoGlow.scale.y = 0.8 + Math.sin(t * 1.6) * 0.2; });
      const light = new THREE.PointLight(0x59ff8a, 9, 22, 1.8);
      light.position.set(0, 4, -10);
      grp.add(light);
      this.propAnims.push((t) => { light.intensity = 7 + Math.sin(t * 2.2) * 3; });
    } else if (idx === 4) {
      // РАВНИНЫ ТАУ: платформы, голопанели, дроны, купола
      const ceramic = std(0xb8bcc0, 0.35, 0.4);
      const holo = glow(0x6adfff);
      const dark = std(0x3a3f46, 0.5, 0.6);
      for (const [x, z] of [[-16, -10], [16, 10], [0, 14]] as Array<[number, number]>) {
        put(new THREE.CylinderGeometry(2.6, 2.9, 0.35, 18), ceramic, x, 0.17, z);
        put(new THREE.TorusGeometry(2.2, 0.07, 8, 32), holo, x, 0.38, z).rotation.x = Math.PI / 2;
      }
      for (let i = 0; i < 4; i++) {
        const x = -18 + i * 12;
        const panel = put(new THREE.PlaneGeometry(2.4, 1.4), holo, x, 3.2, -17);
        panel.material = holo;
        const ph = Math.random() * 6;
        this.propAnims.push((t) => {
          panel.position.y = 3.2 + Math.sin(t * 1.4 + ph) * 0.15;
          panel.rotation.y = Math.sin(t * 0.6 + ph) * 0.2;
        });
        put(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6), dark, x, 1.3, -17.2);
      }
      for (let i = 0; i < 3; i++) {
        const drone = put(new THREE.SphereGeometry(0.45, 12, 8), ceramic, -10 + i * 10, 3.5, 4);
        drone.scale.set(1, 0.55, 1);
        const eye = put(new THREE.SphereGeometry(0.12, 8, 6), holo, drone.position.x, 3.5, 4.42);
        const cx = drone.position.x, cz = 4, ph = i * 2.1;
        this.propAnims.push((t) => {
          const a = t * 0.5 + ph;
          drone.position.set(cx + Math.cos(a) * 2.4, 3.5 + Math.sin(t * 2 + ph) * 0.3, cz + Math.sin(a) * 2.4);
          eye.position.set(drone.position.x, drone.position.y, drone.position.z + 0.42);
        });
      }
      for (const sx of [-1, 1]) {
        const dome = put(new THREE.SphereGeometry(4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), ceramic, sx * 26, 0, 14);
        dome.scale.set(1, 0.7, 1);
      }
    } else if (idx === 5) {
      // ЗАЛЫ ВОТАННОВ: кузни, лавовые каналы, машины, ковши
      const ironworks = std(0x2e2a26, 0.55, 0.75);
      const lava = glow(0xff9a30);
      const stone = std(0x3a332c, 0.9, 0.1);
      for (const [x, z, w] of [[-14, -12, 10], [12, 10, 12], [-6, 15, 8]] as Array<[number, number, number]>) {
        const channel = put(new THREE.BoxGeometry(w, 0.12, 0.9), lava, x, 0.07, z);
        const ph = Math.random() * 6;
        this.propAnims.push((t) => {
          const s = 0.85 + Math.sin(t * 3 + ph) * 0.15;
          channel.scale.set(1, 1, s);
        });
        put(new THREE.BoxGeometry(w + 0.6, 0.3, 1.7), stone, x, 0.05, z);
        channel.position.y = 0.22;
      }
      for (const [x, z] of [[-GX, -10], [GX, 4]] as Array<[number, number]>) {
        put(new THREE.BoxGeometry(2.4, 1.1, 1.4), ironworks, x, 0.55, z); // anvil block
        put(new THREE.BoxGeometry(1.4, 0.5, 0.9), ironworks, x, 1.35, z);
        const light = new THREE.PointLight(0xff9a30, 8, 10, 1.8);
        light.position.set(x, 2.2, z);
        grp.add(light);
        const ph = Math.random() * 6;
        this.propAnims.push((t) => { light.intensity = 6 + (Math.sin(t * 8 + ph) * 0.5 + 0.5) * 5; });
      }
      for (let i = 0; i < 3; i++) {
        const x = -10 + i * 10;
        put(new THREE.BoxGeometry(2.6, 2.6, 2), ironworks, x, 1.3, -17.5);
        const piston = put(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 10), stone, x, 3.3, -17.5);
        const ph = i * 1.7;
        this.propAnims.push((t) => { piston.position.y = 3.3 + Math.sin(t * 2.4 + ph) * 0.5; });
      }
      for (let i = 0; i < 5; i++) {
        const x = -GX + Math.random() * GX * 2;
        const z = -6 + Math.random() * 16;
        if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
        const bucket = put(new THREE.CylinderGeometry(0.7, 0.55, 0.9, 10), ironworks, x, 0.45, z);
        bucket.rotation.z = (Math.random() - 0.5) * 0.4;
        put(new THREE.SphereGeometry(0.45, 8, 6), lava, x, 0.85, z).scale.y = 0.4;
      }
    } else if (idx === 6) {
      // МИР-КОРАБЛЬ: костяные арки, кристаллы духов, рёбра психопластика
      const bone = std(0xd4dcd8, 0.35, 0.25);
      const crystal = glow(0x7df0ff);
      for (const [x, z, ry] of [[-18, -8, 0.4], [18, 6, -0.6], [-6, 14, 1.2]] as Array<[number, number, number]>) {
        const arch = put(new THREE.TorusGeometry(3.4, 0.4, 10, 24, Math.PI), bone, x, 0, z);
        arch.rotation.y = ry;
      }
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const rib = put(new THREE.CylinderGeometry(0.22, 0.4, 9, 8), bone, sx * (27.5 - i * 0.3), 4.5, -14 + i * 9);
          rib.rotation.z = sx * -0.35;
        }
      }
      const crystals: THREE.Mesh[] = [];
      for (const [x, z] of [[-12, 6], [10, -12], [4, 2], [-20, 14], [20, -4]] as Array<[number, number]>) {
        const cr = put(new THREE.OctahedronGeometry(0.55, 0), crystal, x, 1.4, z);
        put(new THREE.CylinderGeometry(0.3, 0.5, 0.8, 8), bone, x, 0.4, z);
        crystals.push(cr);
        const light = new THREE.PointLight(0x7df0ff, 4, 7, 1.8);
        light.position.set(x, 1.6, z);
        grp.add(light);
      }
      this.propAnims.push((t) => {
        for (let i = 0; i < crystals.length; i++) {
          crystals[i].rotation.y = t * 0.8 + i;
          crystals[i].position.y = 1.4 + Math.sin(t * 1.6 + i * 1.3) * 0.18;
        }
      });
    } else {
      // ЖИВОЙ КОРАБЛЬ: волдыри, вены, хитиновые шипы, лужи слизи
      const flesh = std(0x7a3a4a, 0.55, 0.1);
      const chitin = std(0x2a1626, 0.5, 0.3);
      const vein = glow(0xe26aff);
      const boils: THREE.Mesh[] = [];
      for (const [bx, bz] of [[-GX, -GZ], [GX, -GZ], [-GX, GZ], [GX, GZ], [0, GZ + 1], [-14, 0], [14, -6]] as Array<[number, number]>) {
        for (let i = 0; i < 4; i++) {
          const r = 0.3 + Math.random() * 0.45;
          const boil = put(new THREE.SphereGeometry(r, 10, 8), flesh, bx + (Math.random() - 0.5) * 1.6, r * 0.6, bz + (Math.random() - 0.5) * 1.6);
          boils.push(boil);
        }
      }
      this.propAnims.push((t) => {
        for (let i = 0; i < boils.length; i++) {
          const s = 1 + Math.sin(t * 2.6 + i * 0.9) * 0.16;
          boils[i].scale.set(s, s * 0.9, s);
        }
      });
      for (let i = 0; i < 6; i++) {
        const x = -20 + i * 8;
        const v = put(new THREE.CylinderGeometry(0.1, 0.14, 12, 6), vein, x, 0.12, 18.5);
        v.rotation.z = Math.PI / 2;
        v.rotation.y = (Math.random() - 0.5) * 0.6;
        const ph = i * 1.1;
        this.propAnims.push((t) => { v.scale.set(1, 0.8 + Math.sin(t * 3.2 + ph) * 0.35, 1); });
      }
      for (let i = 0; i < 8; i++) {
        const x = -GX + Math.random() * GX * 2;
        const z = -GZ + Math.random() * GZ * 2;
        if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
        const h = 1.6 + Math.random() * 2.4;
        const spike = put(new THREE.ConeGeometry(0.4, h, 6), chitin, x, h / 2 - 0.1, z);
        spike.rotation.z = (Math.random() - 0.5) * 0.5;
      }
      for (const [x, z] of [[-10, -14], [12, 14], [18, 2]] as Array<[number, number]>) {
        const pool = put(new THREE.CylinderGeometry(1.6, 1.8, 0.08, 14), glow(0x6a2a7a), x, 0.05, z);
        const ph = Math.random() * 6;
        this.propAnims.push((t) => { pool.scale.setScalar(1 + Math.sin(t * 1.8 + ph) * 0.08); });
      }
    }

    this.scene.add(grp);
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
    this.altarMat.color.setHex(b.monument);
    this.statueMat.color.setHex(b.monument);
    this.roseMat.color.setHex(b.propGlow);
    this.buildProps(idx);
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
    for (const anim of this.propAnims) anim(t);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    for (const d of this.propsDisposables) d.dispose();
    this.propsDisposables = [];
    this.propAnims = [];
  }
}
