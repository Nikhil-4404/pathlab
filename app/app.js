(function () {
  'use strict';
  const { createSearch, createLayout, createMaze, rasterLine } = PathfindingEngine;
  const { serializeMap, parseMap } = PathlabMaps;
  const $ = id => document.getElementById(id);
  const canvas = $('grid'), ctx = canvas.getContext('2d');
  if (!ctx) { $('result-summary').textContent = 'Canvas is unavailable in this browser.'; $('run').disabled = true; $('step').disabled = true; return; }
  const COLS = 48, ROWS = 28, SIZE = COLS * ROWS;
  const names = { astar: 'A*', dijkstra: "Dijkstra's", bfs: 'BFS' };
  const notes = {
    astar: 'Uses distance traveled + Manhattan distance to the goal to guide its search.',
    dijkstra: 'Follows the lowest known travel cost. Takes terrain costs into account.',
    bfs: 'Finds the fewest moves. Ignores terrain costs, so its route can be more expensive.'
  };
  const insights = {
    astar: 'A* asks a simple question: <em>which next step looks most promising?</em>',
    dijkstra: "Dijkstra's settles the nearest frontier cell. <em>Certainty, one distance at a time.</em>",
    bfs: 'BFS explores in ripples. <em>Every cell in a layer is the same distance from the start.</em>'
  };
  const rates = [30, 100, 300, 1000, 5000];
  let board = createLayout('switchback', COLS, ROWS);
  let algorithm = 'astar', tool = 'wall', phase = 'idle', playing = false;
  let iterator = null, result = null, pathCursor = 0, frame = 0, lastFrame = 0, budget = 0, activeStart = 0;
  let states = new Uint8Array(SIZE), stats = freshStats();
  let hover = null, keyboardCell = board.start, gesture = null, latest = -1;
  let details = new Map(), inspectionCell = null, comparing = false, dirty = false;
  const terrainCosts = { sand: 3, mud: 5, water: 9 };
  const terrainColors = { 3: '#9d824b', 5: '#815945', 9: '#336eaa' };
  const SAVE_KEY = 'pathlab.board.v1';

  function saveBoard() {
    try {
      localStorage.setItem(SAVE_KEY, serializeMap(board, COLS, ROWS));
      dirty = false; $('save-status').textContent = 'Saved on this device';
    } catch { $('save-status').textContent = 'Auto-save unavailable. Export to keep your map.'; }
  }
  function invalidateComparison() {
    $('comparison-results').hidden = true; $('comparison-rows').replaceChildren();
    $('comparison-status').textContent = 'Compare route cost, explored cells, and search time on your current map.';
  }
  function inspect(id) {
    inspectionCell = id; updateInspector(); $('cell-announcement').textContent = describeCell(id); draw();
  }
  function updateInspector() {
    const id = inspectionCell ?? (latest >= 0 ? latest : board.start), detail = details.get(id);
    const coord = index => `${index % COLS + 1}, ${Math.floor(index / COLS) + 1}`;
    $('inspect-cell').textContent = `Cell (${coord(id)})${id === latest ? ' · last explored' : ''}`;
    $('inspect-cost').textContent = board.walls.has(id) ? 'Blocked' : board.weights.get(id) || 1;
    $('g-label').textContent = algorithm === 'bfs' ? 'Steps g' : 'Cost g';
    $('inspect-g').textContent = detail?.g ?? '—';
    $('inspect-h').textContent = algorithm === 'astar' ? detail?.h ?? '—' : 'Unused';
    $('inspect-f').textContent = detail?.f ?? '—';
    $('inspect-parent').textContent = detail && detail.parent >= 0 ? coord(detail.parent) : '—';
    $('inspect-state').textContent = board.walls.has(id) ? 'Wall' : ['Unseen', 'Explored', 'Frontier', 'Path'][states[id]];
    $('selection-rule').textContent = algorithm === 'astar' ? 'A* selects the smallest g + h; equal scores favor a smaller h, then discovery order.' : algorithm === 'dijkstra' ? "Dijkstra's selects the smallest known travel cost g. Ties follow discovery order." : 'BFS selects the earliest queued cell, one layer at a time. g counts moves; terrain does not affect its choices.';
  }

  function freshStats() { return { visited: 0, computeMs: 0, renderMs: 0, activeMs: 0, frontier: 0, peak: 0 }; }
  function busy() { return phase === 'searching' || phase === 'path'; }
  function elapsed() { return stats.activeMs + (playing ? performance.now() - activeStart : 0); }
  function setSummary(message) { $('result-summary').textContent = message; }
  function stopClock() {
    if (playing) stats.activeMs += performance.now() - activeStart;
    playing = false;
    cancelAnimationFrame(frame);
  }

  function syncControls() {
    const locked = busy() || comparing;
    document.querySelectorAll('[data-algorithm], [data-tool]').forEach(button => { button.disabled = locked && !(button.dataset.tool === 'inspect' && !comparing); });
    $('layout').disabled = locked;
    $('step').disabled = playing || comparing;
    $('run').disabled = comparing;
    $('compare').disabled = locked;
    $('generate-maze').disabled = locked;
    $('maze-complexity').disabled = locked;
    $('import-map').disabled = locked;
    $('clear-board').disabled = comparing;
    $('clear-path').disabled = comparing;
    const label = busy() ? (playing ? 'Pause exploration' : 'Resume exploration') : `Visualize ${names[algorithm]}`;
    $('run').querySelector('span').textContent = label;
    $('run').querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    $('run').setAttribute('aria-label', label);
    const phaseLabel = $('phase-label');
    phaseLabel.textContent = busy() ? (playing ? (phase === 'path' ? 'TRACING PATH' : 'EXPLORING') : 'PAUSED') : phase === 'done' ? 'PATH FOUND' : phase === 'unreachable' ? 'NO ROUTE' : 'READY';
    phaseLabel.className = 'status-pill' + (busy() || phase === 'done' ? ' active' : phase === 'unreachable' ? ' error' : '');
    canvas.style.cursor = comparing || playing ? 'default' : tool === 'inspect' || busy() ? 'help' : 'crosshair';
    $('guarantee-text').textContent = algorithm === 'bfs' ? 'Fewest moves · cost may be higher' : 'Lowest cost, when reachable';
  }

  function updateMetrics() {
    const walkable = SIZE - board.walls.size;
    const coverage = stats.visited / walkable * 100;
    $('visited-value').innerHTML = `${stats.visited.toLocaleString()}<span> / ${walkable.toLocaleString()}</span>`;
    $('coverage-detail').textContent = `${coverage.toFixed(1)}% of walkable cells`;
    $('coverage-bar').style.width = `${coverage}%`;
    $('path-value').innerHTML = `${result?.found ? result.path.length - 1 : '—'}<span> steps</span>`;
    $('path-detail').textContent = result ? (result.found ? `Cost ${result.cost} · ${algorithm === 'bfs' ? 'fewest moves' : 'lowest cost'}` : 'Goal is unreachable') : 'Waiting for a route';
    $('search-value').innerHTML = `${stats.computeMs.toFixed(2)}<span> ms</span>`;
    $('render-value').innerHTML = `${stats.renderMs.toFixed(2)}<span> ms</span>`;
    const active = elapsed();
    const overhead = Math.max(0, active - stats.computeMs - stats.renderMs);
    $('playback-summary').textContent = `Playback ${(active / 1000).toFixed(2)}s · overhead ${(overhead / 1000).toFixed(2)}s · peak frontier ${stats.peak}`;
    updateInspector();
  }

  function draw(measure = false) {
    const before = performance.now();
    const width = canvas.clientWidth, height = canvas.clientHeight;
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    const cellW = width / COLS, cellH = height / ROWS;
    const inset = Math.min(1.3, cellW * .07);
    ctx.fillStyle = '#10161d'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#202b37'; ctx.lineWidth = .65;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, height); }
    for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * cellH); ctx.lineTo(width, y * cellH); }
    ctx.stroke();
    const fillCell = (id, color) => {
      ctx.fillStyle = color;
      ctx.fillRect((id % COLS) * cellW + inset, Math.floor(id / COLS) * cellH + inset, cellW - 2 * inset, cellH - 2 * inset);
    };
    for (let id = 0; id < SIZE; id++) {
      if (board.walls.has(id)) fillCell(id, '#445365');
      else if (states[id] === 1) fillCell(id, '#245762');
      else if (states[id] === 2) fillCell(id, '#70b6c1');
      else if (states[id] === 3) fillCell(id, '#b9e975');
      else if (board.weights.has(id)) fillCell(id, terrainColors[board.weights.get(id)]);
      if (board.weights.has(id)) {
        ctx.fillStyle = states[id] === 2 || states[id] === 3 ? '#14251d' : '#ffffff';
        ctx.font = `${Math.max(7, cellW * .48)}px Consolas, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(board.weights.get(id)), (id % COLS + .5) * cellW, (Math.floor(id / COLS) + .5) * cellH);
      }
    }
    if (result?.found && pathCursor > 1) {
      ctx.beginPath();
      for (let i = 0; i < pathCursor; i++) {
        const id = result.path[i], x = (id % COLS + .5) * cellW, y = (Math.floor(id / COLS) + .5) * cellH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#d4ff9a'; ctx.lineWidth = Math.max(1, cellW * .13); ctx.lineJoin = 'round'; ctx.stroke();
    }
    function marker(id, color, isStart) {
      const x = id % COLS * cellW, y = Math.floor(id / COLS) * cellH;
      fillCell(id, color);
      ctx.strokeStyle = '#182419'; ctx.fillStyle = '#182419'; ctx.lineWidth = Math.max(1.3, cellW * .085);
      if (isStart) {
        ctx.beginPath(); ctx.moveTo(x + cellW * .38, y + cellH * .28); ctx.lineTo(x + cellW * .72, y + cellH * .5); ctx.lineTo(x + cellW * .38, y + cellH * .72); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x + cellW / 2, y + cellH / 2, cellW * .25, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + cellW / 2, y + cellH / 2, cellW * .07, 0, Math.PI * 2); ctx.fill();
      }
    }
    const previewStart = gesture?.brush === 'start' && gesture.last !== board.end ? gesture.last : board.start;
    const previewGoal = gesture?.brush === 'goal' && gesture.last !== board.start ? gesture.last : board.end;
    marker(previewStart, '#c5f477', true); marker(previewGoal, '#f1be6a', false);
    if (latest >= 0 && busy()) {
      ctx.strokeStyle = '#a0eff0'; ctx.lineWidth = 1;
      ctx.strokeRect(latest % COLS * cellW + 2, Math.floor(latest / COLS) * cellH + 2, Math.max(0, cellW - 4), Math.max(0, cellH - 4));
    }
    const focusCell = inspectionCell ?? (document.activeElement === canvas ? (hover ?? keyboardCell) : hover);
    if (focusCell !== null && !playing) {
      ctx.strokeStyle = '#e6efd5'; ctx.lineWidth = 1.5;
      ctx.strokeRect(focusCell % COLS * cellW + 1, Math.floor(focusCell / COLS) * cellH + 1, cellW - 2, cellH - 2);
    }
    if (measure) stats.renderMs += performance.now() - before;
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientWidth * ROWS / COLS * ratio);
    draw(playing); updateMetrics();
  }

  function clearSearch(message = 'Ready when you are.') {
    if (gesture) finishGesture({ pointerId: gesture.pointerId });
    stopClock(); iterator = null; result = null; pathCursor = 0; latest = -1;
    phase = 'idle'; states = new Uint8Array(SIZE); stats = freshStats(); budget = 0;
    details = new Map(); inspectionCell = null;
    syncControls(); updateMetrics(); draw(); setSummary(message);
  }

  function initializeSearch() {
    clearSearch(`${names[algorithm]} is ready to explore.`);
    const before = performance.now();
    iterator = createSearch({ cols: COLS, rows: ROWS, ...board, algorithm });
    stats.computeMs += performance.now() - before;
    phase = 'searching'; states[board.start] = 2; stats.frontier = 1; stats.peak = 1;
  }

  function advance() {
    if (phase === 'searching') {
      const before = performance.now();
      const next = iterator.next();
      stats.computeMs += performance.now() - before;
      if (!next.done) {
        const event = next.value;
        for (const detail of event.details) details.set(detail.index, detail);
        states[event.index] = 1; latest = event.index;
        for (const id of event.discovered) if (states[id] !== 1) states[id] = 2;
        stats.visited = event.visitedCount; stats.frontier = event.frontierSize; stats.peak = event.peakFrontier;
      } else {
        result = next.value;
        phase = result.found ? 'path' : 'unreachable';
        if (result.found) setSummary(`Route found · ${result.path.length - 1} steps · cost ${result.cost}. Tracing it now.`);
        else setSummary('No route found. Try opening a gap in the walls.');
        syncControls();
      }
    } else if (phase === 'path') {
      states[result.path[pathCursor++]] = 3;
      if (pathCursor === result.path.length) {
        phase = 'done';
        setSummary(`${algorithm === 'bfs' ? 'Fewest moves' : 'Lowest cost'} · ${result.path.length - 1} steps · cost ${result.cost} · ${stats.visited.toLocaleString()} explored.`);
      }
    }
  }

  function animate(now) {
    if (!playing) return;
    const delta = now - lastFrame; lastFrame = now;
    const speed = phase === 'path' ? Math.min(180, rates[$('speed').value - 1]) : rates[$('speed').value - 1];
    // shortcut: background-tab catch-up is capped to keep returning to the canvas responsive.
    budget = Math.min(budget + delta * speed / 1000, Math.max(1, speed / 10));
    const before = performance.now();
    let advanced = 0;
    while (budget >= 1 && busy() && performance.now() - before < 8) {
      advance(); budget--; advanced++;
    }
    if (advanced) draw(true);
    if (!busy()) { stopClock(); syncControls(); }
    updateMetrics();
    if (playing) frame = requestAnimationFrame(animate);
  }

  function togglePlay() {
    if (comparing) return;
    if (playing) {
      stopClock(); syncControls(); updateMetrics();
      setSummary('Paused. Inspect the grid or advance one step.');
    } else {
      if (!busy()) {
        const before = performance.now();
        initializeSearch();
        stats.activeMs += performance.now() - before;
      }
      playing = true; activeStart = performance.now(); lastFrame = activeStart; budget = 0;
      syncControls(); setSummary(`${names[algorithm]} ${phase === 'path' ? 'is tracing the route.' : 'is exploring the grid.'}`);
      frame = requestAnimationFrame(animate);
    }
  }

  $('run').addEventListener('click', togglePlay);
  $('step').addEventListener('click', () => {
    const before = performance.now();
    if (!busy()) initializeSearch();
    advance(); draw(true);
    stats.activeMs += performance.now() - before;
    syncControls(); updateMetrics();
    if (busy()) setSummary(`Paused · ${stats.visited.toLocaleString()} nodes explored. Advance or resume.`);
  });

  function selectTool(next) {
    tool = next;
    document.querySelectorAll('[data-tool]').forEach(button => {
      const selected = button.dataset.tool === tool;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    syncControls();
  }
  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => selectTool(button.dataset.tool)));
  document.querySelectorAll('[data-algorithm]').forEach(button => button.addEventListener('click', () => {
    algorithm = button.dataset.algorithm;
    clearSearch();
    document.querySelectorAll('[data-algorithm]').forEach(other => {
      const selected = other === button;
      other.classList.toggle('selected', selected); other.setAttribute('aria-pressed', String(selected));
    });
    $('algorithm-note').textContent = notes[algorithm]; $('insight-text').innerHTML = insights[algorithm];
  }));

  function loadLayout(name) {
    clearSearch(); board = createLayout(name, COLS, ROWS); keyboardCell = board.start;
    $('layout').value = name; invalidateComparison(); draw(); updateMetrics(); dirty = true; saveBoard();
    setSummary(name === 'random' ? 'Scattered barriers loaded. Some layouts may have no route.' : 'Your canvas is ready.');
  }
  $('layout').addEventListener('change', event => loadLayout(event.target.value));
  $('generate-maze').addEventListener('click', () => {
    clearSearch(); board = createMaze(COLS, ROWS, Number($('maze-complexity').value)); keyboardCell = board.start;
    $('layout').value = 'custom'; invalidateComparison(); draw(); updateMetrics(); dirty = true; saveBoard();
    setSummary('Connected maze generated. There is a route between the markers.');
  });
  $('clear-board').addEventListener('click', () => { loadLayout('empty'); selectTool('wall'); });
  $('clear-path').addEventListener('click', () => clearSearch('Visualization cleared. Your walls are still here.'));
  $('speed').addEventListener('input', () => {
    const speed = rates[$('speed').value - 1];
    $('speed-value').textContent = `${speed.toLocaleString()}/s`;
    $('speed').setAttribute('aria-valuetext', `${speed} nodes per second`);
  });

  function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(COLS - 1, Math.floor((event.clientX - rect.left) / rect.width * COLS)));
    const y = Math.max(0, Math.min(ROWS - 1, Math.floor((event.clientY - rect.top) / rect.height * ROWS)));
    return y * COLS + x;
  }
  function describeCell(id) {
    const cost = board.weights.get(id) || 1, material = { 3: 'sand', 5: 'mud', 9: 'water' }[cost];
    const kind = id === board.start ? 'start' : id === board.end ? 'goal' : board.walls.has(id) ? 'wall' : `${material || 'open'}, entry cost ${cost}`;
    $('coordinates').textContent = `X ${String(id % COLS + 1).padStart(2, '0')}  Y ${String(Math.floor(id / COLS) + 1).padStart(2, '0')}`;
    return `Column ${id % COLS + 1}, row ${Math.floor(id / COLS) + 1}, ${kind}.`;
  }
  function paint(id, brush) {
    if (brush === 'start' && id !== board.end) { board.start = id; board.walls.delete(id); board.weights.delete(id); }
    else if (brush === 'goal' && id !== board.start) { board.end = id; board.walls.delete(id); board.weights.delete(id); }
    else if (brush === 'erase') { board.walls.delete(id); board.weights.delete(id); }
    else if (id !== board.start && id !== board.end) {
      if (brush === 'wall') { board.walls.add(id); board.weights.delete(id); }
      else if (terrainCosts[brush]) { board.walls.delete(id); board.weights.set(id, terrainCosts[brush]); }
    }
    $('layout').value = 'custom';
    dirty = true; invalidateComparison();
  }

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 2) return;
    if (comparing || playing) return;
    event.preventDefault(); canvas.focus({ preventScroll: true });
    const id = cellAt(event);
    if (busy() || tool === 'inspect') { keyboardCell = id; inspect(id); return; }
    let brush = event.button === 2 ? 'erase' : tool;
    if (tool === 'wall' || tool === 'erase') {
      if (id === board.start) brush = 'start';
      else if (id === board.end) brush = 'goal';
      else if (brush === 'wall' && board.walls.has(id)) brush = 'erase';
    }
    clearSearch('Canvas updated. Ready for a new route.');
    gesture = { brush, last: id, pointerId: event.pointerId };
    keyboardCell = id; hover = id;
    if (brush !== 'start' && brush !== 'goal') paint(id, brush);
    canvas.setPointerCapture(event.pointerId);
    draw(); updateMetrics();
  });
  canvas.addEventListener('pointermove', event => {
    const id = cellAt(event); hover = id; describeCell(id);
    if (gesture && gesture.pointerId === event.pointerId && !busy() && !comparing) {
      if (gesture.brush !== 'start' && gesture.brush !== 'goal') {
        for (const cell of rasterLine(gesture.last, id, COLS)) paint(cell, gesture.brush);
      }
      gesture.last = id; keyboardCell = id; updateMetrics();
    }
    if (!playing && !comparing) draw();
  });
  function finishGesture(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if ((gesture.brush === 'start' || gesture.brush === 'goal') && event.type !== 'pointercancel') paint(gesture.last, gesture.brush);
    $('cell-announcement').textContent = describeCell(gesture.last);
    gesture = null;
    saveBoard(); draw(); updateMetrics();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', finishGesture);
  canvas.addEventListener('pointercancel', finishGesture);
  canvas.addEventListener('lostpointercapture', finishGesture);
  canvas.addEventListener('pointerleave', () => { if (!gesture) hover = null; if (!busy()) draw(); });
  canvas.addEventListener('focus', () => { if (!busy()) draw(); });
  canvas.addEventListener('blur', () => { hover = null; if (!busy()) draw(); });
  canvas.addEventListener('keydown', event => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
    if (event.key in moves) {
      event.preventDefault();
      const x = keyboardCell % COLS;
      if ((event.key === 'ArrowLeft' && x === 0) || (event.key === 'ArrowRight' && x === COLS - 1)) return;
      keyboardCell = Math.max(0, Math.min(SIZE - 1, keyboardCell + moves[event.key]));
      hover = null; $('cell-announcement').textContent = describeCell(keyboardCell); draw();
    } else if (event.key === 'Enter' && !playing && !comparing) {
      if (busy() || tool === 'inspect') { event.preventDefault(); inspect(keyboardCell); return; }
      event.preventDefault(); clearSearch('Canvas updated with the keyboard.');
      paint(keyboardCell, tool); $('cell-announcement').textContent = describeCell(keyboardCell); draw(); updateMetrics(); saveBoard();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,textarea,select,button,dialog') || $('help-dialog').open || $('import-dialog').open || comparing) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    else if (!busy()) {
      const shortcuts = { w: 'wall', e: 'erase', s: 'start', g: 'goal', '3': 'sand', '5': 'mud', '9': 'water', i: 'inspect' };
      if (shortcuts[event.key.toLowerCase()]) { event.preventDefault(); selectTool(shortcuts[event.key.toLowerCase()]); }
    }
  });

  const help = $('help-dialog');
  $('help-button').addEventListener('click', () => help.showModal());
  $('metrics-help').addEventListener('click', () => help.showModal());
  $('close-help').addEventListener('click', () => help.close());
  help.addEventListener('click', event => { if (event.target === help) { const r = help.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) help.close(); } });
  $('export-map').addEventListener('click', () => {
    try {
      const url = URL.createObjectURL(new Blob([serializeMap(board, COLS, ROWS)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'pathlab-map.json';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { $('save-status').textContent = 'Export failed. Your current map is still on the canvas.'; }
  });
  const importDialog = $('import-dialog');
  let fileReadVersion = 0;
  $('import-map').addEventListener('click', () => { $('import-error').textContent = ''; importDialog.showModal(); });
  $('close-import').addEventListener('click', () => importDialog.close());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const version = ++fileReadVersion;
    $('import-json').value = ''; $('import-apply').disabled = true;
    try {
      if (file.size > 256 * 1024) throw new Error('Map files must be 256 KiB or smaller.');
      const contents = await file.text();
      if (version === fileReadVersion) { $('import-json').value = contents; $('import-error').textContent = ''; }
    } catch (error) { if (version === fileReadVersion) $('import-error').textContent = error.message || 'Could not read the file.'; }
    finally { if (version === fileReadVersion) { $('import-apply').disabled = false; event.target.value = ''; } }
  });
  $('import-apply').addEventListener('click', () => {
    if (busy() || comparing) return;
    try {
      const imported = parseMap($('import-json').value, COLS, ROWS);
      clearSearch(); board = imported; keyboardCell = board.start; $('layout').value = 'custom';
      invalidateComparison(); draw(); updateMetrics(); dirty = true; saveBoard(); importDialog.close();
      setSummary('Map imported. Ready to explore.');
    } catch (error) { $('import-error').textContent = error.message; }
  });
  $('compare').addEventListener('click', async () => {
    if (busy() || comparing) return;
    if (gesture) finishGesture({ pointerId: gesture.pointerId });
    comparing = true; syncControls();
    $('comparison-status').textContent = 'Comparing the same map…'; $('comparison-results').hidden = true;
    const snapshot = { ...board, walls: new Set(board.walls), weights: new Map(board.weights), cols: COLS, rows: ROWS };
    const algorithms = ['astar', 'dijkstra', 'bfs'], runs = Object.fromEntries(algorithms.map(key => [key, []]));
    const outcomes = {};
    try {
      for (let round = 0; round < 6; round++) {
        await new Promise(resolve => setTimeout(resolve, 0));
        for (let offset = 0; offset < algorithms.length; offset++) {
          const key = algorithms[(offset + round) % algorithms.length], before = performance.now();
          const search = createSearch({ ...snapshot, algorithm: key });
          let next;
          do { next = search.next(); } while (!next.done);
          const duration = performance.now() - before;
          if (round > 0) runs[key].push(duration);
          outcomes[key] = next.value;
        }
      }
      $('comparison-rows').replaceChildren();
      const bestCost = Math.min(...algorithms.filter(key => outcomes[key].found).map(key => outcomes[key].cost));
      for (const key of algorithms) {
        const outcome = outcomes[key], row = document.createElement('tr');
        const median = runs[key].sort((a, b) => a - b)[2];
        const values = [names[key], outcome.found ? outcome.path.length - 1 : 'No route', outcome.found ? outcome.cost : '—', outcome.visitedCount, outcome.peakFrontier, median < .01 ? '<0.01' : median.toFixed(2)];
        values.forEach((value, index) => { const cell = document.createElement(index === 0 ? 'th' : 'td'); cell.textContent = value; if (index === 0) cell.scope = 'row'; if (index === 2 && outcome.cost === bestCost) cell.className = 'best-cost'; row.append(cell); });
        $('comparison-rows').append(row);
      }
      $('comparison-results').hidden = false;
      $('comparison-status').textContent = board.weights.size ? 'A* and Dijkstra minimize cost. BFS minimizes moves; compare its total cost.' : 'With unit costs, BFS and Dijkstra explore in the same order. Small timing differences can be noise.';
    } catch (error) { $('comparison-status').textContent = `Comparison failed: ${error.message}`; }
    finally { comparing = false; syncControls(); }
  });
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved !== null) { board = parseMap(saved, COLS, ROWS); keyboardCell = board.start; $('layout').value = 'custom'; $('save-status').textContent = 'Restored your saved map'; }
  } catch { $('save-status').textContent = 'Saved map unavailable. Export to keep changes; edits will try saving again.'; }
  window.addEventListener('pagehide', () => { if (dirty) saveBoard(); });
  new ResizeObserver(resize).observe(canvas);
  syncControls(); resize(); updateMetrics();
})();
