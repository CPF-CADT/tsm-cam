import { state } from './state.js';

const BASE_KM_PER_SECOND = 40;
const ARRIVAL_PAUSE_MS = 1000;
const PLAYBACK_SPEED = 2.5;

let map;
let animation;

const panel = document.querySelector('#journey-details');
const currentLabel = document.querySelector('#animation-current');
const nextLabel = document.querySelector('#animation-next');
const progressLabel = document.querySelector('#animation-progress');
const remainingLabel = document.querySelector('#animation-remaining');

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

function heading(from, to) {
  // The source artwork faces right. Match the straight route's screen direction,
  // rather than a geographic bearing that can differ under map projection.
  const start = map.project(from);
  const end = map.project(to);
  return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
}

function updateDetails(progress = 0) {
  if (!animation) return;
  const leg = animation.legs[animation.legIndex];
  const total = animation.totalMeters;
  const travelled = Math.min(total, animation.completedMeters + (leg ? leg.distance_meters * progress : 0));
  const current = leg ? leg.from_name : animation.legs.at(-1).to_name;
  const next = leg ? leg.to_name : '—';
  currentLabel.textContent = current;
  nextLabel.textContent = next;
  progressLabel.textContent = `${total ? ((travelled / total) * 100).toFixed(0) : 100}%`;
  remainingLabel.textContent = `${Math.max(0, (total - travelled) / 1000).toFixed(2)} km`;
}

function setVisited(stopIndex) {
  const marker = state.routeMarkers.find(item => item.__locationIndex === stopIndex);
  marker?.getElement()?.classList.add('is-visited');
}

function setCompletedSegment(index) {
  const layer = state.routeLayers[index];
  layer?.setStyle({ color: '#2a9d8f', weight: 7, opacity: 1 });
}

function interpolate(from, to, progress) {
  return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
}

function finishLeg() {
  const leg = animation.legs[animation.legIndex];
  animation.completedMeters += leg.distance_meters;
  setCompletedSegment(animation.legIndex);
  setVisited(leg.to_index);
  animation.legIndex += 1;
  animation.legStart = null;
  updateDetails();

  const nextLeg = animation.legs[animation.legIndex];
  if (!nextLeg) return;

  const from = toLatLng(nextLeg.coordinates[0]);
  const to = toLatLng(nextLeg.coordinates.at(-1));
  animation.helicopter.getElement()?.querySelector('.animated-car-icon')
    ?.style.setProperty('--helicopter-heading', `${heading(from, to)}deg`);
  animation.pauseTimer = setTimeout(() => {
    animation.pauseTimer = null;
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
    updateDetails(progress);
    animation.frame = requestAnimationFrame(step);
  }
}

export function resetRouteAnimation() {
  if (animation) {
    if (animation.frame !== null) cancelAnimationFrame(animation.frame);
    if (animation.pauseTimer !== null) clearTimeout(animation.pauseTimer);
    animation.helicopter.remove();
    animation = null;
  }
  panel.hidden = true;
}

export function startRouteAnimation(leafletMap, data) {
  resetRouteAnimation();
  const legs = data.legs.map(leg => ({ ...leg, coordinates: leg.geometry.coordinates }));
  if (!legs.length) return;

  map = leafletMap;
  const from = toLatLng(legs[0].coordinates[0]);
  const to = toLatLng(legs[0].coordinates.at(-1));
  animation = {
    legs,
    totalMeters: data.distance_meters ?? legs.reduce((sum, leg) => sum + leg.distance_meters, 0),
    completedMeters: 0,
    legIndex: 0,
    frame: null,
    pauseTimer: null,
    legStart: null,
    helicopter: L.marker(from, {
      icon: helicopterIcon(heading(from, to)), interactive: false, zIndexOffset: 1000,
    }).addTo(map),
  };
  panel.hidden = false;
  updateDetails();
  animation.frame = requestAnimationFrame(step);
}
