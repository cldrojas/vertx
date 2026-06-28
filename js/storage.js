/**
 * VERT/X — localStorage persistence wrapper.
 *
 * Provides safe read/write access to the high score, degrading gracefully
 * when localStorage is unavailable (private browsing, sandboxed iframes).
 *
 * Storage key: "vertx_best"
 */

const STORAGE_KEY = 'vertx_best';

/**
 * Read the best score from localStorage.
 *
 * @returns {number} The stored best score, or 0 if none exists or
 *                   localStorage is unavailable.
 */
export function getBestScore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    // localStorage blocked or unavailable — degrade silently
    return 0;
  }
}

/**
 * Persist a new best score to localStorage.
 *
 * @param {number} score - The score to store (must be non-negative integer).
 */
export function setBestScore(score) {
  try {
    const value = String(Math.floor(Math.max(0, score)));
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage blocked or unavailable — degrade silently
  }
}
