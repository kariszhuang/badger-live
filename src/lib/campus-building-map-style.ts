export const CAMPUS_BUILDING_FILL_PAINT = {
  "fill-color": "#c5050c",
  "fill-opacity": 1,
} as const;

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
