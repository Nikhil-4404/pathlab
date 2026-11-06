# Product intent

Pathlab is a local, interactive lab for learning how BFS, Dijkstra's, and A* explore a user-drawn world. Users paint barriers and terrain, place endpoints, animate a search, and inspect the reason behind each step.

The current increment includes a 48 × 28 orthogonal grid, continuous wall/terrain painting, movable endpoints, pause/resume/step, measured playback overhead, local map auto-save, portable JSON maps, weighted-route comparisons, connected maze generation, and a cell inspector. Search results and measurements come from real computations; example layouts are editable inputs.

Open cells cost 1, sand 3, mud 5, and water 9 to enter. BFS finds the fewest moves; Dijkstra and A* minimize total travel cost. This distinction should be clear before and after each run. Comparison uses the same board for all algorithms and excludes animation from its timed runs.

Success means users can preserve/reload a map, see BFS choose an expensive short route while A*/Dijkstra choose a cheaper detour, generate a solvable maze, and explain a cell's g/h/f values. These are acceptance goals, with actual verification in status.md.

Out of scope: diagonal movement, accounts, cloud storage, collaboration, AI integration, and external app hosting. Public GitHub source publication was authorized on 2026-11-06. No novelty or demand claim is made.
