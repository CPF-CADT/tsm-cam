import { ROUTE_COLORS } from './config.js';

export function showColoredRoute(map, data) {
  return data.legs.map((leg, index) => L.geoJSON(leg.geometry, {
    style: { color: ROUTE_COLORS[index % ROUTE_COLORS.length], weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
  }).addTo(map));
}
