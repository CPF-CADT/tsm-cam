import { state } from './state.js';
import { showStatus } from './ui.js?v=20261128-13';

const placeOptions = document.querySelector('#place-options');

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    const crossingLongitude = (previousLongitude - currentLongitude) * (latitude - currentLatitude)
      / (previousLatitude - currentLatitude) + currentLongitude;
    if (crossesLatitude && longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

function provinceAtPoint(provinces, latitude, longitude) {
  if (!provinces) return null;
  return provinces.features.find(feature => {
    const [west, south, east, north] = feature.bbox || [];
    if (longitude < west || longitude > east || latitude < south || latitude > north) return false;
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    return polygons.some(([outerRing, ...holes]) =>
      pointInRing(longitude, latitude, outerRing) && !holes.some(hole => pointInRing(longitude, latitude, hole))
    );
  })?.properties.name || null;
}

function pointKey(input) {
  return input.id || `destination-${[...document.querySelectorAll('.destination')].indexOf(input)}`;
}

export function readRouteLocations() {
  return [...document.querySelectorAll('#depot, .destination')]
    .map(input => ({ name: input.value.trim(), point: state.pickedPoints.get(pointKey(input)) ?? null }));
}

function renderPlaceOptions(places) {
  placeOptions.replaceChildren(...places.map(place => {
    const option = document.createElement('option');
    option.value = place.query;
    option.label = `${place.detected_type || 'place'}${place.province ? ` - ${place.province}` : ''}`;
    return option;
  }));
}

export function initializeLocationSearch(refreshSelectedPins) {
  document.querySelectorAll('#depot, .destination').forEach(input => {
    input.addEventListener('change', () => refreshSelectedPins());
    input.addEventListener('input', () => {
      state.pickedPoints.delete(pointKey(input));
      refreshSelectedPins(false);
      clearTimeout(state.placeSearchTimers.get(input));
      state.placeSearchControllers.get(input)?.abort();
      const query = input.value.trim();
      if (query.length < 3) return;
      state.placeSearchTimers.set(input, setTimeout(async () => {
        const cacheKey = query.toLowerCase();
        if (state.placeSearchCache.has(cacheKey)) return renderPlaceOptions(state.placeSearchCache.get(cacheKey));
        const controller = new AbortController();
        state.placeSearchControllers.set(input, controller);
        try {
          const response = await fetch(`/api/places?query=${encodeURIComponent(query)}`, {signal: controller.signal});
          if (!response.ok) return;
          const places = await response.json();
          state.placeSearchCache.set(cacheKey, places);
          renderPlaceOptions(places);
        } catch (error) {
          if (error.name !== 'AbortError') showStatus('Place search is unavailable');
        }
      }, 500));
    });
  });
}

export function initializeMapPicking(maps, refreshSelectedPins) {
  const pickButtons = [...document.querySelectorAll('.pick-location-button')];
  let pickRevision = 0;
  const setPickingCursor = active => maps.forEach(map => {
    map.getContainer().classList.toggle('map-picking', active);
  });
  // Province lookup stays local, including when TSM_OFFLINE=1.
  const provinceBoundaries = fetch('/static/data/provinces.geojson')
    .then(response => response.ok ? response.json() : null)
    .catch(() => null);
  const resetPickButtons = () => pickButtons.forEach(button => {
    button.classList.remove('is-active');
    button.textContent = '📍';
  });

  pickButtons.forEach(button => button.addEventListener('click', () => {
    pickRevision += 1;
    const isSameTarget = state.pickingOnMap && state.pickTarget === button.dataset.pickTarget;
    state.pickingOnMap = !isSameTarget;
    state.pickTarget = state.pickingOnMap ? button.dataset.pickTarget : null;
    resetPickButtons();
    if (state.pickingOnMap) {
      button.classList.add('is-active');
      button.textContent = '✕';
    }
    setPickingCursor(state.pickingOnMap);
    showStatus(state.pickingOnMap ? 'Click either map to choose this location…' : 'Map picking cancelled');
  }));

  async function pickOnMap(event) {
    if (!state.pickingOnMap) return;
    const revision = ++pickRevision;
    const target = state.pickTarget;
    showStatus('Finding the selected map location…');
    try {
      const provinceName = provinceAtPoint(await provinceBoundaries, event.latlng.lat, event.latlng.lng);
      const place = provinceName
        ? { query: provinceName }
        : await fetch(`/api/reverse?latitude=${event.latlng.lat}&longitude=${event.latlng.lng}`)
          .then(async response => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Location is outside Cambodia');
            return result;
          });
      if (revision !== pickRevision) return;
      const input = target === 'depot' ? document.querySelector('#depot') : document.querySelectorAll('.destination')[Number(target.split('-')[1])];
      input.value = place.query;
      state.pickedPoints.set(target, {query: place.query, latitude: event.latlng.lat, longitude: event.latlng.lng});
      refreshSelectedPins();
      state.pickingOnMap = false;
      state.pickTarget = null;
      setPickingCursor(false);
      resetPickButtons();
      showStatus(`${place.query} selected from the map`);
    } catch (error) {
      if (revision === pickRevision) showStatus(`Map selection error: ${error.message}`);
    }
  }
  maps.forEach(map => map.on('click', pickOnMap));
}
