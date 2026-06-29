/**
 * VERT/X — Player module.
 *
 * The player is a neon‑cyan ship that auto‑flies upward through the tunnel.
 * Tapping / pressing Space flips horizontal direction.  The player is
 * bounded by tunnel walls and has i‑frames after taking a hit.
 *
 * Exports conform to the main.js import contract.
 */

import { dequeueAction, ACTION_TAP } from './input.js';
import { getGapAtY } from './tunnel.js';

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W = 360;
const CANVAS_H = 640;

const INVULN_DURATION = 1500;

/* ── Comet tail config (history-based) ──────────────────────────── */
const HISTORY_LEN = 80;       // frames de historial guardados
const TAIL_MIN_LEN = 20;       // segmentos minimos del trail (speed 1.0)
const TAIL_MAX_LEN = 80;       // segmentos maximos del trail (speed 3.0)
const TAIL_BASE_OP = 0.5;     // opacidad en la cabeza del trail

/* ── Sprite trail config ───────────────────────────────────────── */
const TRAIL_SPRITE_FRAMES = 8;
const TRAIL_SPRITE_SRC_W  = 302;    // source PNG width (px)
const TRAIL_SPRITE_SRC_H  = 332;    // source PNG height (px)
const TRAIL_SPRITE_DISP_W = 30;     // display width on canvas (px)
const TRAIL_VERT_GAP  = 20;     // vertical spacing between trail sprites (px)

/* ===================================================================
   32×32 Sprite system — pre‑generated offscreen canvases
   =================================================================== */

const SPRITE_W     = 32;
const SPRITE_H     = 32;
const ANIM_FRAMES  = 6;
const ANIM_MS      = 100;
const SCREEN_HALF  = 180;

/**
 * Build one running frame at a given animation phase, with side‑aware lean.
 * @param {number} phase  0 … 1
 * @param {number} side   -1 (left half) | 1 (right half)
 * @returns {HTMLCanvasElement}
 */
function buildRunFrame(phase, side) {
  const cv = document.createElement('canvas');
  cv.width  = SPRITE_W;
  cv.height = SPRITE_H;
  const s = cv.getContext('2d');

  const fill = (x, y, w, h, col) => { s.fillStyle = col; s.fillRect(x, y, w, h); };

  const legSwing  = Math.round(Math.sin(phase * Math.PI * 2) * 3);
  const armSwing  = Math.round(Math.sin(phase * Math.PI * 2 + Math.PI) * 3);
  const lean      = side * 1;

  // Boots / thrusters
  fill(11 + lean, 26 + legSwing, 4, 3, '#088');
  fill(17 + lean, 26 - legSwing, 4, 3, '#088');

  // Legs
  fill(12 + lean, 21, 2, 6 + legSwing, '#0ff');
  fill(18 + lean, 21, 2, 6 - legSwing, '#0ff');

  // Waist
  fill(10 + lean, 20, 12, 2, '#0ff');
  fill(10 + lean, 20, 12, 1, '#fff');

  // Torso
  fill(10 + lean, 13, 12, 8, '#0ff');
  fill(11 + lean, 14, 10, 6, '#0ff');
  fill(15 + lean, 15,  2, 5, '#088');   // centre line

  // Arms (swing opposite to legs)
  fill( 7 + lean + armSwing, 14, 4, 3, '#0ff');
  fill(21 + lean - armSwing, 14, 4, 3, '#0ff');

  // Shoulders
  fill( 8 + lean, 12, 4, 2, '#0ff');
  fill(20 + lean, 12, 4, 2, '#0ff');

  // Neck
  fill(14, 10, 4, 2, '#0ff');

  // Helmet
  fill(11, 3, 10, 8, '#0ff');
  fill(12, 2,  8, 2, '#0ff');
  fill(13, 1,  6, 2, '#0ff');

  // Antenna
  fill(15, 0, 2, 1, '#0ff');
  fill(14, 0, 1, 1, '#f0f');            // pink tip

  // Visor
  fill(14, 5, 8, 3, '#fff');
  fill(14, 6, 8, 1, '#0ff');            // cyan visor line
  fill(16, 5, 2, 1, '#f0f');            // pink glint

  // Helmet rim
  fill(11, 9, 10, 1, '#088');

  // Side accents
  fill( 9 + lean, 16, 1, 4, '#f0f');
  fill(22 + lean, 16, 1, 4, '#f0f');

  return cv;
}

/**
 * Boost / jump frame — legs tucked, arms up.
 * @param {number} side
 * @returns {HTMLCanvasElement}
 */
