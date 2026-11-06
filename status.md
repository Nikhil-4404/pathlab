# Status — 2026-11-05

Legend: `[ ] Planned`, `[-] Active`, `[i] Implemented — Verification Pending`, `[x] Verified Complete`, `[!] Blocked`, `[~] Deferred`.

Current milestone: the five requested upgrades are implemented, with pure-logic checks and the main local browser workflows verified. Public GitHub source publication was authorized on 2026-11-06; app hosting and a production-readiness claim remain outside this increment.

## Source publication — 2026-11-06

- Target: public repository `Nikhil-4404/pathlab`, branch `main`.
- Scope: application, tests, specifications, README, and app-only screenshots. Local saves, scratch files, downloads, and credentials are excluded. Added `.gitignore`; source credential-pattern scan passed.
- Publication status: prepared locally; remote creation and push are pending. Git remote and commit history are the canonical source publication records.

| State | Scope | Requirements | Evidence / limit |
|---|---|---|---|
| [x] Verified Complete | Weighted searches, real route costs, inspector event data, generated mazes | REQ-02,09,11,12 | 27 engine tests passed, including independent weighted/unweighted oracles and 60 maze configurations. |
| [x] Verified Complete | Strict portable JSON maps | REQ-08 | 12 codec tests passed; actual browser download and file/pasted import exercised. |
| [x] Verified Complete | Main save/restore, terrain editing, pause/step inspection, comparisons, generated-maze UI, responsive layout | REQ-01,03–06,08–12 | In-app browser evidence below. Scope excludes unexercised exception paths and other browsers. |
| [x] Verified Complete | Local HTTP startup, local assets, no new dependencies | REQ-07 | Functional startup through loopback; source/DOM reference checks passed. |
| [i] Implemented — Verification Pending | Storage-denial/quota/corrupt-save fallback; overlapping file-read guard | REQ-08 | Error handling exists; forced browser-level failure/race scenarios were not exercised. Export fallback and startup data preservation reviewed in source. |
| [i] Implemented — Verification Pending | Direct-file startup, Firefox/Safari, physical touch and assistive-technology behavior | REQ-06,07 | Direct-file preview blocked by browser URL policy in the first increment; no bypass attempted. Other coverage unavailable/unexecuted. |
| [~] Deferred | Diagonal movement, cloud accounts/storage, external hosting | Out of scope | Revisit only when requested. |

## Current verification evidence

All evidence is from this Windows workspace on 2026-11-05. Node v22.21.1; UI checks used the in-app browser through http://127.0.0.1:4173. Pure engine/codec sources did not change after the passing suite; subsequent UI changes received syntax and browser checks.

- `node --test tests/*.test.cjs`: **39 passed, 0 failed**. The suite includes 60 seeded unweighted boards and 50 seeded weighted boards compared with independent distance calculations; BFS is checked for minimum moves and A*/Dijkstra for minimum cost. It checks weighted snapshot isolation, rejected costs, g/h/f/parent semantics, deterministic solvable mazes across 5 sizes × 4 seeds × 3 complexities, and strict JSON round trips/boundaries (including exact 256 KiB UTF-8 size, duplicates, overlaps, endpoints, unknown/prototype-like fields, versions, invalid dimensions/indexes).
- `node --check app/app.js`: passed after the final changes. Prior syntax checks for engine/maps passed. Static assertions found no duplicate HTML IDs, missing referenced DOM IDs, or missing script assets.
- Weighted demo browser comparison: **A* 43 moves / cost 43 / 90 explored; Dijkstra 43 / 43 / 1,134; BFS 37 / 181 / 981**. Browser median timings were actually measured and varied between runs; they are not fixed guarantees. Final comparison has all 3 rows and excludes animation.
- Map auto-save survived reload and restored terrain. Keyboard 3/5/9 painted the expected costs; inspecting water showed 9, erasing it showed 1; the saved terrain also survived reload. Inspecting the paused first A* event showed g=0, h=37, f=37 and one explored node. Finished goal showed g=f=43, h=0, with a parent.
- Export produced an actual JSON download. File-chooser import of that export replaced the board successfully. Pasted JSON import also succeeded. Unsupported version 99 reported an error without replacing the map; a synthetic 256 KiB + 1 byte file was rejected and cleared stale import text.
- Marker-drag regression: dragged the start across the entire weighted patch and exported the result. A Node assertion compared actual browser exports: **all 90 terrain cells and every wall preserved; only start moved to index 709**, goal unchanged. Marker drag now previews and commits only on drop. Review also fixed active strokes continuing after search/comparison snapshots; the guard/gesture finalization was source-reviewed, not reproduced with simultaneous held-pointer/keyboard automation.
- Generated a Tight maze in the browser: all algorithms found a 284-step route on that particular sample. Maze randomness means this is not a guaranteed route length. A pasted full-height barrier correctly produced **No route** for all 3 algorithms, with 672 explored nodes, missing cost, and controls unlocked afterward.
- Responsive layout at actual CSS viewports **1600 × 1167** and **434 × 938**: no document horizontal overflow; the table retains 3 rows inside its scroll container, and metrics/inspector remain present. Saved updated preview-desktop.jpg and preview-mobile.jpg. Temporary viewport override reset.
- Captured browser warnings/errors after exercised flows: empty. Assets remain local; no API calls, remote fonts, telemetry, or added packages.

The temporary QA HTTP server is stopped at handoff; README documents restarting it. Browser storage remains on this device and is scoped to its origin/port. JSON export is the portable backup; clearing browser data/private browsing or changing address can affect saves. Physical touch precision, screen readers/WCAG conformance, Firefox/Safari, direct-file execution, controlled performance benchmarking, and external deployment remain unchecked.

## History and decisions

- First increment (same date): the original unit-cost playground passed 20 engine checks plus pointer, keyboard, pause/step, no-route, and responsive browser checks. The current 39-test run and updated screenshots supersede that baseline for changed behavior.
- Upgrade decision: BFS continues to minimize moves; Dijkstra/A* minimize weighted cost. Every result displays actual cost, and the UI no longer promises cost optimality for BFS.
- Comparison uses one snapshot, one warm-up per algorithm, then five rotating-order measured runs. It includes validation and generator event allocation, excludes rendering, and reports median local time. Peak frontier counts heap/queue entries (including stale heap entries), not unique cells or bytes.
- localStorage saves only board data with version-1 JSON. Inputs are validated before replacement; malformed saved data is not overwritten at startup. There is no cloud sync or backend.
- Complexity means passage connectivity rather than a promised solving difficulty. All generated mazes retain a route.
