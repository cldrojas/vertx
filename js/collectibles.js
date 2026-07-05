/**
 * VERT/X — Collectibles module (coins).
 *
 * Coins appear inside the tunnel passage.  Collecting a coin increases
 * the score (multiplied by the current combo) and increments the combo
 * counter.
 *
 * Exports conform to the main.js import contract.
 */

import { getChunks } from './tunnel.js';
import { drawGlow } from './glow.js';

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W     = 360;
const CANVAS_H     = 640;
const CHUNK_HEIGHT = 800;   // must match tunnel CHUNK_HEIGHT
const COIN_RADIUS  = 6;
const SPAWN_CHANCE = 0.3;   // per‑chunk probability of containing a coin
const SCROLL_SPEED = 300;   // must match tunnel SCROLL_SPEED

/* ===================================================================
   State
   =================================================================== */

let ctx;

/**
 * @type {{ x:number, y:number, collected:boolean, radius:number, chunkId:number }[]}
 */
let coins = [];

/**
 * Track which chunk IDs already had their spawn check,
 * so we don't double‑spawn.
 * @type {Set<number>}
 */
let spawnedChunks = new Set();

/**
 * Collect‑effect particles (coin pop + floating score text).
 * @type {{ x:number, y:number, timer:number, maxTimer:number, text:string }[]}
 */
let effects = [];

/* ===================================================================
   Init / Reset
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  reset();
}

export function reset() {
  coins = [];
  spawnedChunks = new Set();
  effects = [];
}

/* ===================================================================
   Spawn helpers
   =================================================================== */

function spawnCoin(chunk) {
  const half = chunk.gapWidth / 2;
  const gapLeft  = chunk.gapCentre - half;
  const gapRight = chunk.gapCentre + half;

  // Place the coin somewhere within the gap horizontally,
  // and at a random vertical position within the chunk.
  const x = gapLeft + COIN_RADIUS + Math.random() * (gapRight - gapLeft - COIN_RADIUS * 2);
  const y = chunk.y + 60 + Math.random() * (CHUNK_HEIGHT - 120);

  coins.push({
    x,
    y,
    collected: false,
    radius: COIN_RADIUS,
    chunkId: chunk.id,
  });
}

/* ===================================================================
   Update
   =================================================================== */

export function update(dt, speed) {
  const scrollDist = SCROLL_SPEED * (dt / 1000) * Math.max(speed, 0.01);

  // ── Scroll coins ───────────────────────────────────────────────
  for (const coin of coins) {
    coin.y += scrollDist;
  }

  // ── Remove coins that are off‑screen or collected ──────────────
  const keep = [];
  for (const c of coins) {
    if (c.collected) continue;
    if (c.y < -COIN_RADIUS * 4 || c.y > CANVAS_H + COIN_RADIUS * 4) continue;
    keep.push(c);
  }
  coins = keep;

  // ── Spawn new coins for fresh chunks ───────────────────────────
  const activeChunks = getChunks();
  for (const chunk of activeChunks) {
    if (spawnedChunks.has(chunk.id)) continue;
    spawnedChunks.add(chunk.id);
    if (Math.random() < SPAWN_CHANCE) {
      spawnCoin(chunk);
    }
  }

  // ── Garbage‑collect stale chunk IDs ────────────────────────────
  const activeIds = new Set(activeChunks.map(c => c.id));
  for (const id of spawnedChunks) {
    if (!activeIds.has(id)) spawnedChunks.delete(id);
  }

  // ── Update collect effects ────────────────────────────────────
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].timer -= dt;
    if (effects[i].timer <= 0) {
      effects.splice(i, 1);
    }
  }
}

/* ===================================================================
   Draw
   =================================================================== */

export function draw(alpha) {
  for (const coin of coins) {
    if (coin.collected) continue;

    // Skip coins off‑screen
    if (coin.y < -20 || coin.y > CANVAS_H + 20) continue;

    const { x, y, radius } = coin;

    // ── Glow (cached glow texture instead of shadowBlur) ────────
    ctx.save();
    drawGlow(ctx, x, y, 10);

    // ── Yellow circle ───────────────────────────────────────────
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle  = '#880';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // ── "+" glyph ────────────────────────────────────────────────
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth   = 1.5;
    const cross = radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - cross, y);
    ctx.lineTo(x + cross, y);
    ctx.moveTo(x, y - cross);
    ctx.lineTo(x, y + cross);
    ctx.stroke();

    ctx.restore();
  }
}

/* ===================================================================
   Collect‑effect rendering  (called by main.js)
   =================================================================== */

/**
 * Draw all active collect‑effect particles (coin pop + floating text).
 * @param {number} alpha — render interpolation (unused, kept for consistency)
 */
export function drawCollectibleEffects(/* alpha */) {
  for (const effect of effects) {
    const t = effect.timer / effect.maxTimer; // 1 → 0 over lifetime
    if (t <= 0) continue;

    // ── Coin pop: scale from 1.5x down to 0 ─────────────────
    const scale = 1.5 * t;
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.scale(scale, scale);

    drawGlow(ctx, 0, 0, 10);
    ctx.fillStyle   = '#ff0';
    ctx.beginPath();
    ctx.arc(0, 0, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle  = '#880';
    ctx.beginPath();
    ctx.arc(0, 0, COIN_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // "+" glyph
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth   = 1.5;
    const cross = COIN_RADIUS * 0.5;
    ctx.beginPath();
    ctx.moveTo(-cross, 0);
    ctx.lineTo(cross, 0);
    ctx.moveTo(0, -cross);
    ctx.lineTo(0, cross);
    ctx.stroke();

    ctx.restore();

    // ── Floating "+100" text that rises and fades ────────────
    const fontSize = 14 + (1 - t) * 10;       // 14 → 24 px
    const floatY   = effect.y - (1 - t) * 30; // float up 30 px
    ctx.save();
    ctx.globalAlpha = t;                      // fade out
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle   = '#ff0';
    ctx.font        = `bold ${fontSize}px Orbitron, "Courier New", monospace`;
    drawGlow(ctx, effect.x + (effect.text.length * fontSize * 0.3) / 2, floatY, 6);
    ctx.fillText(effect.text, effect.x, floatY);
    ctx.restore();
  }
}

/* ===================================================================
   Getters / manipulators  (called by collision.js)
   =================================================================== */

export function getCoins() {
  return coins;
}

export function getEffects() {
  return effects;
}

/**
 * Mark a coin at the given index as collected.
 * @param {number} index
 */
export function collectCoin(index) {
  if (index >= 0 && index < coins.length) {
    const coin = coins[index];
    if (!coin.collected) {
      // Spawn a collect effect at the coin position
      effects.push({
        x: coin.x,
        y: coin.y,
        timer: 200,
        maxTimer: 200,
        text: '+100',
      });
    }
    coin.collected = true;
  }
}
