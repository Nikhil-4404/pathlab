# User and state flows

1. Startup attempts to parse the latest local save. A valid board restores with idle search state; absent save uses the switchback. Invalid/unavailable storage shows a message and retains the in-memory app. Startup does not overwrite unreadable saved data.
2. Painting invalidates results. Wall/erase/terrain strokes use raster interpolation. Marker drags preview movement and commit only at drop, clearing only destination terrain/walls. Completed edits save; storage failure suggests export. Dirty board data is flushed on pagehide.
3. Import uses a native modal with file or pasted JSON. File content is size-limited and guarded against stale asynchronous reads. Load validates before replacing anything; errors leave the current board intact. Successful replacement cancels old work, saves, and returns to idle. Export creates a local JSON download.
4. Playback finalizes an active gesture and snapshots the board. The generator emits settled/discovered cells and details. Pausing retains progress and excludes inspection time from playback. A paused cell click/Enter inspects without editing. Resume continues the iterator. Reaching the goal traces its route; exhausting the frontier reports no route.
5. Compare locks editing, snapshots the board, warms each algorithm, then runs five timed rounds each in rotating order. It displays median CPU time and route/search statistics. It excludes animation and never replaces the visible search. Errors unlock controls; board edits invalidate the table.
6. Generate maze uses the selected connection density and replaces/saves the board. It guarantees an existing route. Clear path cancels visualization but keeps map/save. Clear board saves a new empty board with default endpoints.

Search lifecycle: idle → searching → path → done, or searching → unreachable. Searching/path can be running or paused. Comparison is a separate bounded operation; it starts only when search is idle/terminal. Controls prevent simultaneous mutations. Search/inspection data and comparison results are transient; only maps persist.

There is no authentication, cloud synchronization, API request, or background job.
