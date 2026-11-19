import { state } from './state.js';
import { showStatus } from './ui.js';

const placeOptions = document.querySelector('#place-options');

function pointKey(input) {
  return input.id || `destination-${[...document.querySelectorAll('.destination')].indexOf(input)}`;
}

function renderPlaceOptions(places) {
  placeOptions.replaceChildren(...places.map(place => {
    const option = document.createElement('option');
    option.value = place.query;
    option.label = `${place.detected_type || 'place'}${place.province ? ` - ${place.province}` : ''}`;
    return option;
  }));
}

export function initializeLocationSearch() {
  document.querySelectorAll('#depot, .destination').forEach(input => {
    input.addEventListener('input', () => {
      state.pickedPoints.delete(pointKey(input));
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

export function initializeMapPicking(map) {
  const pickButtons = [...document.querySelectorAll('.pick-location-button')];
  const resetPickButtons = () => pickButtons.forEach(button => {
    button.classList.remove('is-active');
    button.textContent = '📍';
  });

  pickButtons.forEach(button => button.addEventListener('click', () => {
    const isSameTarget = state.pickingOnMap && state.pickTarget === button.dataset.pickTarget;
    state.pickingOnMap = !isSameTarget;
    state.pickTarget = state.pickingOnMap ? button.dataset.pickTarget : null;
    resetPickButtons();
    if (state.pickingOnMap) {
      button.classList.add('is-active');
      button.textContent = '✕';
    }
    map.getContainer().classList.toggle('map-picking', state.pickingOnMap);
    showStatus(state.pickingOnMap ? 'Click the map to choose this location…' : 'Map picking cancelled');
  }));

  map.on('click', async event => {
    if (!state.pickingOnMap) return;
    const target = state.pickTarget;
    showStatus('Finding the selected map location…');
    try {
      const response = await fetch(`/api/reverse?latitude=${event.latlng.lat}&longitude=${event.latlng.lng}`);
      const place = await response.json();
      if (!response.ok) throw new Error(place.detail || 'Location is outside Cambodia');
      const input = target === 'depot' ? document.querySelector('#depot') : document.querySelectorAll('.destination')[Number(target.split('-')[1])];
      input.value = place.query;
      state.pickedPoints.set(target, {query: place.query, latitude: event.latlng.lat, longitude: event.latlng.lng});
      state.pickingOnMap = false;
      state.pickTarget = null;
      map.getContainer().classList.remove('map-picking');
      resetPickButtons();
      showStatus(`${place.query} selected from the map`);
    } catch (error) {
      showStatus(`Map selection error: ${error.message}`);
    }
  });
}
