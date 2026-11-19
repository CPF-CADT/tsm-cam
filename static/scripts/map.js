import { CAMBODIA_VIEW } from './config.js';

export function initializeMap() {
  const map = L.map('map', {
    minZoom: 2, maxZoom: 19,
    maxBounds: [[9.0, 101.0], [16.0, 109.0]],
    maxBoundsViscosity: 0.8,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.fitBounds(CAMBODIA_VIEW, { padding: [40, 40], maxZoom: 6, animate: false });
  return map;
}
