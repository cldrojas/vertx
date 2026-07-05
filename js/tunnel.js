/**
 * VERT/X — Tunnel module.
 *
 * Manages the scrolling tunnel walls.  The tunnel is divided into tall
 * vertical chunks; each chunk has a horizontal gap whose centre position
 * shifts smoothly between consecutive chunks.
 *
 * Exports conform to the main.js import contract.
 */

/* ===================================================================
   Constants
   =================================================================== */

const CANVAS_W         = 360;
const CANVAS_H         = 640;
const WALL_WIDTH       = 50;       // minimum wall thickness from edges
const CHUNK_HEIGHT     = 800;      // height of one tunnel segment
const MIN_GAP          = 100;      // narrowest horizontal passage
const MAX_GAP          = 150;      // widest horizontal passage
const POOL_COUNT       = 6;        // pre‑allocated chunks in the ring
const SCROLL_SPEED     = 300;      // base px/s (multiplied by game speed)

/**
 * Luminosity multipliers (0–1 range recommended, >1 for overbright)
 * Adjust independently for buildings vs. neon signs/billboards.
 */
const BUILDING_LUMINOSITY     = 1.0;   // windows, AC vents, roof details, edge neons
const SIGN_LUMINOSITY         = 1.2;   // neon signs (carteles) on building faces
const GAP_NEON_LUMINOSITY     = 1.0;   // gap edge neons, corner brackets
const CENTER_TEXT_LUMINOSITY  = 1.0;   // VERT-X text in gap center

/**
 * Minimum horizontal overlap (px) between consecutive gap openings.
 * Ensures the player can always transition between chunks without
 * being caught outside the gap (phantom collision).
 */
const MIN_OVERLAP   = 36;       // minimum px of overlap between consecutive gaps (player diameter)

/* ===================================================================
   State
   =================================================================== */

let ctx;

/** @type {Chunk[]} */
let chunks = [];

/* ===================================================================
   Chunk shape
   =================================================================== */

/**
 * @typedef {Object} Chunk
 * @property {number}  id        – unique identifier
 * @property {number}  y         – top‑edge y‑coordinate (canvas space)
 * @property {number}  gapCentre – horizontal centre of the passage
 * @property {number}  gapWidth  – width of the passage
 * @property {{x:number,y:number,w:number,h:number}[]} leftWalls
 * @property {{x:number,y:number,w:number,h:number}[]} rightWalls
 * @property {{type:string,x:number,y:number,w:number,h:number,side?:string}[]} obstacles
 */

let nextId = 0;

/* ===================================================================
   Helpers
   =================================================================== */

function rect(x, y, w, h) {
  return { x, y, w, h };
}

/**
 * Generate a fresh chunk positioned so its top‑edge is at `yPos`.
 * The gap centre is constrained relative to the previous chunk (if any).
 */
