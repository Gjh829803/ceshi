#!/usr/bin/env node
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

function parseArguments(argv) {
  const result = { items: [], references: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--item" || key === "--reference") {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key === "--item" ? "items" : "references"].push(value);
      index += 1;
    } else if (key?.startsWith("--")) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${key}`);
    }
  }
  return result;
}

function split(value, count, label) {
  const parts = value.split("::");
  if (parts.length < count) throw new Error(`${label} is malformed.`);
  return parts;
}

const args = parseArguments(process.argv.slice(2));
if (!args.output) throw new Error("--output is required.");
if (args.items.length === 0) throw new Error("At least one --item is required.");

const itemsById = new Map();
for (const rawItem of args.items) {
  const [id, promptFile, orientation = "横图"] = split(rawItem, 2, "--item");
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) throw new Error(`Invalid item id: ${id}`);
  if (itemsById.has(id)) throw new Error(`Duplicate item id: ${id}`);
  const prompt = await readFile(resolve(promptFile), "utf8");
  itemsById.set(id, { id, prompt, shortPrompt: prompt.slice(0, 500), orientation, referenceImages: [] });
}

for (const rawReference of args.references) {
  const [itemId, filePath, role = "reference", name = "reference"] = split(rawReference, 2, "--reference");
  const item = itemsById.get(itemId);
  if (!item) throw new Error(`Reference names an unknown item: ${itemId}`);
  item.referenceImages.push({ path: resolve(filePath), role, name });
}

await writeFile(resolve(args.output), `${JSON.stringify({
  width: Number(args.width || 1536),
  height: Number(args.height || 1024),
  maxReferenceImagesPerItem: Number(args.maxReferenceImages || 8),
  items: [...itemsById.values()],
}, null, 2)}\n`, "utf8");
