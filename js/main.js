/**
 * VERT/X — Main orchestrator.
 *
 * Owns the game loop (fixed‑timestep 60 fps), state machine, canvas setup,
 * responsive scaling, and top‑level update/render dispatch.
 *
 * Phase 3+ will wire in real implementations for the stub modules imported
 * below (player, tunnel, collectibles, collision, hud).
 */

import { getBestScore, setBestScore } from './storage.js';
import { ACTION_TAP, init as initInput, dequeueAction } from './input.js';

// Phase 3+ — real implementations replace these stub modules
import { init as initPlayer, update as updatePlayer,
         draw as drawPlayer,   reset as resetPlayer,
         getPosition as getPlayerPosition,
         getBounds as getPlayerBounds,
         isInvulnerable as playerIsInvulnerable } from './player.js';
import { init as initTunnel, update as updateTunnel,
         draw as drawTunnel,  reset as resetTunnel,
         getWalls as tunnelGetWalls } from './tunnel.js';
import { init as initCollectibles, update as updateCollectibles,
         draw as drawCollectibles, reset as resetCollectibles,
         getCoins as collectiblesGetCoins,
         drawCollectibleEffects } from './collectibles.js';
import { init as initObstacles, update as updateObstacles,
         draw as drawObstacles, reset as resetObstacles,
         getObstacles } from './obstacles.js';
import { init as initCollision, check as checkCollisions,
         reset as resetCollision } from './collision.js';
import { init as initHUD, drawGameHUD, setSpeed as hudSetSpeed } from './hud.js';
import { initGlowCache } from './glow.js';

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W = 360;
const CANVAS_H = 640;
const FIXED_DT  = 1000 / 60;           // 16.666… ms

const STATE = {
  MENU:      'MENU',
  PLAYING:   'PLAYING',
  GAME_OVER: 'GAME_OVER',
};

/* ===================================================================
   State
   =================================================================== */

/** @type {keyof STATE} */
let gameState = STATE.MENU;

/** @type {HTMLCanvasElement} */
let canvas;
/** @type {CanvasRenderingContext2D} */
let ctx;

// ── Game‑state variables ──────────────────────────────────────────────
let score       = 0;
let bestScore   = 0;
let lives       = 3;
let combo       = 1;      // score multiplier
let lastCoinTime = 0;     // timestamp of most‑recent coin collected
let speed       = 1.0;    // base speed multiplier; ramps over time

// ── Debug ──────────────────────────────────────────────────────────────
let debugPause = false;   // freeze frame on collision for inspection

// ── Loop timing ───────────────────────────────────────────────────────
let lastTime    = 0;
let accumulator = 0;

// ── Assets ─────────────────────────────────────────────────────────────
let loadScreenImg = null;

/* ===================================================================
   Game loop  (fixed‑timestep with accumulator)
   =================================================================== */

/**
 * @param {DOMHighResTimeStamp} timestamp  rAF timestamp
 */
function gameLoop(timestamp) {
  let delta = timestamp - lastTime;
  lastTime = timestamp;

  // Cap delta to avoid spiral‑of‑death after tab‑switch
  delta = Math.min(delta, 50);

  accumulator += delta;
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT;
  render(alpha);

  requestAnimationFrame(gameLoop);
}

/* ===================================================================
   update  —  one fixed‑timestep tick
   =================================================================== */

