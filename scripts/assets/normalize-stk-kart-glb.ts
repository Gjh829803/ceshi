import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const EMISSIVE_STRENGTH_EXTENSION = "KHR_materials_emissive_strength";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`STK_KART_GLB_ARGUMENT_REQUIRED: ${name}`);
  }
  return path.resolve(value);
}

function paddedJsonBytes(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  const padding = (4 - (bytes.byteLength % 4)) % 4;
  return Buffer.concat([bytes, Buffer.alloc(padding, 0x20)]);
}

function normalizeEmissiveStrength(json: Record<string, unknown>): void {
  const materials = Array.isArray(json.materials)
    ? json.materials as Record<string, unknown>[]
    : [];
  for (const material of materials) {
    if (material.extensions === null || typeof material.extensions !== "object" ||
        Array.isArray(material.extensions)) continue;
    const extensions = material.extensions as Record<string, unknown>;
    const extension = extensions[EMISSIVE_STRENGTH_EXTENSION];
    if (extension === null || typeof extension !== "object" ||
        Array.isArray(extension)) continue;
    const strength = (extension as Record<string, unknown>).emissiveStrength;
    if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0) {
      throw new Error("STK_KART_GLB_EMISSIVE_STRENGTH_INVALID");
    }
    const factor = material.emissiveFactor;
    if (!Array.isArray(factor) || factor.length !== 3 ||
        factor.some((component) => typeof component !== "number" ||
          !Number.isFinite(component))) {
      throw new Error("STK_KART_GLB_EMISSIVE_FACTOR_INVALID");
    }
    material.emissiveFactor = factor.map((component) =>
      Math.max(0, Math.min(1, Number(component) * strength))
    );
    delete extensions[EMISSIVE_STRENGTH_EXTENSION];
    if (Object.keys(extensions).length === 0) delete material.extensions;
  }
  const extensionsUsed = json.extensionsUsed;
  if (Array.isArray(extensionsUsed)) {
    const filteredExtensions = extensionsUsed.filter(
      (extension) => extension !== EMISSIVE_STRENGTH_EXTENSION,
    );
    if (filteredExtensions.length === 0) delete json.extensionsUsed;
    else json.extensionsUsed = filteredExtensions;
  }
  const extensionsRequired = json.extensionsRequired;
  if (Array.isArray(extensionsRequired) &&
      extensionsRequired.includes(EMISSIVE_STRENGTH_EXTENSION)) {
    throw new Error("STK_KART_GLB_REQUIRED_EXTENSION_FORBIDDEN");
  }
}

async function main(): Promise<void> {
  const inputPath = requiredArgument("--input");
  const outputPath = requiredArgument("--output");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC ||
      bytes.readUInt32LE(4) !== GLB_VERSION ||
      bytes.readUInt32LE(8) !== bytes.byteLength ||
      bytes.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error("STK_KART_GLB_ENVELOPE_INVALID");
  }
  const sourceJsonLength = bytes.readUInt32LE(12);
  const sourceJsonEnd = 20 + sourceJsonLength;
  const json = JSON.parse(bytes.toString("utf8", 20, sourceJsonEnd)) as
    Record<string, unknown>;
  normalizeEmissiveStrength(json);
  const jsonBytes = paddedJsonBytes(json);
  const remainingChunks = bytes.subarray(sourceJsonEnd);
  const outputLength = 12 + 8 + jsonBytes.byteLength + remainingChunks.byteLength;
  const output = Buffer.alloc(outputLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(outputLength, 8);
  output.writeUInt32LE(jsonBytes.byteLength, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  jsonBytes.copy(output, 20);
  remainingChunks.copy(output, 20 + jsonBytes.byteLength);
  await writeFile(outputPath, output);
}

await main();
