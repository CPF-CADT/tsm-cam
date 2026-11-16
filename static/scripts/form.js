import { state } from './state.js';
import { clearRouteMarkers, showLocationMarkers } from './markers.js';
import { clearRouteLayers, showColoredRoute } from './route_layers.js';
import { clearResult, renderResult, showStatus } from './ui.js';

export function initializeRouteForm(map) {
  document.querySelector('#route-form').addEventListener('submit', async event => {
    event.preventDefault();
    const solverMode = document.querySelector('#solver-mode').value;
    showStatus(solverMode === 'quantum' ? 'Calculating distance and running QAOA…' : 'Calculating the classical route…');
    clearResult();
    clearRouteMarkers();
    clearRouteLayers(map);
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
    } catch (error) {
      showStatus(`Error: ${error.message}`);
    }
  });
}
