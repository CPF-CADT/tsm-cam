function divIcon(className, html, size, anchor) {
  return L.divIcon({ className, html, iconSize: size, iconAnchor: anchor });
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function placeLabelIcon(name, className = '', visitNumber) {
  const icon = visitNumber === undefined
    ? '&#128205;'
    : `<span class="visit-number">${visitNumber}</span>`;
  return divIcon(
    `province-label-wrapper ${className}`,
    `<span class="province-label">${icon} ${escapeHtml(name)}</span>`,
    [1, 1], [0, 0]
  );
}

export function initializeLocationMarkers(maps, toggle, readLocations) {
  const groups = maps.map(map => ({
    map,
    provinceLayer: L.layerGroup(),
    selectedLayer: L.layerGroup().addTo(map),
    provincePins: new Map(),
    optimizedLocations: null,
    animating: false
  }));
  const toggleState = toggle.querySelector('span');
  let enabled = toggle.getAttribute('aria-pressed') === 'true';
  let selectedNames = [];
  let selectedLocations = [];
  let revision = 0;
  const geocodes = new Map();

  function updateVisibility({ map, provinceLayer, animating }) {
    if (enabled && !animating) provinceLayer.addTo(map);
    else map.removeLayer(provinceLayer);
  }

  function renderPins(group) {
    const { optimizedLocations, provincePins, provinceLayer, selectedLayer } = group;
    const names = optimizedLocations?.map(place => place.query) ?? selectedNames;
    const selected = new Set(names.map(name => name.toLowerCase()));
    for (const [name, marker] of provincePins) {
      if (selected.has(name)) provinceLayer.removeLayer(marker);
      else provinceLayer.addLayer(marker);
    }
    selectedLayer.clearLayers();
    if (optimizedLocations) return;
    selectedLocations.forEach((location, index) => {
      if (location) addLocationMarker(selectedLayer, location, index, index === 0);
    });
  }

  groups.forEach(updateVisibility);
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggleState.textContent = enabled ? 'On' : 'Off';
    groups.forEach(updateVisibility);
  });

  const provincesReady = fetch('/static/data/provinces.json')
    .then(response => response.ok ? response.json() : [])
    .catch(() => [])
    .then(provinces => {
      for (const { provincePins } of groups) {
        for (const province of provinces) {
          const name = province.name.toLowerCase();
          provincePins.set(name, L.marker([province.latitude, province.longitude], {
            icon: placeLabelIcon(province.name),
            interactive: false
          }));
        }
      }
      return new Map(provinces.map(province => [province.name.toLowerCase(), province]));
    });

  function resolvePlace(name) {
    const key = name.toLowerCase();
    if (!geocodes.has(key)) {
      const lookup = fetch(`/api/geocode?query=${encodeURIComponent(name)}`)
        .then(response => response.ok ? response.json() : [])
        .then(places => places[0] ?? null)
        .catch(() => null)
        .then(place => {
          if (!place) geocodes.delete(key);
          return place;
        });
      geocodes.set(key, lookup);
    }
    return geocodes.get(key);
  }

  async function refreshSelectedPins(resolveUnknown = true) {
    const current = ++revision;
    const [depot, ...destinations] = readLocations();
    const entries = [depot, ...destinations.filter(entry => entry.name)];
    selectedNames = entries.map(entry => entry.name);
    const provinces = await provincesReady;
    if (current !== revision) return;

    const points = entries.map(({ name, point }) => point ?? provinces.get(name.toLowerCase()));
    function showPoints(locations) {
      selectedLocations = locations.map((location, index) =>
        location ? { ...location, query: entries[index].name } : null);
      groups.forEach(renderPins);
    }
    showPoints(points);
    if (points.every((point, index) => point || !entries[index].name)) return;

    const resolved = await Promise.all(points.map((point, index) => {
      const name = entries[index].name;
      if (point || !name) return point;
      return resolveUnknown ? resolvePlace(name) : geocodes.get(name.toLowerCase());
    }));
    if (current === revision) showPoints(resolved);
  }

  refreshSelectedPins();
  return {
    refreshSelectedPins,
    controls: groups.map(group => ({
      setAnimating(animating) {
        group.animating = animating;
        updateVisibility(group);
      },
      showRoute(locations) {
        group.optimizedLocations = locations;
        renderPins(group);
      }
    }))
  };
}

function addLocationMarker(target, location, index, isDepot, visitNumber) {
  const title = isDepot ? 'Depot' : 'Destination';
  const style = isDepot ? 'selected-location depot-location' : 'selected-location';
  const marker = L.marker([location.latitude, location.longitude], {
    icon: placeLabelIcon(location.query, style, visitNumber),
    zIndexOffset: 200
  }).bindPopup(`<strong>${title}</strong><br>${escapeHtml(location.query)}`, { offset: [0, -12] }).addTo(target);
  marker.__locationIndex = index;
  return marker;
}

export function showLocationMarkers(map, data) {
  const visitNumbers = new Map(data.order.slice(1, -1).map((index, position) => [index, position + 1]));
  return data.locations.map((location, index) =>
    addLocationMarker(map, location, index, index === data.order[0], visitNumbers.get(index)));
}
