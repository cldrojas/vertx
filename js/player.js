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

const TRAIL_MAX      = 200;
const TRAIL_SAMPLE_DIST = 30;   // px travelled between trail samples

const INVULN_DURATION = 1500;   // ms of invulnerability after a hit

/* ===================================================================
   State
   =================================================================== */

let ctx;

const player = {
  x: 180,
  y: 580,           // fixed vertical position (tunnel scrolls instead)
  vx: -250,         // horizontal velocity (px/s); flips on tap
  vy: 0,            // no vertical movement — tunnel provides the scroll
  radius: 6,
  lives: 3,
  invulnTimer: 0,   // ms remaining of invulnerability
  shakeTimer: 0,    // ms remaining of screen‑shake
  trail: [],        // ring buffer of { x, y } points
  trailLastX: 0,
  trailLastY: 0,
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
  player.radius      = 6;
  player.lives       = 3;
  player.invulnTimer = 0;
  player.shakeTimer  = 0;
  player.trail       = [];
  player.trailLastX  = player.x;
  player.trailLastY  = player.y;
}

/* ===================================================================
   Update
   =================================================================== */

export function update(dt, speed) {
  // ── Input ───────────────────────────────────────────────────────
  if (dequeueAction() === ACTION_TAP) {
    player.vx = -player.vx;
  }

  // ── Movement ────────────────────────────────────────────────────
  const s = dt / 1000 * Math.max(speed, 0.01);
  player.x += player.vx * s;

  // Apply y mobility: slight drift toward vertical center for feel
  // (keeps the player vertically anchored in the play area)
  // player.y stays fixed — tunnel scrolls below.

  // ── Tunnel wall bounds ──────────────────────────────────────────
  const gap = getGapAtY(player.y);
  if (gap) {
    const minX = gap.left  + player.radius;
    const maxX = gap.right - player.radius;
    if (minX < maxX) {
      player.x = Math.max(minX, Math.min(maxX, player.x));
    }
    // If player is outside gap, push toward center of gap
    if (player.x < minX) player.x = minX;
    if (player.x > maxX) player.x = maxX;
  }

  // ── Invulnerability countdown ───────────────────────────────────
  if (player.invulnTimer > 0) {
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  }

  // ── Shake countdown ─────────────────────────────────────────────
  if (player.shakeTimer > 0) {
    player.shakeTimer = Math.max(0, player.shakeTimer - dt);
  }

  // ── Trail sampling ──────────────────────────────────────────────
  const dx = player.x - player.trailLastX;
  const dy = player.y - player.trailLastY;
  if (Math.sqrt(dx * dx + dy * dy) >= TRAIL_SAMPLE_DIST) {
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > TRAIL_MAX) {
      player.trail.shift();
    }
    player.trailLastX = player.x;
    player.trailLastY = player.y;
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

  // ── Trail ───────────────────────────────────────────────────────
  if (player.trail.length > 1) {
    for (let i = 1; i < player.trail.length; i++) {
      const t = i / player.trail.length; // 0 … 1
      ctx.strokeStyle = `rgba(0, 255, 255, ${t * 0.35})`;
      ctx.lineWidth = t * 3 + 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(player.trail[i - 1].x), Math.round(player.trail[i - 1].y));
      ctx.lineTo(Math.round(player.trail[i].x),     Math.round(player.trail[i].y));
      ctx.stroke();
    }
  }

  // ── Skip drawing during invulnerability flash ───────────────────
  if (player.invulnTimer > 0) {
    // Flash every 100 ms — skip ~half the frames
    const flashCycle = Math.floor(player.invulnTimer / 100) % 2 === 0;
    if (!flashCycle) {
      if (shaking) ctx.restore();
      return;
    }
  }

  // ── Glow ──────────────────────────────────────────────────────
  ctx.save();
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur  = 15;

  // ── Body ────────────────────────────────────────────────────────
  ctx.fillStyle = '#0ff';
  ctx.beginPath();
  ctx.arc(Math.round(player.x), Math.round(player.y), player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  // ── Bright core ─────────────────────────────────────────────────
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(Math.round(player.x), Math.round(player.y), player.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (shaking) ctx.restore();
}

/* ===================================================================
   Collision helpers  (called by collision.js)
   =================================================================== */

/**
 * Register a hit.  Honour invulnerability window.
 * @returns {boolean} true if the hit was applied, false if ignored.
 */
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

export function getTrail() {
  return player.trail;
}
