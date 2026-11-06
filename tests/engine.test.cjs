'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSearch, createLayout, createMaze, rasterLine } = require('../app/engine.js');
const algorithms = ['bfs', 'dijkstra', 'astar'];

function run(config) {
  const iterator = createSearch(config), events = [];
  while (true) {
    const next = iterator.next();
    if (next.done) return { ...next.value, events };
    events.push(next.value);
    assert.ok(events.length <= config.cols * config.rows, 'A node is settled at most once');
  }
}
function validPath(config, result) {
  if (!result.found) { assert.deepEqual(result.path, []); assert.equal(result.cost, null); return; }
  assert.equal(result.path[0], config.start);
  assert.equal(result.path.at(-1), config.end);
  for (let i = 0; i < result.path.length; i++) {
    const id = result.path[i];
    assert.ok(!config.walls.has(id), 'Paths cannot cross walls');
    if (i) {
      const prev = result.path[i - 1];
      assert.equal(Math.abs(id % config.cols - prev % config.cols) + Math.abs(Math.floor(id / config.cols) - Math.floor(prev / config.cols)), 1);
    }
  }
  assert.equal(new Set(result.events.map(e => e.index)).size, result.visitedCount);
  assert.equal(result.events.at(-1).index, config.end);
  assert.equal(result.cost, result.path.slice(1).reduce((sum, cell) => sum + (config.weights?.get(cell) || 1), 0));
}

for (const algorithm of algorithms) {
  test(`${algorithm}: shortest open route, no diagonal or row wrapping`, () => {
    const config = { cols: 8, rows: 6, walls: new Set(), start: 7, end: 40, algorithm };
    const result = run(config);
    assert.equal(result.path.length - 1, 12); validPath(config, result);
  });
  test(`${algorithm}: forced detour`, () => {
    const config = { cols: 5, rows: 5, walls: new Set([2, 7, 12, 17]), start: 10, end: 14, algorithm };
    const result = run(config);
    assert.equal(result.path.length - 1, 8); validPath(config, result);
  });
  test(`${algorithm}: unreachable goal`, () => {
    const config = { cols: 3, rows: 3, walls: new Set([1, 4, 7]), start: 3, end: 5, algorithm };
    const result = run(config);
    assert.equal(result.found, false); assert.equal(result.visitedCount, 3); validPath(config, result);
  });
  test(`${algorithm}: start equals goal`, () => {
    const config = { cols: 1, rows: 1, walls: new Set(), start: 0, end: 0, algorithm };
    const result = run(config);
    assert.deepEqual(result.path, [0]); assert.equal(result.visitedCount, 1); validPath(config, result);
  });
  test(`${algorithm}: preset is solvable`, () => {
    const config = { cols: 48, rows: 28, ...createLayout('switchback', 48, 28), algorithm };
    const result = run(config);
    assert.equal(result.found, true); validPath(config, result);
  });
}

