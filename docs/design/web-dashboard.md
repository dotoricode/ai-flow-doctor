# Web Dashboard Design — afd v2.0

> Lightweight browser dashboard served from the existing daemon process.

## 1. Server Strategy

The daemon already runs `Bun.serve()` on a random localhost port (`src/daemon/server.ts:624`). The dashboard is served by adding a single route to the existing fetch handler in `src/daemon/http-routes.ts`.

**Approach:** Read `src/daemon/dashboard.html` once at handler creation time and cache as a string. Serve it on `GET /dashboard` with `Content-Type: text/html`. No new process, no new port, no new dependency.

```ts
// In createHttpHandler(), before the 404 fallback:
const dashboardHtml = readFileSync(resolve(__dirname, "dashboard.html"), "utf-8");

if (url.pathname === "/dashboard") {
  return new Response(dashboardHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

**Static assets:** None. All CSS and JS are inlined in the single HTML file.

## 2. API Endpoints

All endpoints already exist. No new JSON endpoints required for Phase 1.

| Endpoint | Method | Purpose | Dashboard Use |
|----------|--------|---------|---------------|
| `/score` | GET | Full daemon stats | Main data source (polled + on SSE event) |
| `/mini-status` | GET | Lightweight status | Header badge (quick refresh) |
| `/events` | GET (SSE) | Real-time SEAM events | Live event feed + refresh trigger |
| `/antibodies` | GET | Antibody list | Defense history table |
| `/evolution/status` | GET | Quarantine & lessons | Evolution panel |
| `/telemetry?days=7` | GET | Aggregated telemetry | Usage analytics chart |
| `/hologram?file=` | GET | Per-file hologram | Hologram explorer (Phase 2) |
| `/health` | GET | Alive check | Connection indicator |

### Phase 2 Additions (if needed)

| Endpoint | Purpose |
|----------|---------|
| `/workspace-map` | File tree for hologram explorer |
| `/mistake-history?file=` | Per-file mistake drill-down |

## 3. Frontend Strategy

**Single HTML file** (`src/daemon/dashboard.html`) with:
- Inline `<style>` — CSS custom properties for theming, CSS Grid layout
- Inline `<script>` — vanilla JS, no framework, no build step
- Zero external resources (no CDN links, no fonts, no images)

**Why vanilla JS:** The dashboard displays ~6 data panels with simple bar charts and a live event log. This does not warrant React/Vue/Svelte overhead. Vanilla JS with template literals and `requestAnimationFrame` is sufficient and keeps the file under 15KB.

**File size budget:** Target < 12KB unminified. This adds < 1% to the 138KB tarball.

### HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>afd dashboard</title>
  <style>/* inline CSS */</style>
</head>
<body>
  <header id="hdr"><!-- status badge, uptime, port --></header>
  <main id="app">
    <section id="savings"><!-- token savings bars --></section>
    <section id="history"><!-- 7-day chart --></section>
    <section id="immune"><!-- antibodies, heal count --></section>
    <section id="events"><!-- live SEAM event log --></section>
    <section id="evolution"><!-- quarantine stats --></section>
    <section id="system"><!-- ecosystem, uptime, validators --></section>
  </main>
  <script>/* inline JS */</script>
</body>
</html>
```

## 4. Real-time Updates

Reuse the existing SSE `/events` endpoint (`http-routes.ts:337`).

**Pattern** (mirrors the TUI approach from `dashboard.ts`):

```js
// 1. Initial fetch
let score = await fetch('/score').then(r => r.json());
render(score);

// 2. SSE listener — re-fetch /score on any SEAM event
const es = new EventSource('/events');
es.onmessage = async (e) => {
  appendEvent(JSON.parse(e.data));         // live log update
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {  // debounced refresh
    score = await fetch('/score').then(r => r.json());
    render(score);
  }, 500);
};

// 3. Fallback polling every 10s
setInterval(async () => {
  score = await fetch('/score').then(r => r.json());
  render(score);
}, 10000);
```

## 5. Dashboard Sections

### 5.1 Header Bar
- Status badge: `LIVE` (green) / `OFFLINE` (red)
- Daemon port, PID, uptime
- Ecosystem detected

### 5.2 Token Savings (primary)
- Three bars: Original / Actual / Saved with percentage
- Breakdown: Hologram, Workspace Map, Pinpoint
- Estimated dollar value

### 5.3 7-Day History
- Horizontal bar chart, one row per day
- Color: green (>=70%), yellow (>=40%), gray (<40%)

### 5.4 Immune System
- Antibodies count, auto-heal count
- Last heal event, active validators
- Defense reasons breakdown

### 5.5 Live Event Feed
- Scrolling SEAM events from SSE (max 50 in DOM)
- Color-coded by phase: Sense (blue), Extract (cyan), Analyze (yellow), Mutate (red)

### 5.6 Evolution Status
- Quarantine count (total / learned / pending)
- Suppression stats

## 6. Security

- **Localhost only:** `Bun.serve()` binds to `127.0.0.1`
- **No auth:** Local dev tool, authentication adds zero value
- **No CORS:** Same-origin (served from same port)
- **CSP header:** `default-src 'self' 'unsafe-inline'` — blocks all external resources

## 7. Implementation Plan

### Phase 1: Core Dashboard (1-2 days)

| Step | Description | Effort |
|------|-------------|--------|
| 1.1 | Create `src/daemon/dashboard.html` | 2h |
| 1.2 | Token savings panel | 2h |
| 1.3 | 7-day history chart | 1h |
| 1.4 | Immune system panel | 1h |
| 1.5 | SSE live event feed | 1h |
| 1.6 | `/dashboard` route in `http-routes.ts` | 15min |
| 1.7 | `afd dashboard --web` CLI flag | 30min |

### Phase 2: Enhanced (1 day)

| Step | Description | Effort |
|------|-------------|--------|
| 2.1 | Hologram explorer (file tree + viewer) | 3h |
| 2.2 | Evolution detail panel | 1h |
| 2.3 | Telemetry chart (canvas) | 2h |

### Phase 3: Polish (0.5 day)

| Step | Description | Effort |
|------|-------------|--------|
| 3.1 | Dark/light theme toggle | 1h |
| 3.2 | Responsive layout | 1h |
| 3.3 | Korean/English toggle | 1h |

### CLI Integration

```ts
if (options.web) {
  const info = getDaemonInfo();
  const url = `http://127.0.0.1:${info.port}/dashboard`;
  const cmd = process.platform === 'win32' ? 'start'
            : process.platform === 'darwin' ? 'open' : 'xdg-open';
  Bun.spawn([cmd, url]);
  console.log(`[afd] Dashboard: ${url}`);
  return;
}
```

## 8. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single HTML file (not embedded string) | Better DX — syntax highlighting, hot-reload |
| Vanilla JS, no framework | 6 panels of data. React/Vue adds 30KB+ for zero benefit |
| HTML cached at handler creation | Zero runtime I/O after startup |
| Debounced SSE -> /score refresh | Prevents UI thrashing during event bursts |
| SSE, not WebSocket | Server->client push only. No upstream data needed |
| CSS Grid layout | Native, no layout library |
