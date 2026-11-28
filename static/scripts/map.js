import { CAMBODIA_VIEW } from './config.js';

const routeBounds = new WeakMap();

function fitVisibleRoute(map) {
  map.stop();
  map.invalidateSize({ animate: false });
  const bounds = routeBounds.get(map);
  if (!bounds?.isValid()) return;

  const size = map.getSize();
  if (size.x === 0 || size.y === 0) return;
  const padding = [Math.min(64, size.x / 5), Math.min(42, size.y / 5)];
  map.fitBounds(bounds, { padding, maxZoom: 8, animate: false });
}

export function frameRoute(map, bounds) {
  routeBounds.set(map, bounds);
  fitVisibleRoute(map);
}

export function initializeMap(container) {
  const map = L.map(container, {
    minZoom: 2, maxZoom: 19,
    trackResize: false,
    maxBounds: [[9.0, 101.0], [16.0, 109.0]],
    maxBoundsViscosity: 0.8,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.fitBounds(CAMBODIA_VIEW, { padding: [40, 40], maxZoom: 6, animate: false });
  map.setZoom(map.getZoom() + 1, { animate: false });
  const observer = new ResizeObserver(() => fitVisibleRoute(map));
  observer.observe(container);
  map.once('unload', () => observer.disconnect());
  return map;
}
