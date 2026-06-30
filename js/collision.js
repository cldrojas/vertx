/**
 * VERT/X — Collision detection module.
 *
 * Detects wall hits and coin pick‑ups each tick, mutates the player
 * state (invulnerability / lives) via player.onHit(), and returns an
 * updated game‑state snapshot to the caller.
 *
 * Exports conform to the main.js import contract.
 */

import { onHit as playerOnHit } from './player.js';
import { collectCoin } from './collectibles.js';

/* ===================================================================
   Constants
   =================================================================== */

const COIN_RADIUS  = 6;
const COIN_SCORE   = 100;

/* ===================================================================
   Init / Reset  (no persistent state needed)
   =================================================================== */

export function init() {}

export function reset() {}

/* ===================================================================
   Collision check
   =================================================================== */

/**
 * @typedef {Object} PlayerState
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {boolean} isInvulnerable
 *
 * @typedef {Object} WallRect
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 *
 * @typedef {Object} CoinState
 * @property {number} x
 * @property {number} y
 * @property {boolean} collected
 * @property {number} radius
 *
 * @typedef {Object} GameState
 * @property {number} lives
 * @property {number} score
 * @property {number} combo
 * @property {number} speed
 *
 * @typedef {Object} CollisionResult
 * @property {boolean} wallHit
 * @property {boolean} obstacleHit
 * @property {boolean} coinCollected
 * @property {number}  coinCollectedIndex
 * @property {number}  isNewLives
 * @property {number}  isNewScore
 * @property {number}  isNewCombo
 * @property {number}  isSpeed
 */

/**
 * Run one frame of collision detection.
 *
 * @param {PlayerState} playerState
 * @param {WallRect[]}  walls
 * @param {Object[]}    obstacles
 * @param {CoinState[]} coins
 * @param {GameState}   gameState
 * @returns {CollisionResult}
 */
export function check(playerState, walls, obstacles, coins, gameState) {
  const result = {
    wallHit: false,
    obstacleHit: false,
    coinCollected: false,
    coinCollectedIndex: -1,
    isNewLives: gameState.lives,
    isNewScore: gameState.score,
    isNewCombo: gameState.combo,
    isSpeed: gameState.speed,
  };

  // ── Player bounding box (AABB) ─────────────────────────────────
  const pr = {
    x: playerState.x - playerState.radius,
    y: playerState.y - playerState.radius,
    w: playerState.radius * 2,
    h: playerState.radius * 2,
  };

  // ── Wall collision ─────────────────────────────────────────────
  if (!playerState.isInvulnerable && gameState.lives > 0) {
    for (const wall of walls) {
      if (aabbOverlap(pr, wall)) {
        result.wallHit = true;
        playerOnHit();                            // sets invulnTimer, decrements lives
        result.isNewLives = Math.max(0, gameState.lives - 1);
        break;
      }
    }
  }

  // ── Obstacle collision (AABB) ──────────────────────────────────
  if (!playerState.isInvulnerable && gameState.lives > 0) {
    for (const obs of obstacles) {
      if (aabbOverlap(pr, obs)) {
        result.obstacleHit = true;
        playerOnHit();
        result.isNewLives = Math.max(0, gameState.lives - 1);
        break;
      }
    }
  }

  // ── Coin collision ─────────────────────────────────────────────
  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    if (coin.collected) continue;

    const dx = playerState.x - coin.x;
    const dy = playerState.y - coin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < playerState.radius + COIN_RADIUS) {
      result.coinCollected = true;
      result.coinCollectedIndex = i;
      result.isNewScore = gameState.score + COIN_SCORE * gameState.combo;
      result.isNewCombo = gameState.combo + 1;
      collectCoin(i);
      break;
    }
  }

  // ── Speed ramp ─────────────────────────────────────────────────
  result.isSpeed = Math.min(3.0, gameState.speed + 0.001);

  return result;
}

/* ===================================================================
   Internal helpers
   =================================================================== */

/**
 * AABB overlap test.
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 * @returns {boolean}
 */
function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
