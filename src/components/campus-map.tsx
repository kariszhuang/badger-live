"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { EventCategory, VenueGroup } from "@/lib/events";
import { findCampusBuildingAt, type CampusBuilding, type CampusBuildings } from "@/lib/campus-buildings";

type Props = { groups: VenueGroup[]; selectedGroupId: string | null; liveGroupIds: string[]; angled: boolean; onSelect: (id: string) => void; focus: [number, number] | null; userLocation: [number, number] | null; fitSignal: number; campusSignal: number; mapKey: string; buildings: CampusBuildings | null; selectedBuildingId: string | null; onSelectBuilding: (building: CampusBuilding, coordinates: [number, number]) => void };
const CENTER: [number, number] = [-89.405, 43.075];
const CAMPUS_BOUNDS: [[number, number], [number, number]] = [[-89.455, 43.045], [-89.375, 43.095]];
const BUILDING_SOURCE = "uw-campus-buildings";
const BUILDING_FILL = "uw-campus-building-fill";
const BUILDING_SHADOW = "uw-campus-building-shadow";
const BUILDING_OUTLINE = "uw-campus-building-outline";
const BUILDING_PARTIAL = "uw-campus-building-partial";
const BUILDING_POINTS = "uw-campus-building-complexes";
const BUILDING_LABELS = "uw-campus-building-labels";
const ICON_PATHS: Record<EventCategory, string[]> = {
  music: ["M9 18V5l12-2v13", "M9 9l12-2", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  food: ["M3 2v7a4 4 0 0 0 4 4", "M7 2v20", "M11 2v7a4 4 0 0 1-4 4", "M16 2v20", "M20 2v7a4 4 0 0 1-4 4"],
  arts: ["M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3.1 1.7 1.7 0 0 1 1.4-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z", "M7.5 10h.01", "M12 7h.01", "M16.5 10h.01"],
  sports: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m8 4 2 5-4 3", "m16 4-2 5 4 3", "m6 15 5-1 1 6", "m18 15-5-1-1 6"],
  talks: ["M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z", "M4 5.5v16", "M8 7h8", "M8 11h8"],
  outdoors: ["M12 22v-8", "M12 14c-5 0-8-3-8-8 5 0 8 3 8 8Z", "M12 17c0-5 3-8 8-8 0 5-3 8-8 8Z"],
  community: ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M20 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  other: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 8v4", "M12 16h.01"],
};
const LANDMARKS = [
  { name: "Memorial Union", coordinates: [-89.3999144494, 43.0764210063] as [number, number], symbol: "⌂", className: "union" },
  { name: "Bascom Hill", coordinates: [-89.4048, 43.0754] as [number, number], symbol: "▲", className: "bascom" },
  { name: "Camp Randall", coordinates: [-89.41261, 43.07005] as [number, number], symbol: "▤", className: "stadium" },
  { name: "Wisconsin State Capitol", coordinates: [-89.3842, 43.0747] as [number, number], symbol: "⌂", className: "capitol" },
];
const SVG_NS = "http://www.w3.org/2000/svg";

export function CampusMap({ groups, selectedGroupId, liveGroupIds, angled, onSelect, focus, userLocation, fitSignal, campusSignal, mapKey, buildings, selectedBuildingId, onSelectBuilding }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const landmarkMarkers = useRef<Marker[]>([]);
  const userMarker = useRef<Marker | null>(null);
  const fallbackUsed = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onSelectBuildingRef = useRef(onSelectBuilding);
  const buildingsRef = useRef(buildings);
  const selectedBuildingIdRef = useRef(selectedBuildingId);
  const previousSelectedBuildingId = useRef<string | null>(null);
  const installBuildingHandlers = useRef<(() => void) | null>(null);
  const buildingHandlersAttached = useRef(false);
  const angledRef = useRef(angled);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onSelectBuildingRef.current = onSelectBuilding; }, [onSelectBuilding]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);
  useEffect(() => { selectedBuildingIdRef.current = selectedBuildingId; }, [selectedBuildingId]);
  useEffect(() => { angledRef.current = angled; }, [angled]);

  useEffect(() => {
    if (!container.current || map.current) return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const style = mapKey ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapKey)}` : "https://tiles.openfreemap.org/styles/liberty";
    const instance = new maplibregl.Map({ container: container.current, style, center: CENTER, zoom: 14.25, minZoom: 11.5, maxZoom: 17, maxBounds: CAMPUS_BOUNDS, maxPitch: 60, attributionControl: false, pitchWithRotate: false, dragRotate: false });
    instance.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    const attachHandlersWhenReady = () => {
      if (buildingHandlersAttached.current) return;
      let hoveredBuildingId: string | null = null;
      const clearHover = () => {
        if (hoveredBuildingId !== null && instance.getSource(BUILDING_SOURCE)) instance.setFeatureState({ source: BUILDING_SOURCE, id: hoveredBuildingId }, { hover: false });
        hoveredBuildingId = null;
        instance.getCanvas().style.cursor = "";
      };
      const interactiveLayers = () => [BUILDING_FILL, BUILDING_POINTS].filter((layerId) => instance.getLayer(layerId));
      const onBuildingMove = (event: maplibregl.MapMouseEvent) => {
        const layers = interactiveLayers();
        const feature = layers.length ? instance.queryRenderedFeatures(event.point, { layers })[0] : undefined;
        const rawId = feature?.properties?.mapObjectId ?? feature?.id;
        const building = (rawId === undefined || rawId === null ? undefined : buildingsRef.current?.features.find(({ properties }) => properties.mapObjectId === String(rawId)))
          ?? findCampusBuildingAt(buildingsRef.current, [event.lngLat.lng, event.lngLat.lat]);
        if (!building) { clearHover(); return; }
        const id = building.properties.mapObjectId;
        if (hoveredBuildingId !== id) {
          clearHover();
          hoveredBuildingId = id;
          if (instance.getSource(BUILDING_SOURCE)) instance.setFeatureState({ source: BUILDING_SOURCE, id }, { hover: true });
        }
        instance.getCanvas().style.cursor = "pointer";
      };
      const onBuildingClick = (event: maplibregl.MapMouseEvent) => {
        const target = event.originalEvent.target;
        if (target instanceof Element && target.closest(".maplibregl-marker, .venue-marker-anchor, .landmark-marker, .maplibregl-ctrl")) return;
        const layers = interactiveLayers();
        const feature = layers.length ? instance.queryRenderedFeatures(event.point, { layers })[0] : undefined;
        const rawId = feature?.properties?.mapObjectId ?? feature?.id;
        const coordinate: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        const buildingFeature = (rawId === undefined || rawId === null ? undefined : buildingsRef.current?.features.find(({ properties }) => properties.mapObjectId === String(rawId)))
          ?? findCampusBuildingAt(buildingsRef.current, coordinate);
        if (!buildingFeature) return;
        onSelectBuildingRef.current(buildingFeature.properties, coordinate);
      };
      instance.on("mousemove", onBuildingMove);
      instance.on("click", onBuildingClick);
      instance.getCanvasContainer().addEventListener("mouseleave", clearHover);
      buildingHandlersAttached.current = true;
    };
    installBuildingHandlers.current = attachHandlersWhenReady;
    attachHandlersWhenReady();
    const syncCampusBuildings = () => {
      if (!buildingsRef.current || !instance.isStyleLoaded()) return;
      addCampusBuildings(instance, buildingsRef.current, selectedBuildingIdRef.current);
      attachHandlersWhenReady();
    };
    instance.on("style.load", () => {
      applyCampusPalette(instance, angledRef.current);
      if (instance.isStyleLoaded()) syncCampusBuildings();
      else instance.once("idle", syncCampusBuildings);
    });
    instance.on("error", () => {
      if (mapKey && !fallbackUsed.current) {
        fallbackUsed.current = true;
        console.warn("MapTiler tiles unavailable; switching to an open fallback basemap.");
        instance.setStyle("https://tiles.openfreemap.org/styles/liberty");
      }
    });
    map.current = instance;
    landmarkMarkers.current = LANDMARKS.map((landmark) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `landmark-marker landmark-${landmark.className}`;
      element.setAttribute("aria-label", `Show ${landmark.name} on the map`);
      const content = document.createElement("span");
      content.className = "landmark-content";
      const symbol = document.createElement("span");
      symbol.className = "landmark-symbol";
      symbol.textContent = landmark.symbol;
      const label = document.createElement("span");
      label.className = "landmark-name";
      label.textContent = landmark.name;
      content.append(symbol, label);
      element.append(content);
      element.addEventListener("click", () => instance.flyTo({ center: landmark.coordinates, zoom: Math.max(instance.getZoom(), 15.5), essential: true }));
      return new maplibregl.Marker({ element, anchor: "left", offset: [9, -2] }).setLngLat(landmark.coordinates).addTo(instance);
    });
    return () => { markers.current.forEach((marker) => marker.remove()); markers.current = []; landmarkMarkers.current.forEach((marker) => marker.remove()); landmarkMarkers.current = []; userMarker.current?.remove(); userMarker.current = null; installBuildingHandlers.current = null; buildingHandlersAttached.current = false; instance.remove(); map.current = null; };
    // One map instance survives filtering and date changes.
  }, [mapKey]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !buildings) return;
    const syncCampusBuildings = () => {
      if (!instance.isStyleLoaded()) return;
      addCampusBuildings(instance, buildings, selectedBuildingIdRef.current);
      installBuildingHandlers.current?.();
    };
    if (instance.isStyleLoaded()) syncCampusBuildings();
    else instance.once("idle", syncCampusBuildings);
    return () => { instance.off("idle", syncCampusBuildings); };
  }, [buildings]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded() || !instance.getSource(BUILDING_SOURCE)) return;
    if (previousSelectedBuildingId.current && previousSelectedBuildingId.current !== selectedBuildingId) {
      instance.setFeatureState({ source: BUILDING_SOURCE, id: previousSelectedBuildingId.current }, { selected: false });
    }
    if (selectedBuildingId) instance.setFeatureState({ source: BUILDING_SOURCE, id: selectedBuildingId }, { selected: true });
    previousSelectedBuildingId.current = selectedBuildingId;
    // The map style may have reset feature state while replacing its basemap.
  }, [selectedBuildingId, buildings]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = groups.map((group) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "venue-marker-anchor";
      const counts = new Map<EventCategory, number>();
      group.events.forEach((event) => counts.set(event.category, (counts.get(event.category) || 0) + 1));
      const category = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "other";
      const visual = document.createElement("span");
      visual.className = `venue-marker category-${category}`;
      element.dataset.groupId = group.id;
      element.dataset.longitude = String(group.coordinates[0]);
      element.dataset.latitude = String(group.coordinates[1]);
      element.setAttribute("aria-label", `${group.events.length} event${group.events.length === 1 ? "" : "s"} at ${group.name}`);
      element.title = `${group.events.length} UW event${group.events.length === 1 ? "" : "s"} at ${group.name}`;
      visual.append(createEventIcon(category));
      if (group.events.length > 1) {
        const count = document.createElement("span");
        count.className = "venue-marker-count";
        count.textContent = String(group.events.length);
        visual.append(count);
      }
      element.append(visual);
      element.addEventListener("click", () => onSelectRef.current(group.id));
      return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(group.coordinates).addTo(map.current!);
    });
  }, [groups]);

  useEffect(() => {
    markers.current.forEach((marker) => {
      const element = marker.getElement();
      element.classList.toggle("is-selected", element.dataset.groupId === selectedGroupId);
      element.classList.toggle("is-live", liveGroupIds.includes(element.dataset.groupId || ""));
    });
  }, [groups, selectedGroupId, liveGroupIds]);

  useEffect(() => {
    userMarker.current?.remove();
    userMarker.current = null;
    if (!map.current || !userLocation) return;
    const element = document.createElement("div");
    element.className = "user-location-marker";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "Your current location");
    userMarker.current = new maplibregl.Marker({ element }).setLngLat(userLocation).addTo(map.current);
  }, [userLocation]);

  useEffect(() => { if (focus && map.current) map.current.flyTo({ center: focus, zoom: Math.max(map.current.getZoom(), 15), essential: true }); }, [focus]);
  useEffect(() => {
    if (!map.current) return;
    const instance = map.current;
    applyCampusPalette(instance, angled);
    if (angled) instance.flyTo({ center: instance.getCenter(), zoom: Math.max(instance.getZoom(), 15.5), pitch: 48, bearing: -15, duration: 650 });
    else instance.easeTo({ pitch: 0, bearing: 0, duration: 550 });
  }, [angled]);
  useEffect(() => {
    if (!fitSignal || !map.current || groups.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    groups.forEach((group) => bounds.extend(group.coordinates));
    map.current.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 650 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);
  useEffect(() => { if (campusSignal && map.current) map.current.flyTo({ center: CENTER, zoom: 14.25, essential: true }); }, [campusSignal]);
  return <div ref={container} className="map-canvas" role="application" aria-label="Interactive map of UW–Madison event venues" />;
}

function addCampusBuildings(instance: MapLibreMap, collection: CampusBuildings | null, selectedBuildingId: string | null) {
  if (!collection || !instance.isStyleLoaded()) return;
  const existingSource = instance.getSource(BUILDING_SOURCE) as GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(collection as unknown as FeatureCollection);
  } else {
    instance.addSource(BUILDING_SOURCE, {
      type: "geojson",
      data: collection as unknown as FeatureCollection,
      promoteId: "mapObjectId",
    });
  }

  const firstSymbol = instance.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  const beforeId = firstSymbol;
  if (!instance.getLayer(BUILDING_FILL)) {
    instance.addLayer({
      id: BUILDING_FILL,
      type: "fill",
      source: BUILDING_SOURCE,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      layout: { visibility: "visible" },
      paint: {
        "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "#c5050c", ["boolean", ["feature-state", "hover"], false], "#c94d48", "#d65f56"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.86, ["boolean", ["feature-state", "hover"], false], 0.82, 0.76],
      },
    }, beforeId);
    instance.addLayer({
      id: BUILDING_SHADOW,
      type: "line",
      source: BUILDING_SOURCE,
      filter: ["all", ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]], ["!=", ["get", "footprintStatus"], "partial"]],
      paint: {
        "line-color": "#513231",
        "line-width": 2.5,
        "line-opacity": 0.13,
        "line-translate": [0, 1.5],
        "line-translate-anchor": "viewport",
      },
    }, beforeId);
    instance.addLayer({
      id: BUILDING_OUTLINE,
      type: "line",
      source: BUILDING_SOURCE,
      filter: ["all", ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]], ["!=", ["get", "footprintStatus"], "partial"]],
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#79080c", ["boolean", ["feature-state", "hover"], false], "#a12f31", "#7f3032"],
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.2, ["boolean", ["feature-state", "hover"], false], 2.4, 2],
        "line-opacity": 0.92,
      },
    }, beforeId);
    instance.addLayer({
      id: BUILDING_PARTIAL,
      type: "line",
      source: BUILDING_SOURCE,
      filter: ["==", ["get", "footprintStatus"], "partial"],
      paint: { "line-color": "#a47a3e", "line-width": 1.7, "line-dasharray": [2, 1.5], "line-opacity": 0.9 },
    }, beforeId);
    instance.addLayer({
      id: BUILDING_POINTS,
      type: "circle",
      source: BUILDING_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 9, 6],
        "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#c5050c", "#aa4d48"],
        "circle-stroke-color": "#fffdf8",
        "circle-stroke-width": 2.5,
      },
    }, beforeId);
    instance.addLayer({
      id: BUILDING_LABELS,
      type: "symbol",
      source: BUILDING_SOURCE,
      minzoom: 15,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 17, 12],
        "text-anchor": "center",
        "text-max-width": 11,
        "text-optional": true,
      },
      paint: { "text-color": "#703735", "text-halo-color": "#fffaf2", "text-halo-width": 1.6, "text-opacity": 0.94 },
    });
  }
  if (selectedBuildingId) instance.setFeatureState({ source: BUILDING_SOURCE, id: selectedBuildingId }, { selected: true });
}

function createEventIcon(category: EventCategory): SVGSVGElement {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  for (const pathData of ICON_PATHS[category]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  }
  return icon;
}

function applyCampusPalette(instance: MapLibreMap, angled: boolean) {
  if (!instance.isStyleLoaded()) return;
  for (const layer of instance.getStyle().layers) {
    if (layer.id.startsWith("uw-campus-building-")) continue;
    const name = layer.id.toLowerCase();
    if (layer.type === "fill-extrusion" && name.includes("building")) {
      instance.setPaintProperty(layer.id, "fill-extrusion-color", "#e9decd");
      instance.setPaintProperty(layer.id, "fill-extrusion-opacity", 0.86);
      instance.setPaintProperty(layer.id, "fill-extrusion-vertical-gradient", true);
      instance.setLayoutProperty(layer.id, "visibility", angled ? "visible" : "none");
    } else if (layer.type === "fill" && name.includes("building")) {
      instance.setPaintProperty(layer.id, "fill-color", "#e8dfd2");
      instance.setPaintProperty(layer.id, "fill-opacity", 0.5);
      instance.setPaintProperty(layer.id, "fill-outline-color", "#d6cabb");
    } else if (layer.type === "fill" && /water|lake|river/.test(name)) {
      instance.setPaintProperty(layer.id, "fill-color", name.includes("intermittent") ? "#d7e6ec" : "#b8d7e5");
    } else if (layer.type === "fill" && /wood|forest|grass|vegetation|park|landcover/.test(name)) {
      instance.setPaintProperty(layer.id, "fill-color", /forest|wood|vegetation/.test(name) ? "#c7d9c0" : "#cfe2c5");
    }
  }
  instance.setLight({ anchor: "viewport", color: "#fff8eb", intensity: 0.6, position: [1.15, 210, 35] });
}
