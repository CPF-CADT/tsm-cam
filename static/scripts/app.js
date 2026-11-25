import { initializeMap } from './map.js';
import { initializeLocationSearch, initializeMapPicking } from './locations.js?v=20261125-2';
import { initializeProvinceMarkers } from './markers.js?v=20261125-3';
import { initializeRouteForm } from './form.js?v=20261126-2';
import { initializeRouteAnimation } from './animation.js?v=20261126-2';

const map = initializeMap();
initializeProvinceMarkers(map);
initializeLocationSearch();
initializeMapPicking(map);
initializeRouteAnimation();
initializeRouteForm(map);
