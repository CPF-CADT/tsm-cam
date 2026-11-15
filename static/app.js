import * as maplibregl from '/static/vendor/maplibre/maplibre-gl.mjs';

const pmtilesProtocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
maplibregl.setWorkerUrl('/static/vendor/maplibre/maplibre-gl-worker.mjs');
const form = document.querySelector('#route-form');
const statusBox = document.querySelector('#status');
const resultBox = document.querySelector('#result');
const placeOptions = document.querySelector('#place-options');
const routeLegend = document.querySelector('#route-legend');
const routeColors = ['#e4572e', '#176b87', '#7a3e9d', '#2a9d8f', '#e9c46a', '#f4a261'];
const pickedPoints = new Map();
const placeSearchCache = new Map();
const placeSearchTimers = new WeakMap();
const placeSearchControllers = new WeakMap();
let pickingOnMap = false;
let routeMarkers = [];
let provinceMarkers = [];
let routeLayerIds = [];
let routeSourceIds = [];

const map = new maplibregl.Map({
  container: 'map', style: '/static/data/cambodia-style.json', center: [104.991, 12.5657],
  zoom: 7, minZoom: 7, maxZoom: 10, maxBounds: [[102.25, 10.30], [107.75, 14.75]],
  dragPan: false, scrollZoom: true, doubleClickZoom: true, attributionControl: false
});
map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');
map.once('load', () => {
  // Fit the complete Cambodia mainland inside the visible map area.
  map.fitBounds([[102.30, 10.35], [107.70, 14.75]], {padding: 24, maxZoom: 7});
});

fetch('/static/data/provinces.json').then(response => response.json()).then(provinces => {
  provinces.forEach(province => {
    const element = document.createElement('div');
    element.className = 'province-label-marker';
    element.textContent = `📍 ${province.name}`;
    provinceMarkers.push(new maplibregl.Marker({element, anchor: 'center'})
      .setLngLat([province.longitude, province.latitude])
      .addTo(map));
  });
}).catch(() => { statusBox.textContent = 'Province labels are unavailable'; });

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

document.querySelectorAll('#depot, .destination').forEach(input => {
  input.addEventListener('input', () => {
    pickedPoints.delete(pointKey(input));
    clearTimeout(placeSearchTimers.get(input));
    placeSearchControllers.get(input)?.abort();
    const query = input.value.trim();
    if (query.length < 3) return;
    placeSearchTimers.set(input, setTimeout(async () => {
      const cacheKey = query.toLowerCase();
      if (placeSearchCache.has(cacheKey)) return renderPlaceOptions(placeSearchCache.get(cacheKey));
      const controller = new AbortController();
      placeSearchControllers.set(input, controller);
      try {
        const response = await fetch(`/api/places?query=${encodeURIComponent(query)}`, {signal: controller.signal});
        if (!response.ok) return;
        const places = await response.json();
        placeSearchCache.set(cacheKey, places);
        renderPlaceOptions(places);
      } catch (error) {
        if (error.name !== 'AbortError') statusBox.textContent = 'Place search is unavailable';
      }
    }, 500));
  });
});

function removeRouteOverlays() {
  routeMarkers.forEach(marker => marker.remove());
  routeMarkers = [];
  routeLayerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  routeSourceIds.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
  routeLayerIds = [];
  routeSourceIds = [];
  routeLegend.replaceChildren();
}

function markerElement(kind, number) {
  const element = document.createElement('div');
  element.className = kind === 'depot' ? 'car-marker' : 'destination-marker';
  if (kind === 'depot') element.textContent = '🚗';
  else element.innerHTML = `<span>${number}</span>`;
  return element;
}

function showLocationMarkers(data) {
  routeMarkers.forEach(marker => marker.remove());
  routeMarkers = [];
  const stopNumbers = new Map();
  data.order.slice(0, -1).forEach((locationIndex, position) => stopNumbers.set(locationIndex, position + 1));
  data.locations.forEach((location, locationIndex) => {
    const isDepot = locationIndex === data.order[0];
    const marker = new maplibregl.Marker({element: markerElement(isDepot ? 'depot' : 'destination', stopNumbers.get(locationIndex))})
      .setLngLat([location.longitude, location.latitude])
      .setPopup(new maplibregl.Popup({offset: 24}).setHTML(`<strong>${isDepot ? 'Departure' : `Stop ${stopNumbers.get(locationIndex)}`}</strong><br>${location.query}`))
      .addTo(map);
    routeMarkers.push(marker);
  });
}

