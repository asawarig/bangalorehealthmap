/* Leaflet.markercluster is a plugin from before ES modules: it reaches for a
   global `L` at evaluation time. Imports are evaluated in order, so putting the
   global here — in a module imported before the plugin — is what makes
   `L.markerClusterGroup` exist by the time the app runs. */
import L from 'leaflet';

if (typeof window !== 'undefined' && !window.L) window.L = L;

export default L;