test('search validates dimensions, walls, markers, and algorithm before execution', () => {
  const base = { cols: 5, rows: 5, walls: new Set(), start: 0, end: 24, algorithm: 'astar' };
  for (const bad of [{ cols: 0 }, { rows: 1.5 }, { rows: 201 }, { start: -1 }, { end: 25 }, { algorithm: 'unknown' }, { walls: [] }, { walls: new Set([25]) }, { walls: new Set([0]) }]) {
    assert.throws(() => createSearch({ ...base, ...bad }));
  }
});
test('running searches snapshot the walls and never change the original board', () => {
  const config = { cols: 3, rows: 1, walls: new Set(), start: 0, end: 2, algorithm: 'bfs' };
  const iterator = createSearch(config); config.walls.add(1);
  let next;
  do { next = iterator.next(); } while (!next.done);
  assert.deepEqual(next.value.path, [0, 1, 2]); assert.deepEqual([...config.walls], [1]);
});
test('continuous drawing fills a fast horizontal, vertical, and diagonal stroke', () => {
  assert.deepEqual(rasterLine(0, 4, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(rasterLine(0, 20, 5), [0, 5, 10, 15, 20]);
  assert.deepEqual(rasterLine(24, 0, 5), [24, 18, 12, 6, 0]);
  const cells = rasterLine(0, 23, 5);
  assert.equal(cells[0], 0); assert.equal(cells.at(-1), 23);
  for (let i = 1; i < cells.length; i++) {
    assert.ok(Math.abs(cells[i] % 5 - cells[i - 1] % 5) <= 1);
    assert.ok(Math.abs(Math.floor(cells[i] / 5) - Math.floor(cells[i - 1] / 5)) <= 1);
  }
});
test('layouts protect endpoints, and unknown presets fail explicitly', () => {
  const full = createLayout('random', 48, 28, () => 0);
  assert.equal(full.walls.size, 48 * 28 - 2);
  assert.ok(!full.walls.has(full.start)); assert.ok(!full.walls.has(full.end));
  assert.equal(createLayout('empty', 48, 28).walls.size, 0);
  assert.throws(() => createLayout('missing', 48, 28));
});
test('all algorithms agree with an independent distance oracle on 60 seeded boards', () => {
  let seed = 57;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function oracle(config) {
    const distances = new Map([[config.start, 0]]), queue = [config.start];
    for (const cell of queue) {
      if (cell === config.end) return distances.get(cell);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const x = cell % config.cols + dx, y = Math.floor(cell / config.cols) + dy;
        const next = y * config.cols + x;
        if (x < 0 || x >= config.cols || y < 0 || y >= config.rows || config.walls.has(next) || distances.has(next)) continue;
        distances.set(next, distances.get(cell) + 1); queue.push(next);
      }
    }
    return null;
  }
  for (let sample = 0; sample < 60; sample++) {
    const config = { cols: 13, rows: 11, ...createLayout('random', 13, 11, random) };
    const expected = oracle(config);
    const runs = algorithms.map(algorithm => {
      const result = run({ ...config, algorithm });
      assert.equal(result.found ? result.path.length - 1 : null, expected, `${algorithm}, sample ${sample}`);
      validPath(config, result); return result;
    });
    assert.deepEqual(runs[0].events.map(e => e.index), runs[1].events.map(e => e.index), 'Uniform-cost Dijkstra and BFS explore in the same order');
  }
});

function seededRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('weighted search distinguishes cheapest cost from fewest steps and excludes the starting cost', () => {
  const config = { cols: 5, rows: 3, walls: new Set(), weights: new Map([[5, 9], [6, 9], [7, 9], [8, 9]]), start: 5, end: 9 };
  const bfs = run({ ...config, algorithm: 'bfs' });
  assert.equal(bfs.path.length - 1, 4); assert.equal(bfs.cost, 28); validPath(config, bfs);
  for (const algorithm of ['dijkstra', 'astar']) {
    const result = run({ ...config, algorithm });
    assert.equal(result.path.length - 1, 6); assert.equal(result.cost, 6); validPath(config, result);
  }
  const same = run({ ...config, end: config.start, algorithm: 'astar' });
  assert.equal(same.cost, 0);
});

test('weighted terrain demo contains all three materials and demonstrates a cheaper detour', () => {
  const config = { cols: 48, rows: 28, ...createLayout('terrain', 48, 28) };
  assert.deepEqual([...new Set(config.weights.values())].sort(), [3, 5, 9]);
  assert.ok(!config.weights.has(config.start)); assert.ok(!config.weights.has(config.end));
  const bfs = run({ ...config, algorithm: 'bfs' });
  const astar = run({ ...config, algorithm: 'astar' });
  const dijkstra = run({ ...config, algorithm: 'dijkstra' });
  assert.ok(astar.cost < bfs.cost); assert.ok(astar.path.length > bfs.path.length);
  assert.equal(astar.cost, dijkstra.cost);
  for (const result of [bfs, astar, dijkstra]) validPath(config, result);
});

test('invalid costs and wall overlaps fail before searching; optional weights stay backward-compatible', () => {
  const base = { cols: 3, rows: 3, walls: new Set([4]), start: 0, end: 8, algorithm: 'astar' };
  for (const weights of [null, [], new Map([[-1, 2]]), new Map([[9, 2]]), new Map([[1.5, 2]]), new Map([[4, 3]]), ...[0, -1, 10, 1.5, Infinity, NaN, '3'].map(cost => new Map([[1, cost]]))]) {
    assert.throws(() => createSearch({ ...base, weights }));
  }
  assert.equal(run(base).cost, 4);
});

test('weights are snapshotted and caller-owned values are preserved', () => {
  const weights = new Map([[1, 5]]);
  const iterator = createSearch({ cols: 3, rows: 1, walls: new Set(), weights, start: 0, end: 2, algorithm: 'astar' });
  weights.set(1, 9);
  let next;
  do { next = iterator.next(); } while (!next.done);
  assert.equal(next.value.cost, 6); assert.deepEqual([...weights], [[1, 9]]);
});

test('inspector details explain current and newly relaxed cells using each algorithm objective', () => {
  const config = { cols: 5, rows: 3, walls: new Set(), weights: new Map([[6, 9], [7, 5]]), start: 5, end: 9 };
  for (const algorithm of algorithms) {
    const result = run({ ...config, algorithm }), known = new Map();
    for (const event of result.events) {
      assert.deepEqual(event.details.map(d => d.index), [event.index, ...event.discovered]);
      for (const detail of event.details) {
        known.set(detail.index, detail);
        const expectedH = algorithm === 'astar' ? Math.abs(detail.index % config.cols - config.end % config.cols) + Math.abs(Math.floor(detail.index / config.cols) - Math.floor(config.end / config.cols)) : 0;
        assert.equal(detail.h, expectedH); assert.equal(detail.f, detail.g + detail.h);
        if (detail.index === config.start) { assert.equal(detail.g, 0); assert.equal(detail.parent, -1); }
        else {
          const parent = known.get(detail.parent);
          assert.ok(parent, 'A cell refers to an already discovered parent');
          assert.equal(detail.g, parent.g + (algorithm === 'bfs' ? 1 : config.weights.get(detail.index) || 1));
        }
      }
    }
    const goal = known.get(config.end);
    assert.equal(goal.g, algorithm === 'bfs' ? result.path.length - 1 : result.cost);
  }
});

test('weighted algorithms match an independent scan-based distance oracle on 50 seeded boards', () => {
  const random = seededRandom(2026);
  function oracle(config, weighted) {
    const distance = Array(config.cols * config.rows).fill(Infinity), settled = new Set();
    distance[config.start] = 0;
    while (true) {
      let best = -1;
      for (let cell = 0; cell < distance.length; cell++) if (!settled.has(cell) && Number.isFinite(distance[cell]) && (best === -1 || distance[cell] < distance[best])) best = cell;
      if (best === -1) return null;
      if (best === config.end) return distance[best];
      settled.add(best);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = best % config.cols + dx, y = Math.floor(best / config.cols) + dy, next = y * config.cols + x;
        if (x < 0 || x >= config.cols || y < 0 || y >= config.rows || config.walls.has(next)) continue;
        distance[next] = Math.min(distance[next], distance[best] + (weighted ? config.weights.get(next) || 1 : 1));
      }
    }
  }
  for (let sample = 0; sample < 50; sample++) {
    const config = { cols: 9, rows: 8, ...createLayout('random', 9, 8, random) };
    for (let cell = 0; cell < 72; cell++) if (!config.walls.has(cell) && random() < .5) config.weights.set(cell, [3, 5, 9][Math.floor(random() * 3)]);
    const expected = oracle(config, true), steps = oracle(config, false);
    for (const algorithm of algorithms) {
      const result = run({ ...config, algorithm }); validPath(config, result);
      assert.equal(result.found ? (algorithm === 'bfs' ? result.path.length - 1 : result.cost) : null, algorithm === 'bfs' ? steps : expected, `${algorithm}, sample ${sample}`);
    }
  }
});

test('maze generation is deterministic, solvable, and opens more shortcuts at lower complexity', () => {
  for (const [cols, rows] of [[5, 5], [6, 8], [17, 13], [48, 28], [49, 29]]) {
    for (const seed of [1, 4, 93, 2026]) {
      const counts = [];
      for (const complexity of [1, 2, 3]) {
        const maze = createMaze(cols, rows, complexity, seededRandom(seed));
        assert.deepEqual(maze, createMaze(cols, rows, complexity, seededRandom(seed)));
        assert.ok(!maze.walls.has(maze.start)); assert.ok(!maze.walls.has(maze.end));
        assert.notEqual(maze.start, maze.end); assert.equal(maze.weights.size, 0);
        const config = { cols, rows, ...maze, algorithm: 'bfs' };
        const result = run(config); assert.equal(result.found, true); validPath(config, result);
        counts.push(maze.walls.size);
      }
      assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2]);
    }
  }
  for (const args of [[4, 10], [10, 4], [201, 10], [10, 10, 0], [10, 10, 4], [10, 10, 1.5]]) assert.throws(() => createMaze(...args));
});
