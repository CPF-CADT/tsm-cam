import { initializeMap } from './map.js?v=20261128-17';
import { initializeLocationSearch, initializeMapPicking, readRouteLocations } from './locations.js?v=20261128-13';
import { initializeLocationMarkers } from './markers.js?v=20261128-15';
import { initializeRouteForm } from './form.js?v=20261128-17';

const views = [...document.querySelectorAll('[data-solver-panel]')].map(panel => ({
  panel,
  map: initializeMap(panel.querySelector('.map'))
}));
const maps = views.map(view => view.map);
const pins = initializeLocationMarkers(maps, document.querySelector('#toggle-location-pins'), readRouteLocations);
const clearComparison = initializeRouteForm(views.map((view, index) => ({ ...view, pins: pins.controls[index] })));
function updateSelection(resolveUnknown) {
  clearComparison();
  return pins.refreshSelectedPins(resolveUnknown);
}
initializeLocationSearch(updateSelection);
initializeMapPicking(maps, updateSelection);
