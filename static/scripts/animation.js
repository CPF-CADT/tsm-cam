import { state } from './state.js';
import { ROUTE_COLORS } from './config.js';

const BASE_KM_PER_SECOND = 40;
const ARRIVAL_PAUSE_MS = 1000;

let map;
let animation;

const panel = document.querySelector('#animation-panel');
const startButton = document.querySelector('#animation-start');
const pauseButton = document.querySelector('#animation-pause');
const resumeButton = document.querySelector('#animation-resume');
const resetButton = document.querySelector('#animation-reset');
const stateLabel = document.querySelector('#animation-state');
const currentLabel = document.querySelector('#animation-current');
const nextLabel = document.querySelector('#animation-next');
const progressLabel = document.querySelector('#animation-progress');
const remainingLabel = document.querySelector('#animation-remaining');

function carIcon(bearing = 0) {
  return L.divIcon({
    className: 'car-icon-wrapper',
    html: `<div class="animated-car-icon" style="--car-bearing: ${bearing}deg" role="img" aria-label="Animated route helicopter"></div>`,
    iconSize: [72, 52], iconAnchor: [36, 26],
  });
}

function toLatLng(coordinate) {
  return [coordinate[1], coordinate[0]];
}

function haversineMeters(a, b) {
  const radians = Math.PI / 180;
  const lat1 = a[0] * radians;
  const lat2 = b[0] * radians;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearing(from, to) {
  const radians = Math.PI / 180;
  const lat1 = from[0] * radians;
  const lat2 = to[0] * radians;
  const deltaLng = (to[1] - from[1]) * radians;
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

function setButtonState() {
  const active = Boolean(animation);
  const running = active && (animation.status === 'running' || animation.status === 'pausing');
  const paused = active && animation.status === 'paused';
  const done = active && animation.status === 'complete';
  startButton.disabled = !active || running || paused || animation.started;
  pauseButton.disabled = !running;
  resumeButton.disabled = !paused;
  resetButton.disabled = !active || (!animation.started && !done);
  stateLabel.textContent = done ? 'Complete' : paused ? 'Paused' : animation?.status === 'pausing' ? 'At stop' : running ? 'Moving' : 'Ready';
}

function updateDetails(progress = 0) {
  if (!animation) return;
  const leg = animation.legs[animation.legIndex];
  const total = animation.totalMeters;
  const travelled = Math.min(total, animation.completedMeters + (leg ? leg.distance_meters * progress : 0));
  const current = leg ? leg.from_name : animation.depotName;
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

function cancelFrame() {
  if (!animation) return;
  if (animation.frame) cancelAnimationFrame(animation.frame);
  if (animation.pauseTimer) clearTimeout(animation.pauseTimer);
  animation.frame = null;
  animation.pauseTimer = null;
}

function finishLeg() {
  const leg = animation.legs[animation.legIndex];
  animation.car.setLatLng(toLatLng(leg.coordinates.at(-1)));
  animation.completedMeters += leg.distance_meters;
  animation.elapsedSeconds = 0;
  animation.legStart = null;
  setCompletedSegment(animation.legIndex);
  setVisited(leg.to_index);
  animation.legIndex += 1;
  updateDetails(0);
  if (animation.legIndex >= animation.legs.length) {
    animation.status = 'complete';
    animation.frame = null;
    setButtonState();
    return;
  }
  animation.status = 'pausing';
  animation.frame = null;
  setButtonState();
  animation.pauseTimer = setTimeout(() => {
    if (animation?.status !== 'pausing') return;
    animation.status = 'running';
    animation.legStart = null;
    setButtonState();
    animation.frame = requestAnimationFrame(step);
  }, ARRIVAL_PAUSE_MS);
}

function step(timestamp) {
  if (!animation || animation.status !== 'running') return;
  const leg = animation.legs[animation.legIndex];
  if (!animation.legStart) animation.legStart = timestamp;
  const elapsed = animation.elapsedSeconds + (timestamp - animation.legStart) / 1000 * animation.speed;
  const travelSeconds = Math.max(1.5, (leg.distance_meters / 1000) / BASE_KM_PER_SECOND);
  const progress = Math.min(1, elapsed / travelSeconds);
  const from = toLatLng(leg.coordinates[0]);
  const to = toLatLng(leg.coordinates.at(-1));
  const position = interpolate(from, to, progress);
  animation.car.setLatLng(position);
  animation.car.getElement()?.querySelector('.animated-car-icon')
    ?.style.setProperty('--car-bearing', `${bearing(from, to)}deg`);
  updateDetails(progress);
  if (progress >= 1) finishLeg();
  else animation.frame = requestAnimationFrame(step);
}

function begin() {
  if (!animation || animation.started) return;
  animation.started = true;
  animation.status = 'running';
  animation.legStart = null;
  animation.elapsedSeconds = 0;
  setButtonState();
  animation.frame = requestAnimationFrame(step);
}

function pause() {
  if (!animation || animation.status !== 'running') return;
  if (animation.legStart) animation.elapsedSeconds += (performance.now() - animation.legStart) / 1000 * animation.speed;
  cancelFrame();
  animation.status = 'paused';
  setButtonState();
}

function resume() {
  if (!animation || animation.status !== 'paused') return;
  animation.status = 'running';
  animation.legStart = null;
  setButtonState();
  animation.frame = requestAnimationFrame(step);
}

export function resetRouteAnimation({ hide = false } = {}) {
  cancelFrame();
  if (animation?.car) animation.car.remove();
  animation = null;
  state.routeMarkers.forEach(marker => marker.getElement()?.classList.remove('is-visited'));
  state.routeLayers.forEach((layer, index) => layer.setStyle({ color: ROUTE_COLORS[index % ROUTE_COLORS.length], weight: 5, opacity: 0.9 }));
  panel.hidden = hide;
  currentLabel.textContent = '—'; nextLabel.textContent = '—'; progressLabel.textContent = '0%'; remainingLabel.textContent = '—';
  setButtonState();
}

export function prepareRouteAnimation(leafletMap, data) {
  resetRouteAnimation();
  map = leafletMap;
  const legs = data.legs.map(leg => ({ ...leg, coordinates: leg.geometry.coordinates }));
  if (!legs.length) return;
  const depot = data.locations[data.order[0]];
  animation = {
    legs, depotName: depot.query, totalMeters: data.distance_meters || legs.reduce((sum, leg) => sum + leg.distance_meters, 0),
    completedMeters: 0, legIndex: 0, status: 'ready', speed: 1, started: false, frame: null, pauseTimer: null, legStart: null, elapsedSeconds: 0,
    car: L.marker([depot.latitude, depot.longitude], { icon: carIcon(), interactive: false, zIndexOffset: 1000 }).addTo(map),
  };
  panel.hidden = false;
  updateDetails();
  setButtonState();
}

export function initializeRouteAnimation() {
  startButton.addEventListener('click', begin);
  pauseButton.addEventListener('click', pause);
  resumeButton.addEventListener('click', resume);
  resetButton.addEventListener('click', () => {
    const data = animation;
    if (!data) return;
    const initial = data.legs[0].coordinates[0];
    cancelFrame();
    data.car.setLatLng(toLatLng(initial));
    data.legIndex = 0; data.completedMeters = 0; data.status = 'ready'; data.started = false; data.legStart = null; data.elapsedSeconds = 0;
    state.routeMarkers.forEach(marker => marker.getElement()?.classList.remove('is-visited'));
    state.routeLayers.forEach((layer, index) => layer.setStyle({ color: ROUTE_COLORS[index % ROUTE_COLORS.length], weight: 5, opacity: 0.9 }));
    updateDetails(); setButtonState();
  });
  document.querySelectorAll('[data-animation-speed]').forEach(button => button.addEventListener('click', () => {
    if (!animation) return;
    if (animation.status === 'running' && animation.legStart) {
      animation.elapsedSeconds += (performance.now() - animation.legStart) / 1000 * animation.speed;
      animation.legStart = performance.now();
    }
    animation.speed = Number(button.dataset.animationSpeed);
    document.querySelectorAll('[data-animation-speed]').forEach(item => item.classList.toggle('is-selected', item === button));
  }));
}