function buildBoostFrame(side) {
  const cv = document.createElement('canvas');
  cv.width  = SPRITE_W;
  cv.height = SPRITE_H;
  const s = cv.getContext('2d');

  const fill = (x, y, w, h, col) => { s.fillStyle = col; s.fillRect(x, y, w, h); };
  const lean = side * 1;

  // Boots (tucked under)
  fill(12 + lean, 26, 3, 2, '#088');
  fill(17 + lean, 26, 3, 2, '#088');

  // Legs (bent, shorter)
  fill(13 + lean, 22, 2, 5, '#0ff');
  fill(17 + lean, 22, 2, 5, '#0ff');

  // Waist
  fill(11 + lean, 21, 10, 2, '#0ff');

  // Body
  fill(10 + lean, 14, 12, 8, '#0ff');
  fill(15, 16, 2, 4, '#088');            // centre line

  // Arms (raised)
  fill( 8 + lean, 12, 3, 3, '#0ff');
  fill(21 + lean, 12, 3, 3, '#0ff');

  // Shoulders
  fill( 9 + lean, 13, 3, 2, '#0ff');
  fill(20 + lean, 13, 3, 2, '#0ff');

  // Neck
  fill(14, 11, 4, 2, '#0ff');

  // Helmet
  fill(11, 4, 10, 8, '#0ff');
  fill(12, 3,  8, 2, '#0ff');
  fill(13, 2,  6, 2, '#0ff');

  // Antenna
  fill(15, 1, 2, 1, '#0ff');
  fill(14, 1, 1, 1, '#f0f');

  // Visor
  fill(14, 6, 8, 3, '#fff');
  fill(14, 7, 8, 1, '#0ff');
  fill(16, 6, 2, 1, '#f0f');

  // Rim
  fill(11, 10, 10, 1, '#088');

  // Pink accents
  fill(10 + lean, 17, 1, 3, '#f0f');
  fill(21 + lean, 17, 1, 3, '#f0f');

  return cv;
}

/** Pre‑generated frame cache. */
let frames = null;

let trailSprites = [];      // HTMLCanvasElement[] — pre-processed cyan-tinted frames
let trailReady   = false;   // true once all sprites loaded and processed
let trailLoaded  = 0;       // count of successfully loaded images

function buildFrames() {
  const runLeft  = [];
  const runRight = [];
  for (let i = 0; i < ANIM_FRAMES; i++) {
    const phase = i / ANIM_FRAMES;
    runLeft.push(buildRunFrame(phase, -1));
    runRight.push(buildRunFrame(phase, 1));
  }
  return {
    runLeft,
    runRight,
    boostLeft:  buildBoostFrame(-1),
    boostRight: buildBoostFrame(1),
  };
}

/**
 * Load 8 trail sprite PNGs and pre-process them to cyan-tinted canvases.
 */
function loadTrailSprites() {
  const processFrame = (img, idx) => {
    const cv = document.createElement('canvas');
    cv.width  = TRAIL_SPRITE_SRC_W;
    cv.height = TRAIL_SPRITE_SRC_H;
    const s = cv.getContext('2d');
    
    // Draw the original sprite
    s.drawImage(img, 0, 0);
    
    // Cyan tint via source-in: fill with cyan, keep only where sprite has pixels
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = '#0ff';
    s.fillRect(0, 0, TRAIL_SPRITE_SRC_W, TRAIL_SPRITE_SRC_H);
    s.globalCompositeOperation = 'source-over';
    
    trailSprites[idx] = cv;
    trailLoaded++;
    if (trailLoaded === TRAIL_SPRITE_FRAMES) {
      trailReady = true;
    }
  };

  for (let i = 0; i < TRAIL_SPRITE_FRAMES; i++) {
    const img = new Image();
    img.onload  = () => processFrame(img, i);
    img.onerror = () => {
      console.warn(`[player] Failed to load trail sprite ${i + 1}.png`);
      trailLoaded++;
      if (trailLoaded === TRAIL_SPRITE_FRAMES && !trailReady) {
        // All attempted, none succeeded — trail stays disabled
      }
    };
    img.src = `sprites/${i + 1}.png`;
  }
}

/* ===================================================================
   State
   =================================================================== */

let ctx;

const player = {
  x: 180,
  y: 580,
  vx: -250,
  vy: 0,
  radius: 6,
  lives: 3,
  invulnTimer: 0,
  shakeTimer: 0,
  animTimer: 0,             // ms accumulator for running animation
  boostTimer: 0,            // ms remaining for boost/jump pose
  posHistory: [],           // ring buffer de {x, y}
  historyHead: 0,           // índice de escritura actual
  currentSpeed: 1.0,        // velocidad actual para estela dinámica
};

/* ===================================================================
   Init / Reset
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  if (!frames) frames = buildFrames();
  if (trailSprites.length === 0) loadTrailSprites();
  reset();
}

export function reset() {
  player.x           = 180;
  player.y           = 580;
  player.vx          = -250;
  player.vy          = 0;
  player.radius      = 6;
  player.lives       = 3;
  player.invulnTimer = 0;
  player.shakeTimer  = 0;
  player.animTimer   = 0;
  player.boostTimer  = 0;
  player.posHistory  = [];
  player.historyHead = 0;
  player.currentSpeed = 1.0;
}

/* ===================================================================
   Update
   =================================================================== */

