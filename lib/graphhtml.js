'use strict';

/*
 * Standalone HTML export for the 3D project graph (the CLI's /graph command).
 * Inlines desktop/graph-client.js and the scanned graph data into one
 * self-contained file that opens in any browser, fully offline.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_PATH = path.join(__dirname, 'graph-client.browser.js');

// </script> inside embedded JSON/JS would terminate our script block early.
function safeScript(text) {
  return String(text).replace(/<\/script/gi, '<\\/script');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function build(data) {
  const client = fs.readFileSync(CLIENT_PATH, 'utf8');
  const title = `GolDid graph — ${path.basename(data.root)}`;
  const nodeCount = (data.nodes || []).length;
  const edgeCount = (data.edges || data.links || []).length;
  const summary = `${data.root} · ${nodeCount} files · ${edgeCount} connections`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body {
    display: grid; grid-template-rows: auto 1fr; font-family: "Segoe UI", system-ui, sans-serif;
    background: #0b1018; color: #f4f7fb;
  }
  header {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid #25324a; background: #111824;
  }
  header h1 { font-size: 15px; color: #ffd36c; margin-right: 6px; }
  header small { color: #94a3bd; overflow-wrap: anywhere; }
  #search {
    margin-left: auto; min-width: 260px; padding: 7px 10px; border-radius: 6px;
    border: 1px solid #41516b; background: #0c1320; color: #f4f7fb; font: inherit;
  }
  #hits { color: #94a3bd; font-size: 12px; min-width: 90px; }
  main { position: relative; min-height: 0; background: radial-gradient(circle at 50% 42%, #1b2637 0, #0b1018 58%, #070b11 100%); }
  canvas { display: block; width: 100%; height: 100%; cursor: grab; }
  canvas:active { cursor: grabbing; }
  #tooltip {
    position: absolute; z-index: 2; max-width: 380px; padding: 8px 10px;
    border: 1px solid #41516b; border-radius: 6px; background: #101722f2; color: #f4f7fb;
    font: 12px Consolas, monospace; pointer-events: none; overflow-wrap: anywhere;
  }
  #tooltip strong { display: block; color: #ffd36c; }
  footer-note { display: none; }
</style>
</head>
<body>
<header>
  <h1>GolDid project graph</h1>
  <small>${escapeHtml(summary)}</small>
  <input id="search" type="search" placeholder="Find a file (substring or wildcard like lib/*.js)" autofocus>
  <span id="hits"></span>
</header>
<main>
  <canvas id="graph"></canvas>
  <div id="tooltip" hidden></div>
</main>
<script>
${safeScript(client)}
</script>
<script>
(function () {
  var data = ${safeScript(JSON.stringify(data))};
  var canvas = document.getElementById('graph');
  var graph = window.GoldidGraph.create(canvas, document.getElementById('tooltip'));
  graph.setData(data);
  window.addEventListener('resize', function () { graph.resize(); });
  var search = document.getElementById('search');
  var hits = document.getElementById('hits');
  search.addEventListener('input', function () {
    var q = search.value.trim();
    if (!q) { graph.clearSearch(); hits.textContent = ''; return; }
    var r = graph.search(q);
    hits.textContent = r.count + ' match' + (r.count === 1 ? '' : 'es');
  });
})();
</script>
</body>
</html>`;
}

module.exports = { build };
