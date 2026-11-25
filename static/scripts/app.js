import { initializeMap } from './map.js';
import { initializeLocationSearch, initializeMapPicking } from './locations.js?v=20261125-2';
import { initializeProvinceMarkers } from './markers.js';
import { initializeRouteForm } from './form.js?v=20261125-5';
import { initializeRouteAnimation } from './animation.js?v=20261125-5';

const map = initializeMap();
initializeProvinceMarkers(map);
initializeLocationSearch();
initializeMapPicking(map);
initializeRouteAnimation();
initializeRouteForm(map);
