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

const CANVAS_W      = 360;
const CANVAS_H      = 640;
const WALL_WIDTH    = 50;       // minimum wall thickness from edges
const CHUNK_HEIGHT  = 800;      // height of one tunnel segment
const MIN_GAP       = 75;       // narrowest horizontal passage
const MAX_GAP       = 150;      // widest horizontal passage
const POOL_COUNT    = 6;        // pre‑allocated chunks in the ring
const SCROLL_SPEED  = 300;      // base px/s (multiplied by game speed)

/**
 * Minimum horizontal overlap (px) between consecutive gap openings.
 * Ensures the player can always transition between chunks without
 * being caught outside the gap (phantom collision).
 */
const MIN_OVERLAP   = 10;       // minimum px of overlap between consecutive gaps (player diameter)

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
    gapCentre = lo + Math.random() * (hi - lo);
  } else {
    gapCentre = margin + Math.random() * (CANVAS_W - margin * 2);
  }

  const gapLeft  = gapCentre - halfGap;
  const gapRight = gapCentre + halfGap;

  return {
    id: nextId++,
    y: yPos,
    gapCentre,
    gapWidth,
    leftWalls:  [rect(0,           yPos, gapLeft,          CHUNK_HEIGHT)],
    rightWalls: [rect(gapRight,    yPos, CANVAS_W - gapRight, CHUNK_HEIGHT)],
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
  chunk.id         = fresh.id;
  chunk.y          = fresh.y;
  chunk.gapCentre  = fresh.gapCentre;
  chunk.gapWidth   = fresh.gapWidth;
  chunk.leftWalls  = fresh.leftWalls;
  chunk.rightWalls = fresh.rightWalls;
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


  // Recycle chunks that have scrolled past the bottom of the viewport
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].y > CANVAS_H) {
      recycleChunk(chunks[i]);
    }
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

// Parallax configuration
const PARALLAX_WINDOW_FACTOR = 0.85;  // Windows move 85% of building speed
const PARALLAX_SIGN_FACTOR = 0.72;    // Neon signs move 72% of building speed
const PARALLAX_AC_FACTOR = 0.88;      // AC units move 88% of building speed

let buildingCache = new Map();
let timeOffset = 0;

function getBuildingKey(chunk, isLeft) {
  return chunk.id + "-" + (isLeft ? "L" : "R");
}

function generateBuildingGeometry(wall, chunk) {
  const isLeftWall = wall.x === 0;
  const key = getBuildingKey(chunk, isLeftWall);
  if (buildingCache.has(key)) {
    return buildingCache.get(key);
  }

  const width = wall.w;
  const height = wall.h;
  const baseX = wall.x;

  // Building structure — all y-positions stored RELATIVE to building top (0)
  const floorRelHeight = 40 + Math.random() * 20; // 40-60px per floor
  const numFloors = Math.max(3, Math.floor(height / floorRelHeight));
  const actualFloorHeight = height / numFloors;

  const floors = [];
  for (let f = 0; f < numFloors; f++) {
    const floorRY = f * actualFloorHeight;

    // Windows — spread evenly across building width
    const numWindows = Math.max(2, Math.min(Math.floor(width / 22), 6));
    const windowWidth = 10;
    const windowHeight = 16;
    const windowSpacing = (width - numWindows * windowWidth) / (numWindows + 1);

    const windows = [];
    for (let w = 0; w < numWindows; w++) {
      // Same formula for both walls: position from left edge going right
      const rx = windowSpacing + w * (windowWidth + windowSpacing);
      windows.push({
        rx,
        ry: floorRY + (actualFloorHeight - windowHeight) / 2,
        w: windowWidth,
        h: windowHeight,
        lit: Math.random() < 0.6,
        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
        blinkPhase: Math.random() * Math.PI * 2,
      });
    }

    // Neon sign — on the INNER edge (facing the gap)
    let neonSign = null;
    if (Math.random() < 0.18) {
      const signText = Math.random() < 0.6
        ? KANJI_SIGNS[Math.floor(Math.random() * KANJI_SIGNS.length)]
        : KANA_SIGNS[Math.floor(Math.random() * KANA_SIGNS.length)];
      neonSign = {
        text: signText,
        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
        rx: isLeftWall ? width - 4 : 4, // inner edge
        ry: floorRY + actualFloorHeight * 0.25,
        width: Math.min(width - 8, 80),
        phase: Math.random() * Math.PI * 2,
        isKanji: /[\u4e00-\u9faf]/.test(signText),
      };
    }

    // AC Unit / ventilation — on the OUTER edge (away from gap)
    let acUnit = null;
    if (Math.random() < 0.15) {
      acUnit = {
        rx: isLeftWall ? 2 : width - 18, // outer edge
        ry: floorRY + actualFloorHeight * 0.12,
        w: 16,
        h: 20,
      };
    }

    floors.push({
      ry: floorRY,
      height: actualFloorHeight,
      windows,
      neonSign,
      acUnit,
    });
  }

  // Roof details — spires/antennas
  const roofDetails = [];
  if (numFloors > 0) {
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
  }

  const building = {
    baseX,
    generationChunkY: chunk.y,
    width,
    height,
    isLeftWall,
    floors,
    roofDetails,
  };

  buildingCache.set(key, building);
  return building;
}

