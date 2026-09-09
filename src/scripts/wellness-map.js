/* The Bengaluru Wellness Map.
 *
 * Filters, list, cards and Leaflet map. Everything it draws comes from
 * src/data/ by way of src/lib/db.js — to add a listing, edit the data, not
 * this file.
 */

import L from './leaflet.js';
import 'leaflet.markercluster';

import { DB, ZONES, BORDERS, MASK, ROUTES, ICONS, LABELS, METRO, PARKS, PARK_AMENITIES, COUNTS } from '../lib/db.js';
import { CATS, CATLABEL, COLOUR, PROMISE, VISION, edgeOn, glyphOn } from '../lib/categories.js';
import { CARTO_LABELS, TILES } from '../lib/basemap.js';

/* The markup lives in WellnessMap.astro. If it is not on the page — a stray
   import, a partial render — there is nothing to wire up. */
if (!document.getElementById('map')) throw new Error('Wellness map: #map is not on the page');

const E = DB.entries;
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const ico = g => `<svg viewBox="0 0 24 24">${ICONS[g]||''}</svg>`;
const isReal = u => u && !/goo\.gl\/example/.test(u);
const igUrl = h => 'https://instagram.com/' + h.replace(/^@/,'');
const vClass = v => v === 'Verified' ? 'v' : v === 'Needs check' ? 'v check' : 'v comm';

const state = {cat:'all', area:'all', sub:'all', rg:'all', q:'', view:'map',
               active:null, about:true, paint:'regions'};

/* ---------- header and footer facts, counted from the data ---------- */
document.getElementById('flag').textContent =
  COUNTS.total + ' entries · ' + COUNTS.mapped + ' mapped · ' + COUNTS.verified + ' verified';
document.getElementById('foot').textContent =
  'Map data © OpenStreetMap contributors, tiles by CARTO, rendered with Leaflet. '
  + COUNTS.total + ' entries compiled by hand: ' + COUNTS.mapped + ' pinned, '
  + COUNTS.unpinned + ' with no fixed address, ' + COUNTS.outside + ' starting outside the city limits. '
  + 'City and corporation boundaries from the Greater Bengaluru Authority delimitation '
  + 'notification of 19 July 2025 (' + DB.gba_km2 + ' km²), via OpenCity. '
  + 'Metro alignment from OpenStreetMap; ' + PARKS.features.length
  + ' parks from the BBMP parks register, as points rather than outlines. '
  + 'Last reviewed September 2026. Not medical advice, and worth ringing ahead before you travel.';

/* ---------- controls ---------- */
const segEl = document.getElementById('seg');
const TABS = [['all','Everything',null]].concat(CATS.map(c => [c.k, c.label, c.c]));
TABS.forEach(([k,label,col]) => {
  const b = document.createElement('button');
  b.innerHTML = (col ? `<span class="dot" style="background:${col}"></span>` : '') + esc(label);
  b.setAttribute('aria-pressed', state.cat === k);
  b.onclick = () => { state.cat = k; state.sub = 'all'; state.active = null; syncSeg(); syncSub(); render(); };
  segEl.appendChild(b);
});
function syncSeg(){ [...segEl.children].forEach((b,i) => b.setAttribute('aria-pressed', TABS[i][0] === state.cat)); }

const CORPS = {}; DB.corps.forEach(c => CORPS[c.k] = c);

const rgEl = document.getElementById('rg');
rgEl.innerHTML = '<option value="all">All five corporations</option>'
  + DB.corps.map(c => `<option value="${c.k}">${esc(c.label)} (${c.n})</option>`).join('')
  + '<option value="none">No fixed corporation</option>';
rgEl.onchange = () => {
  state.rg = rgEl.value; state.area = 'all'; areaEl.value = 'all';
  restyleZones(); render();
};

/* Areas nest under the corporation they sit in, so the two filters read as one
   hierarchy rather than two lists that can contradict each other. */
const areaEl = document.getElementById('area');
areaEl.innerHTML = '<option value="all">All areas</option>'
  + DB.areas.map(g => `<optgroup label="${esc(g.label)}">`
      + g.items.map(a => `<option>${esc(a)}</option>`).join('') + '</optgroup>').join('');
areaEl.onchange = () => { state.area = areaEl.value; restyleZones(); render(); };

