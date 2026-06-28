/**
 * VERT/X — Tunnel module.
 *
 * Manages the scrolling tunnel walls.  The tunnel is divided into tall
 * vertical chunks; each chunk has a horizontal gap whose centre position
 * shifts smoothly between consecutive chunks.
 *
 * Exports conform to the main.js import contract.
 */

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W      = 360;
const CANVAS_H      = 640;
const WALL_WIDTH    = 40;       // minimum wall thickness from edges
const CHUNK_HEIGHT  = 800;      // height of one tunnel segment
const MIN_GAP       = 48;       // narrowest horizontal passage
const MAX_GAP       = 100;      // widest horizontal passage
const POOL_COUNT    = 6;        // pre‑allocated chunks in the ring
const SCROLL_SPEED  = 300;      // base px/s (multiplied by game speed)

/**
 * Maximum difference in gap‑centre (px) between consecutive chunks.
 * Keeps the tunnel from zig‑zagging too violently.
 */
const MAX_CENTRE_DELTA = 144;   // 40 % of canvas width

/* ===================================================================
   State
   =================================================================== */

let ctx;

/** @type {Chunk[]} */
let chunks = [];

/* ===================================================================
   Chunk shape
   =================================================================== */

/**
 * @typedef {Object} Chunk
 * @property {number}  id        – unique identifier
 * @property {number}  y         – top‑edge y‑coordinate (canvas space)
 * @property {number}  gapCentre – horizontal centre of the passage
 * @property {number}  gapWidth  – width of the passage
 * @property {{x:number,y:number,w:number,h:number}[]} leftWalls
 * @property {{x:number,y:number,w:number,h:number}[]} rightWalls
 */

let nextId = 0;

/* ===================================================================
   Helpers
   =================================================================== */

function rect(x, y, w, h) {
  return { x, y, w, h };
}

/**
 * Generate a fresh chunk positioned so its top‑edge is at `yPos`.
 * The gap centre is constrained relative to the previous chunk (if any).
 */
function generateChunk(yPos, prevCentre) {
  const gapWidth = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);

  // Horizontal centre for the gap
  let gapCentre;
  const halfGap = gapWidth / 2;
  const margin  = halfGap + 6;              // keep away from canvas edges

  if (prevCentre !== undefined) {
    const lo = Math.max(margin, prevCentre - MAX_CENTRE_DELTA);
    const hi = Math.min(CANVAS_W - margin, prevCentre + MAX_CENTRE_DELTA);
    gapCentre = lo + Math.random() * (hi - lo);
  } else {
    gapCentre = margin + Math.random() * (CANVAS_W - margin * 2);
  }

  const gapLeft  = gapCentre - halfGap;
  const gapRight = gapCentre + halfGap;

  return {
    id: nextId++,
    y: yPos,
    gapCentre,
    gapWidth,
    leftWalls:  [rect(0,           yPos, gapLeft,          CHUNK_HEIGHT)],
    rightWalls: [rect(gapRight,    yPos, CANVAS_W - gapRight, CHUNK_HEIGHT)],
  };
}

/**
 * Reposition a chunk below the current lowest chunk and re‑roll its gap.
 */
function recycleChunk(chunk) {
  const lowest  = chunks.reduce((a, c) => (c.y > a.y ? c : a), chunks[0]);
  // Find the previous chunk in the sorted list for centre constraint
  const sorted = [...chunks].sort((a, b) => a.y - b.y);
  const idx    = sorted.indexOf(chunk);
  const prev   = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];

  const fresh = generateChunk(lowest.y + CHUNK_HEIGHT, prev.gapCentre);
  chunk.id         = fresh.id;
  chunk.y          = fresh.y;
  chunk.gapCentre  = fresh.gapCentre;
  chunk.gapWidth   = fresh.gapWidth;
  chunk.leftWalls  = fresh.leftWalls;
  chunk.rightWalls = fresh.rightWalls;
}

