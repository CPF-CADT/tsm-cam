import * as maplibregl from '/static/vendor/maplibre/maplibre-gl.mjs';
import { ROUTE_COLORS } from './config.js';
import { state } from './state.js';

export function clearRouteLayers(map) {
  state.routeLayerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  state.routeSourceIds.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
  state.routeLayerIds = [];
  state.routeSourceIds = [];
  document.querySelector('#route-legend').replaceChildren();
}

export function showColoredRoute(map, data) {
  clearRouteLayers(map);
  if (!data.legs?.length) return;
  const bounds = new maplibregl.LngLatBounds();
  data.legs.forEach((leg, index) => {
    const sourceId = `route-source-${index}`;
    const layerId = `route-layer-${index}`;
    const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
    map.addSource(sourceId, {type: 'geojson', data: {type: 'Feature', geometry: leg.geometry, properties: {}}});
    map.addLayer({id: layerId, type: 'line', source: sourceId, paint: {'line-color': color, 'line-width': 5, 'line-opacity': 0.9}});
    state.routeSourceIds.push(sourceId);
    state.routeLayerIds.push(layerId);
    leg.geometry.coordinates.forEach(coordinate => bounds.extend(coordinate));
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${leg.from_name} → ${leg.to_name}</span>`;
    document.querySelector('#route-legend').appendChild(legendItem);
  });
  if (!bounds.isEmpty()) map.fitBounds(bounds, {padding: 40, maxZoom: 8});
}