function generateChunk(yPos, prevChunk) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const gapWidth = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);

    // Horizontal centre for the gap
    let gapCentre;
    const halfGap = gapWidth / 2;
    const margin  = halfGap + 6;              // keep away from canvas edges

    if (prevChunk) {
      const prevHalf  = prevChunk.gapWidth / 2;
      const prevLeft  = prevChunk.gapCentre - prevHalf;
      const prevRight = prevChunk.gapCentre + prevHalf;
      // Guarantee at least MIN_OVERLAP between consecutive gaps
      const lo = Math.max(margin, prevLeft + MIN_OVERLAP - halfGap);
      const hi = Math.min(CANVAS_W - margin, prevRight - MIN_OVERLAP + halfGap);
      if (lo >= hi) continue;   // constraints impossible — retry with different gapWidth
      gapCentre = lo + Math.random() * (hi - lo);
    } else {
      gapCentre = margin + Math.random() * (CANVAS_W - margin * 2);
    }

    const gapLeft  = gapCentre - halfGap;
    const gapRight = gapCentre + halfGap;

    const chunk = {
      id: nextId++,
      y: yPos,
      gapCentre,
      gapWidth,
      leftWalls:  [rect(0,           yPos, gapLeft,          CHUNK_HEIGHT)],
      rightWalls: [rect(gapRight,    yPos, CANVAS_W - gapRight, CHUNK_HEIGHT)],
      leftBuilding:  generateBuildingData(0, gapLeft, true),
      rightBuilding: generateBuildingData(gapRight, CANVAS_W - gapRight, false),
    };

    if (_validateChunk(chunk)) return chunk;
  }

  // Fallback — 3rd attempt exhausted: construct a chunk with MAX_GAP width
  const fw = MAX_GAP;
  const fh = fw / 2;
  const fc = prevChunk
    ? Math.max(fh + 6, Math.min(CANVAS_W - fh - 6, prevChunk.gapCentre))
    : CANVAS_W / 2;

  return {
    id: nextId++,
    y: yPos,
    gapCentre: fc,
    gapWidth: fw,
    leftWalls:  [rect(0, yPos, fc - fh, CHUNK_HEIGHT)],
    rightWalls: [rect(fc + fh, yPos, CANVAS_W - fc - fh, CHUNK_HEIGHT)],
    leftBuilding:  generateBuildingData(0, fc - fh, true),
    rightBuilding: generateBuildingData(fc + fh, CANVAS_W - fc - fh, false),
  };
}

/**
 * Reposition a chunk above the current highest chunk and re‑roll its gap.
 */
function recycleChunk(chunk) {
  const highest = chunks.reduce((a, c) => (c.y < a.y ? c : a), chunks[0]);
  // Find the next chunk in the sorted list for centre constraint
  const sorted = [...chunks].sort((a, b) => a.y - b.y);
  const idx    = sorted.indexOf(chunk);
  const next   = idx < sorted.length - 1 ? sorted[idx + 1] : sorted[0];

  const fresh = generateChunk(highest.y - CHUNK_HEIGHT, next);

  // Guarantee generated chunk passes validation before applying
  if (!_validateChunk(fresh)) {
    // Force a conservative fallback for the gap
    fresh.gapWidth = MAX_GAP;
    const halfFallback = MAX_GAP / 2;
    const fc = Math.max(halfFallback + 6, Math.min(CANVAS_W - halfFallback - 6, fresh.gapCentre));
    fresh.gapCentre = fc;
    fresh.leftWalls  = [rect(0, fresh.y, fc - halfFallback, CHUNK_HEIGHT)];
    fresh.rightWalls = [rect(fc + halfFallback, fresh.y, CANVAS_W - fc - halfFallback, CHUNK_HEIGHT)];
    fresh.leftBuilding  = generateBuildingData(0, fc - halfFallback, true);
    fresh.rightBuilding = generateBuildingData(fc + halfFallback, CANVAS_W - fc - halfFallback, false);
  }

  chunk.id         = fresh.id;
  chunk.y          = fresh.y;
  chunk.gapCentre  = fresh.gapCentre;
  chunk.gapWidth   = fresh.gapWidth;
  chunk.leftWalls  = fresh.leftWalls;
  chunk.rightWalls = fresh.rightWalls;
  chunk.leftBuilding  = fresh.leftBuilding;
  chunk.rightBuilding = fresh.rightBuilding;
}

/**
 * Validate a chunk's gap width and overlap with its neighbours.
 * Used as a safety net in the generation retry loop and recycling.
 *
 * @param {Chunk} chunk
 * @returns {boolean}  true if the chunk satisfies all constraints
 */
