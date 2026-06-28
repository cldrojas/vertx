/**
 * VERT/X — HUD module (score, lives, combo, speed indicator).
 *
 * Pure canvas text — no DOM elements.
 *
 * Exports conform to the main.js import contract.
 */

import { getBestScore } from './storage.js';

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W = 360;

const SPEED_THRESHOLDS = [1.5, 2.0, 2.5];
const FLASH_INTERVAL   = 600;   // ms for speed‑indicator flash

/* ===================================================================
   State
   =================================================================== */

let ctx;

/* ===================================================================
   Init
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
}

/* ===================================================================
   Draw
   =================================================================== */

/**
 * Render the in‑game HUD.
 *
 * @param {number} score  – current score
 * @param {number} lives  – remaining lives
 * @param {number} combo  – current combo multiplier
 */
export function drawGameHUD(score, lives, combo) {
  ctx.save();

  // ── LIVES  top‑left ────────────────────────────────────────────
  ctx.textAlign   = 'left';
  ctx.textBaseline = 'top';
  ctx.font        = '18px Orbitron, "Courier New", monospace';

  let livesStr = '';
  for (let i = 0; i < 3; i++) {
    livesStr += i < lives ? '\u2665' : '\u2661';  // ♥ full / ♡ hollow
  }

  // Active hearts
  const fullCount = Math.min(lives, 3);
  if (fullCount > 0) {
    ctx.fillStyle = '#0ff';
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur  = 6;
    ctx.fillText(livesStr.slice(0, fullCount), 12, 12);
  }
  // Dimmed hearts
  if (fullCount < 3) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.fillText(livesStr.slice(fullCount), 12 + fullCount * 14, 12);
  }

  ctx.shadowBlur = 0;

  // ── SCORE  top‑centre ──────────────────────────────────────────
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';
  ctx.font        = 'bold 22px Orbitron, "Courier New", monospace';
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#0ff';
  ctx.fillText(String(score).padStart(5, '0'), CANVAS_W / 2, 10);
  ctx.shadowBlur = 0;

  // ── BEST  top‑right ────────────────────────────────────────────
  const best = getBestScore();
  if (best > 0) {
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'top';
    ctx.font        = '11px Orbitron, "Courier New", monospace';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 4;
    ctx.fillStyle   = '#ffd700';
    ctx.fillText(`BEST ${String(best).padStart(5, '0')}`, CANVAS_W - 12, 14);
    ctx.shadowBlur = 0;
  }

  // ── COMBO  below score ─────────────────────────────────────────
  if (combo > 1) {
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.font        = 'bold 14px Orbitron, "Courier New", monospace';
    ctx.shadowColor = '#ff0';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#ff0';
    ctx.fillText(`\u00d7${combo} COMBO`, CANVAS_W / 2, 38);
    ctx.shadowBlur = 0;
  }

  // ── SPEED indicator  right side ────────────────────────────────
  const currentSpeed = getSpeed();   // read from internal tracker
  let showSpeed      = false;
  let thresholdMet   = -1;

  for (let i = SPEED_THRESHOLDS.length - 1; i >= 0; i--) {
    if (currentSpeed >= SPEED_THRESHOLDS[i]) {
      thresholdMet = i;
      break;
    }
  }

  if (thresholdMet >= 0) {
    // Flash the indicator
    const flashOn = Math.floor(performance.now() / FLASH_INTERVAL) % 2 === 0;
    showSpeed = flashOn;

    if (showSpeed) {
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font         = 'bold 12px Orbitron, "Courier New", monospace';
      ctx.shadowColor  = '#ff0';
      ctx.shadowBlur   = 6;
      ctx.fillStyle    = '#ff0';

      let label;
      if (currentSpeed >= 2.5)       label = 'SPEED +++';
      else if (currentSpeed >= 2.0)  label = 'SPEED ++';
      else                           label = 'SPEED +';

      ctx.fillText(label, CANVAS_W - 12, 60);
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
}

/* ===================================================================
   Speed tracking
   =================================================================== */

/**
 * The HUD needs to draw a speed indicator.  main.js doesn't pass the
 * speed directly, but we can track it via the public draw call.
 *
 * We stash the speed value every time drawGameHUD is called.
 * @type {number}
 */
let lastSpeed = 1.0;

/**
 * Overwrite the stored speed (called from main.js before draw).
 * Exported so main.js can feed the current speed in.
 * @param {number} s
 */
export function setSpeed(s) {
  lastSpeed = s;
}

function getSpeed() {
  return lastSpeed;
}