function update(dt) {
  switch (gameState) {
    /* ── MENU ──────────────────────────────────────────────────────── */
    case STATE.MENU:
      if (dequeueAction() === ACTION_TAP) {
        resetGame();
        gameState = STATE.PLAYING;
      }
      break;

    /* ── PLAYING ────────────────────────────────────────────────────── */
    case STATE.PLAYING:
      // Debug pause: freeze on collision, tap to resume
      if (debugPause) {
        if (dequeueAction() === ACTION_TAP) {
          debugPause = false;
        }
        break;  // skip all updates while paused
      }

      updatePlayer(dt, speed);
      updateTunnel(dt, speed);
      updateCollectibles(dt, speed);
      updateObstacles(dt, speed);

      // ── Collision detection ──────────────────────────────────────
      {
        const pBounds = getPlayerBounds();
        const playerState = {
          x: pBounds.x,
          y: pBounds.y,
          radius: pBounds.radius,
          isInvulnerable: playerIsInvulnerable(),
        };
        const walls = tunnelGetWalls(pBounds.y);
        const coins = collectiblesGetCoins();
        const obstacles = getObstacles();
        const result = checkCollisions(playerState, walls, obstacles, coins, {
          lives, score, combo, speed, lastCoinTime,
        });

        if (result.wallHit || result.obstacleHit) {
          debugPause = true;
          lives = result.isNewLives;
        }
        if (result.coinCollected) {
          score = result.isNewScore;
          combo = result.isNewCombo;
          lastCoinTime = performance.now();
        }
        // Combo timeout: reset after 1s without collecting
        if (combo > 1 && performance.now() - lastCoinTime > 1000) {
          combo = 1;
        }
        speed = result.isSpeed;
      }

      // ── Auto‑score — points tick up even without coins ─────────
      score += 1;

      if (lives <= 0) {
        // Persist new best score
        if (score > bestScore) {
          bestScore = score;
          setBestScore(bestScore);
        }
        gameState = STATE.GAME_OVER;
      }
      break;

    /* ── GAME_OVER ──────────────────────────────────────────────────── */
    case STATE.GAME_OVER:
      if (dequeueAction() === ACTION_TAP) {
        gameState = STATE.MENU;
      }
      break;
  }
}

/* ===================================================================
   render  —  interpolate between fixed ticks with `alpha` [0‑1]
   =================================================================== */

function render(alpha) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  switch (gameState) {
    case STATE.MENU:
      drawMenu();
      break;

    case STATE.PLAYING:
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawTunnel(alpha);
      drawCollectibles(alpha);
      drawObstacles(alpha);
      drawCollectibleEffects(alpha);
      drawPlayer(alpha);
      hudSetSpeed(speed);
      drawGameHUD(score, lives, combo);

      // Debug pause overlay
      if (debugPause) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.08)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 20px Orbitron, "Courier New", monospace';
        ctx.fillText('⏸ COLISION', CANVAS_W / 2, 60);
        ctx.font = '12px Orbitron, "Courier New", monospace';
        ctx.fillText('toca para continuar', CANVAS_W / 2, 90);
        ctx.restore();
      }
      break;

    case STATE.GAME_OVER:
      drawGameOverScreen();
      break;
  }
}

/* ===================================================================
   Draw helpers  —  MENU & GAME_OVER screens
   =================================================================== */

/**
 * Faint neon grid used as background on menu and game‑over screens.
 */
function drawGrid() {
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.06)';
  ctx.lineWidth   = 1;

  const step = 20;
  for (let x = 0; x <= CANVAS_W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, CANVAS_H);
    ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CANVAS_W, y + 0.5);
    ctx.stroke();
  }
}

/**
 * Title / start screen.
 */
function drawMenu() {
  drawGrid();

  // ── game title ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow layer
  ctx.shadowColor   = '#0ff';
  ctx.shadowBlur    = 20;
  ctx.fillStyle     = '#0ff';
  ctx.font          = 'bold 52px Orbitron, "Courier New", monospace';
  ctx.fillText('VERT/X', CANVAS_W / 2, 180);
  ctx.shadowBlur = 0;

  // Sub‑title accent
  ctx.fillStyle = '#f0f';
  ctx.font      = '16px Orbitron, "Courier New", monospace';
  ctx.fillText('TUNNEL DIVER', CANVAS_W / 2, 230);

  // ── pulsing prompt ──
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#0ff';
  ctx.font = '20px Orbitron, "Courier New", monospace';
  ctx.fillText('TAP TO START', CANVAS_W / 2, 360);
  ctx.restore();

  // ── best score ──
  if (bestScore > 0) {
    ctx.fillStyle = '#ffd700';
    ctx.font      = '16px Orbitron, "Courier New", monospace';
    ctx.fillText(`BEST  ${String(bestScore).padStart(6, '0')}`, CANVAS_W / 2, 420);
  }
}

