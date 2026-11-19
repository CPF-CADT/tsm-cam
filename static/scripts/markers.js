import { state } from './state.js';

function divIcon(className, html, size, anchor) {
  return L.divIcon({ className, html, iconSize: size, iconAnchor: anchor });
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

export function initializeProvinceMarkers(map) {
  fetch('/static/data/provinces.json').then(response => response.json()).then(provinces => {
    provinces.forEach(province => {
      const marker = L.marker([province.latitude, province.longitude], {
        icon: divIcon('province-label-wrapper', `<span class="province-label">&#128205; ${escapeHtml(province.name)}</span>`, [1, 1], [0, 0]),
        interactive: false,
      }).addTo(map);
      state.provinceMarkers.push(marker);
    });
  }).catch(() => {});
}

function markerIcon(kind, number) {
  return kind === 'depot'
    ? divIcon('car-icon-wrapper', '<div class="car-icon">&#128664;</div>', [42, 42], [21, 21])
    : divIcon('destination-icon-wrapper', `<div class="destination-icon"><span>${number}</span></div>`, [34, 34], [17, 34]);
}

export function clearRouteMarkers() {
  state.routeMarkers.forEach(marker => marker.remove());
  state.routeMarkers = [];
}

export function showLocationMarkers(map, data) {
  clearRouteMarkers();
  const stopNumbers = new Map();
  data.order.slice(0, -1).forEach((locationIndex, position) => stopNumbers.set(locationIndex, position + 1));
  data.locations.forEach((location, locationIndex) => {
    const isDepot = locationIndex === data.order[0];
    const title = isDepot ? 'Departure' : `Stop ${stopNumbers.get(locationIndex)}`;
    const marker = L.marker([location.latitude, location.longitude], {
      icon: markerIcon(isDepot ? 'depot' : 'destination', stopNumbers.get(locationIndex)),
    }).bindPopup(`<strong>${title}</strong><br>${escapeHtml(location.query)}`, { offset: [0, -20] }).addTo(map);
    state.routeMarkers.push(marker);
  });
}
