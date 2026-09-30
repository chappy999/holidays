# Japan, together

## Download and run locally

[**Download the ready-to-run app**](https://github.com/chappy999/holidays/raw/refs/heads/main/Japan-together.zip) while signed into the GitHub account that has access to this private repository.

Extract the ZIP, then follow the [local setup guide](LOCAL-SHARING.md). The package includes the built app and fonts; install Node.js 24 and cloudflared on your laptop, then run the password-protected startup helper. No hosting account or npm dependency installation is needed for the download.

A private trip-planning app for Charlie and Daniella’s **2–15 November 2026** journey: Tokyo arrival around midday, Tokyo or Osaka departure in the evening.

The working profile: active travellers, enthusiastic about food, outdoors, Japanese culture/history and unusual experiences; a **£100–£150 room/night** target with occasional splurges. Airports, flight bookings, previous visits and driving preferences remain unspecified.

## What is built

- 40 candidate experiences, including classics, quieter alternatives and deliberate detours.
- An interactive map with actual Natural Earth coastlines, clustered experiences, zoom/pan and route overlays. Dotted routes are schematic; pins are approximate anchors.
- Three dated routes, each covering 14 days and 13 nights. The current recommended starting point is Tokyo 4 → Kiso Valley 2 → Kyoto 5 → Osaka 2.
- Editable individual profiles, separate love/maybe/pass decisions, shared notes and shortlist overlap.
- Browser storage, shareable snapshot links and JSON export/import. **Snapshots do not provide live synchronisation.** Opening a shared plan explicitly replaces the current device’s plan; download a backup first if needed.
- Google Maps links for current reviews; no invented or scraped ratings.
- Responsive layouts, keyboard-accessible map controls, focus-managed dialogs and reduced-motion support.
- Local fonts, original SVG illustrations and embedded geography; no third-party requests are necessary to render the production app.

## Research status

**This is a research draft, not verified booking advice.** Official tourism websites were blocked by the environment’s network policy. Every experience has `verification: "pending"` and a source URL for follow-up. Sources have not been fetched or validated against current 2026 content. No current prices, booking availability, ratings or opening hours are claimed.

See `research/classics-notes.md`, `research/quiet-notes.md` and `research/logistics.md` for evidence gaps. Prioritise current venue calendars, Nov 3 Culture Day demand, trail/daylight conditions, ferries, reservation releases, final airports and accommodation quotes. Foliage varies with altitude and year; early November is often before Kyoto’s peak.

The £1,300–£1,950 lodging figure is simply 13 × the stated nightly room budget. It excludes splurges, meals and transport. `£`/`££`/`£££` on experiences are relative spending bands, not quotes.

Research network additions are saved in the environment configuration draft. Apply those settings before attempting official-site verification. A saved draft does not change the running network policy or publish the site.

## Develop

Requires Node.js 24 (the cloud environment currently provides it).

```sh
npm ci
npm run dev -- --port 5173
```

Use this existing checkout. Each cloud task is already isolated; do not create a Git worktree unless specifically requested.

The development server is for local work and does **not** authenticate requests. Use the protected production server for any hosted or shared deployment.

## Validate

```sh
npm test
npm run build
```

With the development server running:

```sh
npm run test:browser
npm run test:a11y
```

The browser script uses Playwright and `/usr/bin/chromium` when present. Set `BROWSER_PATH` to another Chromium executable and `APP_URL` to the appropriate local server when needed. On another development machine, install a supported Chromium and set that path. Tests create their own browser contexts; they do not overwrite your planning data.

`npm run test:server` validates the authenticated production server after a build. `npm run test:production` also opens the built app in Chromium behind the authentication layer, using temporary generated test credentials. In the managed cloud environment, binding a server or driving Chromium may need the execution tool’s network-enabled mode.

## Local hosting and a temporary share link

Use [LOCAL-SHARING.md](LOCAL-SHARING.md) to run the password-protected app on your own computer and share it through a Cloudflare Quick Tunnel. No hosting account is needed. `npm run local` asks for a hidden password and binds the authenticated server only to `127.0.0.1:3000` using the explicit `PLANNER_LOCAL_ONLY=1` mode. Start the tunnel only after the private server reports readiness.

`npm run package:local` builds `releases/japan-together-local.zip`, including the compiled app, server, startup helper, instructions and font licences. The extracted package needs Node.js 24 and cloudflared, but no npm dependencies. It contains no passwords or personal decision files.

The temporary link normally changes when the tunnel restarts. Decisions belong to the browser origin, so download your plan before stopping and import it at the new address. The app shows that reminder on trycloudflare.com addresses. A live tunnel has not been created or verified from this restricted cloud environment.

## Private hosting

The production entry point is `npm start`. Configure these values using the hosting provider’s secure environment settings:

| Variable           | Purpose                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `PLANNER_USERNAME` | Login name; defaults to `charlie-and-daniella`.                                          |
| `PLANNER_PASSWORD` | A private password of at least 16 characters. Never commit it or put it in a share link. |
| `APP_ORIGIN`       | The final HTTPS origin, e.g. `https://your-private-host.example`.                        |
| `NODE_ENV`         | Set to `production` on the host.                                                         |
| `PORT`             | Port supplied by the host; default 3000.                                                 |

Build with `npm ci && npm run build`, then start with `npm start` behind your host’s HTTPS endpoint. All app assets are protected by server-side authentication, not a client-side password gate. The browser presents a native login prompt. Share the site URL with Daniella and communicate the credentials separately. Both people use the same login; profile votes identify perspectives, not authenticated user accounts.

The server fails closed when required configuration is missing. Keep the repository and deployment private. Do not deploy `dist/` alone to a public static host: that would bypass the authentication server.

No live hosting account or production password is configured in this workspace. The site has not been publicly or privately published. Hosting credentials must be provided through the chosen provider’s secure settings; never send them in chat.

## Structure and attribution

- `src/App.tsx`: planner screens and interactions.
- `src/state.ts`: validated persistence, snapshot encoding and decision helpers.
- `src/components/JapanMap.tsx`: map; local geography is derived from Natural Earth through `world-atlas`.
- `src/components/Artwork.tsx`: original illustrative artwork, not photographs of specific venues.
- `research/*.json`: candidates and itineraries.
- `server.mjs`: authenticated production serving.

Natural Earth data is public domain. DM Sans and Cormorant Garamond are bundled through Fontsource under their included font licences. No map API keys or Google Places billing are needed.