/**
 * Game‑over overlay.
 */
function drawGameOverScreen() {
  // Draw loadscreen.png as background (covers full canvas)
  if (loadScreenImg && loadScreenImg.complete && loadScreenImg.naturalWidth > 0) {
    ctx.drawImage(loadScreenImg, 0, 0, CANVAS_W, CANVAS_H);
    // Darken overlay for text readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  } else {
    // Fallback: original grid background
    drawGrid();
  }

  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';

  // ── GAME OVER ──
  ctx.shadowColor = '#ff1493';
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = '#ff1493';
  ctx.font        = 'bold 40px Orbitron, "Courier New", monospace';
  ctx.fillText('GAME OVER', CANVAS_W / 2, 180);
  ctx.shadowBlur = 0;

  // ── score ──
  ctx.fillStyle = '#fff';
  ctx.font      = '26px Orbitron, "Courier New", monospace';
  ctx.fillText(`SCORE  ${String(score).padStart(6, '0')}`, CANVAS_W / 2, 270);

  // ── best ──
  ctx.fillStyle = '#ffd700';
  ctx.font      = '18px Orbitron, "Courier New", monospace';
  ctx.fillText(`BEST   ${String(bestScore).padStart(6, '0')}`, CANVAS_W / 2, 320);

  // ── new best badge ──
  if (score > 0 && score >= bestScore) {
    ctx.fillStyle = '#ff0';
    ctx.font      = '14px Orbitron, "Courier New", monospace';
    ctx.fillText('★ NEW BEST ★', CANVAS_W / 2, 360);
  }

  // ── retry prompt ──
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#0ff';
  ctx.font      = '18px Orbitron, "Courier New", monospace';
  ctx.fillText('TAP TO RETRY', CANVAS_W / 2, 440);
  ctx.restore();
}

/* ===================================================================
   Helpers
   =================================================================== */

/**
 * Reset game state for a fresh run.
 */
function resetGame() {
  score         = 0;
  lives         = 3;
  combo         = 1;
  lastCoinTime  = 0;
  speed         = 1.0;
  debugPause    = false;

  resetPlayer();
  resetTunnel();
  resetCollectibles();
  resetObstacles();
  resetCollision();
}

/**
 * Scale the canvas CSS size to fill its container while maintaining
 * the logical pixel dimensions (so drawing code always works at 360×640).
 */
function resizeCanvas() {
  const container = document.getElementById('gameContainer');
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ===================================================================
   Init  —  wire everything up and start the loop
   =================================================================== */

function init() {
  canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('[VERT/X] <canvas id="gameCanvas"> not found.');
    return;
  }

  ctx = canvas.getContext('2d');

  // Logical resolution (drawing always uses these dimensions)
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;

  // Read persisted best score
  bestScore = getBestScore();

  // Preload Game Over background image
  loadScreenImg = new Image();
  loadScreenImg.src = '/loadingscreen.jpeg';
  loadScreenImg.onload = () => console.log('[VERT/X] loadingscreen.jpeg loaded');
  loadScreenImg.onerror = () => console.warn('[VERT/X] loadingscreen.jpeg not found at /loadingscreen.jpeg');

  // Pre‑render glow cache (replaces expensive shadowBlur)
  initGlowCache();

  // Wire modules
  initInput(canvas);
  initPlayer(ctx);
  initTunnel(ctx);
  initCollectibles(ctx);
  initObstacles(ctx);
  initCollision();
  initHUD(ctx);

  // Responsive CSS scaling
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Boot the loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ── Auto‑start ──────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