function drawBuilding(ctx, building, chunkY, time) {
  const { baseX, generationChunkY, width, height, isLeftWall, floors, roofDetails } = building;
  const baseY = chunkY;
  const scrollSinceGen = chunkY - generationChunkY; // for parallax: how far we have scrolled since this building was generated

  ctx.save();

  // ── Building base silhouette (dark gradient) ──────────────────────
  const baseGradient = ctx.createLinearGradient(baseX, baseY, baseX + width, baseY);
  baseGradient.addColorStop(0, "#0a0a0f");
  baseGradient.addColorStop(0.5, "#0f0f1a");
  baseGradient.addColorStop(1, "#0a0a0f");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(baseX, baseY, width, height);

  // ── Draw each floor ───────────────────────────────────────────────
  for (const floor of floors) {
    const floorY = baseY + floor.ry;
    const floorH = floor.height;

    // Floor ledge
    const ledgeY = floorY + floorH;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(baseX - 1, ledgeY - 2, width + 2, 3);
    ctx.fillStyle = "rgba(0, 255, 255, 0.12)";
    ctx.fillRect(baseX - 1, ledgeY - 2, width + 2, 1);

    // Windows — with PARALLAX (move slower than building)
    for (const win of floor.windows) {
      const winParallaxY = floorY + (win.ry - floor.ry) + scrollSinceGen * (1 - PARALLAX_WINDOW_FACTOR);
      const px = baseX + win.rx;
      const py = winParallaxY;

      const blinkIntensity = 0.7 + 0.3 * Math.sin(time * 3 + win.blinkPhase);

      // Frame
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(px - 1, py - 1, win.w + 2, win.h + 2);

      if (win.lit) {
        // Lit window with glow
        const r = parseInt(win.color.slice(1, 3), 16);
        const g = parseInt(win.color.slice(3, 5), 16);
        const b = parseInt(win.color.slice(5, 7), 16);
        ctx.shadowColor = win.color;
        ctx.shadowBlur = 6;
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
        ctx.fillStyle = "rgba(0,255,255,0.03)";
        ctx.fillRect(px, py, win.w, win.h * 0.3);
      }
    }

    // Neon sign — with PARALLAX (moves even slower)
    if (floor.neonSign) {
      const sign = floor.neonSign;
      const signParallaxY = floorY + (sign.ry - floor.ry) + scrollSinceGen * (1 - PARALLAX_SIGN_FACTOR);
      const pulseIntensity = 0.7 + 0.3 * Math.sin(time * 4 + sign.phase);
      const glowBlur = 12 + 10 * pulseIntensity;

      // Backing plate
      const plateW = Math.min(sign.width, sign.text.length * 12 + 6);
      const plateX = isLeftWall ? baseX + width - plateW - 2 : baseX + 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(plateX, signParallaxY - 2, plateW, 24);

      // Glowing text
      ctx.save();
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = glowBlur;
      ctx.fillStyle = sign.color;
      ctx.font = sign.isKanji
        ? "bold 18px \"Noto Sans JP\", \"Hiragino Kaku Gothic ProN\", sans-serif"
        : "bold 13px \"Noto Sans JP\", \"Hiragino Kaku Gothic ProN\", sans-serif";
      ctx.textAlign = isLeftWall ? "right" : "left";
      ctx.textBaseline = "top";
      ctx.globalAlpha = 0.9 * pulseIntensity;
      ctx.fillText(sign.text, isLeftWall ? baseX + width - 4 : baseX + 4, signParallaxY);
      ctx.restore();
    }

    // AC Unit / ventilation — with PARALLAX
    if (floor.acUnit) {
      const ac = floor.acUnit;
      const acParallaxY = floorY + (ac.ry - floor.ry) + scrollSinceGen * (1 - PARALLAX_AC_FACTOR);
      const acX = baseX + ac.rx;

      // Body
      ctx.fillStyle = "#2a2a3e";
      ctx.fillRect(acX, acParallaxY, ac.w, ac.h);

      // Grill lines
      ctx.strokeStyle = "rgba(0,255,255,0.25)";
      ctx.lineWidth = 0.5;
      for (let g = 0; g < 4; g++) {
        const gy = acParallaxY + 4 + g * 4;
        ctx.beginPath();
        ctx.moveTo(acX + 2, gy);
        ctx.lineTo(acX + ac.w - 2, gy);
        ctx.stroke();
      }

      // Vent glow
      ctx.fillStyle = "rgba(255,20,147,0.35)";
      ctx.fillRect(isLeftWall ? acX : acX + ac.w - 3, acParallaxY + 4, 3, ac.h - 8);

      // Ventilation duct going upward
      ctx.strokeStyle = "rgba(0,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(acX + ac.w / 2, acParallaxY);
      ctx.lineTo(acX + ac.w / 2, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

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
    ctx.fillStyle = "#0ff";
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = 5;
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
        ctx.fillStyle = "#ff0044";
        ctx.shadowColor = "#ff0044";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(roofX, roofY - roof.height - 12, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  // ── Building edge neon accent (vertical strip at gap side) ───────
  const edgeX = isLeftWall ? baseX + width - 1 : baseX;
  const edgeGradient = ctx.createLinearGradient(edgeX, baseY, edgeX, baseY + height);
  edgeGradient.addColorStop(0, "rgba(0,255,255,0)");
  edgeGradient.addColorStop(0.3, "rgba(0,255,255,0.35)");
  edgeGradient.addColorStop(0.7, "rgba(255,20,147,0.35)");
  edgeGradient.addColorStop(1, "rgba(0,255,255,0)");
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(edgeX, baseY, 2, height);

  ctx.restore();
}

export function draw(alpha) {
  // Use real elapsed time for animations
  timeOffset += (16 * alpha) / 1000; // approximate seconds

  // Only draw chunks that overlap the viewport
  const visTop    = -CHUNK_HEIGHT;
  const visBottom = CANVAS_H + CHUNK_HEIGHT;

  for (const ch of chunks) {
    if (ch.y + CHUNK_HEIGHT < visTop || ch.y > visBottom) continue;

    // ── Japanese Building Walls ───────────────────────────────────
    for (const wall of [...ch.leftWalls, ...ch.rightWalls]) {
      const building = generateBuildingGeometry(wall, ch);
      drawBuilding(ctx, building, ch.y, timeOffset);
    }

    const gapL  = ch.gapCentre - ch.gapWidth / 2;
    const gapR  = ch.gapCentre + ch.gapWidth / 2;
    const midY  = ch.y + CHUNK_HEIGHT * 0.5;
    const brk   = 16;

    // ── Corner brackets (animated glow) ─────────────────────────
    const bracketPulse = 0.6 + 0.4 * Math.sin(timeOffset * 5);
    ctx.strokeStyle = "rgba(0,255,255," + bracketPulse + ")";
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur  = 8 * bracketPulse;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(gapL, midY - brk);
    ctx.lineTo(gapL, midY);
    ctx.lineTo(gapL + brk, midY);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(gapR, midY - brk);
    ctx.lineTo(gapR, midY);
    ctx.lineTo(gapR - brk, midY);
    ctx.stroke();

    // Bottom-left
    const botY = ch.y + CHUNK_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(gapL, botY);
    ctx.lineTo(gapL, botY + brk);
    ctx.lineTo(gapL + brk, botY + brk);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(gapR, botY);
    ctx.lineTo(gapR, botY + brk);
    ctx.lineTo(gapR - brk, botY + brk);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // ── Gap edge neon strips (vertical gradient) ────────────────
    const stripHeight = CHUNK_HEIGHT;
    const stripGradL = ctx.createLinearGradient(gapL, ch.y, gapL, ch.y + stripHeight);
    stripGradL.addColorStop(0, "rgba(0,255,255,0)");
    stripGradL.addColorStop(0.5, "rgba(0,255,255,0.5)");
    stripGradL.addColorStop(1, "rgba(255,20,147,0)");
    ctx.fillStyle = stripGradL;
    ctx.fillRect(gapL - 2, ch.y, 3, stripHeight);

    const stripGradR = ctx.createLinearGradient(gapR, ch.y, gapR, ch.y + stripHeight);
    stripGradR.addColorStop(0, "rgba(255,20,147,0)");
    stripGradR.addColorStop(0.5, "rgba(255,20,147,0.5)");
    stripGradR.addColorStop(1, "rgba(0,255,255,0)");
    ctx.fillStyle = stripGradR;
    ctx.fillRect(gapR - 1, ch.y, 3, stripHeight);

    // ── Faint "VERT-X" text ─────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.07 * (0.5 + 0.5 * Math.sin(timeOffset * 2));
    ctx.fillStyle   = "#0ff";
    ctx.font        = "bold 48px Orbitron, \"Courier New\", monospace";
    ctx.textAlign   = "center";
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
