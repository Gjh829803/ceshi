import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { encode as encodePng } from 'fast-png';
import { ClampToEdgeWrapping, DataTexture, LinearFilter, Mesh, MeshStandardMaterial, NearestFilter, NoColorSpace, SRGBColorSpace } from 'three';
import contentCatalog from '../../../asset-library/dist/whitebox/asset-catalog.json';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
import { loadAsset, cloneAsset } from './assets';
import type { AssetDefinition, AssetInstance } from './engine-contracts';

const instances: AssetInstance[] = [];
afterEach(() => { for (const instance of instances.splice(0)) instance.dispose(); });
function material(instance: AssetInstance): MeshStandardMaterial {
  let result: MeshStandardMaterial | undefined;
  instance.object.traverse(node => { if (node instanceof Mesh) result = node.material as MeshStandardMaterial; });
  return result!;
}
function glb(image: Uint8Array, mimeType: string, dataUri = false) {
  const position = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const imageBytes = Buffer.from(image);
  const binary = Buffer.concat([position, ...(dataUri ? [] : [imageBytes, Buffer.alloc((4 - imageBytes.length % 4) % 4)])]);
  const document = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: position.length }, ...(dataUri ? [] : [{ buffer: 0, byteOffset: position.length, byteLength: imageBytes.length }])],
    images: [dataUri ? { uri: `data:${mimeType};base64,${imageBytes.toString('base64')}` } : { bufferView: 1, mimeType }],
    samplers: [{ magFilter: 9728, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
    textures: [{ source: 0, sampler: 0 }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  [0x46546c67, 2, 28 + padded.length + binary.length, padded.length, 0x4e4f534a].forEach((n, i) => header.writeUInt32LE(n, i * 4));
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([header, padded, binHeader, binary]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const definition: AssetDefinition = { id: 'textured-' + hash, displayName: 'Embedded texture fixture', limitations: [], uri: 'memory:' + hash, sha256: hash, byteLength: bytes.length,
    rootTransform: { positionMetersXYZ: [0, 0, 0], rotationEulerRadiansXYZ: [0, 0, 0], scaleXYZ: [1, 1, 1] }, actions: {} };
  return { bytes, definition };
}

it.each([false, true])('decodes actual embedded PNG pixels without DOM globals (data URI=%s)', async dataUri => {
  expect(typeof self).toBe('undefined');
  const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 64]);
  const png = await sharp(pixels, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
  const { bytes, definition } = glb(png, 'image/png', dataUri);
  const asset = await loadAsset(definition, { loadTextures: true, fetchBytes: async () => bytes }); instances.push(asset);
  const texture = material(asset).map as DataTexture;
  expect(texture.isDataTexture).toBe(true); expect(texture.image.width).toBe(2);
  expect(Array.from(texture.image.data!)).toEqual([...pixels]);
  expect(texture.flipY).toBe(false); expect(texture.colorSpace).toBe(SRGBColorSpace);
  expect(texture.magFilter).toBe(NearestFilter); expect(texture.minFilter).toBe(LinearFilter);
  expect(texture.wrapS).toBe(ClampToEdgeWrapping); expect(texture.generateMipmaps).toBe(false);
  expect(typeof self).toBe('undefined');
});

it('decodes JPEG pixels and keeps leased textures alive until the last clone releases them', async () => {
  const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 70, b: 30 } } }).jpeg({ quality: 100 }).toBuffer();
  const { bytes, definition } = glb(jpeg, 'image/jpeg');
  const source = await loadAsset(definition, { loadTextures: true, fetchBytes: async () => bytes }); instances.push(source);
  const clone = cloneAsset(source); instances.push(clone);
  const texture = material(source).map as DataTexture;
  expect(material(clone).map).toBe(texture);
  expect(texture.image.width).toBe(2); expect(texture.image.height).toBe(2);
  for (const [channel, expected] of [200, 70, 30, 255].entries()) expect(Math.abs(texture.image.data![channel]! - expected)).toBeLessThanOrEqual(2);
  const dispose = vi.fn(); texture.addEventListener('dispose', dispose);
  source.dispose(); expect(dispose).not.toHaveBeenCalled();
  clone.dispose(); expect(dispose).toHaveBeenCalledOnce();
});

it('preserves palette alpha and scales sixteen-bit grayscale to RGBA', async () => {
  const palettePixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 0]);
  const indexed = await sharp(palettePixels, { raw: { width: 2, height: 1, channels: 4 } }).png({ palette: true }).toBuffer();
  const gray = encodePng({ width: 2, height: 1, channels: 1, depth: 16, data: new Uint16Array([0, 65535]) });
  for (const [png, expected] of [[indexed, palettePixels], [gray, Buffer.from([0, 0, 0, 255, 255, 255, 255, 255])]] as const) {
    const { bytes, definition } = glb(png, 'image/png');
    const asset = await loadAsset(definition, { loadTextures: true, fetchBytes: async () => bytes }); instances.push(asset);
    const pixels = (material(asset).map as DataTexture).image.data!;
    // RGB of fully transparent palette entries may be normalized by the encoder.
    for (let i = 0; i < expected.length; i++) if (i % 4 === 3 || expected[Math.floor(i / 4) * 4 + 3]) expect(pixels[i]).toBe(expected[i]);
  }
});

it('loads the real default humanoid color and normal images instead of substituting empty textures', async () => {
  const definition = catalog.assets.find(asset => asset.id === 'humanoid.uefn-mannequin')!;
  const source = await loadAsset(definition as unknown as AssetDefinition, { loadTextures: true, fetchBytes: () => readFile(definition.sourcePath) }); instances.push(source);
  const skin = material(source);
  for (const texture of [skin.map, skin.normalMap] as DataTexture[]) {
    expect(texture.isDataTexture).toBe(true); expect(texture.image.width).toBe(2048); expect(texture.image.height).toBe(2048);
    expect(texture.image.data!.length).toBe(2048 * 2048 * 4);
    expect(texture.image.data!.some(value => value !== 0)).toBe(true);
  }
  expect(skin.map!.colorSpace).toBe(SRGBColorSpace); expect(skin.normalMap!.colorSpace).toBe(NoColorSpace);
  expect(skin.transparent).toBe(false); expect(skin.depthWrite).toBe(true);
});

it('rejects corrupt or unsupported embedded images rather than silently returning an untextured asset', async () => {
  for (const mime of ['image/png', 'image/webp']) {
    const { bytes, definition } = glb(new Uint8Array([1, 2, 3]), mime);
    const fetchBytes = vi.fn(async () => bytes);
    await expect(loadAsset(definition, { loadTextures: true, fetchBytes })).rejects.toThrow();
    await expect(loadAsset(definition, { loadTextures: true, fetchBytes })).rejects.toThrow();
    expect(fetchBytes).toHaveBeenCalledTimes(2);
  }
});
