# Bengaluru Wellness Map

An interactive map of 395 places, routes, clinics, kitchens and communities for
looking after yourself in Bengaluru, built as an [Astro](https://astro.build)
site so it can be published on its own and dropped into a Webflow page.
Built by the marketing team at [Plum](https://plumhq.com).

Live at: _add the published URL once Pages is switched on_

## What it is

Left column is a filterable list of every entry, centre is a Leaflet map, and
the ground is coloured by which of the five Greater Bengaluru Authority city
corporations a place sits in. Everything outside the gazetted city boundary is
masked off, so the map reads as Bengaluru rather than a rectangle of tiles.

- **395 entries** across six categories and 30 sub-categories, each with a
  hand-drawn icon.
- **319 have a pin.** 40 have no fixed address (run clubs, accounts to follow)
  and 36 sit outside the city limits (day trips, outbound cycling routes). Both
  groups stay in the list rather than being deleted.
- **Trails can be drawn as lines** rather than pins, start to finish. See
  [Adding routes](#adding-routes).
- **Regions / Plain** switches between the corporation colouring and a plain
  basemap with street names. Each of the 102 areas carries its own shade of its
  corporation's colour, picked so that no two areas sharing a border get the
  same one.
- **Metro and Parks** are two reference layers over the top: the Namma Metro
  alignment, and 610 of BBMP's parks with their hours and amenities. Both
  switch off.

Two routes are built:

| Route | For |
|---|---|
| `/` | The standalone page, with the wordmark, canonical URL and social meta |
| `/embed` | The same map for an iframe: `noindex`, and it fills whatever height the frame gives it |

## Run it

Needs Node 22.12 or newer.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # writes dist/
npm run preview  # serve dist/ locally
```

`npm run build` produces a plain static `dist/` — no server, no runtime. Any
static host will serve it.

## Putting it in Webflow

Webflow's Embed element caps out at 50,000 characters, and this page is a good
deal larger than that, so it goes in as an iframe pointing at the published
site rather than as pasted markup. That is also what you want for a page you
keep adding to: you republish here, and every Webflow page showing the map
updates without anyone touching Webflow.

1. **Publish this site.** Push to `main` and
   [the workflow](.github/workflows/deploy.yml) builds it to GitHub Pages —
   switch Pages on first, under Settings → Pages → Source → GitHub Actions.
   Netlify, Vercel and Cloudflare Pages all work too: build command
   `npm run build`, publish directory `dist`.
2. **Copy [`webflow/embed-snippet.html`](webflow/embed-snippet.html)** into a
   Webflow Embed element (Add panel → Components → Embed).
3. **Change the `src`** in the snippet to your published URL, keeping the
   `/embed/` path.
4. Publish the Webflow site. Embeds do not render in the Designer canvas —
   use Preview or the published page to see it.

Two things worth knowing:

- **The frame decides the height.** The map fills it, so a frame that is too
  short shows a cramped map rather than a scrollbar. The snippet uses `82vh`
  with a `620px` floor, and the whole screen on a phone — the filter bar takes
  several rows at that width, so there is less room than you would think.
  Inside the frame the list scrolls in its own box rather than the frame
  scrolling, so a swipe on the map or the list does what you expect and a swipe
  anywhere else moves the Webflow page.
- **`?chrome=off`** hides the map's own wordmark, for a Webflow section that
  already has a heading above the frame. Drop it to keep the wordmark. The
  credit line at the bottom stays either way — it carries the data sources and
  the "not medical advice" note.

If the frame comes up blank, the host is sending an `X-Frame-Options` header.
GitHub Pages, Netlify, Vercel and Cloudflare Pages do not by default.

## Adding entries

Edit [`src/data/entries.json`](src/data/entries.json) and rebuild. A listing is
one object in that array:

```json
{
  "id": "BLR-396",
  "n": "Name as it should read on the card",
  "c": "Activities",
  "g": "swim",
  "a": "Indiranagar",
  "lat": 12.971891,
  "lon": 77.641151,
  "rg": "Central",
  "d": "One or two sentences. This is the card blurb and the popup text.",
  "gm": "https://maps.app.goo.gl/…",
  "w": "https://…",
  "ig": "@handle",
  "p": "₹₹",
  "b": "Beginners, Solo",
  "t": "Mon–Sat, 6:00–21:00",
  "tg": ["indoor", "beginner-friendly"],
  "src": "Where you got this",
  "v": "Verified"
}
```

Only `id`, `n` (name), `c` (category) and `g` (sub-category) are required.
Everything else fills in as empty, and an entry with no `lat`/`lon` still
appears in the list, without a pin.

| Field | Notes |
|---|---|
| `c` | One of the six categories in [`src/lib/categories.js`](src/lib/categories.js) |
| `g` | A sub-category key from the same file. A new one fails the build until it is added there with a label and an icon — that is deliberate |
| `a` | The area. A new area appears in the Area dropdown by itself, under its corporation |
| `rg` | `Central`, `North`, `East`, `South` or `West`. Leave it out for an online community or anywhere past the city boundary |
| `lat` / `lon` | Copy from Google Maps at six decimal places. Three decimals is about 110 m of error, which is enough to put a lake pin on dry land |
| `out` | `1` for somewhere beyond the gazetted boundary. It stays in the list, without a pin |
| `v` | `Verified`, `Needs check` or `Community-reported`. Drives the coloured dot on the card |

**The build checks your work.** `npm run build` (and every save under
`npm run dev`) runs [`src/lib/validate.js`](src/lib/validate.js), which stops
with the entry id and the reason on a duplicate id, an unknown category or
sub-category, a sub-category filed under the wrong category, half a coordinate
pair, or a coordinate that lands outside Greater Bengaluru without `"out": 1`.

The area dropdown, the per-corporation counts and the tallies in the header and
footer are all counted from the data at build time, so adding a listing is one
edit in one file.

## The metro and the parks

Two reference layers, neither of which is an entry. They are built from KML by
[`scripts/kml-to-geojson.mjs`](scripts/kml-to-geojson.mjs):

```bash
node scripts/kml-to-geojson.mjs <rail.kml> <parks.kml>
```

which writes `src/data/metro.json` and `src/data/parks.json`. The KMLs
themselves are not committed, the same way the boundary KML and the entry
spreadsheet are not.

**The metro** comes from an OpenStreetMap extract of everything on rails in the
city. Only `railway=subway` is drawn: that is Namma Metro. The same file also
holds 374 `rail` ways, which are the mainline and suburban network, and 61
`construction` ways which do not say which of the two they will become. Neither
is drawn, because neither is the metro.

**The parks** come from BBMP's own register, which is a working document rather
than a clean dataset, and the script has to be defensive about it:

- **Coordinates.** Some have lost their decimal point (`77331399`), some have
  latitude and longitude the wrong way round. Both are repaired. 672 rows still
  do not land anywhere in Bengaluru — around 500 of them sit in a cluster near
  Harohalli, some 40 km southwest — and those are dropped rather than guessed
  at. 610 of the 1,282 rows survive with a position that can be trusted.
- **Personal details.** The register carries the maintenance contractors' names
  and mobile numbers, and in 101 rows someone has typed them into the
  opening-hours column. Nothing matching a phone number reaches the page, and
  the script exits rather than write a file containing one. If you re-run it
  against a newer export and it refuses, that guard is the reason.
- **Names.** 147 rows are named after the work order rather than the park
  ("Maintenance Of Park in ward no-174 ... (FOODYS PARK)"). Where one ends in a
  bracketed name, that is used.

## Adding routes

Entries whose shape matters can be drawn as a line instead of a pin. Add a
GeoJSON `LineString` feature to
[`src/data/routes.json`](src/data/routes.json), with the entry's id and the
distance in its properties:

```json
{
  "type": "Feature",
  "properties": { "id": "BLR-152", "km": 4.2, "loop": true },
  "geometry": { "type": "LineString", "coordinates": [[77.5929, 12.9763], "…"] }
}
```

A loop gets one marker; a point-to-point route gets **A** at the start and
**B** at the finish. Coordinates are `[longitude, latitude]`, GeoJSON's order,
which is the reverse of the `lat`/`lon` fields on an entry.

**Do not import routes from MapMyRun, Strava or Komoot.** Those are user
uploads under terms that do not allow republishing the geometry. The best
source is the club that runs the route, which also comes with permission.

## The CARTO basemap key

The raster basemap wants an API key as a `key=` parameter; without one CARTO
paints an "API key required" watermark over every tile. The key lives in
[`src/lib/basemap.js`](src/lib/basemap.js) and can be overridden by setting
`PUBLIC_CARTO_KEY` in `.env` (or as a `CARTO_KEY` repository secret, which the
deploy workflow passes through).

It is checked in on purpose. A tile key reaches the browser with every tile
request, so it is public whatever you do with it — restrict it by referrer in
the [CARTO dashboard](https://carto.com/basemaps/apikey/) rather than trying to
hide it.

The map tries three basemaps in order: keyed CARTO Voyager, unkeyed CARTO, then
OpenStreetMap. Some corporate networks and preview frames block one CDN but not
another, so it falls back rather than showing bare pins on an empty ground.
If a tile looks stale after a key change, force-refresh — both the browser and
the CDN cache tiles.

## Where the data comes from

| What | Source | Licence |
|---|---|---|
| The 395 entries | Compiled by hand | Ours |
| Metro alignment | OpenStreetMap extract, `railway=subway` | ODbL |
| Parks | BBMP parks register | Government of Karnataka |
| City and corporation boundaries | GBA delimitation notification, 19 July 2025, via [OpenCity](https://data.opencity.in/dataset/greater-bengaluru-authority-corporations-delimitation-2025) | Government of Karnataka, public domain |
| Basemap tiles | CARTO Voyager | Free with attribution |
| Underlying map data | OpenStreetMap contributors | ODbL |

The code is MIT; the data is not all ours to relicense.

## Known issues

- **The boundaries are the July 2025 draft.** The final notification of
  2 September 2025 adjusted some lines, so a place within a street or two of a
  seam may be in a different corporation than shown.
- **22 coordinates need a look.** Five pairs are the same place entered twice,
  Sankey Tank appears twice 500 m apart, and two entries share coordinates
  despite being different businesses. 346 entries carry a Google `place_id`, so
  one pass through the Places API would settle all of them.
- **Some jogging loops are filed as Communities**, not under Running & trails:
  Agara Lake, Ulsoor Lake, Sankey Tank, Lalbagh and Cubbon Park. The search says
  when a filter is hiding matches, but the underlying fix is to let an entry
  carry more than one sub-category.
- **Two entries are filed oddly**: one gym sits under Activities rather than
  Health investments, and four entries still have placeholder Google Maps URLs.

## Layout

```
src/
  data/
    entries.json         the 395 listings — this is the file you edit
    corporations.json    the five GBA corporations: label, hue, area
    city.json            the gazetted bounding box
    zones.json           per-area colour blocks, one per entry catchment
    borders.json         city outline and corporation seams
    mask.json            everything outside the boundary, painted over
    routes.json          traced trails, keyed by entry id
    metro.json           the Namma Metro alignment
    parks.json           BBMP parks: where, when open, what is in them
    park-amenities.json  amenity keys -> the words in the popup
    icons.json           30 sub-category icons as SVG paths
    labels.json          sub-category keys -> the words on the card
  lib/
    categories.js        the six categories and their sub-categories
    db.js                data -> one database, with areas and counts derived
    validate.js          the build-time check on entries.json
    basemap.js           CARTO key, tile URLs and the fallback order
  components/
    WellnessMap.astro    the markup, and where the styles and script come in
  scripts/
    wellness-map.js      filters, list, cards and the Leaflet map
    leaflet.js           gives the markercluster plugin its global L
  styles/
    wellness-map.css     the whole design, Plum palette and all
  layouts/BaseLayout.astro
  pages/
    index.astro          /
    embed.astro          /embed — the iframe version for Webflow
scripts/kml-to-geojson.mjs   the two KML sources -> metro.json and parks.json
webflow/embed-snippet.html   copy-paste into a Webflow Embed element
```
