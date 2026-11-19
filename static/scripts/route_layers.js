import { ROUTE_COLORS } from './config.js';
import { state } from './state.js';

export function clearRouteLayers() {
  state.routeLayers.forEach(layer => layer.remove());
  state.routeLayers = [];
  document.querySelector('#route-legend').replaceChildren();
}

export function showColoredRoute(map, data) {
  clearRouteLayers();
  if (!data.legs?.length) return;
  const bounds = L.latLngBounds();
  data.legs.forEach((leg, index) => {
    const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
    const layer = L.geoJSON(leg.geometry, {
      style: { color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' },
    }).addTo(map);
    state.routeLayers.push(layer);
    bounds.extend(layer.getBounds());

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    const label = document.createElement('span');
    label.textContent = `${leg.from_name} → ${leg.to_name}`;
    legendItem.append(swatch, label);
    document.querySelector('#route-legend').appendChild(legendItem);
  });
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
}
