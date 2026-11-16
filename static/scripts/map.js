import * as maplibregl from '/static/vendor/maplibre/maplibre-gl.mjs';
import { CAMBODIA_VIEW, MAP_STYLE, MAP_WORKER } from './config.js';

const pmtilesProtocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
maplibregl.setWorkerUrl(MAP_WORKER);

export function initializeMap() {
  const map = new maplibregl.Map({
    container: 'map', style: MAP_STYLE, center: [104.991, 12.5657], zoom: 5,
    // Keep zoom-out available while keeping Cambodia as the map's main area.
    minZoom: 2, maxZoom: 10,
    maxBounds: [[101.0, 9.0], [109.0, 16.0]],
    dragPan: true, scrollZoom: true, doubleClickZoom: true, attributionControl: false
  });
  map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
  map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');

  function fitCambodiaView() {
    map.resize();
    map.fitBounds(CAMBODIA_VIEW, {
      padding: {top: 40, bottom: 40, left: 40, right: 40}, maxZoom: 5, duration: 0
    });
  }
  map.once('load', () => {
    fitCambodiaView();
    requestAnimationFrame(fitCambodiaView);
    setTimeout(fitCambodiaView, 250);
  });
  return map;
}
