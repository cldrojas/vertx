/**
 * VERT/X — Input module.
 *
 * Action‑queue pattern. Each frame the game loop calls `dequeueAction()`
 * exactly once, consuming one queued tap. Multiple rapid inputs within the
 * same frame collapse to a single action.
 *
 * Events:
 *   - pointerdown on canvas (passive:true – no preventDefault needed)
 *   - keydown on document  (Space / ArrowUp; Space prevented to avoid scroll)
 */

export const ACTION_TAP = 'TAP';

// Logical canvas dimensions (must match main.js CANVAS_W / CANVAS_H)
const CANVAS_W = 360;
const CANVAS_H = 640;

/**
 * @typedef {{ type: string, x?: number, y?: number }} Action
 */

/** @type {Action[]} First‑in‑first‑out queue of action objects. */
let actionQueue = [];

/**
 * Bind input listeners to the given canvas element.
 * Safe to call multiple times — each call rebinds fresh listeners.
 *
 * @param {HTMLCanvasElement} canvas
 */
export function init(canvas) {
  // Flush any stale actions from a previous session
  actionQueue = [];

  // ── Pointer ─────────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    // Scale to logical coordinates (360×640), not physical pixels
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    actionQueue.push({ type: ACTION_TAP, x, y });
  }, { passive: true });

  // ── Keyboard ────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Space' || e.key === 'ArrowUp') {
      // Prevent Space from scrolling the page
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
      }
      actionQueue.push({ type: ACTION_TAP });
    }
  });
}

/**
 * Consume one action from the queue, returning the first waiting action
 * or `null` when the queue is empty.
 *
 * Call this ONCE per fixed‑timestep tick so that rapid taps within a
 * single frame only produce one action.
 *
 * @returns {Action|null}
 */
export function dequeueAction() {
  return actionQueue.shift() ?? null;
}
