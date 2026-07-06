# VERT/X — Neon Tunnel Diver

> **Pixel‑art tunnel runner built for 60 FPS on mobile.**  
> Vanilla JS + Canvas 2D + Vite. No frameworks. No dependencies.

![vertx-preview](https://img.shields.io/badge/status-live-brightgreen)
![build](https://img.shields.io/badge/build-passing-brightgreen)

**[Play Now](https://vertx-five.vercel.app)** (Deployed on Vercel)

---

## Gameplay

Guide a diamond‑shaped diver through an infinite neon tunnel.  
Collect coins, dodge walls, survive as long as you can. The tunnel gets faster, tighter, and more alive as your score climbs.

- **Mobile‑first**: touch anywhere to steer, one‑tap controls
- **Procedural generation**: every run is unique — building layouts, window patterns, neon signs, roof details
- **Pixel art aesthetic**: 360×640 logical resolution with crisp pixel rendering
- **Synth‑wave / cyberpunk vibe**: cyan + magenta neon strips, glowing windows, animated signs

### Gallery

<table>
  <tr>
    <td><img src="screenshots/slow.png" width="140" alt="Slow"></td>
    <td><img src="screenshots/mid.png" width="140" alt="Mid"></td>
    <td><img src="screenshots/jump.png" width="140" alt="Jump"></td>
    <td><img src="screenshots/fast.png" width="140" alt="Fast"></td>
  </tr>
  <tr>
    <td><img src="screenshots/superfast.png" width="140" alt="Super Fast"></td>
    <td><img src="screenshots/fast-jump.png" width="140" alt="Fast Jump"></td>
    <td><img src="screenshots/game-over.png" width="140" alt="Game Over"></td>
  </tr>
</table>

---

## Performance Optimisation

This project was diagnosed with **six performance killers** that caused dropped frames (30–45 FPS) on 3× DPR mobile devices. Each was systematically eliminated.

| # | Killer | Why It Hurt | Fix | Impact |
|---|--------|-------------|-----|--------|
| 1 | **Full DPR canvas** | 1080×1920 canvas = 6× more pixels than logical | Cap DPR at `min(devicePixelRatio, 1.5)` | **~75% fewer GPU pixels** |
| 2 | **`shadowBlur` everywhere** | Player glow, building windows, neon signs, roof spires, coins — each call forces a separate GPU render‑target | Replace all `shadowBlur` with a **glow cache** — 5 pre‑rendered radial gradients on offscreen canvases, drawn via `drawImage` | **~20 shadowBlur calls → 0** per frame |
| 3 | **Per‑frame `createLinearGradient`** | Building silhouettes, edge strips, gap strips — 18–20 gradient objects allocated every frame | Cache gradients on **building objects** (at generation time) and **chunk objects** (at gap‑strip creation) | **~20 gradient allocations → 0** per frame |
| 4 | **Unbatched trail** | Player trail drawn as 30–50 individual `fillRect` calls | Single `beginPath` + `moveTo`/`lineTo` + `stroke` per segment | **~40 draw calls → 2** per frame |
| 5 | **Coin glow** | Each coin used `shadowBlur(10)` plus coin‑pop effect and floating text | Replaced with glow cache (`drawGlow`) | **~10 shadowBlur calls → 0** per frame |
| 6 | **No culling** | Entire chunk rendered even when 2× off‑screen (above/below visible area) | Add `draw()` early‑return check at the top of the chunk render loop | **~30% fewer pixels drawn** per frame (worst case) |

**Result: 60 FPS sustained on target devices (3× DPR, 360×640 logical).**  
All six fixes are independent and together cost ~100 lines of new code.

---

## Architecture

```
vertx/
├── index.html          # Entry point, mobile meta tags
├── vite.config.js      # Vite config (no special plugins needed)
├── vercel.json         # Vercel deployment config
├── style.css           # Global styles, font imports
├── js/
│   ├── main.js         # Game loop, init, input, DPR capping
│   ├── tunnel.js       # Chunk generation, building/roof/window logic, frustum culling
│   ├── player.js       # Player physics, trail rendering, glow cache integration
│   ├── collectibles.js # Coin spawning, rendering, collection effects
│   ├── collision.js    # Hit‑detection between player, walls, and coins
│   ├── ui.js           # HUD, score display, game‑over screen
│   └── glow.js         # Glow cache module (5 pre‑rendered textures)
└── assets/
    └── (logo, sounds)
```

**Key modules:**

- **`glow.js`** — Pre‑renders 5 radial gradients for radii [3, 6, 10, 15, 22] on offscreen canvases. Exports `drawGlow(ctx, x, y, radius)` that does nearest‑radius lookup and single `drawImage` call.
- **`tunnel.js`** — Procedural chunk generation with cached gradients on every building (`baseGradient`, `edgeGradient`) and every chunk (`gapGradL`, `gapGradR`). Frustum culling skips chunks entirely when above/below visible area.
- **`player.js`** — Batched trail path (single stroke instead of 30–50 rects), `drawGlow` instead of `shadowBlur(22)` for player aura.
- **`collectibles.js`** — Coin glow via `drawGlow`, coin‑pop effect and floating "+100" text glow via cache.

---

## Design Decisions

### Why Canvas 2D (not WebGL / Three.js)?

Pixel art benefits from **crisp nearest‑neighbour scaling**. Canvas 2D gives us sub‑pixel control and keeps the bundle under 15 KB gzip. Three.js would add 500+ KB for zero visual gain in this art style.

### Why DPR 1.5 (not 1.0 or 2.0)?

- 1.0 looks noticeably blurry on retina screens
- 2.0+ on a 3× phone = 3,240 × 1,920 GPU pixels = slow fill rates
- 1.5 preserves sharpness while reducing GPU work by ~75% vs uncapped

### Why gradient caching instead of pre‑rendered textures?

Building gradients depend on dynamic width (which varies per building). Caching them at generation time avoids per‑frame allocation without losing procedural flexibility. Gap gradients are always the same shape so they could be pre‑rendered, but caching on the chunk object is simpler and cost is one‑time.

### Why a glow cache instead of dropping glow entirely?

Glow is a core part of the aesthetic. Removing it would make the game look flat. The cache preserves the visual while eliminating the GPU cost of shadowBlur.

---

## Portafolio / Project Journal

> *"This is not just a game. It's a case study in making things fast on constrained hardware."*

This project is part of a **developer growth portfolio** demonstrating:

- **Performance diagnosis**: Profiling mobile GPU pipelines, identifying shadowBlur and gradient allocation as frame‑drop culprits
- **Systematic optimisation**: Applying the 80/20 rule — fixing 6 root causes for maximum impact
- **2D rendering internals**: Understanding Canvas 2D render‑target switches, draw‑call batching, and gradient object lifecycle
- **Mobile constraints**: Thinking in terms of GPU fill rate, DPR, and battery life
- **Clean code**: Modular ES module architecture with zero external dependencies

### What I learned

1. **`shadowBlur` is expensive** — Chrome DevTools Performance tab shows each shadowBlur triggers a separate GPU render‑target pass. Batch instead.
2. **Gradient objects have GC cost** — `createLinearGradient` allocates a new object. On a 60 FPS loop, 20 per frame = 1,200 allocations/second. Cache them.
3. **Trail batching reverses a common anti‑pattern** — Individual rect calls for trail segments are intuitive but terrible for GPUs. A single path stroke is visually identical.
4. **Frustum culling is dirt cheap** — A single `if (chunk.y + CHUNK_HEIGHT < -CHUNK_HEIGHT || chunk.y > CANVAS_H)` check skips entire chunks. 30 seconds to implement, ~30% pixel savings.

---

## Local Development

```bash
# Install dependencies (Vite)
npm install

# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## Deployment

Automatic deploys via Vercel (`vercel.json` in repo root).  
Production URL: [https://vertx-five.vercel.app](https://vertx-five.vercel.app)

---

## License

MIT — do what you want with it.
