(function (root) {
  'use strict';
  const MAX_BYTES = 256 * 1024;
  const FIELDS = new Set(['version', 'cols', 'rows', 'start', 'end', 'walls', 'weights']);

  function checkSize(text) {
    if (typeof text !== 'string') throw new TypeError('Map contents must be JSON text.');
    if (text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) {
      throw new RangeError('Map files must be 256 KiB or smaller.');
    }
  }

  function validate(data, cols, rows) {
    const dimension = value => Number.isInteger(value) && value >= 1 && value <= 200;
    if (!dimension(cols) || !dimension(rows)) throw new RangeError('Expected grid dimensions must be integers from 1 to 200.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('The map must be a JSON object.');
    if (Object.keys(data).some(key => !FIELDS.has(key))) throw new TypeError('The map contains unsupported fields.');
    if (data.version !== 1) throw new TypeError('Unsupported map version. Use a version 1 Pathlab map.');
    if (!dimension(data.cols) || !dimension(data.rows) || data.cols !== cols || data.rows !== rows) {
      throw new RangeError(`The map must use the current ${cols} × ${rows} grid.`);
    }
    const size = cols * rows;
    const cell = value => Number.isInteger(value) && value >= 0 && value < size;
    if (!cell(data.start) || !cell(data.end) || data.start === data.end) {
      throw new RangeError('Start and goal must be different cells inside the grid.');
    }
    if (!Array.isArray(data.walls) || data.walls.length > size) throw new TypeError('Map walls must be a list of cell indexes.');
    if (!Array.isArray(data.weights) || data.weights.length > size) throw new TypeError('Map terrain must be a list of cell and cost pairs.');
    const walls = new Set(), weights = new Map();
    for (const index of data.walls) {
      if (!cell(index) || walls.has(index)) throw new RangeError('Wall cells must be unique indexes inside the grid.');
      if (index === data.start || index === data.end) throw new RangeError('Start and goal cannot be walls.');
      walls.add(index);
    }
    for (const entry of data.weights) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('Each terrain entry must contain a cell index and a cost.');
      const [index, cost] = entry;
      if (!cell(index) || weights.has(index)) throw new RangeError('Terrain cells must be unique indexes inside the grid.');
      if (![3, 5, 9].includes(cost)) throw new RangeError('Terrain costs must be 3 (sand), 5 (mud), or 9 (water).');
      if (walls.has(index) || index === data.start || index === data.end) {
        throw new RangeError('Terrain cannot overlap a wall, start, or goal.');
      }
      weights.set(index, cost);
    }
    return { walls, weights, start: data.start, end: data.end };
  }

  function parseMap(text, expectedCols, expectedRows) {
    checkSize(text);
    let data;
    try { data = JSON.parse(text); }
    catch { throw new SyntaxError('This file is not valid JSON. Choose an exported Pathlab map.'); }
    return validate(data, expectedCols, expectedRows);
  }

  function serializeMap(board, cols, rows) {
    if (!board || !(board.walls instanceof Set)) throw new TypeError('The board must contain a Set of walls.');
    const weights = board.weights === undefined ? new Map() : board.weights;
    if (!(weights instanceof Map)) throw new TypeError('The board terrain must be a Map of cell costs.');
    const data = {
      version: 1, cols, rows, start: board.start, end: board.end,
      walls: [...board.walls].sort((a, b) => a - b),
      weights: [...weights].sort((a, b) => a[0] - b[0])
    };
    validate(data, cols, rows);
    const text = JSON.stringify(data);
    checkSize(text);
    return text;
  }

  const api = { serializeMap, parseMap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PathlabMaps = api;
})(globalThis);
