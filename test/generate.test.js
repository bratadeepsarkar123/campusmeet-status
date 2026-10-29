'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSite, escapeHtml } = require('../scripts/generate');
const { cleanSummary, issuesToIncidents, selectIncidents, SECURITY_MESSAGE } = require('../scripts/incidents');
const now = new Date('2026-10-30T12:00:00Z');
const base = { severity: 'SEV2 degraded', status: 'open', security: false,
  area: 'Website', summary: 'Service is slow', startedAt: '2026-10-30T10:00:00Z', resolvedAt: null };
const page = incidents => renderSite({ updatedAt: now.toISOString(), incidents }, now);
function issue(overrides = {}) {
  return {
    title: 'PRIVATE_TITLE', state: 'open', labels: [{ name: 'incident' }],
    created_at: base.startedAt, closed_at: null,
    body: ['PRIVATE_PREAMBLE', '### Title', '', 'PRIVATE_INTERNAL_TITLE', '',
      '### Severity', '', 'SEV2 degraded', '', '### Affected area', '', 'Website', '',
      '### Started at', '', base.startedAt, '', '### Public summary', '', 'Approved update', '',
      '### Security incident', '', '- [ ] This is a security incident', '',
      '### Internal notes', '', 'PRIVATE_BODY'].join('\n'),
    comments: [{ body: 'PRIVATE_COMMENT' }], html_url: 'PRIVATE_URL', ...overrides
  };
}

test('HTML-escapes all five special characters', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  const html = page([{ ...base, summary: `A & "B" 'C'` }]);
  assert.ok(html.includes('A &amp; &quot;B&quot; &#39;C&#39;'));
});

test('strips HTML, scripts, styles and comments before rendering', () => {
  const summary = '<b>Slow</b><script>PRIVATE_SCRIPT</script><style>PRIVATE_STYLE</style><!--PRIVATE_COMMENT--> &lt;img src=x&gt;';
  const html = page([{ ...base, summary }]);
  assert.ok(html.includes('Slow &amp;lt;img src=x&amp;gt;'));
  for (const marker of ['<b>', '<script>', 'PRIVATE_SCRIPT', 'PRIVATE_STYLE', 'PRIVATE_COMMENT']) assert.ok(!html.includes(marker));
});

test('security incidents expose only generic text, severity and status in their card', () => {
  const html = page([{ ...base, security: true, summary: 'PRIVATE_SECURITY', area: 'Payments' }]);
  assert.ok(html.includes(`<h3>${SECURITY_MESSAGE}</h3>`));
  assert.ok(html.includes('SEV2 degraded · Open'));
  for (const marker of ['PRIVATE_SECURITY', 'Payments', 'Affected area:', 'Started:']) assert.ok(!html.includes(marker));
});

test('caps public summaries at 280 Unicode code points without splitting emoji', () => {
  assert.equal(Array.from(cleanSummary('😀'.repeat(281))).length, 280);
  const html = page([{ ...base, summary: 'a'.repeat(280) + 'PRIVATE_TAIL' }]);
  assert.ok(html.includes(`<h3>${'a'.repeat(280)}</h3>`));
  assert.ok(!html.includes('PRIVATE_TAIL'));
});

test('exports only fixed public fields; private issue body, title, comments and URL never reach JSON or HTML', () => {
  const incidents = issuesToIncidents([issue()], now);
  const output = JSON.stringify(incidents) + page(incidents);
  assert.ok(output.includes('Approved update'));
  assert.ok(!output.includes('PRIVATE_'));
  assert.deepEqual(Object.keys(incidents[0]).sort(), ['area', 'resolvedAt', 'security', 'severity', 'startedAt', 'status', 'summary']);
});

test('redacts checked security fields from public JSON as well as HTML', () => {
  const raw = issue();
  raw.body = raw.body.replace('- [ ]', '- [x]').replace('Approved update', 'PRIVATE_SECURITY');
  const incidents = issuesToIncidents([raw], now);
  assert.equal(incidents[0].summary, SECURITY_MESSAGE);
  assert.ok(!('area' in incidents[0]));
  assert.ok(!(JSON.stringify(incidents) + page(incidents)).includes('PRIVATE_SECURITY'));
});

test('missing, ambiguous or malformed security fields fail closed', () => {
  for (const body of [issue().body.replace('### Security incident', '### Other'),
    issue().body + '\n### Security incident\n- [ ] This is a security incident',
    issue().body.replace('- [ ]', '- [?]')]) {
    assert.equal(issuesToIncidents([issue({ body })], now)[0].security, true);
  }
  assert.ok(!page([{ ...base, security: undefined, summary: 'PRIVATE_SECURITY' }]).includes('PRIVATE_SECURITY'));
});

test('unknown area and severity cannot inject public text', () => {
  const incidents = issuesToIncidents([issue({ body: issue().body
    .replace('Website', 'PRIVATE_AREA<script>')
    .replace('SEV2 degraded', 'PRIVATE_SEVERITY') })], now);
  assert.equal(incidents[0].area, 'Other');
  assert.equal(incidents[0].severity, 'SEV2 degraded');
  assert.ok(!(JSON.stringify(incidents) + page(incidents)).includes('PRIVATE_'));
});

test('duplicate public-summary headings do not publish ambiguous content', () => {
  const incidents = issuesToIncidents([issue({ body: issue().body + '\n### Public summary\nPRIVATE_DUPLICATE' })], now);
  assert.equal(incidents[0].summary, SECURITY_MESSAGE);
});

test('includes all open incidents and exactly the rolling 90-day resolved window', () => {
  const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
  const rows = [base, { ...base, summary: 'At cutoff', status: 'resolved', resolvedAt: cutoff },
    { ...base, summary: 'Too old', status: 'resolved', resolvedAt: new Date(Date.parse(cutoff) - 1).toISOString() },
    { ...base, summary: 'Future', status: 'resolved', resolvedAt: '2026-11-01T00:00:00Z' },
    { ...base, summary: 'Old open', startedAt: '2020-01-01T00:00:00Z' }];
  assert.deepEqual(selectIncidents(rows, now).map(item => item.summary).sort(), ['At cutoff', 'Old open', 'Service is slow']);
  assert.ok(!page(rows).includes('Too old'));
});

test('overall status follows the worst open severity and ignores resolved incidents', () => {
  assert.ok(page([]).includes('All systems operational'));
  assert.ok(page([{ ...base, severity: 'SEV3 minor' }]).includes('Minor service issue'));
  assert.ok(page([base]).includes('Degraded service'));
  assert.ok(page([base, { ...base, severity: 'SEV1 outage' }]).includes('Service outage'));
  assert.ok(page([{ ...base, severity: 'SEV1 outage', status: 'resolved', resolvedAt: now.toISOString() }]).includes('All systems operational'));
});

test('ignores pull requests and issues without the incident label', () => {
  assert.deepEqual(issuesToIncidents([issue({ pull_request: {} }), issue({ labels: [] })], now), []);
});

test('malformed public snapshots fail instead of silently claiming operational status', () => {
  assert.throws(() => page([{ ...base, status: 'PRIVATE_STATUS' }]));
  assert.throws(() => page([{ ...base, startedAt: '<invalid>' }]));
  assert.throws(() => page([{ ...base, status: 'resolved', resolvedAt: null }]));
  assert.throws(() => page(null));
});

test('old snapshots display unknown status at generation time', () => {
  assert.ok(renderSite({ updatedAt: '1970-01-01T00:00:00Z', incidents: [] }, now).includes('Status unknown'));
  assert.throws(() => renderSite({ updatedAt: 'invalid', incidents: [] }, now));
});
