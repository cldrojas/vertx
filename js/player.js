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

/* ── Vertical comet tail ───────────────────────────────────────── */
const TAIL_MIN_LEN = 20;       // min height px (speed 1.0)
const TAIL_MAX_LEN = 80;       // max height px (speed 3.0)
const TAIL_BASE_W  = 14;       // width at player (px)
const TAIL_TIP_W  = 4;        // width at tip (px)

/* ── Ninja sprite config ───────────────────────────────────────── */
const NINJA_FRAMES = 8;
const NINJA_SRC_W  = 302;      // source PNG width
const NINJA_SRC_H  = 332;      // source PNG height
const NINJA_DISP_W = 30;       // display width on canvas

/* ── Player animation ──────────────────────────────────────────── */
const ANIM_FRAMES  = 6;
const ANIM_MS      = 100;
const SCREEN_HALF  = 180;

/* ===================================================================
   Ninja sprite system — loaded from PNGs → offscreen canvases
   =================================================================== */

let frames = null;          // { runLeft: Canvas[], runRight: Canvas[], boostLeft, boostRight }
let ninjaImages = [];       // Image[] — 8 loaded PNGs
let ninjaReady = false;     // true once all frames built from loaded images

function scaleCanvas(img, dw, dh, flipX) {
  const cv = document.createElement('canvas');
  cv.width = dw;
  cv.height = dh;
  const s = cv.getContext('2d');
  if (flipX) {
    s.translate(dw, 0);
    s.scale(-1, 1);
  }
  s.drawImage(img, 0, 0, dw, dh);
  return cv;
}

function buildFramesFromNinja() {
  const scale = NINJA_DISP_W / NINJA_SRC_W;
  const dw = Math.round(NINJA_SRC_W * scale);
  const dh = Math.round(NINJA_SRC_H * scale);

  const runLeft = [];
  const runRight = [];
  for (let i = 0; i < ANIM_FRAMES; i++) {
    const imgIdx = i % NINJA_FRAMES;
    const img = ninjaImages[imgIdx];

    if (img instanceof Image && (!img.complete || img.naturalWidth === 0)) {
      // Failed image — draw cyan placeholder
      const pv = document.createElement('canvas');
      pv.width = dw; pv.height = dh;
      const ps = pv.getContext('2d');
      ps.fillStyle = '#0ff';
      ps.fillRect(0, 0, dw, dh);
      runLeft.push(pv);
      const pv2 = document.createElement('canvas');
      pv2.width = dw; pv2.height = dh;
      const ps2 = pv2.getContext('2d');
      ps2.translate(dw, 0); ps2.scale(-1, 1);
      ps2.fillStyle = '#0ff';
      ps2.fillRect(0, 0, dw, dh);
      runRight.push(pv2);
    } else {
      runLeft.push(scaleCanvas(img, dw, dh, false));
      runRight.push(scaleCanvas(img, dw, dh, true));
    }
  }

  frames = {
    runLeft, runRight,
    boostLeft: runLeft[0], boostRight: runRight[0],
  };
  ninjaReady = true;
}

function checkAllLoaded() {
  for (let i = 0; i < NINJA_FRAMES; i++) {
    const img = ninjaImages[i];
    // Image that errored has complete=true but naturalWidth=0 — still counts as "done"
    if (!img || !img.complete) return;
  }
  buildFramesFromNinja();
}

function loadNinjaFrames() {
  for (let i = 0; i < NINJA_FRAMES; i++) {
    const img = new Image();
    img.onload  = checkAllLoaded;
    img.onerror = () => {
      console.warn(`[player] Sprite ${i + 1}.png failed — using fallback`);
      checkAllLoaded();
    };
    ninjaImages.push(img);
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
  currentSpeed: 1.0,        // current speed for dynamic trail length
};

/* ===================================================================
   Init / Reset
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  if (ninjaImages.length === 0) loadNinjaFrames();
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

  // ── Vertical comet tail — stacked segments ────────────────────
  const speedNorm = (player.currentSpeed - 1) / (3 - 1);
  const tailH = TAIL_MIN_LEN + speedNorm * (TAIL_MAX_LEN - TAIL_MIN_LEN);
  const wBot = TAIL_TIP_W + (TAIL_BASE_W - TAIL_TIP_W) * speedNorm;
  const SEG_H = 6;
  const SEGS = Math.max(3, Math.round(tailH / SEG_H));

  for (let i = 0; i < SEGS; i++) {
    const t = i / SEGS;
    const segY = Math.round(player.y + i * SEG_H);
    const segH = Math.round(SEG_H * (1 - t * 0.4));
    const segW = Math.round(wBot * (1 - t * 0.6));
    const alpha = 0.7 * (1 - t) * (1 - t);

    if (alpha < 0.01 || segW < 1) continue;

    const wave = Math.sin(player.animTimer * 0.008 + i * 0.9) * (1 - t) * 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur  = Math.round(14 * (1 - t) + 4);
    ctx.fillStyle = "#0ff";
    ctx.fillRect(player.x - segW / 2 + wave, segY, segW, segH);
    ctx.restore();
  }
  // ── Skip during invulnerability flash ───────────────────────────
  if (player.invulnTimer > 0) {
    const flashCycle = Math.floor(player.invulnTimer / 100) % 2 === 0;
    if (!flashCycle) {
      if (shaking) ctx.restore();
      return;
    }
  }

  // ── Guard: skip if sprites not loaded ────────────────────────────
  if (!frames) {
    if (shaking) ctx.restore();
    return;
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
  const fw = canvas.width;
  const fh = canvas.height;

  ctx.save();
  ctx.translate(px, py);

  // Flip horizontally when moving right
  if (player.vx > 0) ctx.scale(-1, 1);

  // Glow
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur  = 15;

  // Draw the ninja sprite centred
  ctx.drawImage(canvas, -fw / 2, -fh / 2);

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
