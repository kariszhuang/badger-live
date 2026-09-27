import type { LayerSpecification } from "maplibre-gl";

type CampusBuildingFillLayer = Extract<LayerSpecification, { type: "fill" }>;

export const CAMPUS_BUILDING_FILL_PAINT: NonNullable<CampusBuildingFillLayer["paint"]> = {
  "fill-color": [
    "case",
    ["boolean", ["feature-state", "selected"], false], "#c5050c",
    ["boolean", ["feature-state", "hover"], false], "#c94d48",
    "#d65f56",
  ],
  "fill-opacity": [
    "case",
    ["boolean", ["feature-state", "selected"], false], 0.86,
    ["boolean", ["feature-state", "hover"], false], 0.82,
    0.76,
  ],
};

export type MapStyleLayer = { id: string; type: string };

export type CampusBuildingLayerInsertionPoints = {
  footprintsBeforeId?: string;
  labelsBeforeId?: string;
};

export function campusBuildingLayerInsertionPoints(
  layers: readonly MapStyleLayer[],
): CampusBuildingLayerInsertionPoints {
  const baseBuildingFillIndex = layers.findIndex((layer) =>
    layer.type === "fill"
    && /(?:^|[-_])building(?:$|[-_])/i.test(layer.id)
    && !layer.id.startsWith("uw-campus-building-"));

  if (baseBuildingFillIndex === -1) {
    const firstSymbol = layers.find((layer) => layer.type === "symbol")?.id;
    return { footprintsBeforeId: firstSymbol, labelsBeforeId: firstSymbol };
  }

  const layersAboveBuildingFill = layers.slice(baseBuildingFillIndex + 1);
  const firstLabel = layersAboveBuildingFill.find((layer) => layer.type === "symbol")?.id;
  return {
    footprintsBeforeId: firstLabel ?? layersAboveBuildingFill[0]?.id,
    labelsBeforeId: firstLabel,
  };
}
