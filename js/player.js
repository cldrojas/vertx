/**
 * VERT/X — Player module.
 *
 * The player is a neon‑cyan geometric diamond that auto‑flies upward through
 * the tunnel. Tapping / pressing Space flips horizontal direction. The diamond
 * leaves a trail of fading diamond outlines behind it.
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

/* ── Diamond shape ────────────────────────────────────────────── */
const DIAMOND_HEIGHT = 14;       // half-height (vertical radius)
const DIAMOND_WIDTH = 9;         // half-width — smaller = más fino

/* ── Diamond trail ────────────────────────────────────────────── */
const TRAIL_MIN_LEN = 40;       // min trail length (px) at speed 1.0  → ~8 segments
const TRAIL_MAX_LEN = 150;      // max trail length (px) at speed 3.0  → ~30 segments
const SEG_H = 5;                // vertical spacing between trail segments (lower = denser)
const MAX_HISTORY = 60;         // max recent positions stored for trail chasing

/* ===================================================================
   State
   =================================================================== */

let ctx;

const player = {
  x: 180,
  y: 580,
  vx: -250,
  vy: 0,
  radius: 12,
  lives: 3,
  invulnTimer: 0,
  shakeTimer: 0,
  animTimer: 0,             // ms accumulator for animation
  boostTimer: 0,            // ms remaining for boost pulse
  currentSpeed: 1.0,        // current speed for dynamic trail length
  xHistory: [],             // trailing position history (for smooth tail physics)
};

/* ===================================================================
   Init / Reset
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  reset();
}

export function reset() {
  player.x           = 180;
  player.y           = 580;
  player.vx          = -250;
  player.vy          = 0;
  player.radius      = 12;
  player.lives       = 3;
  player.invulnTimer = 0;
  player.shakeTimer  = 0;
  player.animTimer   = 0;
  player.boostTimer  = 0;
  player.currentSpeed = 1.0;
  player.xHistory.length = 0;
}

/* ===================================================================
   Update
   =================================================================== */

export function update(dt, speed) {
  // ── Input ───────────────────────────────────────────────────────
  if (dequeueAction() === ACTION_TAP) {
    player.vx = -player.vx;
    player.boostTimer = 250;          // 250 ms boost pulse
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
    } else {
      player.x = (gap.left + gap.right) / 2;  // center when gap too narrow
    }
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

  // ── Record position for trail history ──────────────────────────
  player.xHistory.push(player.x);
  if (player.xHistory.length > MAX_HISTORY) {
    player.xHistory.shift();
  }
}

/* ===================================================================
   Draw helpers
   =================================================================== */

/**
 * Draw a diamond (rotated square) centered at (cx, cy).
 * @param {CanvasRenderingContext2D} _ctx
 * @param {number} cx  – centre x
 * @param {number} cy  – centre y
 * @param {number} hw  – half-width (horizontal radius)
 * @param {number} hh  – half-height (vertical radius)
 * @param {boolean} fill  – fill the diamond or stroke only
 */
function drawDiamond(_ctx, cx, cy, hw, hh, fill) {
  _ctx.beginPath();
  _ctx.moveTo(cx, cy - hh);       // top
  _ctx.lineTo(cx + hw, cy);       // right
  _ctx.lineTo(cx, cy + hh);       // bottom
  _ctx.lineTo(cx - hw, cy);       // left
  _ctx.closePath();
  if (fill) _ctx.fill();
  _ctx.stroke();
}

/* ===================================================================
   Draw
   =================================================================== */

export function draw(/* alpha */) {
  const shaking = player.shakeTimer > 0;
  if (shaking) {
    ctx.save();
    ctx.translate(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    );
  }

  // ── Boost pulse scale ───────────────────────────────────────────
  const boostScale = player.boostTimer > 0
    ? 1 + Math.sin(player.boostTimer / 250 * Math.PI) * 0.25
    : 1;

  // ── Diamond trail — per‑segment stroke with progressive fade ──
  // Each segment renders with its own alpha for proper fade, wrapped
  // in save/restore so main diamond isn't affected. Segment count
  // uses a power curve so the trail grows progressively with speed:
  //   ~8  at speed 1.0
  //   ~12 at speed 1.5
  //   ~18 at speed 2.0
  //   ~24 at speed 2.5
  //   ~30 at speed 3.0
  const speedNorm = (player.currentSpeed - 1) / (3 - 1);
  const progressive = Math.pow(speedNorm, 1.8);  // power curve: slow early, steep late
  const trailLen = TRAIL_MIN_LEN + progressive * (TRAIL_MAX_LEN - TRAIL_MIN_LEN);
  const SEGS = Math.max(6, Math.round(trailLen / SEG_H));

  if (SEGS > 1) {
    ctx.save();
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth   = 1.5;

    const histLen = player.xHistory.length;

    for (let i = 1; i < SEGS; i++) {
      const t = i / SEGS;
      const segY = Math.round(player.y + i * SEG_H);
      const wave = Math.sin(player.animTimer * 0.005 + i * 4) * (1 - t);

      // Read from position history so the tail physically follows
      // the player's path — bends on direction change, straightens
      // when flying straight.
      const histIdx = Math.max(0, histLen - 1 - i);
      const histX = player.xHistory[histIdx];

      const factor = boostScale * (1 - t * 0.55);
      const hh = Math.round(DIAMOND_HEIGHT * factor);
      const hw = Math.round(DIAMOND_WIDTH * factor);
      const alpha = 0.55 * (1 - t) * (1 - t);

      if (alpha < 0.01 || hh < 2) continue;
      if (alpha < 0.01 || hh < 2) continue;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      const cx = histX + wave;
      const cy = segY;
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.stroke();
    }

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

  // ── Main diamond ────────────────────────────────────────────────
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  const dsH = Math.round(DIAMOND_HEIGHT * boostScale);
  const dsW = Math.round(DIAMOND_WIDTH * boostScale);

  ctx.save();
  ctx.translate(px, py);

  // Outer diamond (cyan fill)
  ctx.fillStyle = '#0ff';
  drawDiamond(ctx, 0, 0, dsW, dsH, true);

  // Inner accent diamond (darker shade, no glow)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#088';
  drawDiamond(ctx, 0, 0, Math.round(dsW * 0.45), Math.round(dsH * 0.45), true);

  // Thin bright border
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8ff';
  ctx.lineWidth   = 1;
  drawDiamond(ctx, 0, 0, dsW, dsH, false);

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