/* ===================================================================
   Module interface
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  reset();
}

export function reset() {
  chunks = [];
  nextId = 0;

  // Generate initial set: one behind viewport, rest below
  let prevCentre;
  for (let i = 0; i < POOL_COUNT; i++) {
    const yPos = -CHUNK_HEIGHT + i * CHUNK_HEIGHT;
    const chk  = generateChunk(yPos, prevCentre);
    prevCentre = chk.gapCentre;
    chunks.push(chk);
  }
}

export function update(dt, speed) {
  const scrollDist = SCROLL_SPEED * (dt / 1000) * Math.max(speed, 0.01);
  if (scrollDist === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    ch.y += scrollDist;

    // Update wall rectangle positions
    for (const w of ch.leftWalls)  w.y += scrollDist;
    for (const w of ch.rightWalls) w.y += scrollDist;
  }

  // Recycle chunks that have scrolled entirely above the viewport
  const recycleThreshold = -CHUNK_HEIGHT * 0.5;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].y + CHUNK_HEIGHT < recycleThreshold) {
      recycleChunk(chunks[i]);
    }
  }
}

export function draw(alpha) {
  // Only draw chunks that overlap the viewport
  const visTop    = -CHUNK_HEIGHT;
  const visBottom = CANVAS_H + CHUNK_HEIGHT;

  for (const ch of chunks) {
    if (ch.y + CHUNK_HEIGHT < visTop || ch.y > visBottom) continue;

    // ── Wall segments ────────────────────────────────────────────
    for (const wall of [...ch.leftWalls, ...ch.rightWalls]) {
      // Fill
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

      // Neon cyan border (1 px)
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth   = 1;
      ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);
    }

    // ── Corner brackets near gap edges ───────────────────────────
    const gapY  = ch.y;                           // gap spans full chunk height
    const gapL  = ch.gapCentre - ch.gapWidth / 2;
    const gapR  = ch.gapCentre + ch.gapWidth / 2;
    const midY  = ch.y + CHUNK_HEIGHT * 0.5;
    const brk   = 12;                             // bracket arm length

    ctx.strokeStyle = '#0ff';
    ctx.lineWidth   = 2;

    // Top‑left bracket
    ctx.beginPath();
    ctx.moveTo(gapL, midY - brk);
    ctx.lineTo(gapL, midY);
    ctx.lineTo(gapL + brk, midY);
    ctx.stroke();

    // Top‑right bracket
    ctx.beginPath();
    ctx.moveTo(gapR, midY - brk);
    ctx.lineTo(gapR, midY);
    ctx.lineTo(gapR - brk, midY);
    ctx.stroke();

    // ── Faint "VERT" text in centre of passage ───────────────────
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle   = '#0ff';
    ctx.font        = 'bold 60px Orbitron, "Courier New", monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VERT', ch.gapCentre, midY);
    ctx.restore();
  }
}

/* ===================================================================
   Getters  (called by player.js, collision.js, collectibles.js)
   =================================================================== */

/**
 * @returns {{x:number,y:number,w:number,h:number}[]}
 *   Flat array of all active wall segments.
 */
export function getWalls() {
  const out = [];
  for (const ch of chunks) {
    for (const w of ch.leftWalls)  out.push(w);
    for (const w of ch.rightWalls) out.push(w);
  }
  return out;
}

/**
 * Return the active chunks list (used by collectibles for coin spawning).
 * @returns {Chunk[]}
 */
export function getChunks() {
  return chunks;
}

/**
 * Find the horizontal gap boundaries at a given canvas y‑coordinate.
 * Used by player.js for wall‑bound clamping.
 *
 * @param {number} y  – canvas y
 * @returns {{left:number, right:number}|null}
 */
export function getGapAtY(y) {
  for (const ch of chunks) {
    if (y >= ch.y && y < ch.y + CHUNK_HEIGHT) {
      const half = ch.gapWidth / 2;
      return { left: ch.gapCentre - half, right: ch.gapCentre + half };
    }
  }
  return null;
}
