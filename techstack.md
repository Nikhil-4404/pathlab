# Technology

HTML/CSS/plain JavaScript with Canvas 2D. No framework, bundler, package installation, CDN, font, or image dependency. No backend/database/server-side storage.

- app/engine.js: incremental generators; FIFO BFS and binary min-heap Dijkstra/A*. Typed distance/parent/closed arrays, snapshotted Set walls and Map costs, cost reconstruction, inspector details, and iterative maze generation. Browser global and CommonJS exports.
- app/maps.js: strict versioned JSON codec, UTF-8 size limit, duplicate/overlap validation, deterministic export. Browser global and CommonJS exports.
- app/app.js: pointer/keyboard state, requestAnimationFrame playback, DPR-aware rendering, performance.now timing, localStorage saves, Blob downloads, file/pasted JSON import, paused inspector, and asynchronous rounds of same-map comparison.
- Tests: Node's built-in node:test and node:assert/strict. Independent unweighted and weighted distance oracles, generated-maze connectivity, and schema boundary tests. Node is a development requirement only.
- Preview: Python standard-library HTTP server bound to 127.0.0.1. No production deployment configured. Direct-file use is designed into classic scripts but remains unverified; storage behavior for file URLs depends on the browser.

README contains commands. Tested runtime/browser evidence is in status.md. Browser storage belongs to an origin (including port); JSON exports are the portable backup. No saved board is included in source.
