ORCA Hackathon Domain 2 task: Offline "Prepare Voyage" feature

CONTEXT
I'm Domain 2 on our team, building the frontend for ORCA (a marine safety AI platform for an
SIH internal hackathon). Domain 1 (backend) owns the agent orchestration and API. I need to
build an offline-capability feature so the app degrades gracefully when a fisherman loses
internet 10-15km offshore, instead of breaking.

REPO / GIT SETUP
- Our repo: github.com/mishradwaterlaw/orca-sih.git
- Standard flow: `git pull origin main` to get latest, then create a feature branch:
  `git checkout -b feature/offline-prepare-voyage`
- Frontend code lives under [ask Domain 1 for the actual frontend folder path, e.g. `frontend/`
  or `web/` — confirm this before starting]
- Commit small, working increments rather than one giant commit at the end — easier to review
  and easier to recover if something breaks close to the deadline.
- Push your branch (`git push origin feature/offline-prepare-voyage`) and open a PR against
  main when ready, rather than merging directly, so Domain 1 can sanity-check the API contract
  you're relying on.

WHAT DOMAIN 1 IS GIVING YOU
- A static file at `[ask Domain 1 for the exact URL, e.g. GET /static/maritime_boundaries.geojson]`(this above is not built yet so try placeholders for now, domain 1 lead will build this)
  — a GeoJSON FeatureCollection of India's maritime EEZ boundary (and possibly neighboring
  countries' boundaries too — confirm with Domain 1). Coordinates are in standard GeoJSON
  order: [longitude, latitude].
- The existing `/query` endpoint (or whatever the live agent endpoint is called — confirm exact
  path/method with Domain 1) that returns weather + risk + PFZ data for a given location.

WHAT YOU'RE BUILDING — TWO PIECES

1. "Prepare Voyage" action (while online):
   - A UI action (button/flow) where the user selects an area (e.g. taps a point on a map, or
     picks a saved location) BEFORE heading out.
   - On trigger, fetch: (a) weather/wave data for that area from the existing live endpoint, and
     (b) the maritime boundaries GeoJSON file from the static URL above.
   - Store both in browser storage — IndexedDB is the better choice over localStorage here,
     since localStorage has a small size limit (~5-10MB) and is synchronous (can block the UI
     thread), while IndexedDB handles larger structured data asynchronously. Use a library like
     `idb` (a thin promise-based wrapper over IndexedDB) rather than raw IndexedDB, which has an
     awkward callback-based API.
   - Store alongside the data: a timestamp of when it was fetched (`cached_at`), and the area/
     location it corresponds to, so you can look up "do I have cached data for roughly where the
     user is now."

2. Offline detection + fallback rendering:
   - Detect offline state using the browser's `navigator.onLine` property, AND listen for the
     `online`/`offline` window events (onLine alone can be unreliable/stale — the events are the
     more trustworthy signal of a state *change*).
   - When offline and the user requests data for an area: check IndexedDB for a cached entry
     matching (roughly) that area. If found, render it — but with a persistent, impossible-to-
     miss banner: "Last updated [formatted timestamp] — not live," using the `cached_at` value.
     NEVER show cached data with the same visual treatment as live data — the staleness must be
     visually obvious, not a small footnote.
   - If offline AND no cached entry exists for that area: do NOT show a blank screen or a raw
     error. Show an explicit message like "No offline data available for this area — connect to
     the internet and use 'Prepare Voyage' before heading out." This is a real edge case, not
     a rare one — a fisherman who forgot to prep is exactly who'll hit this.

HONESTY BOUNDARY — IMPORTANT FOR THE JUDGES
This feature ONLY covers: pre-fetched cached data + client-side geofencing (checking if a point
is inside/outside a cached boundary polygon, using a library like turf.js's
`booleanPointInPolygon` — this works fully offline once the polygon is cached, no network
needed for the geometry check itself).

This feature does NOT include, and we should never imply it does:
- Live satellite data sync while offline (no NavIC/satellite integration)
- SMS-based fallback communication
- Any real-time data of any kind while offline — everything offline is necessarily stale,
  by definition, from whenever "Prepare Voyage" was last run

If asked by judges "does it work fully offline," the honest answer is: "cached data and
geofencing work offline; anything requiring live data does not, and we make that explicitly
visible to the user rather than hiding it."

BUILD THIS INCREMENTALLY
Don't try to build both pieces in one sitting. Suggested order: (1) get IndexedDB read/write
working with dummy data first, prove you can store and retrieve, (2) wire in the real
"Prepare Voyage" fetch + store, (3) build offline detection, (4) build the fallback UI with the
staleness banner, (5) handle the empty-cache edge case last, once the happy path works.