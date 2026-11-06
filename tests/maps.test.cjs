'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMap, serializeMap } = require('../app/maps.js');
const valid = () => ({ version: 1, cols: 48, rows: 28, start: 0, end: 1343, walls: [1, 49], weights: [[2, 3], [50, 5], [51, 9]] });
const parse = data => parseMap(JSON.stringify(data), 48, 28);

test('maps round-trip walls, all terrain types, and endpoints', () => {
  const board = { walls: new Set([49, 1]), weights: new Map([[51, 9], [2, 3], [50, 5]]), start: 0, end: 1343 };
  const beforeWalls = [...board.walls], beforeWeights = [...board.weights];
  const text = serializeMap(board, 48, 28);
  assert.deepEqual(JSON.parse(text), valid());
  assert.deepEqual(parseMap(text, 48, 28), { walls: new Set([1, 49]), weights: new Map([[2, 3], [50, 5], [51, 9]]), start: 0, end: 1343 });
  assert.deepEqual([...board.walls], beforeWalls);
  assert.deepEqual([...board.weights], beforeWeights);
});

test('unweighted boards serialize compatibly and parsed boards are independent', () => {
  const text = serializeMap({ walls: new Set(), start: 0, end: 5 }, 3, 2);
  const first = parseMap(text, 3, 2), second = parseMap(text, 3, 2);
  assert.equal(first.weights.size, 0);
  first.walls.add(1); first.weights.set(2, 3);
  assert.equal(second.walls.size, 0); assert.equal(second.weights.size, 0);
});

test('malformed JSON and non-object roots fail with useful messages', () => {
  assert.throws(() => parseMap('{', 48, 28), /not valid JSON/);
  assert.throws(() => parseMap(null, 48, 28), /JSON text/);
  for (const root of [null, false, 12, 'map', []]) assert.throws(() => parse(root), /JSON object/);
});

test('map schema version and fields are explicit, including prototype-like keys', () => {
  for (const version of [undefined, 0, 2, '1', null]) assert.throws(() => parse({ ...valid(), version }), /version/);
  for (const key of ['unexpected', '__proto__', 'constructor', 'prototype']) {
    const source = valid();
    Object.defineProperty(source, key, { value: { polluted: true }, enumerable: true });
    assert.throws(() => parse(source), /unsupported fields/);
  }
  assert.equal({}.polluted, undefined);
});

test('dimensions must be bounded integers and match the current board', () => {
  for (const cols of [0, -1, 1.5, '48', 200, 201, null]) assert.throws(() => parse({ ...valid(), cols }), /current 48 × 28 grid/);
  for (const rows of [0, 1.5, '28', 29, 201, null]) assert.throws(() => parse({ ...valid(), rows }), /current 48 × 28 grid/);
  for (const expected of [[0, 28], [48, 201], [48, 1.5], ['48', 28]]) {
    assert.throws(() => parseMap(JSON.stringify(valid()), ...expected), /Expected grid dimensions/);
  }
});

test('endpoints must be distinct in-range integer cells', () => {
  for (const bad of [-1, 1344, 1.2, '0', null]) {
    assert.throws(() => parse({ ...valid(), start: bad }), /different cells/);
    assert.throws(() => parse({ ...valid(), end: bad }), /different cells/);
  }
  assert.throws(() => parse({ ...valid(), end: 0 }), /different cells/);
});

test('wall lists reject duplicates, invalid indexes, and endpoint overlap', () => {
  for (const walls of [null, {}, '1,2']) assert.throws(() => parse({ ...valid(), walls }), /list of cell indexes/);
  for (const walls of [[1, 1], [-1], [1344], [1.2], ['1'], [null], ['__proto__']]) {
    assert.throws(() => parse({ ...valid(), walls }), /unique indexes/);
  }
  for (const walls of [[0], [1343]]) assert.throws(() => parse({ ...valid(), walls }), /cannot be walls/);
  assert.throws(() => parse({ ...valid(), walls: Array(1345).fill(1) }), /list of cell indexes/);
});

test('terrain lists require exact pairs and supported numeric costs', () => {
  for (const weights of [null, {}, '3']) assert.throws(() => parse({ ...valid(), weights }), /list of cell and cost pairs/);
  for (const weights of [[null], [2], [[2]], [[2, 3, 5]], [{ index: 2, cost: 3 }]]) {
    assert.throws(() => parse({ ...valid(), weights }), /contain a cell index and a cost/);
  }
  for (const cost of [0, 1, 2, 4, 6, 10, 3.1, '3', null]) {
    assert.throws(() => parse({ ...valid(), weights: [[2, cost]] }), /Terrain costs/);
  }
});

test('terrain rejects duplicate/out-of-range indexes and overlaps', () => {
  for (const weights of [[[2, 3], [2, 5]], [[-1, 3]], [[1344, 3]], [[2.1, 3]], [['2', 3]]]) {
    assert.throws(() => parse({ ...valid(), weights }), /unique indexes/);
  }
  for (const index of [0, 1343, 1, 49]) assert.throws(() => parse({ ...valid(), weights: [[index, 3]] }), /overlap/);
});

test('256 KiB import limit counts UTF-8 bytes and allows the exact boundary', () => {
  const text = JSON.stringify(valid()), limit = 256 * 1024;
  const atLimit = ' '.repeat(limit - text.length) + text;
  assert.equal(parseMap(atLimit, 48, 28).end, 1343);
  assert.throws(() => parseMap(atLimit + ' ', 48, 28), /256 KiB/);
  assert.throws(() => parseMap('"' + '😀'.repeat(65536) + '"', 48, 28), /256 KiB/);
});

test('serialization validates internal boards rather than exporting corrupt maps', () => {
  const board = { walls: new Set(), weights: new Map(), start: 0, end: 1343 };
  for (const bad of [null, { ...board, walls: [] }, { ...board, weights: [] }, { ...board, weights: null }, { ...board, start: '0' }, { ...board, end: 0 }, { ...board, walls: new Set([1343]) }, { ...board, weights: new Map([[2, 4]]) }]) {
    assert.throws(() => serializeMap(bad, 48, 28));
  }
});

test('oversized exports fail explicitly instead of producing unimportable maps', () => {
  const weights = new Map();
  for (let i = 1; i < 39999; i++) weights.set(i, 9);
  assert.throws(() => serializeMap({ walls: new Set(), weights, start: 0, end: 39999 }, 200, 200), /256 KiB/);
});
