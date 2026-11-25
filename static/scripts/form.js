import { state } from './state.js';
import { clearRouteMarkers, showLocationMarkers } from './markers.js';
import { clearRouteLayers, showColoredRoute } from './route_layers.js';
import { clearResult, renderResult, showStatus } from './ui.js';
import { prepareRouteAnimation, resetRouteAnimation } from './animation.js?v=20261125-5';

export function initializeRouteForm(map) {
  document.querySelector('#route-form').addEventListener('submit', async event => {
    event.preventDefault();
    const optimizeButton = event.currentTarget.querySelector('button[type="submit"]');
    if (optimizeButton.disabled) return;
    const solverMode = document.querySelector('#solver-mode').value;
    const originalLabel = optimizeButton.textContent;
    optimizeButton.disabled = true;
    optimizeButton.textContent = solverMode === 'quantum' ? 'Running QAOA…' : 'Calculating route…';
    optimizeButton.setAttribute('aria-busy', 'true');
    showStatus(solverMode === 'quantum' ? 'Calculating distance and running QAOA…' : 'Calculating the classical route…');
    clearResult();
    clearRouteMarkers();
    clearRouteLayers(map);
    resetRouteAnimation({ hide: true });
    const destinationInputs = [...document.querySelectorAll('.destination')];
    const destinations = destinationInputs.map(input => input.value.trim()).filter(Boolean);
    const payload = {
      depot: document.querySelector('#depot').value.trim(), destinations,
      solver_mode: solverMode, shots: 32768,
      depot_point: state.pickedPoints.get('depot') || null,
      destination_points: destinationInputs.map((input, index) => state.pickedPoints.get(`destination-${index}`) || null)
    };
    try {
      const response = await fetch('/api/routes/optimize', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Request failed');
      showStatus(data.message);
      renderResult(data);
      showLocationMarkers(map, data);
      showColoredRoute(map, data);
      prepareRouteAnimation(map, data);
    } catch (error) {
      showStatus(`Error: ${error.message}`);
    } finally {
      optimizeButton.disabled = false;
      optimizeButton.textContent = originalLabel;
      optimizeButton.removeAttribute('aria-busy');
    }
  });
}
