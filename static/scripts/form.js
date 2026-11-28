import { readRouteLocations } from './locations.js?v=20261128-13';
import { frameRoute } from './map.js?v=20261128-17';
import { showLocationMarkers } from './markers.js?v=20261128-15';
import { showColoredRoute } from './route_layers.js?v=20261128-8';
import { renderResult, showStatus } from './ui.js?v=20261128-13';
import { createRouteAnimation } from './animation.js?v=20261128-17';

export function initializeRouteForm(views) {
  const optimizeButton = document.querySelector('#optimize-route');
  let selectionVersion = 0;
  const panels = views.map(({ panel, map, pins }) => ({
    map,
    side: panel.dataset.solverPanel,
    picker: panel.querySelector('.solver-picker'),
    result: panel.querySelector('.solver-result'),
    pins,
    animation: createRouteAnimation(map, pins.setAnimating),
    routeObjects: []
  }));

  function resetPanels() {
    for (const panel of panels) {
      panel.result.hidden = true;
      panel.animation.reset();
      panel.routeObjects.forEach(object => object.remove());
      panel.routeObjects = [];
      panel.pins.showRoute(null);
    }
    panels.forEach(panel => frameRoute(panel.map, null));
  }

  document.querySelector('#route-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (optimizeButton.disabled) return;
    const submittedVersion = selectionVersion;
    optimizeButton.disabled = true;
    optimizeButton.textContent = 'Optimizing…';
    optimizeButton.setAttribute('aria-busy', 'true');
    for (const panel of panels) panel.picker.disabled = true;
    showStatus('Comparing routes…');
    resetPanels();

    const [depot, ...entries] = readRouteLocations();
    const destinations = entries.filter(entry => entry.name);
    const payload = {
      depot: depot.name,
      destinations: destinations.map(entry => entry.name),
      left_solver: panels[0].picker.value,
      right_solver: panels[1].picker.value,
      depot_point: depot.point,
      destination_points: destinations.map(entry => entry.point)
    };
    try {
      const response = await fetch('/api/routes/compare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (submittedVersion !== selectionVersion) return;
      if (!response.ok) {
        const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg).join(' · ') : data.detail;
        throw new Error(detail || 'Route comparison failed');
      }

      const locations = (data.left.route ?? data.right.route)?.locations;
      const bounds = locations && L.latLngBounds(locations.map(place => [place.latitude, place.longitude]));
      for (const panel of panels) renderResult(panel.result, data[panel.side]);
      showStatus('');
      for (const panel of panels) {
        const route = data[panel.side].route;
        frameRoute(panel.map, bounds);
        if (!route) continue;
        const markers = showLocationMarkers(panel.map, route);
        panel.pins.showRoute(route.locations);
        const layers = showColoredRoute(panel.map, route);
        panel.routeObjects = [...markers, ...layers];
        panel.animation.start(route, markers, layers);
      }
    } catch (error) {
      if (submittedVersion === selectionVersion) showStatus(`Error: ${error.message}`);
    } finally {
      for (const panel of panels) panel.picker.disabled = false;
      optimizeButton.disabled = false;
      optimizeButton.textContent = 'Optimize route';
      optimizeButton.removeAttribute('aria-busy');
    }
  });

  return function clearComparison() {
    selectionVersion += 1;
    if (optimizeButton.disabled || panels.some(panel => !panel.result.hidden)) {
      showStatus('');
      resetPanels();
    }
  };
}
