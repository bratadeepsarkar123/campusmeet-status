'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { selectIncidents } = require('./incidents');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderSite(data, now = new Date()) {
  const updatedAt = new Date(data.updatedAt);
  if (!Number.isFinite(updatedAt.getTime()) || updatedAt.getTime() > now.getTime()) throw new Error('Invalid snapshot timestamp');
  const incidents = selectIncidents(data.incidents, now);
  const open = incidents.filter(item => item.status === 'open');
  const resolved = incidents.filter(item => item.status === 'resolved');
  const stale = now.getTime() - updatedAt.getTime() > 30 * 60 * 1000;
  const overall = stale ? 'Status unknown — updates are delayed' :
    open.some(item => item.severity === 'SEV1 outage') ? 'Service outage' :
      open.some(item => item.severity === 'SEV2 degraded') ? 'Degraded service' :
        open.length ? 'Minor service issue' : 'All systems operational';
  function cards(items, empty) {
    return items.length ? items.map(item => `<article>
<h3>${escapeHtml(item.summary)}</h3>
<p>${escapeHtml(item.severity)} · ${escapeHtml(item.status === 'open' ? 'Open' : 'Resolved')}</p>
${item.security ? '' : `<p>Affected area: ${escapeHtml(item.area)}</p>
<p>Started: <time datetime="${escapeHtml(item.startedAt)}">${escapeHtml(item.startedAt)}</time>${item.resolvedAt ? ` · Resolved: <time datetime="${escapeHtml(item.resolvedAt)}">${escapeHtml(item.resolvedAt)}</time>` : ''}</p>`}
</article>`).join('\n') : `<p>${escapeHtml(empty)}</p>`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>CampusMeet status</title>
</head>
<body>
<header><h1>CampusMeet status</h1><p>Service updates</p></header>
<main>
<section aria-labelledby="overall"><h2 id="overall">Overall status</h2><p>${escapeHtml(overall)}</p></section>
<p>Last successful update: <time datetime="${escapeHtml(updatedAt.toISOString())}">${escapeHtml(updatedAt.toISOString())}</time>. All times are UTC.</p>
<section aria-labelledby="open"><h2 id="open">Open incidents</h2>${cards(open, 'No open incidents.')}</section>
<section aria-labelledby="resolved"><h2 id="resolved">Resolved incidents — last 90 days</h2>${cards(resolved, 'No resolved incidents in the last 90 days.')}</section>
</main>
<footer><p>This page reflects the latest published snapshot. If updates stop, check the last successful update time.</p></footer>
</body>
</html>
`;
}

function build(root = path.resolve(__dirname, '..'), now = new Date()) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'incidents.json'), 'utf8'));
  const html = renderSite(data, now);
  fs.mkdirSync(path.join(root, 'site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'site', 'index.html'), html);
  fs.writeFileSync(path.join(root, 'site', '.nojekyll'), '');
}

if (require.main === module) build();
module.exports = { escapeHtml, renderSite, build };
