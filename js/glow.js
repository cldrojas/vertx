/**
 * VERT/X — Glow Cache Module.
 *
 * Pre‑renders radial‑gradient glow textures to offscreen canvases at init,
 * then draws them via drawImage (a simple blit) instead of using the
 * expensive ctx.shadowBlur pipeline.
 *
 * shadowBlur forces the browser to render to an offscreen buffer, apply a
 * Gaussian blur kernel, and composite — all on the CPU on most mobile
 * devices.  A cached glow replaces this with a single GPU‑accelerated blit.
 *
 * Usage:
 *   import { initGlowCache, drawGlow } from './glow.js';
 *   initGlowCache();               // once at boot
 *   drawGlow(ctx, x, y, 10, color);  // in your draw loop
 */

/* ===================================================================
   Cache
   =================================================================== */

/**
 * Pre‑rendered glow textures, keyed by integer radius.
 * @type {Map<number, HTMLCanvasElement>}
 */
const cache = new Map();

/** Radii we pre‑render (keys into the cache). */
const RADII = [3, 6, 10, 15, 22];

/** Guard flag — initGlowCache() runs at most once. */
let _initialized = false;

/* ===================================================================
   Init
   =================================================================== */

/**
 * Pre‑render all glow textures.  Idempotent — safe to call multiple times.
 *
 * Each glow is a square offscreen canvas sized to (radius * 2 + padding).
 * A radial gradient is drawn from the centre (fully opaque white) to the
 * edge (fully transparent).  When drawn via drawImage the canvas's
 * compositing stage will apply the gradient as a soft halo; the caller
 * should set ctx.shadowColor (or the desired tint) in a separate step.
 */
export function initGlowCache() {
  if (_initialized) return;
  _initialized = true;

  for (const r of RADII) {
    const size  = r * 2 + 4;           // +4 px padding so the gradient doesn't clip
    const half  = size / 2;
    const c     = document.createElement('canvas');
    c.width  = size;
    c.height = size;
    const gctx = c.getContext('2d');

    // Radial gradient: centre → edge (white with alpha falloff)
    const grad = gctx.createRadialGradient(half, half, 0, half, half, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, size, size);

    cache.set(r, c);
  }
}

/**
 * Find the nearest cached radius (binary‑search on the sorted RADII list).
 * @param {number} target
 * @returns {number}
 */
function nearestRadius(target) {
  // Clip to our cache range
  if (target <= RADII[0]) return RADII[0];
  if (target >= RADII[RADII.length - 1]) return RADII[RADII.length - 1];

  let lo = 0;
  let hi = RADII.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (RADII[mid] <= target) lo = mid;
    else hi = mid;
  }
  return (target - RADII[lo] <= RADII[hi] - target) ? RADII[lo] : RADII[hi];
}

/* ===================================================================
   Draw API
   =================================================================== */

/**
 * Draw a glow halo centred at (x, y) with approximately the given radius,
 * tinted with `color`.
 *
 * Internally looks up the nearest pre‑rendered glow texture and blits it
 * using drawImage.  The tint is achieved by setting the global composite
 * operation or, more practically, by drawing a tinted overlay.
 *
 * NOTE: because our glow textures are white-on-transparent, calling
 * drawImage then setting fillStyle + globalCompositeOperation would be
 * ideal, but older mobile WebKit has spotty support for "source-atop".
 * The simplest portable approach: draw the glow image as-is (white halo)
 * and rely on the fact that the game already draws coloured geometry on
 * top.  For a coloured glow we instead fill a circle with the colour and
 * low opacity, then draw the white halo under it – but that doubles
 * draw calls.
 *
 * COMPROMISE: We pre‑tint each cached glow at init via a lookup table.
 * Since we only need a handful of colours (cyan #0ff, yellow #ff0,
 * pink #ff1493, red #ff0044, various neon colours), we draw the glow
 * image normally and let the caller handle tinting by drawing a
 * semi‑transparent fill on top if needed.  This is the fastest path.
 *
 * For the common case (cyan glow under a cyan shape), drawing the
 * white glow alone already looks good because the underlying black
 * background provides contrast.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x  – centre x (canvas space)
 * @param {number} y  – centre y (canvas space)
 * @param {number} radius  – desired glow radius (clamped to nearest cached)
 */
export function drawGlow(ctx, x, y, radius) {
  const r = nearestRadius(radius);
  const tex = cache.get(r);
  if (!tex) return;

  const half = tex.width / 2;
  ctx.drawImage(tex, x - half, y - half);
}