function _validateChunk(chunk) {
  // 1. Minimum gap width
  if (chunk.gapWidth < MIN_GAP) return false;

  // 2. Overlap with adjacent chunks in the active ring
  const sorted = [...chunks].sort((a, b) => a.y - b.y);
  const idx    = sorted.indexOf(chunk);
  if (idx === -1) return true;           // not yet in the active list

  const half  = chunk.gapWidth / 2;
  const left  = chunk.gapCentre - half;
  const right = chunk.gapCentre + half;

  // Previous chunk (above — smaller y)
  if (idx > 0) {
    const prev      = sorted[idx - 1];
    const prevHalf  = prev.gapWidth / 2;
    const prevLeft  = prev.gapCentre - prevHalf;
    const prevRight = prev.gapCentre + prevHalf;
    const overlap   = Math.min(right, prevRight) - Math.max(left, prevLeft);
    if (overlap < MIN_OVERLAP) return false;
  }

  // Next chunk (below — larger y)
  if (idx < sorted.length - 1) {
    const next      = sorted[idx + 1];
    const nextHalf  = next.gapWidth / 2;
    const nextLeft  = next.gapCentre - nextHalf;
    const nextRight = next.gapCentre + nextHalf;
    const overlap   = Math.min(right, nextRight) - Math.max(left, nextLeft);
    if (overlap < MIN_OVERLAP) return false;
  }

  return true;
}

/* ===================================================================
   Module interface
   =================================================================== */

export function init(_ctx) {
  ctx = _ctx;
  reset();
}

export function reset() {
  chunks = [];
  nextId = 0;

  // Generate initial set: one behind viewport, rest below
  let prevChunk = null;
  for (let i = 0; i < POOL_COUNT; i++) {
    const yPos = -CHUNK_HEIGHT + i * CHUNK_HEIGHT;
    const chk  = generateChunk(yPos, prevChunk);
    prevChunk = chk;
    chunks.push(chk);
  }
}

export function update(dt, speed) {
  const scrollDist = SCROLL_SPEED * (dt / 1000) * Math.max(speed, 0.01);
  if (scrollDist === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    ch.y += scrollDist;

    // Update wall rectangle positions
    for (const w of ch.leftWalls)  w.y += scrollDist;
    for (const w of ch.rightWalls) w.y += scrollDist;
  }


  // Recycle chunks from bottom to top to maintain gap constraint chain
  const toRecycle = chunks.filter(ch => ch.y > CANVAS_H);
  toRecycle.sort((a, b) => b.y - a.y);
  for (const ch of toRecycle) {
    recycleChunk(ch);
  }

}

/* ===================================================================
   Japanese Building Renderer — helper functions
   =================================================================== */

const NEON_COLORS = [
  "#ff1493", // hot pink
  "#0ff",    // cyan
  "#ffd700", // gold
  "#ff4444", // red
  "#44ff44", // green
  "#ff8800", // orange
  "#aa44ff", // purple
];

const KANJI_SIGNS = [
  "垂直", "疾走", "光速", "極限", "飛翔",
  "ネオン", "サイバー", "夜行", "電脳", "未来",
  "VERT", "SPEED", "NEON", "CYBER", "VOID"
];

const KANA_SIGNS = [
  "ビル", "タワー", "ネオン", "サイバー", "ナイト",
  "タテ", "ヨコ", "ソラ", "ユメ", "ミライ"
];

let timeOffset = 0;

