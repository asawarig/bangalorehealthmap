/* One database object assembled from the files in src/data/.
 *
 * entries.json is the file you edit to add a listing. Everything the page
 * needs beyond the raw rows — the area dropdown, the per-corporation counts,
 * the header and footer tallies — is worked out here at build time, so a new
 * entry in a new neighbourhood shows up in the filters without a second edit.
 */

import rows from '../data/entries.json';
import corporations from '../data/corporations.json';
import city from '../data/city.json';

import ZONES from '../data/zones.json';
import BORDERS from '../data/borders.json';
import MASK from '../data/mask.json';
import ROUTES from '../data/routes.json';
import ICONS from '../data/icons.json';
import LABELS from '../data/labels.json';

/* A listing only has to carry the fields that say what it is and where it is.
   Everything optional is filled in here, so a short new row in entries.json
   renders the same as a row that came out of the original spreadsheet. */
const TEXT = ['n', 'c', 'g', 's', 'a', 'raw', 'ad', 'gm', 'w', 'ig', 'd', 'p', 'b', 't', 'src', 'v'];
const entries = rows.map((row) => {
  const r = { ...row };
  TEXT.forEach((f) => { if (r[f] == null) r[f] = ''; });
  if (!Array.isArray(r.tg)) r.tg = [];
  if (r.lat == null || r.lon == null) { r.lat = null; r.lon = null; }
  r.out = r.out ? 1 : 0;
  if (!r.raw) r.raw = r.a;
  return r;
});

/* Corporation counts follow the data rather than being written down twice. */
const tally = {};
entries.forEach((r) => { if (r.rg) tally[r.rg] = (tally[r.rg] || 0) + 1; });
const corps = corporations.map((c) => ({ ...c, n: tally[c.k] || 0 }));

/* Areas nest under the corporation they sit in, so the two filters read as one
   hierarchy rather than two lists that can contradict each other. Anything with
   no corporation — an online community, a day trip past the boundary — lands in
   a sixth group at the bottom. */
const byRg = {};
entries.forEach((r) => {
  if (!r.a) return;
  const k = r.rg || '';
  (byRg[k] = byRg[k] || new Set()).add(r.a);
});
const areas = [];
corps.forEach((c) => {
  if (byRg[c.k]) areas.push({ rg: c.k, label: c.label, items: [...byRg[c.k]].sort() });
});
if (byRg['']) {
  areas.push({ rg: '', label: 'Outside the five corporations', items: [...byRg['']].sort() });
}

export const DB = { entries, areas, corps, box: city.box, gba_km2: city.gba_km2 };

/* The rows exactly as they sit in entries.json, before the defaults above are
   filled in. The build-time check reads these so it sees what you typed. */
export const RAW_ENTRIES = rows;
export { ZONES, BORDERS, MASK, ROUTES, ICONS, LABELS };

/* Facts the page states in its header, footer and meta description. Counted
   once here so the copy can never drift from the data. */
export const COUNTS = {
  total: entries.length,
  mapped: entries.filter((r) => r.lat != null).length,
  verified: entries.filter((r) => r.v === 'Verified').length,
  outside: entries.filter((r) => r.out).length,
};
COUNTS.unpinned = COUNTS.total - COUNTS.mapped - COUNTS.outside;
