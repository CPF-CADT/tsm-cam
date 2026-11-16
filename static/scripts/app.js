import { initializeMap } from './map.js';
import { initializeLocationSearch, initializeMapPicking } from './locations.js';
import { initializeProvinceMarkers } from './markers.js';
import { initializeRouteForm } from './form.js';

const map = initializeMap();
initializeProvinceMarkers(map);
initializeLocationSearch();
initializeMapPicking(map);
initializeRouteForm(map);
