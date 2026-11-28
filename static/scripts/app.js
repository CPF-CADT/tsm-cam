import { initializeMap } from './map.js';
import { initializeLocationSearch, initializeMapPicking } from './locations.js?v=20261125-2';
import { initializeProvinceMarkers } from './markers.js?v=20261125-3';
import { initializeRouteForm } from './form.js?v=20261128-6';

const map = initializeMap();
initializeProvinceMarkers(map);
initializeLocationSearch();
initializeMapPicking(map);
initializeRouteForm(map);
