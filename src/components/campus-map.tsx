"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { VenueGroup } from "@/lib/events";

type Props = { groups: VenueGroup[]; selectedGroupId: string | null; onSelect: (id: string) => void; focus: [number, number] | null; userLocation: [number, number] | null; fitSignal: number; campusSignal: number; mapKey: string };
const CENTER: [number, number] = [-89.405, 43.075];

export function CampusMap({ groups, selectedGroupId, onSelect, focus, userLocation, fitSignal, campusSignal, mapKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const userMarker = useRef<Marker | null>(null);
  const fallbackUsed = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!container.current || map.current) return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const style = mapKey ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapKey)}` : "https://tiles.openfreemap.org/styles/liberty";
    const instance = new maplibregl.Map({ container: container.current, style, center: CENTER, zoom: 13.5, minZoom: 9, maxZoom: 19, attributionControl: false, pitchWithRotate: false, dragRotate: false });
    instance.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    instance.on("error", () => {
      if (mapKey && !fallbackUsed.current) {
        fallbackUsed.current = true;
        console.warn("MapTiler tiles unavailable; switching to an open fallback basemap.");
        instance.setStyle("https://tiles.openfreemap.org/styles/liberty");
      }
    });
    map.current = instance;
    return () => { markers.current.forEach((marker) => marker.remove()); markers.current = []; userMarker.current?.remove(); userMarker.current = null; instance.remove(); map.current = null; };
    // One map instance survives filtering and date changes.
  }, [mapKey]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = groups.map((group) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "venue-marker";
      element.dataset.groupId = group.id;
      element.setAttribute("aria-label", `${group.events.length} event${group.events.length === 1 ? "" : "s"} at ${group.name}`);
      const glyph = group.events.length > 1 ? String(group.events.length) : markerGlyph(group.events[0].category);
      element.textContent = glyph;
      element.addEventListener("click", () => onSelectRef.current(group.id));
      return new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(group.coordinates).addTo(map.current!);
    });
  }, [groups]);

  useEffect(() => {
    markers.current.forEach((marker) => marker.getElement().classList.toggle("is-selected", marker.getElement().dataset.groupId === selectedGroupId));
  }, [groups, selectedGroupId]);

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
    if (!fitSignal || !map.current || groups.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    groups.forEach((group) => bounds.extend(group.coordinates));
    map.current.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 650 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);
  useEffect(() => { if (campusSignal && map.current) map.current.flyTo({ center: CENTER, zoom: 13.5, essential: true }); }, [campusSignal]);
  return <div ref={container} className="map-canvas" role="application" aria-label="Interactive map of UW–Madison event venues" />;
}

function markerGlyph(category: string): string {
  return ({ music: "♫", arts: "✦", sports: "●", talks: "◈", outdoors: "✿", community: "♡", other: "•" } as Record<string, string>)[category] || "•";
}
