import * as maplibregl from '/static/vendor/maplibre/maplibre-gl.mjs';
import { state } from './state.js';

export function initializeProvinceMarkers(map) {
  fetch('/static/data/provinces.json').then(response => response.json()).then(provinces => {
    provinces.forEach(province => {
      const element = document.createElement('div');
      element.className = 'province-label-marker';
      element.textContent = `📍 ${province.name}`;
      state.provinceMarkers.push(new maplibregl.Marker({element, anchor: 'center'}).setLngLat([province.longitude, province.latitude]).addTo(map));
    });
  }).catch(() => {});
}

function markerElement(kind, number) {
  const element = document.createElement('div');
  element.className = kind === 'depot' ? 'car-marker' : 'destination-marker';
  if (kind === 'depot') element.textContent = '🚗';
  else element.innerHTML = `<span>${number}</span>`;
  return element;
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
    const marker = new maplibregl.Marker({element: markerElement(isDepot ? 'depot' : 'destination', stopNumbers.get(locationIndex))})
      .setLngLat([location.longitude, location.latitude])
      .setPopup(new maplibregl.Popup({offset: 24}).setHTML(`<strong>${isDepot ? 'Departure' : `Stop ${stopNumbers.get(locationIndex)}`}</strong><br>${location.query}`))
      .addTo(map);
    state.routeMarkers.push(marker);
  });
}