function generateBuildingData(baseX, width, isLeftWall) {
  const floorRelHeight = 40 + Math.random() * 20;
  const numFloors = Math.max(3, Math.floor(CHUNK_HEIGHT / floorRelHeight));
  const actualFloorHeight = CHUNK_HEIGHT / numFloors;

  const floors = [];
  for (let f = 0; f < numFloors; f++) {
    const floorRY = f * actualFloorHeight;

    // Windows evenly spread
    const numWindows = Math.max(2, Math.min(Math.floor(width / 26), 6));
    const windowWidth = 14;
    const windowHeight = 20;
    const windowSpacing = (width - numWindows * windowWidth) / (numWindows + 1);

    const windows = [];
    for (let w = 0; w < numWindows; w++) {
      const rx = windowSpacing + w * (windowWidth + windowSpacing);
      windows.push({
        rx,
        ry: floorRY + (actualFloorHeight - windowHeight) / 2,
        w: windowWidth, h: windowHeight,
        lit: Math.random() < 0.6,
        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
        blinkPhase: Math.random() * Math.PI * 2,
      });
    }

    // Neon sign on the INNER edge (facing the gap)
    let neonSign = null;
    if (Math.random() < 0.18) {
      const signText = Math.random() < 0.6
        ? KANJI_SIGNS[Math.floor(Math.random() * KANJI_SIGNS.length)]
        : KANA_SIGNS[Math.floor(Math.random() * KANA_SIGNS.length)];
      neonSign = {
        text: signText,
        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
        rx: isLeftWall ? width - 4 : 4,
        ry: floorRY + actualFloorHeight * 0.25,
        width: Math.min(width - 8, 80),
        phase: Math.random() * Math.PI * 2,
        isKanji: /[\u4e00-\u9faf]/.test(signText),
      };
    }

    // AC unit on the OUTER edge (away from gap)
    let acUnit = null;
    if (Math.random() < 0.15) {
      acUnit = {
        rx: isLeftWall ? 2 : width - 18,
        ry: floorRY + actualFloorHeight * 0.12,
        w: 20, h: 24,
      };
    }

    floors.push({ ry: floorRY, height: actualFloorHeight, windows, neonSign, acUnit });
  }

  // Roof spires
  const roofDetails = [];
  const numSpires = Math.max(1, Math.min(Math.floor(width / 28), 4));
  for (let s = 0; s < numSpires; s++) {
    roofDetails.push({
      rx: (s + 0.5) * (width / numSpires),
      ry: 0,
      height: 8 + Math.random() * 14,
      halfWidth: 2 + Math.random() * 2,
      hasAntenna: Math.random() < 0.4,
    });
  }

  return { baseX, width, isLeftWall, floors, roofDetails };
}

