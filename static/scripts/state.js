export const state = {
  pickedPoints: new Map(),
  placeSearchCache: new Map(),
  placeSearchTimers: new WeakMap(),
  placeSearchControllers: new WeakMap(),
  pickingOnMap: false,
  pickTarget: null,
  routeMarkers: [],
  provinceMarkers: [],
  routeLayers: []
};
