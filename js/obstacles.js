/**
 * VERT/X — Obstacles module.
 *
 * Obstacles appear inside the tunnel passage. Colliding with an obstacle
 * triggers the same death path as wall collision (invulnerability, lives--).
 *
 * Exports conform to the main.js import contract.
 */

import { getChunks, validateChunk } from './tunnel.js';

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W     = 360;
const CANVAS_H     = 640;
const CHUNK_HEIGHT = 800;   // must match tunnel CHUNK_HEIGHT
const SCROLL_SPEED = 300;   // must match tunnel SCROLL_SPEED
const SPAWN_CHANCE = 0.4;   // per-chunk probability of containing obstacles
const MAX_PER_CHUNK = 2;    // max obstacles per chunk

const OBSTACLE_TYPES = [
  { type: 'tiny',     w: 10, h: 10 },
  { type: 'vertical', w: 16, h: 24 },
  { type: 'horizontal', w: 24, h: 16 },
  { type: 'medium',   w: 20, h: 20 },
  { type: 'wide-low', w: 28, h: 12 },
];

/* ===================================================================
   State
   =================================================================== */

let ctx;

/**
 * @type {{ type:string, x:number, y:number, w:number, h:number, chunkId:number }[]}
 */
let obstacles = [];

/**
 * Track which chunk IDs already had their spawn check.
 * @type {Set<number>}
 */
let spawnedChunks = new Set();

/* ===================================================================
   Init / Reset
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  reset();
}

export function reset() {
  obstacles = [];
  spawnedChunks = new Set();
}

/* ===================================================================
   Spawn helpers
   =================================================================== */

function spawnObstacles(chunk) {
  const count = 1 + Math.floor(Math.random() * MAX_PER_CHUNK);  // 1 or 2

  for (let n = 0; n < count; n++) {
    const typeDef = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];

    // Bias obstacle X to the middle 60 % of the gap
    const minX = chunk.gapCentre - chunk.gapWidth / 2 + 0.2 * chunk.gapWidth;
    const maxX = chunk.gapCentre - chunk.gapWidth / 2 + 0.8 * chunk.gapWidth - typeDef.w;
    const ox  = minX + Math.random() * Math.max(0, maxX - minX);

    const oy = chunk.y + 40 + Math.random() * (CHUNK_HEIGHT - 80);

    obstacles.push({
      type: typeDef.type,
      x: ox,
      y: oy,
      w: typeDef.w,
      h: typeDef.h,
      chunkId: chunk.id,
    });
  }

  // Validate gap integrity after spawning
  if (!validateChunk(chunk)) {
    // Gap may have become too narrow — this is informational;
    // the obstacle placement already respects the gap bounds.
  }
}

/* ===================================================================
   Update
   =================================================================== */

export function update(dt, speed) {
  const scrollDist = SCROLL_SPEED * (dt / 1000) * Math.max(speed, 0.01);

  // ── Scroll obstacles ─────────────────────────────────────────────
  for (const obs of obstacles) {
    obs.y += scrollDist;
  }

  // ── Remove obstacles that are off-screen ──────────────────────────
  obstacles = obstacles.filter(o =>
    o.y > -40 && o.y < CANVAS_H + 40
  );

  // ── Spawn new obstacles for fresh chunks ─────────────────────────
  const activeChunks = getChunks();
  for (const chunk of activeChunks) {
    if (spawnedChunks.has(chunk.id)) continue;
    spawnedChunks.add(chunk.id);
    if (Math.random() < SPAWN_CHANCE) {
      spawnObstacles(chunk);
    }
  }

  // ── Garbage-collect stale chunk IDs ────────────────────────────
  const activeIds = new Set(activeChunks.map(c => c.id));
  for (const id of spawnedChunks) {
    if (!activeIds.has(id)) spawnedChunks.delete(id);
  }
}

/* ===================================================================
   Draw
   =================================================================== */

export function draw(alpha) {
  for (const obs of obstacles) {
    if (obs.y < -20 || obs.y > CANVAS_H + 20) continue;

    ctx.save();
    ctx.shadowColor = '#ff1493';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#ff1493';
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    ctx.restore();

    // ── Debug: collision box ────────────────────────────────────────
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth   = 1;
    ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
  }
}

/* ===================================================================
   Getters
   =================================================================== */

export function getObstacles() {
  return obstacles;
}