function showColoredRoute(data) {
  routeLayerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  routeSourceIds.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
  routeLayerIds = [];
  routeSourceIds = [];
  routeLegend.replaceChildren();
  if (!data.legs?.length) return;
  const bounds = new maplibregl.LngLatBounds();
  data.legs.forEach((leg, index) => {
    const sourceId = `route-source-${index}`;
    const layerId = `route-layer-${index}`;
    const color = routeColors[index % routeColors.length];
    map.addSource(sourceId, {type: 'geojson', data: {type: 'Feature', geometry: leg.geometry, properties: {}}});
    map.addLayer({id: layerId, type: 'line', source: sourceId, paint: {'line-color': color, 'line-width': 5, 'line-opacity': 0.9}});
    routeSourceIds.push(sourceId);
    routeLayerIds.push(layerId);
    leg.geometry.coordinates.forEach(coordinate => bounds.extend(coordinate));
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${leg.from_name} → ${leg.to_name}</span>`;
    routeLegend.appendChild(legendItem);
  });
  if (!bounds.isEmpty()) map.fitBounds(bounds, {padding: 40, maxZoom: 8});
}

document.querySelector('#pick-on-map').addEventListener('click', () => {
  pickingOnMap = !pickingOnMap;
  map.getCanvas().classList.toggle('map-picking', pickingOnMap);
  document.querySelector('#pick-on-map').textContent = pickingOnMap ? 'Click map now…' : 'Pick location on map';
});

map.on('click', async event => {
  if (!pickingOnMap) return;
  const target = document.querySelector('#pick-target').value;
  statusBox.textContent = 'Finding the selected map location…';
  try {
    const response = await fetch(`/api/reverse?latitude=${event.lngLat.lat}&longitude=${event.lngLat.lng}`);
    const place = await response.json();
    if (!response.ok) throw new Error(place.detail || 'Location is outside Cambodia');
    const input = target === 'depot' ? document.querySelector('#depot') : document.querySelectorAll('.destination')[Number(target.split('-')[1])];
    input.value = place.query;
    pickedPoints.set(target, {query: place.query, latitude: event.lngLat.lat, longitude: event.lngLat.lng});
    pickingOnMap = false;
    map.getCanvas().classList.remove('map-picking');
    document.querySelector('#pick-on-map').textContent = 'Pick location on map';
    statusBox.textContent = `${place.query} selected from the map`;
  } catch (error) {
    statusBox.textContent = `Map selection error: ${error.message}`;
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const solverMode = document.querySelector('#solver-mode').value;
  statusBox.textContent = solverMode === 'quantum' ? 'Calculating distance and running QAOA…' : 'Calculating the classical route…';
  resultBox.replaceChildren();
  removeRouteOverlays();
  const destinations = [...document.querySelectorAll('.destination')].map(input => input.value.trim()).filter(Boolean);
  const payload = {
    depot: document.querySelector('#depot').value.trim(), destinations, solver_mode: solverMode, shots: 32768,
    depot_point: pickedPoints.get('depot') || null,
    destination_points: [...document.querySelectorAll('.destination')].map((input, index) => pickedPoints.get(`destination-${index}`) || null)
  };
  try {
    const response = await fetch('/api/routes/optimize', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Request failed');
    statusBox.textContent = data.message;
    renderResult(data);
    showLocationMarkers(data);
    showColoredRoute(data);
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
  }
});

function renderResult(data) {
  const order = document.createElement('div');
  order.className = 'route-order';
  order.textContent = data.ordered_names.join(' → ');
  const metrics = document.createElement('div');
  metrics.className = 'metric-grid';
  [['Total distance', `${(data.distance_meters / 1000).toFixed(2)} km`], ['Estimated time', `${(data.duration_seconds / 60).toFixed(1)} minutes`]].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    const title = document.createElement('span');
    title.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = value;
    card.append(title, amount);
    metrics.appendChild(card);
  });
  resultBox.append(order, metrics);
}
