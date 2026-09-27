"use client";

import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { EventCategory, VenueGroup } from "@/lib/events";
import type { HazardReport } from "@/lib/report/types";
import type { CommunityUpdate } from "@/lib/community/types";
import { CommunityIcon } from "./community/community-icon";
import type { PlannedWalkingRoute } from "./routes/route-planner";
import { findCampusBuildingAt, type CampusBuilding, type CampusBuildings } from "@/lib/campus-buildings";
import { CAMPUS_MAP_BOUNDS } from "@/lib/campus-map-bounds";
import { type CrimeCategory, type CrimeVenueGroup } from "@/lib/crime-model";
import { CAMPUS_BUILDING_FILL_PAINT, campusBuildingLayerInsertionPoints } from "@/lib/campus-building-map-style";
import { CrimeCategoryIcon } from "./category-icons";

type Props = { groups: VenueGroup[]; selectedGroupId: string | null; liveGroupIds: string[]; crimeGroups: CrimeVenueGroup[]; selectedCrimeGroupId: string | null; onSelectCrimeGroup: (id: string) => void; hazards: HazardReport[]; hazardsVisible: boolean; selectedHazardId: string | null; onSelectHazard: (id: string) => void; communityUpdates: CommunityUpdate[]; selectedCommunityId: string | null; onSelectCommunity: (id: string) => void; candidateRoute: PlannedWalkingRoute | null; pickingLocation: boolean; previewPoint: [number, number] | null; onMapPoint: (coordinates: [number, number]) => void; onSelect: (id: string) => void; focus: [number, number] | null; sheetLevel: "closed" | "half" | "full"; userLocation: [number, number] | null; campusSignal: number; mapKey: string; buildings: CampusBuildings | null; selectedBuildingId: string | null; onSelectBuilding: (building: CampusBuilding, coordinates: [number, number]) => void };
const CENTER: [number, number] = [-89.405, 43.075];
const BUILDING_SOURCE = "uw-campus-buildings";
const BUILDING_FILL = "uw-campus-building-fill";
const BUILDING_SHADOW = "uw-campus-building-shadow";
const BUILDING_OUTLINE = "uw-campus-building-outline";
const BUILDING_PARTIAL = "uw-campus-building-partial";
const BUILDING_POINTS = "uw-campus-building-complexes";
const BUILDING_LABELS = "uw-campus-building-labels";
const HAZARD_SOURCE = "community-hazard-reports";
const HAZARD_CIRCLES = "community-hazard-circles";
const HAZARD_LABELS = "community-hazard-labels";
const ROUTE_SOURCE = "candidate-walking-route";
const ROUTE_CASING = "candidate-walking-route-casing";
const ROUTE_LINE = "candidate-walking-route-line";
const ICON_PATHS: Record<EventCategory, string[]> = {
  music: ["M9 18V5l12-2v13", "M9 9l12-2", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  food: ["M3 2v7a4 4 0 0 0 4 4", "M7 2v20", "M11 2v7a4 4 0 0 1-4 4", "M16 2v20", "M20 2v7a4 4 0 0 1-4 4"],
  arts: ["M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3.1 1.7 1.7 0 0 1 1.4-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z", "M7.5 10h.01", "M12 7h.01", "M16.5 10h.01"],
  sports: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m8 4 2 5-4 3", "m16 4-2 5 4 3", "m6 15 5-1 1 6", "m18 15-5-1-1 6"],
  talks: ["M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z", "M4 5.5v16", "M8 7h8", "M8 11h8"],
  outdoors: ["M12 22v-8", "M12 14c-5 0-8-3-8-8 5 0 8 3 8 8Z", "M12 17c0-5 3-8 8-8 0 5-3 8-8 8Z"],
  community: ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M20 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  other: ["M8 2v4", "M16 2v4", "M4 5h16v17H4z", "M4 10h16"],
};
const SVG_NS = "http://www.w3.org/2000/svg";

export function CampusMap({ groups, selectedGroupId, liveGroupIds, crimeGroups, selectedCrimeGroupId, onSelectCrimeGroup, hazards, hazardsVisible, selectedHazardId, onSelectHazard, communityUpdates, selectedCommunityId, onSelectCommunity, candidateRoute, pickingLocation, previewPoint, onMapPoint, onSelect, focus, sheetLevel, userLocation, campusSignal, mapKey, buildings, selectedBuildingId, onSelectBuilding }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const crimeMarkers = useRef<Marker[]>([]);
  const crimeIconRoots = useRef<Root[]>([]);
  const communityMarkers = useRef<Marker[]>([]);
  const communityIconRoots = useRef<Root[]>([]);
  const onSelectCommunityRef = useRef(onSelectCommunity);
  const userMarker = useRef<Marker | null>(null);
  const previewMarker = useRef<Marker | null>(null);
  const fallbackUsed = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onSelectHazardRef = useRef(onSelectHazard);
  const onMapPointRef = useRef(onMapPoint);
  const hazardsRef = useRef(hazards);
  const hazardsVisibleRef = useRef(hazardsVisible);
  const pickingLocationRef = useRef(pickingLocation);
  const onSelectCrimeGroupRef = useRef(onSelectCrimeGroup);
  const onSelectBuildingRef = useRef(onSelectBuilding);
  const buildingsRef = useRef(buildings);
  const selectedBuildingIdRef = useRef(selectedBuildingId);
  const candidateRouteRef = useRef(candidateRoute);
  const previousSelectedBuildingId = useRef<string | null>(null);
  const installBuildingHandlers = useRef<(() => void) | null>(null);
  const buildingHandlersAttached = useRef(false);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onSelectHazardRef.current = onSelectHazard; }, [onSelectHazard]);
  useEffect(() => { onSelectCommunityRef.current = onSelectCommunity; }, [onSelectCommunity]);
  useEffect(() => { onMapPointRef.current = onMapPoint; }, [onMapPoint]);
  useEffect(() => { hazardsRef.current = hazards; }, [hazards]);
  useEffect(() => { hazardsVisibleRef.current = hazardsVisible; }, [hazardsVisible]);
  useEffect(() => { pickingLocationRef.current = pickingLocation; }, [pickingLocation]);
  useEffect(() => { onSelectCrimeGroupRef.current = onSelectCrimeGroup; }, [onSelectCrimeGroup]);
  useEffect(() => { onSelectBuildingRef.current = onSelectBuilding; }, [onSelectBuilding]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);
  useEffect(() => { selectedBuildingIdRef.current = selectedBuildingId; }, [selectedBuildingId]);
  useEffect(() => { candidateRouteRef.current = candidateRoute; }, [candidateRoute]);

  useEffect(() => {
    if (!container.current || map.current) return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const style = mapKey ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapKey)}` : "https://tiles.openfreemap.org/styles/liberty";
    const instance = new maplibregl.Map({ container: container.current, style, center: CENTER, zoom: 14.25, minZoom: 11.5, maxZoom: 17, maxBounds: CAMPUS_MAP_BOUNDS, maxPitch: 0, attributionControl: false, pitchWithRotate: false, dragRotate: false });
    container.current.dataset.buildingsReady = "false";
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
        const coordinate: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        if (pickingLocationRef.current) { onMapPointRef.current(coordinate); return; }
        const target = event.originalEvent.target;
        if (target instanceof Element && target.closest(".maplibregl-marker, .venue-marker-anchor, .crime-map-marker-anchor, .maplibregl-ctrl")) return;
        const hazardFeatures = instance.getLayer(HAZARD_CIRCLES) ? instance.queryRenderedFeatures(event.point, { layers: [HAZARD_CIRCLES] }) : [];
        const hazardId = hazardFeatures[0]?.properties?.id;
        if (typeof hazardId === "string") { onSelectHazardRef.current(hazardId); return; }
        const layers = interactiveLayers();
        const feature = layers.length ? instance.queryRenderedFeatures(event.point, { layers })[0] : undefined;
        const rawId = feature?.properties?.mapObjectId ?? feature?.id;
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
      if (instance.getSource(BUILDING_SOURCE) && instance.getLayer(BUILDING_FILL)) {
        container.current?.setAttribute("data-buildings-ready", "true");
      }
      attachHandlersWhenReady();
    };
      instance.on("style.load", () => {
      container.current?.setAttribute("data-buildings-ready", "false");
      applyCampusPalette(instance);
      if (instance.isStyleLoaded()) syncCampusBuildings();
      else instance.once("idle", syncCampusBuildings);
      if (instance.isStyleLoaded()) addHazardLayer(instance, hazardsRef.current, hazardsVisibleRef.current);
      else instance.once("idle", () => addHazardLayer(instance, hazardsRef.current, hazardsVisibleRef.current));
      if (instance.isStyleLoaded()) syncCandidateRouteLayer(instance, candidateRouteRef.current);
      else instance.once("idle", () => syncCandidateRouteLayer(instance, candidateRouteRef.current));
    });
    instance.on("error", () => {
      if (mapKey && !fallbackUsed.current) {
        fallbackUsed.current = true;
        container.current?.setAttribute("data-buildings-ready", "false");
        console.warn("MapTiler tiles unavailable; switching to an open fallback basemap.");
        instance.setStyle("https://tiles.openfreemap.org/styles/liberty");
      }
    });
    map.current = instance;
    const mountedCrimeRoots = crimeIconRoots.current;
    const mountedCommunityRoots = communityIconRoots.current;
    return () => {
      markers.current.forEach((marker) => marker.remove()); markers.current = [];
      unmountRoots(mountedCrimeRoots);
      crimeMarkers.current.forEach((marker) => marker.remove()); crimeMarkers.current = [];
      unmountRoots(mountedCommunityRoots);
      communityMarkers.current.forEach((marker) => marker.remove()); communityMarkers.current = [];
      userMarker.current?.remove(); userMarker.current = null;
      previewMarker.current?.remove(); previewMarker.current = null;
      installBuildingHandlers.current = null; buildingHandlersAttached.current = false;
      instance.remove(); map.current = null;
    };
    // One map instance survives filtering and date changes.
  }, [mapKey]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const sync = () => {
      if (!instance.isStyleLoaded()) return;
      syncCandidateRouteLayer(instance, candidateRoute);
      if (!candidateRoute) return;
      const bounds = new maplibregl.LngLatBounds();
      candidateRoute.coordinates.forEach((coordinate) => bounds.extend(coordinate));
      instance.fitBounds(bounds, { padding: window.innerWidth < 768 ? { top: 180, right: 72, bottom: 230, left: 42 } : { top: 90, right: 90, bottom: 90, left: 430 }, maxZoom: 16, duration: 500 });
    };
    if (instance.isStyleLoaded()) sync();
    else instance.once("idle", sync);
    return () => { instance.off("idle", sync); };
  }, [candidateRoute]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !buildings) return;
    const syncCampusBuildings = () => {
      if (!instance.isStyleLoaded()) return;
      addCampusBuildings(instance, buildings, selectedBuildingIdRef.current);
      if (instance.getSource(BUILDING_SOURCE) && instance.getLayer(BUILDING_FILL)) {
        container.current?.setAttribute("data-buildings-ready", "true");
      }
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
    const instance = map.current;
    const roots = crimeIconRoots.current;
    unmountRoots(roots);
    crimeMarkers.current.forEach((marker) => marker.remove());
    crimeMarkers.current = [];
    if (!instance) return;
    crimeMarkers.current = crimeGroups.map((group) => {
      const counts = new Map<CrimeCategory, number>();
      group.incidents.forEach((incident) => counts.set(incident.category, (counts.get(incident.category) || 0) + 1));
      const category = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "theft";
      const element = document.createElement("button");
      element.type = "button";
      element.className = "crime-map-marker-anchor";
      element.dataset.crimeGroupId = group.id;
      element.setAttribute("aria-label", `${group.incidents.length} official police blotter ${group.incidents.length === 1 ? "entry" : "entries"} at ${group.name}; select to review`);
      element.title = `${group.incidents.length} UWPD blotter ${group.incidents.length === 1 ? "entry" : "entries"} · ${group.name}`;
      const visual = document.createElement("span");
      visual.className = `crime-map-marker crime-category-${category}`;
      const icon = document.createElement("span");
      icon.className = "crime-map-marker-symbol";
      const iconRoot = createRoot(icon);
      iconRoot.render(<CrimeCategoryIcon category={category} size={17} />);
      roots.push(iconRoot);
      visual.append(icon);
      visual.classList.toggle("has-count", group.incidents.length > 1);
      if (group.incidents.length > 1) {
        const count = document.createElement("span");
        count.className = "crime-map-marker-count";
        count.textContent = String(group.incidents.length);
        visual.append(count);
      }
      element.append(visual);
      element.addEventListener("click", () => onSelectCrimeGroupRef.current(group.id));
      return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(group.coordinates).addTo(instance);
    });
    return () => {
      unmountRoots(roots);
      crimeMarkers.current.forEach((marker) => marker.remove()); crimeMarkers.current = [];
    };
  }, [crimeGroups]);

  useEffect(() => {
    crimeMarkers.current.forEach((marker) => marker.getElement().classList.toggle("is-selected", marker.getElement().dataset.crimeGroupId === selectedCrimeGroupId));
  }, [crimeGroups, selectedCrimeGroupId]);

  useEffect(() => {
    const roots = communityIconRoots.current;
    unmountRoots(roots);
    communityMarkers.current.forEach((marker) => marker.remove());
    communityMarkers.current = [];
    const instance = map.current;
    if (!instance || !hazardsVisible) return;
    communityMarkers.current = communityUpdates.map((update) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `community-map-marker kind-${update.kind}${update.isDemo ? " is-demo" : ""}`;
      element.dataset.communityId = update.id;
      element.setAttribute("aria-label", `${update.isDemo ? "Demo example" : "Unofficial update"}: ${update.title} at ${update.placeName}`);
      element.title = `${update.title} · ${update.placeName}${update.isDemo ? " · Demo example" : " · Unofficial"}`;
      const symbol = document.createElement("span");
      const root = createRoot(symbol);
      root.render(<CommunityIcon kind={update.kind} size={20} />);
      roots.push(root);
      element.append(symbol);
      element.addEventListener("click", (event) => { event.stopPropagation(); onSelectCommunityRef.current(update.id); });
      return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(update.coordinates).addTo(instance);
    });
    return () => {
      unmountRoots(roots);
      communityMarkers.current.forEach((marker) => marker.remove()); communityMarkers.current = [];
    };
  }, [communityUpdates, hazardsVisible]);

  useEffect(() => {
    communityMarkers.current.forEach((marker) => marker.getElement().classList.toggle("is-selected", marker.getElement().dataset.communityId === selectedCommunityId));
  }, [communityUpdates, selectedCommunityId]);

  useEffect(() => {
    markers.current.forEach((marker) => {
      const element = marker.getElement();
      element.classList.toggle("is-selected", element.dataset.groupId === selectedGroupId);
      element.classList.toggle("is-live", liveGroupIds.includes(element.dataset.groupId || ""));
    });
  }, [groups, selectedGroupId, liveGroupIds]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const update = () => addHazardLayer(instance, hazards, hazardsVisible);
    if (instance.isStyleLoaded()) update();
    else instance.once("idle", update);
    return () => { instance.off("idle", update); };
  }, [hazards, hazardsVisible]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.getSource(HAZARD_SOURCE)) return;
    if (selectedHazardId) instance.setFeatureState({ source: HAZARD_SOURCE, id: selectedHazardId }, { selected: true });
    return () => {
      if (selectedHazardId && instance.getSource(HAZARD_SOURCE)) instance.setFeatureState({ source: HAZARD_SOURCE, id: selectedHazardId }, { selected: false });
    };
  }, [selectedHazardId]);

  useEffect(() => {
    if (!map.current) return;
    map.current.getCanvas().style.cursor = pickingLocation ? "crosshair" : "";
    return () => { if (map.current) map.current.getCanvas().style.cursor = ""; };
  }, [pickingLocation]);

  useEffect(() => {
    previewMarker.current?.remove();
    previewMarker.current = null;
    if (!map.current || !previewPoint) return;
    const element = document.createElement("div");
    element.className = "map-point-preview-marker";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "Preview pin for the point you are choosing");
    previewMarker.current = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(previewPoint).addTo(map.current);
    return () => {
      previewMarker.current?.remove();
      previewMarker.current = null;
    };
  }, [previewPoint]);

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

  useEffect(() => {
    const instance = map.current;
    if (!focus || !instance) return;
    const offset: [number, number] = [0, 0];
    if (window.matchMedia("(max-width: 767px)").matches) {
      const bounds = instance.getContainer().getBoundingClientRect();
      const headerBottom = document.querySelector(".discovery-header")?.getBoundingClientRect().bottom ?? bounds.top;
      const sheetTop = sheetLevel === "closed"
        ? bounds.bottom
        : document.querySelector(".mobile-sheet")?.getBoundingClientRect().top ?? bounds.bottom;
      const visibleTop = Math.max(bounds.top, Math.min(bounds.bottom, headerBottom));
      const visibleBottom = Math.max(visibleTop, Math.min(bounds.bottom, sheetTop));
      offset[1] = (visibleTop + visibleBottom) / 2 - (bounds.top + bounds.height / 2);
    }
    instance.flyTo({ center: focus, zoom: Math.max(instance.getZoom(), 15), offset, essential: true });
  }, [focus, sheetLevel]);
  useEffect(() => { if (campusSignal && map.current) map.current.flyTo({ center: CENTER, zoom: 14.25, essential: true }); }, [campusSignal]);
  return <div ref={container} className="map-canvas" role="application" aria-label="Interactive map of UW–Madison campus" />;
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

  const { footprintsBeforeId, labelsBeforeId } = campusBuildingLayerInsertionPoints(instance.getStyle().layers);
  if (!instance.getLayer(BUILDING_FILL)) {
    instance.addLayer({
      id: BUILDING_FILL,
      type: "fill",
      source: BUILDING_SOURCE,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      layout: { visibility: "visible" },
      paint: CAMPUS_BUILDING_FILL_PAINT,
    }, footprintsBeforeId);
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
    }, footprintsBeforeId);
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
    }, footprintsBeforeId);
    instance.addLayer({
      id: BUILDING_PARTIAL,
      type: "line",
      source: BUILDING_SOURCE,
      filter: ["==", ["get", "footprintStatus"], "partial"],
      paint: { "line-color": "#a47a3e", "line-width": 1.7, "line-dasharray": [2, 1.5], "line-opacity": 0.9 },
    }, footprintsBeforeId);
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
    }, footprintsBeforeId);
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
    }, labelsBeforeId);
  }
  if (selectedBuildingId) instance.setFeatureState({ source: BUILDING_SOURCE, id: selectedBuildingId }, { selected: true });
}

function addHazardLayer(instance: MapLibreMap, hazards: HazardReport[], visible: boolean) {
  if (!instance.isStyleLoaded()) return;
  const source = instance.getSource(HAZARD_SOURCE) as GeoJSONSource | undefined;
  const features = hazards.map((report) => ({
    type: "Feature" as const,
    id: report.id,
    properties: { id: report.id, kind: report.kind, lifecycle: report.lifecycle, observation_count: report.observationCount, version: report.version },
    geometry: { type: "Point" as const, coordinates: report.coordinates },
  }));
  const collection: FeatureCollection = { type: "FeatureCollection", features };
  if (source) source.setData(collection);
  else instance.addSource(HAZARD_SOURCE, { type: "geojson", data: collection, promoteId: "id" });

  if (!instance.getLayer(HAZARD_CIRCLES)) instance.addLayer({
    id: HAZARD_CIRCLES,
    type: "circle",
    source: HAZARD_SOURCE,
    layout: { visibility: visible ? "visible" : "none" },
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 19, 15],
      "circle-color": ["match", ["get", "kind"],
        "ice", "#367ba6", "snow", "#6684a0", "flooding", "#318b91", "blocked_path", "#b36c27",
        "broken_light", "#9a7630", "accessibility_barrier", "#7c60a4", "construction_obstruction", "#8c6346",
        "fallen_branch", "#568052", "#9a554b"],
      "circle-opacity": ["match", ["get", "lifecycle"], "stale", 0.72, "possibly_cleared", 0.52, 0.96],
      "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#c5050c", "#fffdf7"],
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 4, 2.5],
      "circle-blur": 0.06,
    },
  });
  if (!instance.getLayer(HAZARD_LABELS)) instance.addLayer({
    id: HAZARD_LABELS,
    type: "symbol",
    source: HAZARD_SOURCE,
    minzoom: 13,
    layout: {
      visibility: visible ? "visible" : "none",
      "text-field": ["match", ["get", "kind"], "ice", "I", "snow", "S", "flooding", "W", "blocked_path", "P", "broken_light", "L", "accessibility_barrier", "A", "construction_obstruction", "C", "fallen_branch", "B", "•"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#fff", "text-halo-color": "#29352f", "text-halo-width": 0.35 },
  });
  instance.setLayoutProperty(HAZARD_CIRCLES, "visibility", visible ? "visible" : "none");
  instance.setLayoutProperty(HAZARD_LABELS, "visibility", visible ? "visible" : "none");
}

function syncCandidateRouteLayer(instance: MapLibreMap, route: PlannedWalkingRoute | null) {
  if (!instance.isStyleLoaded()) return;
  const source = instance.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!route || route.coordinates.length < 2) {
    source?.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: route.coordinates },
    }],
  };
  if (source) source.setData(collection);
  else instance.addSource(ROUTE_SOURCE, { type: "geojson", data: collection });

  const beforeId = instance.getLayer(HAZARD_CIRCLES) ? HAZARD_CIRCLES : undefined;
  if (!instance.getLayer(ROUTE_CASING)) instance.addLayer({
    id: ROUTE_CASING,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#fffdf7", "line-width": 9, "line-opacity": 0.94 },
  }, beforeId);
  if (!instance.getLayer(ROUTE_LINE)) instance.addLayer({
    id: ROUTE_LINE,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#2c748d", "line-width": 5, "line-opacity": 0.96 },
  }, beforeId);
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

function unmountRoots(roots: Root[]) {
  for (const root of roots) root.unmount();
  roots.length = 0;
}

function applyCampusPalette(instance: MapLibreMap) {
  if (!instance.isStyleLoaded()) return;
  for (const layer of instance.getStyle().layers) {
    if (layer.id.startsWith("uw-campus-building-")) continue;
    const name = layer.id.toLowerCase();
    if (layer.type === "fill-extrusion" && name.includes("building")) {
      instance.setLayoutProperty(layer.id, "visibility", "none");
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
}
