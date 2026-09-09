/* CARTO basemap wiring.
 *
 * The raster (PNG) tiles want an API key as a `key=` parameter; without one
 * CARTO paints an "API key required" watermark over every tile. The key
 * travels to the browser with every tile request, so it is public whatever you
 * do with it — restrict it by referrer in the CARTO dashboard rather than
 * trying to hide it here. See https://carto.com/basemaps/apikey/
 *
 * Set PUBLIC_CARTO_KEY in .env to use a different key without touching code.
 */

export const CARTO_KEY = import.meta.env.PUBLIC_CARTO_KEY || 'cb1_32zz_1_eaef391f7a379ab2d06bf70d';

const VOYAGER = 'https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png';
export const CARTO_LABELS = `https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png?key=${CARTO_KEY}`;

const OSM_CREDIT = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_CREDIT = OSM_CREDIT + ' © <a href="https://carto.com/attributions">CARTO</a>';

/* Tried in order. Some networks and embedded previews block one CDN but not
   another, so the map falls back instead of showing bare pins. */
export const TILES = [
  {
    name: 'CARTO Voyager, labels off', url: `${VOYAGER}?key=${CARTO_KEY}`, carto: true,
    opts: { maxZoom: 19, attribution: CARTO_CREDIT },
  },
  {
    name: 'CARTO Voyager, labels off, no key', url: VOYAGER, carto: true,
    opts: { maxZoom: 19, attribution: CARTO_CREDIT },
  },
  {
    name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', carto: false,
    opts: { maxZoom: 19, attribution: OSM_CREDIT },
  },
];
