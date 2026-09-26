"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { EventCategory, VenueGroup } from "@/lib/events";

type Props = { groups: VenueGroup[]; selectedGroupId: string | null; liveGroupIds: string[]; angled: boolean; onSelect: (id: string) => void; focus: [number, number] | null; userLocation: [number, number] | null; fitSignal: number; campusSignal: number; mapKey: string };
const CENTER: [number, number] = [-89.405, 43.075];
const CAMPUS_BOUNDS: [[number, number], [number, number]] = [[-89.455, 43.045], [-89.375, 43.095]];
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

export function CampusMap({ groups, selectedGroupId, liveGroupIds, angled, onSelect, focus, userLocation, fitSignal, campusSignal, mapKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const landmarkMarkers = useRef<Marker[]>([]);
  const userMarker = useRef<Marker | null>(null);
  const fallbackUsed = useRef(false);
  const onSelectRef = useRef(onSelect);
  const angledRef = useRef(angled);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { angledRef.current = angled; }, [angled]);

  useEffect(() => {
    if (!container.current || map.current) return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const style = mapKey ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapKey)}` : "https://tiles.openfreemap.org/styles/liberty";
    const instance = new maplibregl.Map({ container: container.current, style, center: CENTER, zoom: 13.5, minZoom: 11.5, maxZoom: 17, maxBounds: CAMPUS_BOUNDS, maxPitch: 60, attributionControl: false, pitchWithRotate: false, dragRotate: false });
    instance.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    instance.on("style.load", () => applyCampusPalette(instance, angledRef.current));
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
    return () => { markers.current.forEach((marker) => marker.remove()); markers.current = []; landmarkMarkers.current.forEach((marker) => marker.remove()); landmarkMarkers.current = []; userMarker.current?.remove(); userMarker.current = null; instance.remove(); map.current = null; };
    // One map instance survives filtering and date changes.
  }, [mapKey]);

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
  useEffect(() => { if (campusSignal && map.current) map.current.flyTo({ center: CENTER, zoom: 13.5, essential: true }); }, [campusSignal]);
  return <div ref={container} className="map-canvas" role="application" aria-label="Interactive map of UW–Madison event venues" />;
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