export function update(dt, speed) {
  // ── Input ───────────────────────────────────────────────────────
  if (dequeueAction() === ACTION_TAP) {
    player.vx = -player.vx;
    player.boostTimer = 250;          // 250 ms boost visual
  }

  // ── Movement ────────────────────────────────────────────────────
  const s = dt / 1000 * Math.max(speed, 0.01);
  player.x += player.vx * s;

  // ── Tunnel wall bounds ──────────────────────────────────────────
  const gap = getGapAtY(player.y);
  if (gap) {
    const minX = gap.left  + player.radius;
    const maxX = gap.right - player.radius;
    if (minX < maxX) {
      player.x = Math.max(minX, Math.min(maxX, player.x));
    }
    if (player.x < minX) player.x = minX;
    if (player.x > maxX) player.x = maxX;
  }

  // ── Invulnerability ─────────────────────────────────────────────
  if (player.invulnTimer > 0) {
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  }

  // ── Shake ───────────────────────────────────────────────────────
  if (player.shakeTimer > 0) {
    player.shakeTimer = Math.max(0, player.shakeTimer - dt);
  }

  // ── Animation timers ────────────────────────────────────────────
  player.animTimer  += dt;
  if (player.boostTimer > 0) {
    player.boostTimer = Math.max(0, player.boostTimer - dt);
  }

  // ── Store current speed for dynamic trail length
  player.currentSpeed = speed;

  // ── Record position history for comet trail ─────────────────────
  if (player.posHistory.length < HISTORY_LEN) {
    player.posHistory.push({ x: player.x, y: player.y });
  } else {
    player.posHistory[player.historyHead] = { x: player.x, y: player.y };
    player.historyHead = (player.historyHead + 1) % HISTORY_LEN;
  }
}

/* ===================================================================
   Draw
   =================================================================== */

export function draw(alpha) {
  const shaking = player.shakeTimer > 0;
  if (shaking) {
    ctx.save();
    ctx.translate(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    );
  }

  // ── Comet trail (sprite-based, vertical) ────────────────────────
  if (trailReady) {
    const speedNorm = (player.currentSpeed - 1) / (3 - 1); // 0..1
    const dynLen = Math.round(TAIL_MIN_LEN + speedNorm * (TAIL_MAX_LEN - TAIL_MIN_LEN));
    const tailLen = Math.min(dynLen, player.posHistory.length);

    for (let i = 0; i < tailLen; i++) {
      const idx = (player.historyHead - 1 - i + HISTORY_LEN) % HISTORY_LEN;
      const pos = player.posHistory[idx];
      if (!pos) break;

      const t     = i / tailLen;
      const alpha = TAIL_BASE_OP * (1 - t) * (1 - t);        // quadratic fade
      const scale = TRAIL_SPRITE_DISP_W / TRAIL_SPRITE_SRC_W  // base scale
                  * (1 - t * 0.7);                             // shrink toward tip
      const sw = Math.round(TRAIL_SPRITE_SRC_W * scale);
      const sh = Math.round(TRAIL_SPRITE_SRC_H * scale);

      if (alpha < 0.01 || sw < 2) continue;                   // early skip

      const tx = Math.round(pos.x);
      const ty = Math.round(player.y + i * TRAIL_VERT_GAP);
      const frameIdx = i % TRAIL_SPRITE_FRAMES;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur  = Math.round(8 * (1 - t) + 2);          // glow fades to tip
      ctx.drawImage(trailSprites[frameIdx], -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    }
  }

  // ── Skip during invulnerability flash ───────────────────────────
  if (player.invulnTimer > 0) {
    const flashCycle = Math.floor(player.invulnTimer / 100) % 2 === 0;
    if (!flashCycle) {
      if (shaking) ctx.restore();
      return;
    }
  }

  // ── Select frame ───────────────────────────────────────────────
  const side       = player.x < SCREEN_HALF ? 'Left' : 'Right';
  const runArr     = side === 'Left' ? frames.runLeft  : frames.runRight;
  const boostFrame = side === 'Left' ? frames.boostLeft : frames.boostRight;

  const isBoost     = player.boostTimer > 0;
  const frameIdx    = Math.floor(player.animTimer / ANIM_MS) % ANIM_FRAMES;
  const canvas      = isBoost ? boostFrame : runArr[frameIdx];

  // ── Render ──────────────────────────────────────────────────────
  const px = Math.round(player.x);
  const py = Math.round(player.y);

  ctx.save();
  ctx.translate(px, py);

  // Flip horizontally when moving right
  if (player.vx > 0) ctx.scale(-1, 1);

  // Glow
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur  = 15;

  // Draw the 32×32 sprite centred
  ctx.drawImage(canvas, -SPRITE_W / 2, -SPRITE_H / 2);

  ctx.restore();

  if (shaking) ctx.restore();
}

export function onHit() {
  if (player.invulnTimer > 0 || player.lives <= 0) return false;
  player.invulnTimer = INVULN_DURATION;
  player.shakeTimer  = 100;
  player.lives--;
  return true;
}

/* ===================================================================
   Getters  (called by collision.js and main.js)
   =================================================================== */

export function getPosition() {
  return { x: player.x, y: player.y };
}

export function getBounds() {
  return { x: player.x, y: player.y, radius: player.radius };
}

export function isInvulnerable() {
  return player.invulnTimer > 0;
}

export function getLives() {
  return player.lives;
}


