import { convertIndexedToRgb, decode as decodePng } from 'fast-png';
import { decode as decodeJpeg } from 'jpeg-js';
import {
  ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter,
  LinearMipmapNearestFilter, MirroredRepeatWrapping, NearestFilter,
  NearestMipmapLinearFilter, NearestMipmapNearestFilter, RepeatWrapping,
  type MagnificationTextureFilter, type MinificationTextureFilter, type Wrapping,
} from 'three';
import type { GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';

const filters: Record<number, MinificationTextureFilter> = {
  9728: NearestFilter, 9729: LinearFilter, 9984: NearestMipmapNearestFilter,
  9985: LinearMipmapNearestFilter, 9986: NearestMipmapLinearFilter, 9987: LinearMipmapLinearFilter,
};
const wraps: Record<number, Wrapping> = { 33071: ClampToEdgeWrapping, 33648: MirroredRepeatWrapping, 10497: RepeatWrapping };
type Pixels = { data: Uint8Array; width: number; height: number };

function pngPixels(bytes: Uint8Array): Pixels {
  const png = decodePng(bytes, { checkCrc: true });
  const { width, height } = png;
  const source = png.palette ? convertIndexedToRgb(png) : png.data;
  const channels = png.palette ? png.palette[0]!.length : png.channels;
  const depth = png.palette ? 8 : png.depth;
  const maximum = 2 ** depth - 1;
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * channels;
    // Sub-byte grayscale PNG rows are padded independently, like indexed rows.
    const gray = depth < 8
      ? (source[Math.floor(pixel / width) * Math.ceil(width * depth / 8) + Math.floor((pixel % width) * depth / 8)]! >> (8 - depth - (pixel % width) * depth % 8)) & maximum
      : source[offset]!;
    const red = channels < 3 ? gray : source[offset]!;
    const green = channels < 3 ? gray : source[offset + 1]!;
    const blue = channels < 3 ? gray : source[offset + 2]!;
    const transparent = !png.palette && png.transparency && (channels === 1
      ? gray === png.transparency[0]
      : channels === 3 && [red, green, blue].every((v, i) => v === png.transparency![i]));
    const alpha = transparent ? 0 : channels === 2 || channels === 4 ? source[offset + channels - 1]! : maximum;
    data[pixel * 4] = Math.round(red * 255 / maximum);
    data[pixel * 4 + 1] = Math.round(green * 255 / maximum);
    data[pixel * 4 + 2] = Math.round(blue * 255 / maximum);
    data[pixel * 4 + 3] = Math.round(alpha * 255 / maximum);
  }
  return { data, width, height };
}

function decode(bytes: Uint8Array, mimeType: string | undefined): Pixels {
  if (mimeType === 'image/png') return pngPixels(bytes);
  if (mimeType === 'image/jpeg') return decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false });
  throw new Error(`ASSET_NODE_IMAGE_UNSUPPORTED: ${mimeType ?? 'missing mimeType'}`);
}

/** Decode only verified embedded bytes, without DOM globals, object URLs or external I/O. */
export function nodeEmbeddedTextures(parser: GLTFParser, owned: Set<DataTexture>, pendingLoads: Set<Promise<DataTexture>>): GLTFLoaderPlugin {
  const images = new Map<number, Promise<Pixels>>();
  const textures = new Map<string, Promise<DataTexture>>();
  async function image(index: number): Promise<Pixels> {
    let pending = images.get(index);
    if (!pending) {
      pending = (async () => {
        const source = parser.json.images?.[index];
        if (!source) throw new Error(`ASSET_IMAGE_MISSING: ${index}`);
        if (source.bufferView !== undefined) return decode(new Uint8Array(await parser.getDependency('bufferView', source.bufferView)), source.mimeType);
        const match = /^data:(image\/(?:png|jpeg))((?:;[^,]*)?),(.*)$/s.exec(source.uri ?? '');
        if (!match) throw new Error('ASSET_NODE_IMAGE_UNSUPPORTED: expected embedded PNG or JPEG');
        const binary = match[2]!.split(';').includes('base64') ? atob(match[3]!) : match[3]!.replace(/%([\da-f]{2})/gi, (_, value: string) => String.fromCharCode(parseInt(value, 16)));
        return decode(Uint8Array.from(binary, c => c.charCodeAt(0)), match[1]);
      })();
      images.set(index, pending);
    }
    return pending;
  }
  return {
    name: 'worldkit-node-embedded-textures',
    loadTexture(index) {
      const definition = parser.json.textures[index];
      const key = `${definition.source}:${definition.sampler}`;
      let pending = textures.get(key);
      if (!pending) {
        pending = image(definition.source).then(pixels => {
          const texture = new DataTexture(pixels.data, pixels.width, pixels.height);
          owned.add(texture);
          const source = parser.json.images[definition.source];
          const sampler = parser.json.samplers?.[definition.sampler] ?? {};
          texture.name = definition.name || source.name || '';
          texture.flipY = false;
          texture.magFilter = (filters[sampler.magFilter] === NearestFilter ? NearestFilter : LinearFilter) as MagnificationTextureFilter;
          texture.minFilter = filters[sampler.minFilter] ?? LinearMipmapLinearFilter;
          texture.wrapS = wraps[sampler.wrapS] ?? RepeatWrapping;
          texture.wrapT = wraps[sampler.wrapT] ?? RepeatWrapping;
          texture.generateMipmaps = texture.minFilter !== NearestFilter && texture.minFilter !== LinearFilter;
          texture.userData = { ...source.extras, mimeType: source.mimeType ?? /^data:([^;,]+)/.exec(source.uri ?? '')?.[1] };
          texture.needsUpdate = true;
          parser.associations.set(texture, { textures: index });
          return texture;
        });
        textures.set(key, pending);
        pendingLoads.add(pending);
      }
      return pending;
    },
  };
}
