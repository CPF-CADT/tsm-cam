const BASE_KM_PER_SECOND = 40;
const ARRIVAL_PAUSE_MS = 1000;
const RESTORE_LOCATIONS_MS = 2000;
const PLAYBACK_SPEED = 3;

function helicopterIcon(heading = 0) {
  return L.divIcon({
    className: 'car-icon-wrapper',
    html: `<div class="animated-car-icon" style="--helicopter-heading: ${heading}deg" role="img" aria-label="Animated route helicopter"></div>`,
    iconSize: [72, 52], iconAnchor: [36, 26],
  });
}

function toLatLng(coordinate) {
  return [coordinate[1], coordinate[0]];
}

function heading(map, from, to) {
  // The source artwork faces right. Match the straight route's screen direction,
  // rather than a geographic bearing that can differ under map projection.
  const start = map.project(from);
  const end = map.project(to);
  return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
}

function interpolate(from, to, progress) {
  return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
}

export function createRouteAnimation(map, setPinsAnimating) {
  let animation;

  function setVisited(stopIndex) {
    const marker = animation.markers.find(item => item.__locationIndex === stopIndex);
    marker?.getElement()?.classList.add('is-visited');
  }

  function setCompletedSegment(index) {
    const layer = animation.layers[index];
    layer?.setStyle({ color: '#2a9d8f', weight: 7, opacity: 1 });
  }

  function finishLeg() {
    const leg = animation.legs[animation.legIndex];
    setCompletedSegment(animation.legIndex);
    setVisited(leg.to_index);
    animation.legIndex += 1;
    animation.legStart = null;
    const nextLeg = animation.legs[animation.legIndex];
    if (!nextLeg) {
      animation.timer = setTimeout(() => {
        animation.timer = null;
        setPinsAnimating(false);
      }, RESTORE_LOCATIONS_MS);
      return;
    }

    const from = toLatLng(nextLeg.coordinates[0]);
    const to = toLatLng(nextLeg.coordinates.at(-1));
    animation.helicopter.getElement()?.querySelector('.animated-car-icon')
      ?.style.setProperty('--helicopter-heading', `${heading(map, from, to)}deg`);
    animation.timer = setTimeout(() => {
      animation.timer = null;
      animation.frame = requestAnimationFrame(step);
    }, ARRIVAL_PAUSE_MS);
  }

  function step(timestamp) {
    animation.frame = null;
    const leg = animation.legs[animation.legIndex];
    animation.legStart ??= timestamp;
    const elapsedSeconds = (timestamp - animation.legStart) / 1000 * PLAYBACK_SPEED;
    const travelSeconds = Math.max(1.5, (leg.distance_meters / 1000) / BASE_KM_PER_SECOND);
    const progress = Math.min(1, elapsedSeconds / travelSeconds);
    const from = toLatLng(leg.coordinates[0]);
    const to = toLatLng(leg.coordinates.at(-1));
    animation.helicopter.setLatLng(interpolate(from, to, progress));

    if (progress >= 1) {
      finishLeg();
    } else {
      animation.frame = requestAnimationFrame(step);
    }
  }

  function reset() {
    if (animation) {
      if (animation.frame !== null) cancelAnimationFrame(animation.frame);
      if (animation.timer !== null) clearTimeout(animation.timer);
      animation.helicopter.remove();
      animation = null;
      setPinsAnimating(false);
    }
  }

  function start(data, markers, layers) {
    reset();
    const legs = data.legs.map(leg => ({ ...leg, coordinates: leg.geometry.coordinates }));
    if (!legs.length) return;

    const from = toLatLng(legs[0].coordinates[0]);
    const to = toLatLng(legs[0].coordinates.at(-1));
    animation = {
      legs,
      markers,
      layers,
      legIndex: 0,
      frame: null,
      timer: null,
      legStart: null,
      helicopter: L.marker(from, {
        icon: helicopterIcon(heading(map, from, to)), interactive: false, zIndexOffset: 1000,
      }).addTo(map),
    };
    setPinsAnimating(true);
    animation.frame = requestAnimationFrame(step);
  }

  return { start, reset };
}
