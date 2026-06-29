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
const TRAIL_SAMPLE_DIST = 30;

const INVULN_DURATION = 1500;


/* ===================================================================
   Sprite data  —  12×12 pixel art character
   Palette: 0=transparent, 1=cyan body, 2=white visor, 3=dark accent,
            4=pink accent, 5=magenta
   =================================================================== */

const S = { _:0, C:1, W:2, D:3, P:4, M:5 };

const SPRITE = [
  //0 1 2 3 4 5 6 7 8 9 0 1
  [0,0,0,0,0,1,1,0,0,0,0,0],  //  0 — helmet dome
  [0,0,0,1,1,1,1,1,1,0,0,0],  //  1 — helmet
  [0,0,1,1,2,2,2,2,1,1,0,0],  //  2 — visor (white)
  [0,1,1,1,1,1,1,1,1,1,1,0],  //  3 — shoulders
  [1,1,1,1,1,1,1,1,1,1,1,1],  //  4 — body
  [1,1,1,1,1,1,1,1,1,1,1,1],  //  5 — body
  [1,1,0,1,1,1,1,0,1,1,0,0],  //  6 — arms
  [0,1,0,1,3,3,1,0,1,0,0,0],  //  7 — torso
  [0,1,1,0,0,0,0,1,1,0,0,0],  //  8 — waist
  [0,0,1,0,0,0,0,1,0,0,0,0],  //  9 — legs
  [0,0,1,0,0,0,0,1,0,0,0,0],  // 10 — legs
  [0,0,0,3,0,0,3,0,0,0,0,0],  // 11 — feet / thrusters
];

const PAL = ['', '#0ff', '#fff', '#088', '#f0f', '#f08'];

/* ===================================================================
   Offscreen canvas — render sprite once, cache for drawImage
   =================================================================== */

let spriteCanvas = null;

function getSpriteCanvas() {
  if (!spriteCanvas) {
    spriteCanvas = document.createElement('canvas');
    spriteCanvas.width  = 12;
    spriteCanvas.height = 12;
    const sctx = spriteCanvas.getContext('2d');
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const idx = SPRITE[row][col];
        if (idx === 0) continue;
        sctx.fillStyle = PAL[idx];
        sctx.fillRect(col, row, 1, 1);
      }
    }
  }
  return spriteCanvas;
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
  trail: [],
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
  if (dequeueAction() === ACTION_TAP) {
    player.vx = -player.vx;
  }

  const s = dt / 1000 * Math.max(speed, 0.01);
  player.x += player.vx * s;

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

  if (player.invulnTimer > 0) {
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  }

  if (player.shakeTimer > 0) {
    player.shakeTimer = Math.max(0, player.shakeTimer - dt);
  }

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
      const t = i / player.trail.length;
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
    const flashCycle = Math.floor(player.invulnTimer / 100) % 2 === 0;
    if (!flashCycle) {
      if (shaking) ctx.restore();
      return;
    }
  }

  // ── Pixel art sprite ────────────────────────────────────────────
  const px = Math.round(player.x);
  const py = Math.round(player.y);

  ctx.save();
  ctx.translate(px, py);
  // Flip horizontally when moving right so the character faces
  // the direction of travel. (Default vx < 0 = facing left.)
  if (player.vx > 0) ctx.scale(-1, 1);

  // Glow layer behind the sprite
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur  = 15;

  // Draw cached pixel‑art sprite (12×12, centered)
  ctx.drawImage(getSpriteCanvas(), -6, -6);

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

export function getTrail() {
  return player.trail;
}