const subEl = document.getElementById('sub');
function syncSub(){
  const c = CATS.find(x => x.k === state.cat);
  subEl.style.display = c ? '' : 'none';
  if (!c) return;
  subEl.innerHTML = '<option value="all">All sub-categories</option>'
    + c.subs.map(s => `<option value="${s}">${esc(LABELS[s])}</option>`).join('');
  subEl.value = state.sub;
}
subEl.onchange = () => { state.sub = subEl.value; render(); };

const qEl = document.getElementById('q');
qEl.oninput = () => { state.q = qEl.value.toLowerCase().trim(); render(); };

document.getElementById('v-map').onclick = () => setView('map');
document.getElementById('v-grid').onclick = () => setView('grid');
function setView(v){
  state.view = v;
  document.body.classList.toggle('grid', v === 'grid');
  document.getElementById('v-map').setAttribute('aria-pressed', v === 'map');
  document.getElementById('v-grid').setAttribute('aria-pressed', v === 'grid');
  if (v === 'map') setTimeout(() => map.invalidateSize(), 60);
}

/* ---------- map ---------- */
/* Core city only. DB.box is the bounding box of the Greater Bengaluru Authority
   area as gazetted, and the map cannot be panned or zoomed out beyond it. The
   city's actual outline is drawn from the same source. */
const [BS, BW, BN, BE] = DB.box;
const CITY = L.latLngBounds([BS, BW], [BN, BE]);
const map = L.map('map', {zoomControl:false, maxBounds:CITY.pad(0.04),
  maxBoundsViscosity:1, minZoom:10, maxZoom:19}).fitBounds(CITY);
L.control.zoom({position:'bottomright'}).addTo(map);
map.createPane('zones').style.zIndex = 350;
const linePane = map.createPane('lines');
linePane.style.zIndex = 400; linePane.style.pointerEvents = 'none';
const labelPane = map.createPane('labels');
labelPane.style.zIndex = 450; labelPane.style.pointerEvents = 'none';
const refPane = map.createPane('reference');
refPane.style.zIndex = 430; refPane.style.pointerEvents = 'none';
map.createPane('parks').style.zIndex = 440;
const maskPane = map.createPane('mask');
maskPane.style.zIndex = 470; maskPane.style.pointerEvents = 'none';
/* Basemaps come from src/lib/basemap.js, keyed and in fallback order. Some
   networks and embedded previews block one CDN but not another, so the map
   drops to the next source instead of showing bare pins. */
const warnEl = document.getElementById('tilewarn');
let base = null, tileIdx = -1, tilesPainted = false, tileErrors = 0, switching = false;

function useTiles(i){
  if (i >= TILES.length){
    warnEl.innerHTML = '<b>The basemap did not load.</b>The pins and the list are correct, '
      + 'but no tile server could be reached. Check that this page can request '
      + '<code>basemaps.cartocdn.com</code> and <code>tile.openstreetmap.org</code>, and that the CARTO key is still valid.';
    warnEl.classList.add('on');
    return;
  }
  switching = true;
  if (base) map.removeLayer(base);
  tileIdx = i; tilesPainted = false; tileErrors = 0;
  base = L.tileLayer(TILES[i].url, TILES[i].opts);
  base.on('load', () => { tilesPainted = true; warnEl.classList.remove('on'); });
  base.on('tileload', () => { tilesPainted = true; warnEl.classList.remove('on'); });
  base.on('tileerror', () => {
    tileErrors++;
    if (tilesPainted || switching || tileErrors < 4) return;
    useTiles(tileIdx + 1);
  });
  base.addTo(map);
  setTimeout(() => { switching = false; }, 400);
  paintMode();
}
/* ---------- region colouring ----------
   The city is filled with one hue per GBA city corporation, and inside each
   corporation every area takes one of five shades of that hue, chosen so that
   no two areas sharing a border take the same one. The blocks are the
   catchments of the entries, so the cells of one area read as a single patch
   and the patch next door reads as a different one, while the five
   corporations still read as five families. Nothing crosses a boundary, so the
   fill and the boundary line always agree.

   The corporation hues sit deliberately off the brand wheel — green, violet,
   terracotta, olive, rose — because the ground and the pins say different
   things. A pin in Plum Red is a Community; the ground under it is a
   corporation, and the two should never be read as the same statement. The
   hues are the midpoints of the gaps between the six category colours, and
   every shade of every one of them stays a long way from every pin colour. */

const hexToHsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l * 100];
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
          : max === g ? (b - r) / d + 2
          : (r - g) / d + 4;
  return [h * 60, (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Which areas share a border. The zone cells come out of one tessellation, so
   two cells that touch carry the same vertex to the fifth decimal, and a shared
   vertex is a shared border. Cheaper and more exact than testing geometry. */
function areaNeighbours(){
  const ringsOf = g => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  const atVertex = new Map(), nb = new Map();
  ZONES.features.forEach(f => {
    const {rg, area} = f.properties;
    if (!rg || !area) return;
    const id = rg + '|' + area;
    if (!nb.has(id)) nb.set(id, new Set());
    ringsOf(f.geometry).forEach(ring => ring.forEach(([x, y]) => {
      const k = x.toFixed(5) + ',' + y.toFixed(5);
      if (!atVertex.has(k)) atVertex.set(k, new Set());
      atVertex.get(k).add(id);
    }));
  });
  atVertex.forEach(ids => {
    const list = [...ids];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        nb.get(list[i]).add(list[j]);
        nb.get(list[j]).add(list[i]);
      }
  });
  return nb;
}

const SHADES = 5;      /* a tessellation is a planar graph, so five is plenty */
const SPREAD = 50;     /* lightness range the five shades are spread across */
const AREA_SHADE = {};
(function shadeAreas(){
  const nb = areaNeighbours();
  const corpOf = id => id.slice(0, id.indexOf('|'));
  const byRg = {};
  nb.forEach((_, id) => { (byRg[corpOf(id)] = byRg[corpOf(id)] || []).push(id); });

  Object.keys(byRg).forEach(rg => {
    const corp = CORPS[rg];
    if (!corp) return;
    const [h, s, l] = hexToHsl(corp.c);
    const pal = [];
    for (let i = 0; i < SHADES; i++) {
      const t = i / (SHADES - 1) - 0.5;
      /* Chroma leans against the lightness, so the pale end does not wash out
         to grey and the dark end does not go muddy. */
      pal.push({sat: clamp(s * (1 - t * 0.5), 8, 90), lig: clamp(l + t * SPREAD, 22, 84)});
    }
    const sameCorp = id => [...nb.get(id)].filter(n => corpOf(n) === rg);
    /* Busiest area first, and each one takes the shade furthest in lightness
       from whatever its neighbours already hold — the usual greedy colouring,
       which on a map this shape never needs all five. */
    const order = byRg[rg].slice().sort((a, b) => sameCorp(b).length - sameCorp(a).length || (a < b ? -1 : 1));
    const chosen = new Map();
    order.forEach(id => {
      const taken = sameCorp(id).map(n => chosen.get(n)).filter(i => i !== undefined);
      let best = 0, bestGap = -1;
      pal.forEach((p, i) => {
        const gap = taken.length ? Math.min(...taken.map(j => Math.abs(p.lig - pal[j].lig))) : Infinity;
        if (gap > bestGap) { bestGap = gap; best = i; }
      });
      chosen.set(id, best);
      AREA_SHADE[id] = `hsl(${h.toFixed(1)} ${pal[best].sat.toFixed(1)}% ${pal[best].lig.toFixed(1)}%)`;
    });
  });
})();
/* A cell the boundary data carries but no entry sits in has no shade of its
   own, and falls back to the corporation's colour. */
const zoneFill = (f) => AREA_SHADE[f.properties.rg + '|' + f.properties.area]
  || (CORPS[f.properties.rg] || {}).c || VISION;

const zoneLayer = L.geoJSON(ZONES, {
  pane:'zones',
  style: f => zoneStyle(f, false),
  onEachFeature(f, lyr){
    lyr.bindTooltip(() => esc(CORPS[f.properties.rg].label)
        + (f.properties.area && f.properties.n ? ' · ' + esc(f.properties.area) : ''),
      {sticky:true, className:'pin-label'});
    lyr.on('mouseover', () => lyr.setStyle(zoneStyle(f, true)));
    lyr.on('mouseout',  () => lyr.setStyle(zoneStyle(f, false)));
    lyr.on('click', () => {
      state.rg = state.rg === f.properties.rg ? 'all' : f.properties.rg;
      rgEl.value = state.rg;
      state.area = 'all'; areaEl.value = 'all'; state.active = null;
      restyleZones(); render();
    });
  }
});
function zoneStyle(f, hot){
  const c = CORPS[f.properties.rg];
  const on = state.rg === 'all' || state.rg === f.properties.rg;
  return {fillColor:zoneFill(f), color:PROMISE, weight:1, opacity:.8,
    fillOpacity:(c.op + (hot ? .1 : 0)) * (on ? 1 : .22)};
}
function restyleZones(){ zoneLayer.eachLayer(l => l.setStyle(zoneStyle(l.feature, false))); }

/* ---------- trails ----------
   Entries whose shape matters are drawn as a line rather than a single pin: park
   and lake loops, and point-to-point routes. Geometry lives in routes.json and is
   keyed by entry id, so any entry can carry a traced path and everything else
   about it still comes from the spreadsheet. A casing under the line keeps it
   readable over the coloured ground. */
const TRAIL = {};
ROUTES.features.forEach(f => { TRAIL[f.properties.id] = f; });
const TRAIL_COLOUR = COLOUR['Activities'];
const trailCasing = L.geoJSON(null, {pane:'lines', interactive:false,
  style:{color:PROMISE, weight:7, opacity:.85, lineCap:'round'}}).addTo(map);
const trailLine = L.geoJSON(null, {pane:'lines',
  style:{color:TRAIL_COLOUR, weight:3.4, opacity:1, lineCap:'round'}}).addTo(map);
const trailCaps = L.layerGroup().addTo(map);

function capIcon(letter, end){
  return L.divIcon({className:'', iconSize:[16,16], iconAnchor:[8,8],
    html:`<div class="trailcap${end ? ' b' : ''}">${letter}</div>`});
}
function drawTrails(items){
  trailCasing.clearLayers(); trailLine.clearLayers(); trailCaps.clearLayers();
  items.forEach(r => {
    const f = TRAIL[r.id];
    if (!f) return;
    trailCasing.addData(f);
    trailLine.addData(f);
    /* A loop needs one marker, a route from A to B needs both ends called out. */
    const c = f.geometry.coordinates, a = c[0], b = c[c.length-1];
    trailCaps.addLayer(L.marker([a[1], a[0]], {icon:capIcon('A', false),
      title:r.n + ' — start', pane:'markerPane'}).on('click', () => select(r.id, true)));
    if (!f.properties.loop)
      trailCaps.addLayer(L.marker([b[1], b[0]], {icon:capIcon('B', true),
        title:r.n + ' — finish', pane:'markerPane'}).on('click', () => select(r.id, true)));
  });
  trailLine.eachLayer(l => {
    const r = E.find(x => x.id === l.feature.properties.id);
    l.bindTooltip(r.n + ' · ' + l.feature.properties.km + ' km',
      {sticky:true, className:'pin-label'});
    l.bindPopup(() => popupHtml(r), {maxWidth:280, minWidth:266});
    l.on('mouseover', () => l.setStyle({weight:5}));
    l.on('mouseout',  () => l.setStyle({weight:3.4}));
  });
}

/* Blank ground outside Greater Bengaluru. Added once and never removed, so the
   basemap is only ever visible inside the boundary. */
L.geoJSON(MASK, {pane:'mask', interactive:false,
  style:{fillColor:'#F6D9C3', fillOpacity:1, stroke:false}}).addTo(map);

/* The city outline and the corporation seams, straight from the gazette KML. */
const gbaLayer = L.geoJSON({type:'FeatureCollection',
    features:BORDERS.features.filter(f => f.properties.kind === 'gba')},
  {pane:'mask', interactive:false, style:{color:VISION, weight:1.6, opacity:.75, fill:false}}).addTo(map);
const borderLayer = L.geoJSON({type:'FeatureCollection',
    features:BORDERS.features.filter(f => f.properties.kind === 'corp')},
  {pane:'lines', interactive:false, style:{color:VISION, weight:2, opacity:.8, fill:false}});

/* ---------- the metro and the parks ----------
   Neither is an entry: they are the two bits of the city that tell you whether
   a place on this map is actually reachable, and whether there is somewhere
   green next to it. Both sit above the coloured ground and under the pins, and
   both can be switched off.

   The metro is the Namma Metro alignment as OpenStreetMap has it, drawn with a
   pale casing so the line stays readable over every one of the ground shades.
   The parks are BBMP's own register, one dot per park, with whatever the
   register knows about it: the ward, the opening hours, the size, and whether
   it has a toilet, a gym or something for children. They are points rather
   than outlines, so a dot says where a park is, not how far it spreads. */
const metroCasing = L.geoJSON(METRO, {pane:'reference', interactive:false,
  style:{color:PROMISE, weight:5.5, opacity:.85, lineCap:'round', lineJoin:'round'}});
const metroLine = L.geoJSON(METRO, {pane:'reference', interactive:false,
  style:{color:'#2A0F20', weight:2.4, opacity:.9, lineCap:'round', lineJoin:'round'}});
/* 610 dots is more than SVG wants in the DOM, so they get a canvas. They are
   clickable — a park with a toilet and play equipment is worth knowing about —
   but they sit under the entry pins, which always win a click. */
const parksRenderer = L.canvas({pane:'parks', padding:.4});
function parkPopup(p){
  const rows = [p.w && ['Ward', p.w], p.t && ['Open', p.t],
                p.sqm && ['Size', p.sqm.toLocaleString('en-IN') + ' m²'],
                p.a && p.a.length && ['Has', p.a.map(k => PARK_AMENITIES[k]).join(', ')]].filter(Boolean);
  return `<div class="pop">
    <div class="kind">BBMP park</div>
    <h4>${esc(p.n || 'Unnamed park')}</h4><div class="rule"></div>
    ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
  </div>`;
}
const parkLayer = L.geoJSON(PARKS, {pane:'parks', renderer:parksRenderer,
  pointToLayer: (f, latlng) => L.circleMarker(latlng, {radius:3, renderer:parksRenderer,
    color:PROMISE, weight:.8, opacity:.6, fillColor:'#17532F', fillOpacity:.85}),
  onEachFeature(f, lyr){
    lyr.bindTooltip(f.properties.n || 'Park', {direction:'top', className:'pin-label'});
    lyr.bindPopup(() => parkPopup(f.properties), {maxWidth:260, minWidth:220});
  }});

const overlays = {
  metro: {on:true, el:document.getElementById('l-metro'), layers:[metroCasing, metroLine]},
  parks: {on:true, el:document.getElementById('l-parks'), layers:[parkLayer]},
};
function syncOverlay(k){
  const o = overlays[k];
  o.layers.forEach(l => { if (o.on) { if (!map.hasLayer(l)) l.addTo(map); } else if (map.hasLayer(l)) map.removeLayer(l); });
  o.el.setAttribute('aria-pressed', o.on);
}
Object.keys(overlays).forEach(k => {
  overlays[k].el.onclick = () => { overlays[k].on = !overlays[k].on; syncOverlay(k); };
  syncOverlay(k);
});

let labelLayer = null;
function paintMode(){
  const regions = state.paint === 'regions';
  if (regions){
    if (labelLayer){ map.removeLayer(labelLayer); labelLayer = null; }
    if (!map.hasLayer(zoneLayer)) zoneLayer.addTo(map);
    if (!map.hasLayer(borderLayer)) borderLayer.addTo(map);
    restyleZones();
  } else {
    if (map.hasLayer(zoneLayer)) map.removeLayer(zoneLayer);
    if (map.hasLayer(borderLayer)) map.removeLayer(borderLayer);
    /* Only CARTO serves a labels-only layer. If the map has fallen back to OSM,
       labels are already baked into the tiles and there is nothing to add. */
    if (!labelLayer && TILES[tileIdx] && TILES[tileIdx].carto){
      labelLayer = L.tileLayer(CARTO_LABELS, {pane:'labels', maxZoom:19}).addTo(map);
    }
  }
  document.getElementById('m-regions').setAttribute('aria-pressed', regions);
  document.getElementById('m-plain').setAttribute('aria-pressed', !regions);
}
document.getElementById('m-regions').onclick = () => { state.paint = 'regions'; paintMode(); };
document.getElementById('m-plain').onclick   = () => { state.paint = 'plain';   paintMode(); };

const canCluster = typeof L.markerClusterGroup === 'function';
const layer = canCluster ? L.markerClusterGroup({
  showCoverageOnHover:false, maxClusterRadius:52, disableClusteringAtZoom:16, spiderfyOnMaxZoom:true,
  iconCreateFunction(cl){
    const tally = {};
    cl.getAllChildMarkers().forEach(m => { const c = m.rec.c; tally[c] = (tally[c]||0)+1; });
    const top = Object.keys(tally).sort((a,b) => tally[b]-tally[a])[0];
    const n = cl.getChildCount(), size = n < 12 ? 34 : n < 45 ? 40 : 48;
    return L.divIcon({html:`<div class="clus" style="--cc:${COLOUR[top]||VISION};width:${size}px;height:${size}px">${n}</div>`,
      className:'', iconSize:[size,size]});
  }
}) : L.layerGroup();
map.addLayer(layer);

function pinIcon(rec, active){
  const col = COLOUR[rec.c] || VISION, k = active ? 1.28 : 1;
  const w = Math.round(28*k), h = Math.round(37*k);
  return L.divIcon({className:'pin', iconSize:[w,h], iconAnchor:[w/2,h], popupAnchor:[0,-h+5],
    html:`<svg width="${w}" height="${h}" viewBox="0 0 28 37" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 36.2C14 36.2 26.5 21.6 26.5 13.6A12.5 12.5 0 0 0 1.5 13.6C1.5 21.6 14 36.2 14 36.2Z"
        fill="${col}" stroke="${active ? VISION : edgeOn(col)}" stroke-width="${active ? 2.2 : 1.4}"/>
      <g transform="translate(6.7 6.3) scale(0.61)" fill="none" stroke="${glyphOn(col)}"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[rec.g]||''}</g>
    </svg>`});
}
function popupHtml(r){
  const col = COLOUR[r.c] || VISION;
  const t = TRAIL[r.id];
  const rows = [r.a && ['Area', r.raw || r.a], r.rg && ['Corporation', CORPS[r.rg].label],
                t && ['Traced', t.properties.km + ' km ' + (t.properties.loop ? 'loop' : 'point to point')],
                r.t && ['Timings', r.t],
                r.p && ['Price', r.p], r.b && ['Best for', r.b]].filter(Boolean);
  return `<div class="pop">
    <div class="kind"><span class="kchip" style="background:${col};color:${glyphOn(col)}">${ico(r.g)}</span>${esc(LABELS[r.g])}</div>
    <h4>${esc(r.n)}</h4><div class="rule"></div>
    ${r.d ? `<p>${esc(r.d)}</p>` : ''}
    ${rows.length ? `<dl>${rows.map(([k,v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
  </div>`;
}

/* ---------- filtering ---------- */
function pool(){ return state.cat === 'all' ? E : E.filter(r => r.c === state.cat); }
/* The text match, kept separate from the dropdowns so the list can say when a
   filter is hiding something the search found. */
function hits(r){
  return !state.q || (r.n + ' ' + r.raw + ' ' + r.s + ' ' + r.d + ' ' + r.tg.join(' ')
    + ' ' + r.b + ' ' + LABELS[r.g]).toLowerCase().includes(state.q);
}
function filtered(){
  return pool().filter(r =>
    (state.rg === 'all' || (state.rg === 'none' ? !r.rg : r.rg === state.rg)) &&
    (state.area === 'all' || r.a === state.area) &&
    (state.sub === 'all' || r.g === state.sub) &&
    hits(r));
}

const marks = new Map();
function drawMap(items){
  layer.clearLayers();
  marks.clear();
  drawTrails(items);
  items.filter(r => r.lat != null).forEach(r => {
    const m = L.marker([r.lat, r.lon], {icon:pinIcon(r, state.active === r.id), title:r.n});
    m.rec = r;
    m.bindTooltip(r.n, {direction:'top', className:'pin-label', offset:[0,-34]});
    m.bindPopup(() => popupHtml(r), {maxWidth:280, minWidth:266});
    m.on('click', () => select(r.id, true));
    marks.set(r.id, m);
    layer.addLayer(m);
  });
}

/* ---------- list ---------- */
const cardsEl = document.getElementById('cards'), noticeEl = document.getElementById('notice');
const ABOUT = () => `
<details class="about" id="about" ${state.about ? 'open' : ''}>
 <summary>Why this page exists</summary>
 <div class="body">
  <div class="rule"></div>
  <p class="lead">Where would you start if you decided to get fit tomorrow?</p>
  <p>We asked ourselves that question and realised we didn't have an answer that didn't involve
   asking an LLM. So we did what most people do. We trawled Twitter and Instagram, opened
   seventeen browser tabs, asked friends, looked at Google Maps reviews, and still felt like we
   were missing the good stuff.</p>
  <p>So we decided to put together this map that we could open any time we felt like this was the
   day we were going to work out. Every gym, run club, cycling route, therapy clinic, dance
   studio, sound bath and salt cave we could find, in one place. Some are famous. Some are the
   kind of place you accidentally notice when stuck in a traffic jam at Sony signal.</p>
  <p>Have a look. There might be something in your part of town that you didn't know was there.</p>
  <p>This is by no means an exhaustive list. So if you know something we've missed, write to us.
   We'd like to add it.</p>
  <h4>How to read it</h4>
  <ol>
   <li>A pin's colour is its category and its icon is the sub-category. The
    colour under the pins is something else: the city corporation.</li>
   <li>Every entry carries a source and a status. <b>Needs check</b> means we could not confirm
    something recently, usually pricing, timings or a change of management.</li>
   <li>Where reviews raised a real concern we left the entry in and said so. Removing it just
    moves the problem to your Saturday morning.</li>
   <li>The colour of the ground is the city corporation, one of five. Plain
    turns the colour off and gives you street names instead.</li>
   <li>The map stops at the gazetted city boundary. Nandi Hills, Ramanagara,
    Wonderla and 33 other places beyond it are listed without a pin rather than
    shrinking Bengaluru to fit them in.</li>
   <li>Each area carries its own shade of its corporation's colour, so where one
    neighbourhood ends and the next begins is visible without reading a label.</li>
   <li>The dark line is the metro. The green dots are the parks BBMP has a record
    of — click one for its hours and whether it has a toilet, a gym or something
    for the children. Both layers switch off above the map.</li>
   <li>Nobody paid to be here. No sponsored slots, no affiliate links.</li>
  </ol>
  <h4>The colours</h4>
  <div class="legend" id="legend"></div>
  <h4>The five corporations</h4>
  <p>BBMP was dissolved on 2 September 2025 and replaced by the Greater Bengaluru
   Authority, with five city corporations under it. They are what the map is
   coloured by, and clicking one filters to it.</p>
  <div class="legend" id="corplegend"></div>
  <p>These are the gazetted boundaries, from the Government of Karnataka map
   published under the delimitation notification of 19 July 2025. Each entry's
   corporation is worked out by testing its coordinates against the polygon, not
   by guessing from the neighbourhood name, and no colour block crosses a
   boundary. One caveat: this is the July map, and the final notification of
   2 September 2025 adjusted some lines, so places within a street or two of a
   seam are worth checking.</p>
  <h4>Who made this</h4>
  <p>The marketing team at <b>Plum</b>. We work on employee health benefits for a living, which
   mostly teaches you that the useful things never make it into a policy document.</p>
 </div>
</details>`;

function drawNotice(items){
  let html = ABOUT();
  if (state.q){
    const everywhere = E.filter(hits);
    const hidden = everywhere.length - items.length;
    if (hidden > 0){
      const where = [...new Set(everywhere.filter(r => !items.includes(r)).map(r => CATLABEL[r.c]))];
      html += `<div class="notice"><b>${hidden} more match${hidden > 1 ? 'es' : ''}
        outside the current filters</b>, in ${where.map(esc).join(', ')}.
        <button class="lnk" id="showAll">Search everything instead</button></div>`;
    }
  }
  const off = items.filter(r => r.lat == null && !r.out).length;
  const out = items.filter(r => r.out).length;
  if (off) html += `<div class="notice"><b>${off} of these have no pin.</b> Run clubs, queer
    sports groups and accounts to follow have no fixed address, so they appear in this list and
    not on the map. Switch to Grid to read them side by side.</div>`;
  if (out) html += `<div class="notice"><b>${out} of these fall outside the city limits.</b>
    They sit beyond the gazetted Greater Bengaluru boundary, so they are listed without a pin
    rather than dragged into frame. Most are outbound cycling routes.</div>`;
  if (state.sub === 'cycle' || state.sub === 'run'){
    const traced = items.filter(r => TRAIL[r.id]).length;
    html += traced
      ? `<div class="notice"><b>${traced} of these ${items.length} have a traced path</b>, drawn
         as a line with its start marked A. The rest are single pins until someone shares a
         GPX file for them.</div>`
      : `<div class="notice"><b>None of these have a traced path yet.</b> The map can draw
         routes as lines, start to finish, but the geometry has to come from a GPX file or an
         open data extract. Until then each one is a single pin.</div>`;
  }
  if (state.rg === 'none') html += `<div class="notice"><b>These sit outside the
    five corporations.</b> Online communities with no address, and places beyond the
    gazetted city boundary.</div>`;
  const nc = items.filter(r => r.v === 'Needs check').length;
  if (nc && state.cat !== 'all') html += `<div class="notice"><b>${nc} entries here need a
    re-check.</b> Look for the yellow dot on the card and ring ahead.</div>`;
  noticeEl.innerHTML = html;
  const sa = document.getElementById('showAll');
  if (sa) sa.onclick = () => {
    state.cat = 'all'; state.sub = 'all'; state.rg = 'all'; state.area = 'all';
    rgEl.value = 'all'; areaEl.value = 'all';
    syncSeg(); syncSub(); restyleZones(); render();
  };
  const ab = document.getElementById('about');
  if (ab) ab.addEventListener('toggle', () => { state.about = ab.open; });
  const cl = document.getElementById('corplegend');
  if (cl) cl.innerHTML = DB.corps.map(c =>
    `<div><span class="sw" style="background:${c.c}"></span>${esc(c.label)}
      <em>${c.km2} km² · ${c.n}</em></div>`).join('');
  const lg = document.getElementById('legend');
  if (lg) lg.innerHTML = CATS.map(c => {
    const n = E.filter(r => r.c === c.k).length;
    return `<div><s style="background:${c.c}"></s>${esc(c.label)}<em>${n}</em></div>`;
  }).join('');
}

function drawList(items){
  if (!items.length){
    cardsEl.innerHTML = `<div class="empty"><b>Nothing matches those filters.</b>
      Clear the search, widen the area, or switch back to Everything.</div>`;
    return;
  }
  cardsEl.innerHTML = items.map(r => {
    const col = COLOUR[r.c] || VISION;
    const links = [];
    if (isReal(r.gm)) links.push(`<a href="${esc(r.gm)}" target="_blank" rel="noopener">Directions</a>`);
    else if (r.lat != null) links.push(`<a href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=17/${r.lat}/${r.lon}" target="_blank" rel="noopener">Open in map</a>`);
    if (r.w)  links.push(`<a href="${esc(r.w)}" target="_blank" rel="noopener">Website</a>`);
    if (r.ig) links.push(`<a href="${esc(igUrl(r.ig))}" target="_blank" rel="noopener">${esc(r.ig)}</a>`);
    return `<div class="card${state.active === r.id ? ' is-active' : ''}" data-id="${r.id}">
      <button class="card-main">
        <h3>${esc(r.n)}</h3>
        <div class="meta">
          <i class="key" style="background:${col};color:${glyphOn(col)}">${ico(r.g)}${esc(LABELS[r.g])}</i>
          <i>${esc(r.raw || r.a)}</i>
          ${r.rg ? `<i>${esc(CORPS[r.rg].label)}</i>` : ''}
          ${r.p ? `<i>${esc(r.p)}</i>` : ''}
          ${TRAIL[r.id] ? `<i>${TRAIL[r.id].properties.km} km ${TRAIL[r.id].properties.loop ? 'loop' : 'route'}</i>` : ''}
          ${r.out ? '<i>Outside the city limits</i>' : r.lat == null ? '<i>No fixed address</i>' : ''}
          ${r.v ? `<i class="${vClass(r.v)}"><s></s>${esc(r.v)}</i>` : ''}
        </div>
        ${r.d ? `<p class="blurb">${esc(r.d)}</p>` : ''}
      </button>
      ${links.length ? `<div class="links">${links.join('')}</div>` : ''}
    </div>`;
  }).join('');
  cardsEl.querySelectorAll('.card-main').forEach(b => {
    b.onclick = () => select(b.parentElement.dataset.id);
  });
}

function select(id, fromMap){
  state.active = id;
  const r = E.find(x => x.id === id);
  render(true);
  if (r && r.lat != null && !fromMap){
    const m = marks.get(id);
    if (canCluster && m) layer.zoomToShowLayer(m, () => m.openPopup());
    else { map.setView([r.lat, r.lon], 16); if (m) m.openPopup(); }
  }
  const el = cardsEl.querySelector(`[data-id="${id}"]`);
  if (el) el.scrollIntoView({block:'nearest'});
}

function render(keep){
  const items = filtered();
  document.getElementById('count').innerHTML = `<b>${items.length}</b> of ${pool().length} shown`;
  drawNotice(items); drawList(items); drawMap(items);
  if (!keep && state.view === 'map'){
    const pts = items.filter(r => r.lat != null).map(r => [r.lat, r.lon]);
    /* Unfiltered, sit on the whole city. Filtered, close in on what is left. */
    const wide = state.area === 'all' && state.sub === 'all' && state.q === '' && state.cat === 'all';
    if (wide || !pts.length) map.fitBounds(CITY);
    else map.fitBounds(L.latLngBounds(pts), {padding:[40,40], maxZoom:15});
  }
}

syncSub();
useTiles(0);
render();
/* Leaflet measures the container once. If fonts, the controls bar wrapping or an
   embedding frame change its height afterwards, tiles are laid out for the old
   size, so re-measure on load, on resize and whenever the box actually changes. */
const remeasure = () => map.invalidateSize({animate:false});
window.addEventListener('load', remeasure);
window.addEventListener('resize', remeasure);
window.addEventListener('orientationchange', remeasure);
if (window.ResizeObserver) new ResizeObserver(remeasure).observe(document.getElementById('map'));
setTimeout(remeasure, 300);
