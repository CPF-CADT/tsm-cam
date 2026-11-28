import { state } from './state.js';
import { clearRouteMarkers, showLocationMarkers } from './markers.js?v=20261125-3';
import { clearRouteLayers, showColoredRoute } from './route_layers.js?v=20261128-3';
import { clearResult, renderResult, showStatus } from './ui.js?v=20261128-5';
import { startRouteAnimation, resetRouteAnimation } from './animation.js?v=20261128-6';

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
    resetRouteAnimation();
    clearResult();
    clearRouteMarkers();
    clearRouteLayers();
    const entries = [...document.querySelectorAll('.destination')]
      .map((input, index) => ({
        name: input.value.trim(),
        point: state.pickedPoints.get(`destination-${index}`) || null
      }))
      .filter(entry => entry.name);
    const payload = {
      depot: document.querySelector('#depot').value.trim(),
      destinations: entries.map(entry => entry.name),
      solver_mode: solverMode,
      depot_point: state.pickedPoints.get('depot') || null,
      destination_points: entries.map(entry => entry.point)
    };
    try {
      const response = await fetch('/api/routes/optimize', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Request failed');
      showStatus(data.message);
      renderResult(data);
      showLocationMarkers(map, data);
      showColoredRoute(map, data);
      startRouteAnimation(map, data);
    } catch (error) {
      showStatus(`Error: ${error.message}`);
    } finally {
      optimizeButton.disabled = false;
      optimizeButton.textContent = originalLabel;
      optimizeButton.removeAttribute('aria-busy');
    }
  });
}
