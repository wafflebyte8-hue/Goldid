'use strict';

/*
 * GolDid 3D project-graph renderer for the BROWSER (not a Node module).
 * Dependency-free: plain canvas 2D with a hand-rolled 3D projection and force
 * layout. lib/graphhtml.js inlines this file into the standalone HTML page
 * that the CLI's /graph command generates. The desktop app has its own
 * renderer inside desktop/renderer.js; both consume lib/project-graph.js data.
 *
 * window.GoldidGraph.create(canvas, tooltip) -> {
 *   setData(data)            load { nodes, edges } from lib/project-graph.js
 *   search(query)            highlight matches, fly to the first; -> {count, firstId}
 *   clearSearch()
 *   setRotationDeg({x,y,z})  sync from sliders
 *   setOffsetSlider({x,y,z}) sync from sliders
 *   onRotate(cb)             notified (degrees) while the user drags
 *   resize() destroy()
 * }
 */

(function () {
  const PALETTE = [
    '#ffd36c', '#7aa2ff', '#5fd0a5', '#e487ff', '#ff8f6b',
    '#6be1ff', '#c9d36c', '#9a8cff', '#ff7ab8', '#f2b84b',
  ];

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Deterministic RNG so the same project always lays out the same way.
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function matcherFor(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    if (q.includes('*') || q.includes('?')) {
      const escaped = q.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
      return (id) => re.test(id);
    }
    const needle = q.toLowerCase();
    return (id) => id.toLowerCase().includes(needle);
  }

  function prettySize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // Cluster nodes by top-level folder on a sphere, then relax with a simple
  // force pass (repulsion + link springs + centering), time-budgeted.
  function layout(nodes, links) {
    const groups = [...new Set(nodes.map((n) => n.group))];
    const centers = new Map();
    const golden = Math.PI * (3 - Math.sqrt(5));
    const R = 150 + nodes.length * 0.35;
    groups.forEach((g, i) => {
      const t = groups.length === 1 ? 0.5 : i / (groups.length - 1);
      const y = 1 - t * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = golden * i;
      centers.set(g, { x: Math.cos(a) * r * R, y: y * R * 0.8, z: Math.sin(a) * r * R });
    });
    for (const n of nodes) {
      const c = centers.get(n.group);
      const rnd = mulberry(hashCode(n.id));
      const spread = 40 + Math.sqrt(nodes.length) * 3;
      n.x = c.x + (rnd() - 0.5) * spread;
      n.y = c.y + (rnd() - 0.5) * spread;
      n.z = c.z + (rnd() - 0.5) * spread;
    }
    const index = new Map(nodes.map((n) => [n.id, n]));
    const edges = links
      .map((l) => [index.get(l.source), index.get(l.target)])
      .filter((p) => p[0] && p[1]);
    const started = Date.now();
    const maxIter = nodes.length > 800 ? 40 : nodes.length > 300 ? 90 : 160;
    for (let iter = 0; iter < maxIter && Date.now() - started < 1500; iter++) {
      const k = 1 - iter / maxIter; // cooling
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          const d2 = dx * dx + dy * dy + dz * dz + 0.01;
          if (d2 > 90000) continue;
          const f = (900 * k) / d2;
          dx *= f; dy *= f; dz *= f;
          a.x += dx; a.y += dy; a.z += dz;
          b.x -= dx; b.y -= dy; b.z -= dz;
        }
      }
      for (const [a, b] of edges) {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
        const f = ((d - 70) / d) * 0.04 * k;
        a.x += dx * f; a.y += dy * f; a.z += dz * f;
        b.x -= dx * f; b.y -= dy * f; b.z -= dz * f;
      }
      for (const n of nodes) {
        n.x *= 1 - 0.003 * k; n.y *= 1 - 0.003 * k; n.z *= 1 - 0.003 * k;
      }
    }
    let radius = 1;
    for (const n of nodes) {
      radius = Math.max(radius, Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z));
    }
    return radius;
  }

  function create(canvas, tooltip) {
    const ctx = canvas.getContext('2d');
    const state = {
      nodes: [],
      links: [],
      edges: [],
      groups: new Map(), // group -> color
      rot: { x: -0.35, y: 0.6, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      camDist: 600,
      fov: 640,
      matched: null, // Set of highlighted ids, or null
      selectedId: null,
      hoverId: null,
      focusId: null,
      autoRotate: true,
      dirty: true,
      destroyed: false,
      rotateCbs: [],
      dpr: Math.max(1, window.devicePixelRatio || 1),
    };

    function color(group) {
      if (!state.groups.has(group)) {
        state.groups.set(group, PALETTE[hashCode(group) % PALETTE.length]);
      }
      return state.groups.get(group);
    }

    function rotate(p) {
      const { x: rx, y: ry, z: rz } = state.rot;
      let { x, y, z } = p;
      let c = Math.cos(ry), s = Math.sin(ry);
      let t = x * c + z * s; z = -x * s + z * c; x = t;
      c = Math.cos(rx); s = Math.sin(rx);
      t = y * c - z * s; z = y * s + z * c; y = t;
      c = Math.cos(rz); s = Math.sin(rz);
      t = x * c - y * s; y = x * s + y * c; x = t;
      return { x, y, z };
    }

    function project(p) {
      const r = rotate(p);
      const x = r.x + state.offset.x;
      const y = r.y + state.offset.y;
      const z = r.z + state.offset.z;
      const depth = state.fov + state.camDist + z;
      if (depth < 60) return null;
      const s = state.fov / depth;
      return {
        sx: canvas.width / (2 * state.dpr) + x * s,
        sy: canvas.height / (2 * state.dpr) + y * s,
        s,
        depth,
      };
    }

    function neighborSet(id) {
      const set = new Set([id]);
      for (const [a, b] of state.edges) {
        if (a.id === id) set.add(b.id);
        if (b.id === id) set.add(a.id);
      }
      return set;
    }

    function draw() {
      const w = canvas.width / state.dpr;
      const h = canvas.height / state.dpr;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const focusSet = state.selectedId ? neighborSet(state.selectedId) : null;
      const dimmed = (id) =>
        (state.matched && !state.matched.has(id)) || (focusSet && !focusSet.has(id));

      // links
      for (const [a, b] of state.edges) {
        const pa = project(a), pb = project(b);
        if (!pa || !pb) continue;
        const lit = (state.matched && state.matched.has(a.id) && state.matched.has(b.id)) ||
          (focusSet && focusSet.has(a.id) && focusSet.has(b.id));
        const alpha = dimmed(a.id) && dimmed(b.id)
          ? 0.04
          : Math.max(0.07, Math.min(0.5, (pa.s + pb.s) * 0.28));
        ctx.strokeStyle = lit ? 'rgba(255, 211, 108, 0.85)' : `rgba(150, 170, 205, ${alpha})`;
        ctx.lineWidth = lit ? 1.4 : 0.7;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.stroke();
      }

      // nodes, back to front
      const drawn = [];
      for (const n of state.nodes) {
        const p = project(n);
        if (!p) { n._sx = -1; continue; }
        n._sx = p.sx; n._sy = p.sy; n._s = p.s;
        drawn.push([n, p]);
      }
      drawn.sort((u, v) => v[1].depth - u[1].depth);
      for (const [n, p] of drawn) {
        const degree = (n.in || 0) + (n.out || 0);
        const r = (2.1 + Math.min(6, Math.sqrt(degree) * 1.25)) * Math.max(0.45, p.s);
        const isDim = dimmed(n.id);
        const isHit = state.matched && state.matched.has(n.id);
        const isSel = n.id === state.selectedId || n.id === state.hoverId;
        ctx.globalAlpha = isDim ? 0.14 : Math.max(0.55, Math.min(1, p.s + 0.25));
        ctx.fillStyle = color(n.group);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (isHit || isSel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffd36c';
          ctx.lineWidth = isSel ? 2 : 1.2;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if ((isSel || (isHit && state.matched.size <= 12)) && !isDim) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#f4f7fb';
          ctx.font = '11px Consolas, monospace';
          ctx.fillText(n.name, p.sx + r + 4, p.sy + 3);
        }
      }
      ctx.globalAlpha = 1;
    }

    function frame() {
      if (state.destroyed) return;
      if (state.autoRotate) {
        state.rot.y += 0.0022;
        state.dirty = true;
      }
      if (state.focusId) {
        const n = state.nodes.find((x) => x.id === state.focusId);
        if (n) {
          const r = rotate(n);
          state.offset.x += (-r.x - state.offset.x) * 0.16;
          state.offset.y += (-r.y - state.offset.y) * 0.16;
          state.offset.z += (Math.min(0, 120 - state.camDist) - state.offset.z) * 0.08;
          if (Math.abs(state.offset.x + r.x) < 1 && Math.abs(state.offset.y + r.y) < 1) {
            state.focusId = null;
          }
          state.dirty = true;
        } else {
          state.focusId = null;
        }
      }
      if (state.dirty) {
        state.dirty = false;
        draw();
      }
      requestAnimationFrame(frame);
    }

    function nodeAt(mx, my) {
      let best = null;
      let bestD = 144; // 12px
      for (const n of state.nodes) {
        if (n._sx == null || n._sx < 0) continue;
        const dx = n._sx - mx, dy = n._sy - my;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    }

    function showTooltip(n, mx, my) {
      if (!tooltip) return;
      if (!n) { tooltip.hidden = true; return; }
      tooltip.textContent = '';
      const title = document.createElement('strong');
      title.textContent = n.id;
      const meta = document.createElement('div');
      const size = n.size != null ? prettySize(n.size) + ' · ' : '';
      meta.textContent = `${n.group} · ${size}${n.out || 0} imports · ${n.in || 0} imported by`;
      tooltip.append(title, meta);
      tooltip.hidden = false;
      const host = tooltip.parentElement || canvas.parentElement;
      const maxX = (host ? host.clientWidth : canvas.clientWidth) - tooltip.offsetWidth - 8;
      const maxY = (host ? host.clientHeight : canvas.clientHeight) - tooltip.offsetHeight - 8;
      tooltip.style.left = Math.max(4, Math.min(mx + 14, maxX)) + 'px';
      tooltip.style.top = Math.max(4, Math.min(my + 14, maxY)) + 'px';
    }

    let dragging = false;
    let moved = false;
    let lastX = 0, lastY = 0;

    function onPointerDown(e) {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      state.autoRotate = false;
      if (canvas.setPointerCapture && e.pointerId != null) {
        canvas.setPointerCapture(e.pointerId);
      }
    }

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        lastX = e.clientX;
        lastY = e.clientY;
        state.rot.y += dx * 0.005;
        state.rot.x += dy * 0.005;
        state.focusId = null;
        state.dirty = true;
        const deg = api.getRotationDeg();
        for (const cb of state.rotateCbs) cb(deg);
        return;
      }
      const n = nodeAt(mx, my);
      if ((n && n.id) !== state.hoverId) {
        state.hoverId = n ? n.id : null;
        state.dirty = true;
      }
      showTooltip(n, mx, my);
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      if (moved) return;
      const rect = canvas.getBoundingClientRect();
      const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      state.selectedId = n && n.id !== state.selectedId ? n.id : null;
      state.dirty = true;
    }

    function onWheel(e) {
      e.preventDefault();
      state.autoRotate = false;
      state.camDist = Math.max(120, Math.min(3200, state.camDist + e.deltaY * 0.9));
      state.dirty = true;
    }

    function onLeave() {
      state.hoverId = null;
      state.dirty = true;
      if (tooltip) tooltip.hidden = true;
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const api = {
      setData(data) {
        // Accepts lib/project-graph.js output: nodes [{ id, label, group, size }]
        // and edges [{ source, target }] (a `links` key works too).
        state.nodes = (data.nodes || []).map((n) => ({
          ...n,
          name: n.label || n.name || String(n.id).split('/').pop(),
          group: n.group || '(root)',
          in: 0,
          out: 0,
        }));
        state.links = (data.links || data.edges || []).map((l) => ({ ...l }));
        const degreeIndex = new Map(state.nodes.map((n) => [n.id, n]));
        for (const l of state.links) {
          const a = degreeIndex.get(l.source);
          const b = degreeIndex.get(l.target);
          if (a && b) { a.out++; b.in++; }
        }
        const radius = layout(state.nodes, state.links);
        const index = new Map(state.nodes.map((n) => [n.id, n]));
        state.edges = state.links
          .map((l) => [index.get(l.source), index.get(l.target)])
          .filter((p) => p[0] && p[1]);
        state.camDist = Math.max(360, radius * 2.1);
        state.offset = { x: 0, y: 0, z: 0 };
        state.matched = null;
        state.selectedId = null;
        state.focusId = null;
        state.autoRotate = true;
        state.dirty = true;
      },
      search(query) {
        const match = matcherFor(query);
        if (!match) {
          api.clearSearch();
          return { count: 0, firstId: null };
        }
        const hits = state.nodes.filter((n) => match(n.id));
        state.matched = new Set(hits.map((n) => n.id));
        state.selectedId = hits.length === 1 ? hits[0].id : null;
        state.focusId = hits.length ? hits[0].id : null;
        state.autoRotate = false;
        state.dirty = true;
        return { count: hits.length, firstId: hits.length ? hits[0].id : null };
      },
      clearSearch() {
        state.matched = null;
        state.focusId = null;
        state.dirty = true;
      },
      setRotationDeg(deg) {
        if (deg.x != null) state.rot.x = (deg.x * Math.PI) / 180;
        if (deg.y != null) state.rot.y = (deg.y * Math.PI) / 180;
        if (deg.z != null) state.rot.z = (deg.z * Math.PI) / 180;
        state.autoRotate = false;
        state.dirty = true;
      },
      getRotationDeg() {
        const norm = (r) => {
          let d = ((r * 180) / Math.PI) % 360;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          return Math.round(d);
        };
        return { x: norm(state.rot.x), y: norm(state.rot.y), z: norm(state.rot.z) };
      },
      setOffsetSlider(off) {
        if (off.x != null) state.offset.x = Number(off.x);
        if (off.y != null) state.offset.y = Number(off.y);
        if (off.z != null) state.offset.z = Number(off.z);
        state.focusId = null;
        state.autoRotate = false;
        state.dirty = true;
      },
      onRotate(cb) {
        state.rotateCbs.push(cb);
      },
      resize() {
        state.dpr = Math.max(1, window.devicePixelRatio || 1);
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = Math.max(1, Math.round(w * state.dpr));
        canvas.height = Math.max(1, Math.round(h * state.dpr));
        state.dirty = true;
      },
      destroy() {
        state.destroyed = true;
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('wheel', onWheel);
      },
    };

    api.resize();
    requestAnimationFrame(frame);
    return api;
  }

  window.GoldidGraph = { create };
})();
