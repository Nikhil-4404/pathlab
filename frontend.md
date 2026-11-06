# Frontend contract

One workspace retains algorithm/tool/layout/animation controls and a canvas. Added tools paint entry costs 3/5/9 or inspect. Map actions expose local save status, export, and import. Below real-time metrics are a cell inspector and a comparison table. Desktop uses a sidebar; smaller widths stack controls and allow only the comparison table to scroll horizontally.

The board is authoritative in memory and serialized after edits. Search snapshots are isolated. Edits invalidate search/comparison results. Pending paint gestures terminate before a search/comparison starts. Marker drags preview only and mutate the final cell; cancellation leaves the original marker. Pointer strokes retain continuous painting. Keyboard Enter paints or inspects, with W/E/S/G, 3/5/9, I, and Space shortcuts; form fields retain normal keys.

Search controls lock mutation while unfinished; paused searches permit inspection. Inspect remains available and never erases a search. The inspector shows each discovered cell's latest g/h/f/parent, with units matching the active algorithm. Unseen values stay absent. Status and explanations distinguish lowest cost from fewest moves.

Comparisons use a single board snapshot and local unanimated median timings. They show steps, cost, explored cells, peak frontier entries (including stale heap entries), and CPU time. The UI does not rank insignificant timing differences or promise controlled benchmark results. Playback and comparison timing have different labels/contexts.

Import is a native modal. Validation failures preserve board/save. File reads are versioned; Apply is disabled while reading. Save/export failures are visible, with no false successful-save badge. localStorage holds only a versioned board, with origin/browser retention limits explained. No map is sent to a server.

Canvas/keyboard, modal focus, browser storage/downloads, and responsive behavior need runtime evidence in status.md; passing pure-engine tests alone does not prove them. No screen-reader/WCAG or cross-browser certification is implied.
