'use strict';

const AREAS = Object.freeze(['Website', 'Ticket scanning', 'Payments', 'Email', 'WhatsApp', 'Login', 'Other']);
const SEVERITIES = Object.freeze(['SEV1 outage', 'SEV2 degraded', 'SEV3 minor']);
const SECURITY_MESSAGE = 'Investigating a service issue';
const DAY = 24 * 60 * 60 * 1000;

function cleanSummary(value) {
  const plain = String(value ?? '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<[^>]*(?:>|$)/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return Array.from(plain).slice(0, 280).join('');
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

// Read only exact, unique form headings. Unknown sections and comments never
// become public text. Ambiguous or missing security fields fail closed.
function field(body, name) {
  const lines = typeof body === 'string' ? body.replace(/\r\n/g, '\n').split('\n') : [];
  const matches = lines.flatMap((line, index) => line === `### ${name}` ? [index] : []);
  if (matches.length !== 1) return null;
  const start = matches[0] + 1;
  let end = start;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n').trim();
}

function normalizeIncident(input) {
  if (!input || typeof input !== 'object' || !['open', 'resolved'].includes(input.status)) throw new Error('Invalid incident status');
  const security = input.security !== false;
  const startedAt = isoDate(input.startedAt);
  const resolvedAt = input.status === 'resolved' ? isoDate(input.resolvedAt) : null;
  if (!startedAt || (input.status === 'resolved' && !resolvedAt)) throw new Error('Invalid incident timestamp');
  const incident = {
    severity: SEVERITIES.includes(input.severity) ? input.severity : SEVERITIES[1],
    status: input.status,
    security,
    startedAt,
    resolvedAt,
    summary: security ? SECURITY_MESSAGE : cleanSummary(input.summary) || SECURITY_MESSAGE
  };
  if (!security) incident.area = AREAS.includes(input.area) ? input.area : 'Other';
  return incident;
}

function selectIncidents(incidents, now = new Date()) {
  if (!Array.isArray(incidents) || !Number.isFinite(now.getTime())) throw new Error('Invalid incident data or clock');
  const cutoff = now.getTime() - 90 * DAY;
  return incidents.map(normalizeIncident)
    .filter(item => item.status === 'open' || (Date.parse(item.resolvedAt) >= cutoff && Date.parse(item.resolvedAt) <= now.getTime()))
    .sort((a, b) => Date.parse(b.resolvedAt || b.startedAt) - Date.parse(a.resolvedAt || a.startedAt));
}

function issuesToIncidents(issues, now = new Date()) {
  if (!Array.isArray(issues)) throw new Error('Expected an issues array');
  const incidents = issues.filter(issue => !issue.pull_request && Array.isArray(issue.labels) &&
    issue.labels.some(label => (typeof label === 'string' ? label : label.name) === 'incident'))
    .map(issue => {
      if (!['open', 'closed'].includes(issue.state)) throw new Error('Unexpected issue state');
      return normalizeIncident({
        severity: field(issue.body, 'Severity'),
        area: field(issue.body, 'Affected area'),
        startedAt: isoDate(field(issue.body, 'Started at')) || issue.created_at,
        resolvedAt: issue.closed_at,
        status: issue.state === 'closed' ? 'resolved' : 'open',
        security: field(issue.body, 'Security incident') !== '- [ ] This is a security incident',
        summary: field(issue.body, 'Public summary')
      });
    });
  return selectIncidents(incidents, now);
}

module.exports = { AREAS, SEVERITIES, SECURITY_MESSAGE, cleanSummary, normalizeIncident, selectIncidents, issuesToIncidents };
