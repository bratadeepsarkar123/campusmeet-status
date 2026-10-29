# CampusMeet status

This repository contains the public static status site. Incidents originate from incident-labelled issues in PRIVATE `Varnabha/campusmeet`; only approved, sanitized fields are committed here. Security incidents always use a generic message.

Requires Node.js 22 or newer, with no npm dependencies:

```sh
node --test
node scripts/generate.js
```

The generated page is `site/index.html`. The initial snapshot is deliberately marked old, so it reports unknown status until the first successful data refresh. All open incidents and the last 90 days of resolved incidents are displayed. Summary text is stripped of HTML, capped at 280 Unicode code points, and escaped. Internal titles, other body fields, comments and private issue links are excluded.

To activate later, add the Actions secret `STATUS_READ_TOKEN` with Issues read permission restricted to `Varnabha/campusmeet`, allow the workflow to write contents to the default branch, enable Pages with GitHub Actions as its source, and manually run Publish status page. The workflow then requests a refresh every ten minutes; scheduled runs can be delayed or disabled by GitHub. The workflow commits public JSON and built HTML before uploading only `site/` to Pages. Failed fetches or commits stop publication.

Do not put private receiver code, raw issues, tokens or environment files in this public repository. Public summaries are retained in public git history; review them before publishing. Security incidents retain lifecycle timestamps in the public JSON for history filtering; their incident cards display only the generic message, severity and status.

This page is a static snapshot. If publication stops, its last update time remains visible but its status and history do not recalculate until another build. The initial site has no custom palette or font pending approved CampusMeet brand assets.