function drawBuilding(ctx, building, chunkY, time) {
  const { baseX, width, isLeftWall, floors, roofDetails } = building;
  const baseY = chunkY;

  ctx.save();

  // ── Building base silhouette (dark gradient) ──────────────────────
  const baseGradient = ctx.createLinearGradient(baseX, baseY, baseX + width, baseY);
  baseGradient.addColorStop(0, "#0a0a0f");
  baseGradient.addColorStop(0.5, "#0f0f1a");
  baseGradient.addColorStop(1, "#0a0a0f");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(baseX, baseY, width, CHUNK_HEIGHT);

  // ── Draw each floor ───────────────────────────────────────────────
  for (const floor of floors) {
    const floorY = baseY + floor.ry;
    const floorH = floor.height;

    // Floor ledge / cornice
    const ledgeY = floorY + floorH;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(baseX - 1, ledgeY - 3, width + 2, 5);
    // Cyan glow top edge
    const ledgeCyanAlpha = 0.45 * BUILDING_LUMINOSITY;
    ctx.fillStyle = "rgba(0, 255, 255, " + ledgeCyanAlpha + ")";
    ctx.fillRect(baseX - 1, ledgeY - 3, width + 2, 3);
    // Hot pink accent bottom edge
    const ledgePinkAlpha = 0.2 * BUILDING_LUMINOSITY;
    ctx.fillStyle = "rgba(255, 20, 147, " + ledgePinkAlpha + ")";
    ctx.fillRect(baseX - 1, ledgeY, width + 2, 2);

    // Windows
    for (const win of floor.windows) {
      const px = baseX + win.rx;
      const py = floorY + win.ry - floor.ry;

      const blinkIntensity = (0.2 + 0.15 * Math.sin(time * 3 + win.blinkPhase)) * BUILDING_LUMINOSITY;

      // Frame
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(px - 1, py - 1, win.w + 2, win.h + 2);

      if (win.lit) {
        // Lit window with glow
        const r = parseInt(win.color.slice(1, 3), 16);
        const g = parseInt(win.color.slice(3, 5), 16);
        const b = parseInt(win.color.slice(5, 7), 16);
        ctx.shadowColor = win.color;
        ctx.shadowBlur = 3;
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + blinkIntensity + ")";
        ctx.fillRect(px, py, win.w, win.h);
        ctx.shadowBlur = 0;
        // Reflection
        ctx.fillStyle = "rgba(255,255,255," + (0.08 * blinkIntensity) + ")";
        ctx.fillRect(px + 1, py + 1, win.w - 2, 2);
      } else {
        // Dark window
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(px, py, win.w, win.h);
        const darkCyanAlpha = 0.03 * BUILDING_LUMINOSITY;
        ctx.fillStyle = "rgba(0,255,255," + darkCyanAlpha + ")";
        ctx.fillRect(px, py, win.w, win.h * 0.3);
      }
    }

    // Neon sign
    if (floor.neonSign) {
      const sign = floor.neonSign;
      const signY = floorY + sign.ry - floor.ry;
      const pulseIntensity = (0.7 + 0.3 * Math.sin(time * 4 + sign.phase)) * SIGN_LUMINOSITY;
      const glowBlur = (12 + 10 * pulseIntensity) * SIGN_LUMINOSITY;

      // Backing plate
      const plateW = Math.min(sign.width, sign.text.length * 12 + 6);
      const plateX = isLeftWall ? baseX + width - plateW - 2 : baseX + 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(plateX, signY - 2, plateW, 24);

      // Glowing text
      ctx.save();
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = glowBlur;
      ctx.fillStyle = sign.color;
      ctx.font = sign.isKanji
        ? "bold 20px \"Noto Sans JP\", \"Hiragino Kaku Gothic ProN\", sans-serif"
        : "bold 15px \"Noto Sans JP\", \"Hiragino Kaku Gothic ProN\", sans-serif";
      ctx.textAlign = isLeftWall ? "right" : "left";
      ctx.textBaseline = "top";
      ctx.globalAlpha = 0.9 * pulseIntensity;
      ctx.fillText(sign.text, isLeftWall ? baseX + width - 4 : baseX + 4, signY);
      ctx.restore();
    }

    // AC Unit / ventilation
    if (floor.acUnit) {
      const ac = floor.acUnit;
      const acY = floorY + ac.ry - floor.ry;
      const acX = baseX + ac.rx;

      // Body
      ctx.fillStyle = "#2a2a3e";
      ctx.fillRect(acX, acY, ac.w, ac.h);

      // Grill lines
      ctx.strokeStyle = "rgba(0,255,255,0.25)";
      ctx.lineWidth = 0.5;
      for (let g = 0; g < 4; g++) {
        const gy = acY + 4 + g * 4;
        ctx.beginPath();
        ctx.moveTo(acX + 2, gy);
        ctx.lineTo(acX + ac.w - 2, gy);
        ctx.stroke();
      }

      // Vent glow
      const acVentAlpha = 0.35 * BUILDING_LUMINOSITY;
      ctx.fillStyle = "rgba(255,20,147," + acVentAlpha + ")";
      ctx.fillRect(isLeftWall ? acX : acX + ac.w - 3, acY + 4, 3, ac.h - 8);

      // Ventilation duct going upward
      const acDuctAlpha = 0.15 * BUILDING_LUMINOSITY;
      ctx.strokeStyle = "rgba(0,255,255," + acDuctAlpha + ")";
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(acX + ac.w / 2, acY);
      ctx.lineTo(acX + ac.w / 2, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── Roof edge neon line ──────────────────────────────────────────
  const roofEdgeCyanAlpha = 0.5 * BUILDING_LUMINOSITY;
  ctx.fillStyle = "rgba(0, 255, 255, " + roofEdgeCyanAlpha + ")";
  ctx.fillRect(baseX - 1, baseY - 1, width + 2, 2);
  const roofEdgePinkAlpha = 0.25 * BUILDING_LUMINOSITY;
  ctx.fillStyle = "rgba(255, 20, 147, " + roofEdgePinkAlpha + ")";
  ctx.fillRect(baseX - 1, baseY + 1, width + 2, 1);

  // ── Roof details (spires, antennas) ───────────────────────────────
  for (const roof of roofDetails) {
    const roofX = baseX + roof.rx;
    const roofY = baseY + roof.ry;

    // Spire
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.moveTo(roofX - roof.halfWidth, roofY);
    ctx.lineTo(roofX, roofY - roof.height);
    ctx.lineTo(roofX + roof.halfWidth, roofY);
    ctx.closePath();
    ctx.fill();

    // Spire tip glow
    const spireGlowAlpha = 5 * BUILDING_LUMINOSITY;
    ctx.fillStyle = "#0ff";
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = spireGlowAlpha;
    ctx.beginPath();
    ctx.arc(roofX, roofY - roof.height, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Antenna with blinking light
    if (roof.hasAntenna) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(roofX, roofY - roof.height);
      ctx.lineTo(roofX, roofY - roof.height - 12);
      ctx.stroke();

      const blink = Math.sin(time * 5) > 0;
      if (blink) {
        const antennaGlowAlpha = 6 * BUILDING_LUMINOSITY;
        ctx.fillStyle = "#ff0044";
        ctx.shadowColor = "#ff0044";
        ctx.shadowBlur = antennaGlowAlpha;
        ctx.beginPath();
        ctx.arc(roofX, roofY - roof.height - 12, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  // ── Building edge neon accent (vertical strip at gap side) ───────
  const edgeX = isLeftWall ? baseX + width - 1 : baseX;
  const edgeAlpha = BUILDING_LUMINOSITY;
  const edgeGradient = ctx.createLinearGradient(edgeX, baseY, edgeX, baseY + CHUNK_HEIGHT);
  edgeGradient.addColorStop(0, "rgba(0,255,255,0)");
  edgeGradient.addColorStop(0.3, "rgba(0,255,255," + (0.35 * edgeAlpha) + ")");
  edgeGradient.addColorStop(0.7, "rgba(255,20,147," + (0.35 * edgeAlpha) + ")");
  edgeGradient.addColorStop(1, "rgba(0,255,255,0)");
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(edgeX, baseY, 2, CHUNK_HEIGHT);

  ctx.restore();
}

export function draw(alpha) {
  timeOffset += (16 * alpha) / 1000;

  const visTop    = -CHUNK_HEIGHT;
  const visBottom = CANVAS_H + CHUNK_HEIGHT;

  // PASS 1: Draw all buildings
  for (const ch of chunks) {
    if (ch.y + CHUNK_HEIGHT < visTop || ch.y > visBottom) continue;
    drawBuilding(ctx, ch.leftBuilding, ch.y, timeOffset);
    drawBuilding(ctx, ch.rightBuilding, ch.y, timeOffset);
  }

  // PASS 2: Draw all gap decorations ON TOP of buildings
  for (const ch of chunks) {
    if (ch.y + CHUNK_HEIGHT < visTop || ch.y > visBottom) continue;

    const gapL = ch.gapCentre - ch.gapWidth / 2;
    const gapR = ch.gapCentre + ch.gapWidth / 2;
    const midY = ch.y + CHUNK_HEIGHT * 0.5;
    const brk = 16;

    // Gap edge neon strips
    const gapAlpha = GAP_NEON_LUMINOSITY;
    const stripGradL = ctx.createLinearGradient(gapL, ch.y, gapL, ch.y + CHUNK_HEIGHT);
    stripGradL.addColorStop(0, "rgba(0,255,255,0)");
    stripGradL.addColorStop(0.5, "rgba(0,255,255," + (0.5 * gapAlpha) + ")");
    stripGradL.addColorStop(1, "rgba(255,20,147,0)");
    ctx.fillStyle = stripGradL;
    ctx.fillRect(gapL - 2, ch.y, 3, CHUNK_HEIGHT);

    const stripGradR = ctx.createLinearGradient(gapR, ch.y, gapR, ch.y + CHUNK_HEIGHT);
    stripGradR.addColorStop(0, "rgba(255,20,147,0)");
    stripGradR.addColorStop(0.5, "rgba(255,20,147," + (0.5 * gapAlpha) + ")");
    stripGradR.addColorStop(1, "rgba(0,255,255,0)");
    ctx.fillStyle = stripGradR;
    ctx.fillRect(gapR - 1, ch.y, 3, CHUNK_HEIGHT);

        // Corner brackets (canvas edges)
    const bracketPulse = (0.6 + 0.4 * Math.sin(timeOffset * 5)) * GAP_NEON_LUMINOSITY;
    ctx.strokeStyle = "rgba(0,255,255," + bracketPulse + ")";
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur  = 8 * bracketPulse;

    // Top-left (canvas corner)
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(0, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();

    // Top-right (canvas corner)
    ctx.beginPath();
    ctx.moveTo(CANVAS_W - 24, 0);
    ctx.lineTo(CANVAS_W, 0);
    ctx.lineTo(CANVAS_W, 24);
    ctx.stroke();

    // Bottom-left (canvas corner)
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_H - 24);
    ctx.lineTo(0, CANVAS_H);
    ctx.lineTo(24, CANVAS_H);
    ctx.stroke();

    // Bottom-right (canvas corner)
    ctx.beginPath();
    ctx.moveTo(CANVAS_W - 24, CANVAS_H);
    ctx.lineTo(CANVAS_W, CANVAS_H);
    ctx.lineTo(CANVAS_W, CANVAS_H - 24);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // VERT-X text
    ctx.save();
    const textAlpha = (0.07 * (0.5 + 0.5 * Math.sin(timeOffset * 2))) * CENTER_TEXT_LUMINOSITY;
    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = "#0ff";
    ctx.font = "bold 48px Orbitron, \"Courier New\", monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VERT-X", ch.gapCentre, midY);
    ctx.restore();
  }
}
/* ===================================================================
   Getters  (called by player.js, collision.js, collectibles.js)
   =================================================================== */

/**
 * @param {number} [playerY]  – if provided, only walls from the chunk
 *   that contains this y‑coordinate are returned (prevents phantom
 *   collisions at chunk boundaries where the adjacent chunk's walls
 *   would overlap the player clamped to the current chunk's gap).
 * @returns {{x:number,y:number,w:number,h:number}[]}
 *   Flat array of wall segments for the chunk containing playerY (or all if omitted).
 */
export function getWalls(playerY) {
  const out = [];
  for (const ch of chunks) {
    if (playerY !== undefined && (playerY < ch.y || playerY >= ch.y + CHUNK_HEIGHT)) continue;
    for (const w of ch.leftWalls)  out.push(w);
    for (const w of ch.rightWalls) out.push(w);
  }
  return out;
}

/**
 * Return the active chunks list (used by collectibles for coin spawning).
 * @returns {Chunk[]}
 */
export function getChunks() {
  return chunks;
}

/**
 * Public validation helper (used by obstacles module after spawning).
 * @param {Chunk} chunk
 * @returns {boolean}
 */
export function validateChunk(chunk) {
  return _validateChunk(chunk);
}

/**
 * Find the horizontal gap boundaries at a given canvas y‑coordinate.
 * Used by player.js for wall‑bound clamping.
 *
 * @param {number} y  – canvas y
 * @returns {{left:number, right:number}|null}
 */
export function getGapAtY(y) {
  for (const ch of chunks) {
    if (y >= ch.y && y < ch.y + CHUNK_HEIGHT) {
      const half = ch.gapWidth / 2;
      return { left: ch.gapCentre - half, right: ch.gapCentre + half };
    }
  }
  return null;
}
