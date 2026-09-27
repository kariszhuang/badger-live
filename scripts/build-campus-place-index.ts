import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseCampusBuildings } from "../src/lib/campus-buildings";

const sourcePath = resolve("public/data/uw-campus-buildings.geojson");
const outputPath = resolve("src/data/campus-place-index.json");
const raw = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
const buildings = parseCampusBuildings(raw);
const places = buildings.features.map(({ properties }) => ({
  mapObjectId: properties.mapObjectId,
  name: properties.name,
  buildingNumber: properties.buildingNumber || null,
  streetAddress: properties.streetAddress || null,
  shortDescription: properties.shortDescription,
  center: properties.center,
  officialMapUrl: properties.officialMapUrl,
}));
if (places.length < 200) throw new Error("The campus place index is unexpectedly small; refusing to replace it.");
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(places)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Saved ${places.length} compact campus place search records.`);
