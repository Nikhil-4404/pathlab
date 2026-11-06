(function (root) {
  'use strict';

  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    before(a, b) { return a.score - b.score || a.h - b.h || a.order - b.order; }
    push(item) {
      const a = this.items;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.before(a[p], item) <= 0) break;
        a[i] = a[p]; i = p;
      }
      a[i] = item;
    }
    pop() {
      const a = this.items, first = a[0], last = a.pop();
      if (a.length) {
        let i = 0;
        while (i * 2 + 1 < a.length) {
          let child = i * 2 + 1;
          if (child + 1 < a.length && this.before(a[child + 1], a[child]) < 0) child++;
          if (this.before(last, a[child]) <= 0) break;
          a[i] = a[child]; i = child;
        }
        a[i] = last;
      }
      return first;
    }
  }

  function validateDimensions(cols, rows) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 200 || rows > 200) {
      throw new RangeError('Grid dimensions must be integers from 1 to 200.');
    }
  }

  function createSearch({ cols, rows, walls, weights = new Map(), start, end, algorithm }) {
    validateDimensions(cols, rows);
    const size = cols * rows;
    const valid = i => Number.isInteger(i) && i >= 0 && i < size;
    if (!valid(start) || !valid(end)) throw new RangeError('Markers must be inside the grid.');
    if (!['bfs', 'dijkstra', 'astar'].includes(algorithm)) throw new TypeError('Unknown algorithm.');
    if (!(walls instanceof Set) || [...walls].some(i => !valid(i))) throw new TypeError('Walls must be a Set of valid cell indexes.');
    if (walls.has(start) || walls.has(end)) throw new RangeError('Markers cannot be walls.');
    if (!(weights instanceof Map) || [...weights].some(([i, cost]) => !valid(i) || !Number.isInteger(cost) || cost < 1 || cost > 9 || walls.has(i))) {
      throw new TypeError('Weights must map open cell indexes to integer costs from 1 to 9.');
    }
    const blocked = new Set(walls);
    const terrain = new Map(weights);

    return (function* () {
      const distance = new Int32Array(size).fill(-1);
      const parent = new Int32Array(size).fill(-1);
      const closed = new Uint8Array(size);
      const queue = [], heap = new MinHeap();
      let head = 0, order = 0, visitedCount = 0, peakFrontier = 1;
      const h = i => algorithm === 'astar' ? Math.abs(i % cols - end % cols) + Math.abs(Math.floor(i / cols) - Math.floor(end / cols)) : 0;
      const detail = index => ({ index, g: distance[index], h: h(index), f: distance[index] + h(index), parent: parent[index] });
      const push = (index, g) => {
        if (algorithm === 'bfs') queue.push({ index, g });
        else heap.push({ index, g, h: h(index), score: g + h(index), order: order++ });
      };
      const count = () => algorithm === 'bfs' ? queue.length - head : heap.size;
      distance[start] = 0;
      push(start, 0);
      while (count()) {
        const entry = algorithm === 'bfs' ? queue[head++] : heap.pop();
        const index = entry.index;
        if (closed[index] || entry.g !== distance[index]) continue;
        closed[index] = 1;
        visitedCount++;
        const discovered = [];
        const details = [detail(index)];
        if (index !== end) {
          const x = index % cols, y = Math.floor(index / cols);
          const neighbors = [];
          if (x + 1 < cols) neighbors.push(index + 1);
          if (y + 1 < rows) neighbors.push(index + cols);
          if (x > 0) neighbors.push(index - 1);
          if (y > 0) neighbors.push(index - cols);
          for (const next of neighbors) {
            if (blocked.has(next) || closed[next]) continue;
            const g = distance[index] + (algorithm === 'bfs' ? 1 : terrain.get(next) || 1);
            if (distance[next] !== -1 && distance[next] <= g) continue;
            distance[next] = g;
            parent[next] = index;
            push(next, g);
            discovered.push(next);
            details.push(detail(next));
          }
        }
        peakFrontier = Math.max(peakFrontier, count());
        yield { index, discovered, details, visitedCount, frontierSize: count(), peakFrontier };
        if (index === end) {
          const path = [];
          for (let cursor = end; cursor !== -1; cursor = parent[cursor]) path.push(cursor);
          path.reverse();
          const cost = path.slice(1).reduce((sum, cell) => sum + (terrain.get(cell) || 1), 0);
          return { found: true, path, cost, visitedCount, peakFrontier };
        }
      }
      return { found: false, path: [], cost: null, visitedCount, peakFrontier };
    })();
  }

  function rasterLine(from, to, cols) {
    const cells = [];
    let x = from % cols, y = Math.floor(from / cols);
    const x1 = to % cols, y1 = Math.floor(to / cols);
    const dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y);
    const sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      cells.push(y * cols + x);
      if (x === x1 && y === y1) return cells;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }

  function createLayout(name, cols, rows, random = Math.random) {
    validateDimensions(cols, rows);
    const walls = new Set(), weights = new Map();
    const start = Math.floor(rows / 2) * cols + Math.floor(cols * .12);
    const end = Math.floor(rows / 2) * cols + Math.floor(cols * .88);
    if (name === 'switchback') {
      for (let bar = 1; bar <= 4; bar++) {
        const x = Math.floor(cols * bar / 5);
        const gap = Math.floor(rows * (bar % 2 ? .24 : .76));
        for (let y = 0; y < rows; y++) if (Math.abs(y - gap) > 1) walls.add(y * cols + x);
      }
    } else if (name === 'random') {
      for (let i = 0; i < cols * rows; i++) if (random() < .27) walls.add(i);
    } else if (name === 'terrain') {
      const center = Math.floor(rows / 2);
      for (let y = Math.max(0, center - 2); y <= Math.min(rows - 1, center + 2); y++) {
        const cost = y === center ? 9 : Math.abs(y - center) === 1 ? 5 : 3;
        for (let x = Math.floor(cols * .33); x <= Math.floor(cols * .67); x++) weights.set(y * cols + x, cost);
      }
    } else if (name !== 'empty') throw new TypeError('Unknown layout.');
    walls.delete(start); walls.delete(end);
    weights.delete(start); weights.delete(end);
    return { walls, weights, start, end };
  }

  function createMaze(cols, rows, complexity = 2, random = Math.random) {
    validateDimensions(cols, rows);
    if (cols < 5 || rows < 5) throw new RangeError('Maze dimensions must be at least 5.');
    if (![1, 2, 3].includes(complexity)) throw new RangeError('Maze complexity must be 1, 2, or 3.');
    const walls = new Set(Array.from({ length: cols * rows }, (_, i) => i));
    const start = cols + 1;
    const end = (rows % 2 ? rows - 2 : rows - 3) * cols + (cols % 2 ? cols - 2 : cols - 3);
    const stack = [start];
    walls.delete(start);
    while (stack.length) {
      const cell = stack[stack.length - 1], x = cell % cols, y = Math.floor(cell / cols);
      const candidates = [];
      for (const [dx, dy] of [[2, 0], [0, 2], [-2, 0], [0, -2]]) {
        const nx = x + dx, ny = y + dy, next = ny * cols + nx;
        if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && walls.has(next)) candidates.push(next);
      }
      if (!candidates.length) { stack.pop(); continue; }
      const next = candidates[Math.floor(random() * candidates.length)];
      walls.delete((cell + next) / 2); walls.delete(next); stack.push(next);
    }
    // Lower complexity adds shortcuts; it never removes the spanning maze's valid route.
    const openingChance = [0, .35, .12, 0][complexity];
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const cell = y * cols + x;
        if (!walls.has(cell) || x % 2 === y % 2) continue;
        const offset = x % 2 ? cols : 1;
        if (!walls.has(cell - offset) && !walls.has(cell + offset) && random() < openingChance) walls.delete(cell);
      }
    }
    return { walls, weights: new Map(), start, end };
  }

  const api = { createSearch, createLayout, createMaze, rasterLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PathfindingEngine = api;
})(globalThis);
