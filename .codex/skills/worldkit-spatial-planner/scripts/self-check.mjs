import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import path from "node:path";
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
const hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
let Hash$1 = class Hash {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
class HashMD extends Hash$1 {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
}
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
}
const sha256$1 = /* @__PURE__ */ createHasher(() => new SHA256());
const sha256 = sha256$1;
class CanonicalJsonAdmissionError extends TypeError {
  code;
  instancePath;
  constructor(instancePath) {
    super(
      `Negative zero at ${canonicalJsonPath(instancePath)} is unsupported canonical JSON.`
    );
    this.name = "CanonicalJsonAdmissionError";
    this.code = "CANONICAL_JSON_NEGATIVE_ZERO";
    this.instancePath = instancePath;
  }
}
function canonicalJsonPath(path2) {
  return path2 || "/";
}
function rejectOwnSymbolKeys(value, path2) {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      `Symbol-keyed property at ${canonicalJsonPath(path2)} is unsupported canonical JSON.`
    );
  }
}
function hasCanonicalArrayShape(value) {
  const ownPropertyNames = Object.getOwnPropertyNames(value);
  if (ownPropertyNames.length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  return lengthDescriptor?.enumerable === false && ownPropertyNames.every((key) => key === "length" || /^\d+$/.test(key));
}
function canonicalize(value, path2) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${canonicalJsonPath(path2)}.`);
    }
    if (Object.is(value, -0)) {
      throw new CanonicalJsonAdmissionError(path2);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(
        `Non-plain array at ${canonicalJsonPath(path2)} is unsupported canonical JSON.`
      );
    }
    rejectOwnSymbolKeys(value, path2);
    if (!hasCanonicalArrayShape(value)) {
      throw new TypeError(
        `Non-canonical array shape at ${canonicalJsonPath(path2)} is unsupported canonical JSON.`
      );
    }
    return value.map((item, index) => canonicalize(item, `${path2}/${index}`));
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(
        `Non-plain object at ${canonicalJsonPath(path2)} is unsupported canonical JSON.`
      );
    }
    rejectOwnSymbolKeys(value, path2);
    const source = value;
    const entries = [];
    for (const key of Object.keys(source).sort()) {
      if (source[key] === void 0) continue;
      entries.push([key, canonicalize(source[key], `${path2}/${key}`)]);
    }
    return Object.fromEntries(entries);
  }
  throw new TypeError(`Unsupported canonical JSON value at ${canonicalJsonPath(path2)}.`);
}
function stringifyCanonicalJson(value) {
  return JSON.stringify(canonicalize(value, ""));
}
function canonicalJsonBytes(value) {
  return new TextEncoder().encode(stringifyCanonicalJson(value));
}
function sha256Bytes(bytes) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}
function sha256CanonicalJson(value) {
  return sha256Bytes(canonicalJsonBytes(value));
}
const CAMERA_RIG_PARAMETER_NAMES_V1 = [
  "distanceMeters",
  "minimumDistanceMeters",
  "maximumDistanceMeters",
  "targetHeightMeters",
  "shoulderOffsetMeters",
  "pitchRadians",
  "minimumPitchRadians",
  "maximumPitchRadians",
  "positionDampingPerSecond",
  "horizontalPositionDampingPerSecond",
  "verticalPositionDampingPerSecond",
  "maximumPositionLagMeters",
  "rotationDampingPerSecond",
  "yawDampingPerSecond",
  "pitchDampingPerSecond",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "baseFovDegrees",
  "speedFovDegreesPerMeterPerSecond",
  "maximumSpeedFovDegrees",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "transitionSeconds",
  "minimumHeadingSpeedMetersPerSecond",
  "velocityHeadingDampingPerSecond",
  "fovDampingPerSecond",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
  "recenterDelaySeconds",
  "recenterDurationSeconds",
  "recenterMinimumSpeedMetersPerSecond",
  "teleportSnapDistanceMeters",
  "lookSensitivityXRatio",
  "lookSensitivityYRatio"
];
const CAMERA_TUNING_PARAMETER_NAMES_V1 = [
  "distanceMeters",
  "targetHeightMeters",
  "shoulderOffsetMeters",
  "pitchRadians",
  "positionDampingPerSecond",
  "horizontalPositionDampingPerSecond",
  "verticalPositionDampingPerSecond",
  "maximumPositionLagMeters",
  "rotationDampingPerSecond",
  "yawDampingPerSecond",
  "pitchDampingPerSecond",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "baseFovDegrees",
  "speedFovDegreesPerMeterPerSecond",
  "maximumSpeedFovDegrees",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "transitionSeconds",
  "minimumHeadingSpeedMetersPerSecond",
  "velocityHeadingDampingPerSecond",
  "fovDampingPerSecond",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
  "recenterDelaySeconds",
  "recenterDurationSeconds",
  "recenterMinimumSpeedMetersPerSecond",
  "teleportSnapDistanceMeters",
  "lookSensitivityXRatio",
  "lookSensitivityYRatio"
];
const CAMERA_RIG_PARAMETER_NAME_SET_V1 = new Set(CAMERA_RIG_PARAMETER_NAMES_V1);
new Set(CAMERA_TUNING_PARAMETER_NAMES_V1);
const SOCKET_FIRST_PERSON_IGNORED_MODIFIER_PARAMETERS_V1 = /* @__PURE__ */ new Set([
  "distanceMeters",
  "minimumDistanceMeters",
  "maximumDistanceMeters",
  "shoulderOffsetMeters",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio"
]);
function isCameraRigParameterNameV1(value) {
  return CAMERA_RIG_PARAMETER_NAME_SET_V1.has(value);
}
function isCameraRigParameterOverrideSupportedV1(algorithmRef, parameterName) {
  return !algorithmRef.endsWith("/socket-first-person@1") || !SOCKET_FIRST_PERSON_IGNORED_MODIFIER_PARAMETERS_V1.has(parameterName);
}
function applyCameraRigParameterOverridesV1(algorithmRef, parameters, overrides) {
  const applied = { ...parameters };
  for (const [parameterName, value] of Object.entries(overrides)) {
    if (value === void 0 || !isCameraRigParameterNameV1(parameterName) || !isCameraRigParameterOverrideSupportedV1(algorithmRef, parameterName)) continue;
    applied[parameterName] = value;
  }
  const positionDamping = overrides.positionDampingPerSecond;
  if (positionDamping !== void 0) {
    if (overrides.horizontalPositionDampingPerSecond === void 0) {
      applied.horizontalPositionDampingPerSecond = positionDamping;
    }
    if (overrides.verticalPositionDampingPerSecond === void 0) {
      applied.verticalPositionDampingPerSecond = positionDamping;
    }
  }
  const rotationDamping = overrides.rotationDampingPerSecond;
  if (rotationDamping !== void 0) {
    if (overrides.yawDampingPerSecond === void 0) {
      applied.yawDampingPerSecond = rotationDamping;
    }
    if (overrides.pitchDampingPerSecond === void 0) {
      applied.pitchDampingPerSecond = rotationDamping;
    }
    if (overrides.velocityHeadingDampingPerSecond === void 0) {
      applied.velocityHeadingDampingPerSecond = rotationDamping;
    }
  }
  return applied;
}
var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
var freeSelf = typeof self == "object" && self && self.Object === Object && self;
var root = freeGlobal || freeSelf || Function("return this")();
var Symbol$1 = root.Symbol;
var objectProto$8 = Object.prototype;
var hasOwnProperty$6 = objectProto$8.hasOwnProperty;
var nativeObjectToString$1 = objectProto$8.toString;
var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : void 0;
function getRawTag(value) {
  var isOwn = hasOwnProperty$6.call(value, symToStringTag$1), tag = value[symToStringTag$1];
  try {
    value[symToStringTag$1] = void 0;
    var unmasked = true;
  } catch (e) {
  }
  var result = nativeObjectToString$1.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag$1] = tag;
    } else {
      delete value[symToStringTag$1];
    }
  }
  return result;
}
var objectProto$7 = Object.prototype;
var nativeObjectToString = objectProto$7.toString;
function objectToString(value) {
  return nativeObjectToString.call(value);
}
var nullTag = "[object Null]", undefinedTag = "[object Undefined]";
var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : void 0;
function baseGetTag(value) {
  if (value == null) {
    return value === void 0 ? undefinedTag : nullTag;
  }
  return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
}
function isObjectLike(value) {
  return value != null && typeof value == "object";
}
var isArray = Array.isArray;
function isObject(value) {
  var type2 = typeof value;
  return value != null && (type2 == "object" || type2 == "function");
}
var asyncTag = "[object AsyncFunction]", funcTag$1 = "[object Function]", genTag = "[object GeneratorFunction]", proxyTag = "[object Proxy]";
function isFunction(value) {
  if (!isObject(value)) {
    return false;
  }
  var tag = baseGetTag(value);
  return tag == funcTag$1 || tag == genTag || tag == asyncTag || tag == proxyTag;
}
var coreJsData = root["__core-js_shared__"];
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
  return uid ? "Symbol(src)_1." + uid : "";
})();
function isMasked(func) {
  return !!maskSrcKey && maskSrcKey in func;
}
var funcProto$1 = Function.prototype;
var funcToString$1 = funcProto$1.toString;
function toSource(func) {
  if (func != null) {
    try {
      return funcToString$1.call(func);
    } catch (e) {
    }
    try {
      return func + "";
    } catch (e) {
    }
  }
  return "";
}
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
var reIsHostCtor = /^\[object .+?Constructor\]$/;
var funcProto = Function.prototype, objectProto$6 = Object.prototype;
var funcToString = funcProto.toString;
var hasOwnProperty$5 = objectProto$6.hasOwnProperty;
var reIsNative = RegExp(
  "^" + funcToString.call(hasOwnProperty$5).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
);
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern2 = isFunction(value) ? reIsNative : reIsHostCtor;
  return pattern2.test(toSource(value));
}
function getValue(object, key) {
  return object == null ? void 0 : object[key];
}
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : void 0;
}
var WeakMap = getNative(root, "WeakMap");
function noop() {
}
function baseFindIndex(array, predicate, fromIndex, fromRight) {
  var length = array.length, index = fromIndex + -1;
  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}
function baseIsNaN(value) {
  return value !== value;
}
function strictIndexOf(array, value, fromIndex) {
  var index = fromIndex - 1, length = array.length;
  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}
function baseIndexOf(array, value, fromIndex) {
  return value === value ? strictIndexOf(array, value, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
}
function arrayIncludes(array, value) {
  var length = array == null ? 0 : array.length;
  return !!length && baseIndexOf(array, value, 0) > -1;
}
function eq(value, other) {
  return value === other || value !== value && other !== other;
}
var MAX_SAFE_INTEGER = 9007199254740991;
function isLength(value) {
  return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}
var objectProto$5 = Object.prototype;
function isPrototype(value) {
  var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto$5;
  return value === proto;
}
var argsTag$1 = "[object Arguments]";
function baseIsArguments(value) {
  return isObjectLike(value) && baseGetTag(value) == argsTag$1;
}
var objectProto$4 = Object.prototype;
var hasOwnProperty$4 = objectProto$4.hasOwnProperty;
var propertyIsEnumerable = objectProto$4.propertyIsEnumerable;
var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
  return arguments;
})()) ? baseIsArguments : function(value) {
  return isObjectLike(value) && hasOwnProperty$4.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
};
function stubFalse() {
  return false;
}
var freeExports$1 = typeof exports == "object" && exports && !exports.nodeType && exports;
var freeModule$1 = freeExports$1 && typeof module == "object" && module && !module.nodeType && module;
var moduleExports$1 = freeModule$1 && freeModule$1.exports === freeExports$1;
var Buffer$1 = moduleExports$1 ? root.Buffer : void 0;
var nativeIsBuffer = Buffer$1 ? Buffer$1.isBuffer : void 0;
var isBuffer = nativeIsBuffer || stubFalse;
var argsTag = "[object Arguments]", arrayTag = "[object Array]", boolTag = "[object Boolean]", dateTag = "[object Date]", errorTag = "[object Error]", funcTag = "[object Function]", mapTag$2 = "[object Map]", numberTag = "[object Number]", objectTag$1 = "[object Object]", regexpTag = "[object RegExp]", setTag$2 = "[object Set]", stringTag = "[object String]", weakMapTag$1 = "[object WeakMap]";
var arrayBufferTag = "[object ArrayBuffer]", dataViewTag$1 = "[object DataView]", float32Tag = "[object Float32Array]", float64Tag = "[object Float64Array]", int8Tag = "[object Int8Array]", int16Tag = "[object Int16Array]", int32Tag = "[object Int32Array]", uint8Tag = "[object Uint8Array]", uint8ClampedTag = "[object Uint8ClampedArray]", uint16Tag = "[object Uint16Array]", uint32Tag = "[object Uint32Array]";
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag$1] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag$2] = typedArrayTags[numberTag] = typedArrayTags[objectTag$1] = typedArrayTags[regexpTag] = typedArrayTags[setTag$2] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag$1] = false;
function baseIsTypedArray(value) {
  return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
}
function baseUnary(func) {
  return function(value) {
    return func(value);
  };
}
var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
var moduleExports = freeModule && freeModule.exports === freeExports;
var freeProcess = moduleExports && freeGlobal.process;
var nodeUtil = (function() {
  try {
    var types2 = freeModule && freeModule.require && freeModule.require("util").types;
    if (types2) {
      return types2;
    }
    return freeProcess && freeProcess.binding && freeProcess.binding("util");
  } catch (e) {
  }
})();
var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}
var nativeKeys = overArg(Object.keys, Object);
var objectProto$3 = Object.prototype;
var hasOwnProperty$3 = objectProto$3.hasOwnProperty;
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty$3.call(object, key) && key != "constructor") {
      result.push(key);
    }
  }
  return result;
}
var nativeCreate = getNative(Object, "create");
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}
var HASH_UNDEFINED$2 = "__lodash_hash_undefined__";
var objectProto$2 = Object.prototype;
var hasOwnProperty$2 = objectProto$2.hasOwnProperty;
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED$2 ? void 0 : result;
  }
  return hasOwnProperty$2.call(data, key) ? data[key] : void 0;
}
var objectProto$1 = Object.prototype;
var hasOwnProperty$1 = objectProto$1.hasOwnProperty;
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== void 0 : hasOwnProperty$1.call(data, key);
}
var HASH_UNDEFINED$1 = "__lodash_hash_undefined__";
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED$1 : value;
  return this;
}
function Hash2(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
Hash2.prototype.clear = hashClear;
Hash2.prototype["delete"] = hashDelete;
Hash2.prototype.get = hashGet;
Hash2.prototype.has = hashHas;
Hash2.prototype.set = hashSet;
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}
var arrayProto = Array.prototype;
var splice = arrayProto.splice;
function listCacheDelete(key) {
  var data = this.__data__, index = assocIndexOf(data, key);
  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}
function listCacheGet(key) {
  var data = this.__data__, index = assocIndexOf(data, key);
  return index < 0 ? void 0 : data[index][1];
}
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}
function listCacheSet(key, value) {
  var data = this.__data__, index = assocIndexOf(data, key);
  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}
function ListCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
ListCache.prototype.clear = listCacheClear;
ListCache.prototype["delete"] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;
var Map$1 = getNative(root, "Map");
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    "hash": new Hash2(),
    "map": new (Map$1 || ListCache)(),
    "string": new Hash2()
  };
}
function isKeyable(value) {
  var type2 = typeof value;
  return type2 == "string" || type2 == "number" || type2 == "symbol" || type2 == "boolean" ? value !== "__proto__" : value === null;
}
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
}
function mapCacheDelete(key) {
  var result = getMapData(this, key)["delete"](key);
  this.size -= result ? 1 : 0;
  return result;
}
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}
function mapCacheSet(key, value) {
  var data = getMapData(this, key), size = data.size;
  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}
function MapCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype["delete"] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;
var DataView$1 = getNative(root, "DataView");
var Promise$1 = getNative(root, "Promise");
var Set$1 = getNative(root, "Set");
var mapTag$1 = "[object Map]", objectTag = "[object Object]", promiseTag = "[object Promise]", setTag$1 = "[object Set]", weakMapTag = "[object WeakMap]";
var dataViewTag = "[object DataView]";
var dataViewCtorString = toSource(DataView$1), mapCtorString = toSource(Map$1), promiseCtorString = toSource(Promise$1), setCtorString = toSource(Set$1), weakMapCtorString = toSource(WeakMap);
var getTag = baseGetTag;
if (DataView$1 && getTag(new DataView$1(new ArrayBuffer(1))) != dataViewTag || Map$1 && getTag(new Map$1()) != mapTag$1 || Promise$1 && getTag(Promise$1.resolve()) != promiseTag || Set$1 && getTag(new Set$1()) != setTag$1 || WeakMap && getTag(new WeakMap()) != weakMapTag) {
  getTag = function(value) {
    var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString:
          return dataViewTag;
        case mapCtorString:
          return mapTag$1;
        case promiseCtorString:
          return promiseTag;
        case setCtorString:
          return setTag$1;
        case weakMapCtorString:
          return weakMapTag;
      }
    }
    return result;
  };
}
var HASH_UNDEFINED = "__lodash_hash_undefined__";
function setCacheAdd(value) {
  this.__data__.set(value, HASH_UNDEFINED);
  return this;
}
function setCacheHas(value) {
  return this.__data__.has(value);
}
function SetCache(values) {
  var index = -1, length = values == null ? 0 : values.length;
  this.__data__ = new MapCache();
  while (++index < length) {
    this.add(values[index]);
  }
}
SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
SetCache.prototype.has = setCacheHas;
function cacheHas(cache, key) {
  return cache.has(key);
}
function setToArray(set) {
  var index = -1, result = Array(set.size);
  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}
var mapTag = "[object Map]", setTag = "[object Set]";
var objectProto = Object.prototype;
var hasOwnProperty = objectProto.hasOwnProperty;
function isEmpty(value) {
  if (value == null) {
    return true;
  }
  if (isArrayLike(value) && (isArray(value) || typeof value == "string" || typeof value.splice == "function" || isBuffer(value) || isTypedArray(value) || isArguments(value))) {
    return !value.length;
  }
  var tag = getTag(value);
  if (tag == mapTag || tag == setTag) {
    return !value.size;
  }
  if (isPrototype(value)) {
    return !baseKeys(value).length;
  }
  for (var key in value) {
    if (hasOwnProperty.call(value, key)) {
      return false;
    }
  }
  return true;
}
function isNil(value) {
  return value == null;
}
var INFINITY = 1 / 0;
var createSet = !(Set$1 && 1 / setToArray(new Set$1([, -0]))[1] == INFINITY) ? noop : function(values) {
  return new Set$1(values);
};
var LARGE_ARRAY_SIZE = 200;
function baseUniq(array, iteratee, comparator) {
  var index = -1, includes = arrayIncludes, length = array.length, isCommon = true, result = [], seen = result;
  if (length >= LARGE_ARRAY_SIZE) {
    var set = createSet(array);
    if (set) {
      return setToArray(set);
    }
    isCommon = false;
    includes = cacheHas;
    seen = new SetCache();
  } else {
    seen = result;
  }
  outer:
    while (++index < length) {
      var value = array[index], computed = value;
      value = value !== 0 ? value : 0;
      if (isCommon && computed === computed) {
        var seenIndex = seen.length;
        while (seenIndex--) {
          if (seen[seenIndex] === computed) {
            continue outer;
          }
        }
        result.push(value);
      } else if (!includes(seen, computed, comparator)) {
        if (seen !== result) {
          seen.push(computed);
        }
        result.push(value);
      }
    }
  return result;
}
function uniq(array) {
  return array && array.length ? baseUniq(array) : [];
}
const TRAVERSAL_DRIVER_PROFILE_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "pathLookaheadMetersXZ",
  "cornerSelectionMode",
  "intentDirectionQuantizationRatio",
  "locomotionIntentMode"
];
new Set(
  TRAVERSAL_DRIVER_PROFILE_REQUIRED_KEYS
);
const TRAVERSAL_GRAPH_BUILDER_PROFILE_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "clearanceMarginMeters",
  "positionQuantizationMeters",
  "slopeCostWeight",
  "stepCostWeight",
  "maximumNodes",
  "maximumEdges",
  "maximumTiles",
  "maximumSearchSteps"
];
new Set(
  TRAVERSAL_GRAPH_BUILDER_PROFILE_REQUIRED_KEYS
);
const TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "clearanceMarginMeters",
  "voxelCellSizeMeters",
  "voxelCellHeightMeters",
  "tileSizeCells",
  "maximumEdgeLengthMeters",
  "maximumSimplificationErrorMeters",
  "positionQuantizationMeters",
  "slopeCostWeight",
  "stepCostWeight",
  "maximumNodes",
  "maximumEdges",
  "maximumTiles",
  "maximumSearchSteps",
  "maximumTraversalSurfaceCount",
  "minimumEquivalentPlaneNormalDotRatio",
  "maximumTraversalSurfaceTrianglePairTestCount"
];
new Set(
  TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_REQUIRED_KEYS
);
const TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "traversalMode",
  "faceSelectionMode"
];
new Set(
  TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS
);
const SUBJECT_RESOURCE_KINDS_V1 = Object.freeze([
  "subject-definition",
  "subject-asset",
  "rig-profile",
  "animation-set",
  "collider-profile",
  "capability",
  "physics-body-profile",
  "locomotion-profile",
  "control-feel-profile",
  "collider-derivation-profile",
  "motion-kernel",
  "motion-profile",
  "control-profile",
  "camera-rig-algorithm",
  "camera-rig-profile",
  "camera-modifier-profile",
  "camera-context-profile",
  "medium-profile",
  "relationship-profile",
  "harness-profile",
  "pose-set-profile",
  "render-binding-profile"
]);
const BIPED_BONE_IDS_V1 = Object.freeze([
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upper-arm.left",
  "lower-arm.left",
  "hand.left",
  "upper-arm.right",
  "lower-arm.right",
  "hand.right",
  "upper-leg.left",
  "lower-leg.left",
  "foot.left",
  "upper-leg.right",
  "lower-leg.right",
  "foot.right"
]);
Object.freeze([
  ...SUBJECT_RESOURCE_KINDS_V1,
  "traversal-surface-profile",
  "gameplay-bootstrap"
]);
const GOLDEN_HUMANOID_SUBJECT_ASSET = {
  kind: "subject-asset",
  id: "humanoid.golden",
  version: 2,
  resourceRef: "worldkit://subject-asset/humanoid.golden@2",
  format: "glb",
  artifact: {
    mediaType: "model/gltf-binary",
    byteLength: 48060,
    contentHash: "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8"
  },
  coordinateConvention: {
    forwardAxis: "-Z",
    upAxis: "+Y",
    metersPerUnit: 1,
    pivot: "support-center"
  },
  bounds: {
    minimumMetersXYZ: [-0.39, 0, -0.16999999999999998],
    maximumMetersXYZ: [0.39, 1.94, 0.16]
  },
  inventory: {
    meshCount: 1,
    vertexCount: 360,
    triangleCount: 180,
    skeletonCount: 1,
    boneCount: 18,
    animationClipNames: ["idle", "jump", "run", "walk"]
  },
  provenance: {
    licenseSpdxId: "LicenseRef-Project-Owned",
    redistributionPolicy: "allowed",
    author: "Agent Whitebox World SDK"
  },
  aiMetadata: {
    displayName: "Golden rigged humanoid",
    description: "Project-owned deterministic GLB 2.0 fixture for the rigged subject pipeline.",
    semanticTags: ["biped", "golden", "humanoid", "rigged", "whitebox"]
  }
};
const GOLDEN_BIPED_RIG_PROFILE = {
  kind: "rig-profile",
  id: "biped.golden",
  version: 2,
  resourceRef: "worldkit://rig-profile/biped.golden@2",
  bodyTopology: "biped",
  compatibleSubjectAssetRefs: [GOLDEN_HUMANOID_SUBJECT_ASSET.resourceRef],
  skeletonRootBoneName: "root",
  requiredBoneIds: BIPED_BONE_IDS_V1,
  sourceNodeNameByBoneId: {
    hips: "hips",
    spine: "spine",
    chest: "chest",
    neck: "neck",
    head: "head",
    "upper-arm.left": "upper-arm.left",
    "lower-arm.left": "lower-arm.left",
    "hand.left": "hand.left",
    "upper-arm.right": "upper-arm.right",
    "lower-arm.right": "lower-arm.right",
    "hand.right": "hand.right",
    "upper-leg.left": "upper-leg.left",
    "lower-leg.left": "lower-leg.left",
    "foot.left": "foot.left",
    "upper-leg.right": "upper-leg.right",
    "lower-leg.right": "lower-leg.right",
    "foot.right": "foot.right"
  },
  aiMetadata: {
    displayName: "Golden biped rig",
    description: "Canonical 17-bone anatomical mapping with an independent Skeleton root for the project-owned Golden humanoid fixture.",
    semanticTags: ["biped", "golden", "humanoid", "rig"]
  }
};
const GOLDEN_GROUND_ANIMATION_SET = {
  kind: "animation-set",
  id: "humanoid.ground.golden",
  version: 2,
  resourceRef: "worldkit://animation-set/humanoid.ground.golden@2",
  subjectAssetRef: GOLDEN_HUMANOID_SUBJECT_ASSET.resourceRef,
  rigProfileRef: GOLDEN_BIPED_RIG_PROFILE.resourceRef,
  defaultActionId: "idle",
  requiredActionIds: ["idle", "walk", "run", "jump"],
  animationBindings: [
    {
      actionId: "idle",
      sourceClipName: "idle",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.2,
      rootMotionMode: "in-place"
    },
    {
      actionId: "walk",
      sourceClipName: "walk",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.2,
      rootMotionMode: "in-place"
    },
    {
      actionId: "run",
      sourceClipName: "run",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.15,
      rootMotionMode: "in-place"
    },
    {
      actionId: "jump",
      sourceClipName: "jump",
      loopMode: "once",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.1,
      rootMotionMode: "in-place"
    }
  ],
  aiMetadata: {
    displayName: "Golden humanoid ground animations",
    description: "Explicit in-place idle, walk, run, and jump mappings for the Golden rig.",
    semanticTags: ["animation", "golden", "ground", "humanoid"]
  }
};
const G_BOT_SUBJECT_ASSET = {
  kind: "subject-asset",
  id: "actor.humanoid.g-bot",
  version: 2,
  resourceRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
  format: "glb",
  artifact: {
    mediaType: "model/gltf-binary",
    byteLength: 6743072,
    contentHash: "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f"
  },
  coordinateConvention: {
    forwardAxis: "-Z",
    upAxis: "+Y",
    metersPerUnit: 1,
    pivot: "support-center"
  },
  bounds: {
    minimumMetersXYZ: [-0.9025661945343018, -3511549439281225e-19, -0.14895710349082947],
    maximumMetersXYZ: [0.9025658369064331, 1.8088831901550293, 0.17174167931079865]
  },
  inventory: {
    meshCount: 2,
    vertexCount: 28374,
    triangleCount: 49112,
    skeletonCount: 1,
    boneCount: 65,
    animationClipCount: 25,
    animationClipNames: [
      "idle",
      "idle.gaming",
      "walk",
      "walk.step",
      "run",
      "jump",
      "fall",
      "land.hard",
      "land.hard.alt",
      "fly",
      "float",
      "swim.surface",
      "swim.tread",
      "swim.exit",
      "sit",
      "sit.idle",
      "sit.ground.idle",
      "sit.toStand",
      "stand",
      "lay.idle",
      "roll.toRun",
      "fight.enter",
      "emote.salute",
      "emote.angry",
      "dance.rumba"
    ]
  },
  provenance: {
    licenseSpdxId: "LicenseRef-Loopit-Company-Private",
    redistributionPolicy: "internal-only",
    author: "Loopit asset team"
  },
  runtimeReadiness: {
    productionReady: false,
    runtimeStateBinding: "not-implemented"
  },
  aiMetadata: {
    displayName: "G Bot Golden",
    description: "Project-owned Mixamo-rigged G Bot with twenty-five art-ready semantic animation clips; runtime state binding is not implemented.",
    semanticTags: ["biped", "g-bot", "humanoid", "rigged"]
  }
};
const G_BOT_MIXAMO_RIG_PROFILE = {
  kind: "rig-profile",
  id: "biped.mixamo-g-bot",
  version: 2,
  resourceRef: "worldkit://rig-profile/biped.mixamo-g-bot@2",
  bodyTopology: "biped",
  compatibleSubjectAssetRefs: [G_BOT_SUBJECT_ASSET.resourceRef],
  skeletonRootBoneName: "mixamorig:Hips",
  requiredBoneIds: BIPED_BONE_IDS_V1,
  sourceNodeNameByBoneId: {
    hips: "mixamorig:Hips",
    spine: "mixamorig:Spine",
    chest: "mixamorig:Spine2",
    neck: "mixamorig:Neck",
    head: "mixamorig:Head",
    "upper-arm.left": "mixamorig:LeftArm",
    "lower-arm.left": "mixamorig:LeftForeArm",
    "hand.left": "mixamorig:LeftHand",
    "upper-arm.right": "mixamorig:RightArm",
    "lower-arm.right": "mixamorig:RightForeArm",
    "hand.right": "mixamorig:RightHand",
    "upper-leg.left": "mixamorig:LeftUpLeg",
    "lower-leg.left": "mixamorig:LeftLeg",
    "foot.left": "mixamorig:LeftFoot",
    "upper-leg.right": "mixamorig:RightUpLeg",
    "lower-leg.right": "mixamorig:RightLeg",
    "foot.right": "mixamorig:RightFoot"
  },
  aiMetadata: {
    displayName: "G Bot Mixamo Humanoid Rig",
    description: "Semantic biped mapping for the G Bot Mixamo skeleton.",
    semanticTags: ["biped", "g-bot", "mixamo", "rig"]
  }
};
const G_BOT_ACTION_BINDINGS = [
  ["idle", "repeat", 0.2],
  ["idle.gaming", "repeat", 0.2],
  ["walk", "repeat", 0.15],
  ["walk.step", "once", 0.12],
  ["run", "repeat", 0.12],
  ["jump", "once", 0.1],
  ["fall", "repeat", 0.12],
  ["land.hard", "once", 0.08],
  ["land.hard.alt", "once", 0.08],
  ["fly", "repeat", 0.18],
  ["float", "repeat", 0.2],
  ["swim.surface", "repeat", 0.18],
  ["swim.tread", "repeat", 0.2],
  ["swim.exit", "once", 0.15],
  ["sit", "once", 0.2],
  ["sit.idle", "repeat", 0.2],
  ["sit.ground.idle", "repeat", 0.2],
  ["sit.toStand", "once", 0.15],
  ["stand", "once", 0.18],
  ["lay.idle", "repeat", 0.2],
  ["roll.toRun", "once", 0.08],
  ["fight.enter", "once", 0.12],
  ["emote.salute", "once", 0.15],
  ["emote.angry", "once", 0.15],
  ["dance.rumba", "repeat", 0.2]
];
const G_BOT_GROUND_ANIMATION_SET = {
  kind: "animation-set",
  id: "humanoid.ground.g-bot",
  version: 2,
  resourceRef: "worldkit://animation-set/humanoid.ground.g-bot@2",
  subjectAssetRef: G_BOT_SUBJECT_ASSET.resourceRef,
  rigProfileRef: G_BOT_MIXAMO_RIG_PROFILE.resourceRef,
  defaultActionId: "idle",
  requiredActionIds: G_BOT_ACTION_BINDINGS.map(([actionId]) => actionId),
  animationBindings: G_BOT_ACTION_BINDINGS.map(
    ([actionId, loopMode, blendDurationSeconds]) => ({
      actionId,
      sourceClipName: actionId,
      loopMode,
      playbackSpeedRatio: 1,
      blendDurationSeconds,
      rootMotionMode: "in-place"
    })
  ),
  aiMetadata: {
    displayName: "G Bot ground and contextual animations",
    description: "Twenty-five explicit in-place semantic mappings for the canonical G Bot asset; automatic runtime state selection remains separate.",
    semanticTags: ["animation", "g-bot", "ground", "humanoid"]
  }
};
const MEDIUM_HUMANOID_CAPSULE_PROFILE = {
  kind: "collider-profile",
  id: "humanoid.medium-capsule",
  version: 1,
  resourceRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
  supportedBodyTopologies: ["biped"],
  collider: {
    kind: "capsule",
    radiusMeters: 0.32,
    heightMeters: 1.92,
    centerOffsetFromSubjectOriginMetersXYZ: [0, 0.96, 0]
  },
  aiMetadata: {
    displayName: "Medium humanoid capsule",
    description: "Explicit support-centered capsule for a medium biped character.",
    semanticTags: ["biped", "capsule", "character", "collider", "medium"]
  }
};
const G_BOT_CAPSULE_PROFILE = {
  kind: "collider-profile",
  id: "humanoid.g-bot-capsule",
  version: 1,
  resourceRef: "worldkit://collider-profile/humanoid.g-bot-capsule@1",
  supportedBodyTopologies: ["biped"],
  collider: {
    kind: "capsule",
    radiusMeters: 0.35,
    heightMeters: 1.8,
    centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0]
  },
  aiMetadata: {
    displayName: "G Bot capsule",
    description: "Product-approved support-centered Capsule for the G Bot humanoid.",
    semanticTags: ["biped", "capsule", "character", "g-bot"]
  }
};
const GROUND_LOCOMOTION_CAPABILITY = {
  kind: "capability",
  id: "locomotion.ground",
  version: 1,
  resourceRef: "worldkit://capability/locomotion.ground@1",
  requiredCapabilityRefs: [],
  providedFeatures: ["ground-locomotion"],
  conflictingCapabilityRefs: [],
  aiMetadata: {
    displayName: "Ground locomotion",
    description: "Moves a controllable subject across supported outdoor ground and water.",
    semanticTags: ["controllable", "ground", "locomotion"]
  }
};
const MEDIUM_CHARACTER_PHYSICS_BODY_PROFILE = {
  kind: "physics-body-profile",
  id: "character.medium",
  version: 1,
  resourceRef: "worldkit://physics-body-profile/character.medium@1",
  supportedBodyTopologies: ["biped", "quadruped", "custom"],
  physicsBody: {
    mode: "character",
    massKilograms: 75,
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3
  },
  aiMetadata: {
    displayName: "Medium character body",
    description: "Standard outdoor character-controller physics for medium-sized subjects.",
    semanticTags: ["character", "medium", "physics"]
  }
};
const STANDARD_GROUND_LOCOMOTION_PROFILE = {
  kind: "locomotion-profile",
  id: "ground.standard",
  version: 1,
  resourceRef: "worldkit://locomotion-profile/ground.standard@1",
  requiredCapabilityRefs: ["worldkit://capability/locomotion.ground@1"],
  allowWalk: true,
  allowRun: true,
  allowJump: true,
  aiMetadata: {
    displayName: "Standard ground locomotion",
    description: "Default walking, running, and jumping capability flags for ground characters.",
    semanticTags: ["ground", "jump", "locomotion", "run", "walk"]
  }
};
const CAPABILITY_CHARACTER_PHYSICS_BODY_PROFILE = {
  kind: "physics-body-profile",
  id: "character.capability-medium",
  version: 1,
  resourceRef: "worldkit://physics-body-profile/character.capability-medium@1",
  supportedBodyTopologies: [
    "biped",
    "quadruped",
    "four-wheel",
    "surface-craft",
    "watercraft",
    "glider",
    "composite",
    "custom"
  ],
  physicsBody: {
    mode: "character",
    massKilograms: 75,
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3
  },
  aiMetadata: {
    displayName: "Capability subject body",
    description: "Shared character-controller body adapter for capability-driven whitebox subjects.",
    semanticTags: ["capability-driven", "character", "physics"]
  }
};
const VERTICAL_CHARACTER_CAPSULE_PROFILE = {
  kind: "collider-derivation-profile",
  id: "vertical-character-capsule",
  version: 1,
  resourceRef: "worldkit://collider-derivation-profile/vertical-character-capsule@1",
  supportedBodyTopologies: ["biped", "quadruped", "custom"],
  colliderDerivation: {
    algorithm: "vertical-character-capsule",
    supportOriginToleranceMeters: 0.01,
    maximumRadiusMeters: 2,
    maximumHeightMeters: 4
  },
  aiMetadata: {
    displayName: "Vertical character capsule",
    description: "Derives one grounded vertical capsule from included primitive bounds.",
    semanticTags: ["automatic", "capsule", "character", "collider"]
  }
};
const CAPABILITY_VERTICAL_CAPSULE_PROFILE = {
  kind: "collider-derivation-profile",
  id: "vertical-capability-capsule",
  version: 1,
  resourceRef: "worldkit://collider-derivation-profile/vertical-capability-capsule@1",
  supportedBodyTopologies: [
    "biped",
    "quadruped",
    "four-wheel",
    "surface-craft",
    "watercraft",
    "glider",
    "composite",
    "custom"
  ],
  colliderDerivation: {
    algorithm: "vertical-character-capsule",
    supportOriginToleranceMeters: 0.01,
    maximumRadiusMeters: 2,
    maximumHeightMeters: 4
  },
  aiMetadata: {
    displayName: "Vertical capability capsule",
    description: "Derives one bounded capsule for capability-driven whitebox subjects.",
    semanticTags: ["automatic", "capability-driven", "capsule", "collider"]
  }
};
const BUILT_IN_SUBJECT_RESOURCE_MANIFESTS = [
  GOLDEN_HUMANOID_SUBJECT_ASSET,
  GOLDEN_BIPED_RIG_PROFILE,
  GOLDEN_GROUND_ANIMATION_SET,
  G_BOT_SUBJECT_ASSET,
  G_BOT_MIXAMO_RIG_PROFILE,
  G_BOT_GROUND_ANIMATION_SET,
  MEDIUM_HUMANOID_CAPSULE_PROFILE,
  G_BOT_CAPSULE_PROFILE,
  GROUND_LOCOMOTION_CAPABILITY,
  MEDIUM_CHARACTER_PHYSICS_BODY_PROFILE,
  CAPABILITY_CHARACTER_PHYSICS_BODY_PROFILE,
  STANDARD_GROUND_LOCOMOTION_PROFILE,
  VERTICAL_CHARACTER_CAPSULE_PROFILE,
  CAPABILITY_VERTICAL_CAPSULE_PROFILE
];
const SHARED_COORDINATE_CONVENTION$2 = {
  forwardAxis: "-Z",
  upAxis: "+Y",
  metersPerUnit: 1,
  pivot: "support-center"
};
const SHARED_COLLIDER_POLICY = {
  kind: "derive",
  colliderDerivationProfileRef: "worldkit://collider-derivation-profile/vertical-character-capsule@1"
};
const SHARED_CAPABILITY_REFS = ["worldkit://capability/locomotion.ground@1"];
const SHARED_GROUND_FEEL_PROFILE_REF = "worldkit://control-feel-profile/humanoid.medium-ground@1";
const SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS = [
  "worldkit://control-feel-profile/humanoid.medium-ground@1",
  "worldkit://control-feel-profile/humanoid.heavy-ground@1"
];
const SHARED_GROUND_MEDIUM_PROFILE_REF = "worldkit://medium-profile/ground-air.standard@1";
const SHARED_PROFILES = {
  physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1"
};
const HUMANOID_THIRD_PERSON_DEFINITION = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "humanoid.third-person",
  version: 1,
  resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
  authoringAvailability: "recommended",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid",
  coordinateConvention: SHARED_COORDINATE_CONVENTION$2,
  visualParts: [
    {
      id: "body",
      kind: "primitive",
      shape: { kind: "capsule", radiusMeters: 0.35, heightMeters: 1.8 },
      localTransform: {
        positionMetersXYZ: [0, 0.9, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["body"]
    }
  ],
  visualBinding: { mode: "static" },
  sockets: [
    {
      id: "hand.right",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0.42, 1.1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["equipment-grip", "hand"]
    }
  ],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1"
  },
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1"
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1"
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "Third-person humanoid",
    description: "A controllable humanoid whitebox proxy for outdoor traversal.",
    semanticTags: ["biped", "ground", "human", "third-person"]
  }
};
const QUADRUPED_GROUND_PROXY_DEFINITION = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "quadruped.ground-proxy",
  version: 1,
  resourceRef: "worldkit://subject-definition/quadruped.ground-proxy@1",
  authoringAvailability: "advanced",
  category: "animal",
  bodyTopology: "quadruped",
  semanticClassId: "subject.animal.quadruped",
  coordinateConvention: SHARED_COORDINATE_CONVENTION$2,
  visualParts: [
    {
      id: "torso",
      kind: "primitive",
      shape: { kind: "box", sizeMetersXYZ: [0.8, 0.7, 1.5] },
      localTransform: {
        positionMetersXYZ: [0, 0.85, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["body", "torso"]
    },
    {
      id: "head",
      kind: "primitive",
      shape: { kind: "box", sizeMetersXYZ: [0.55, 0.55, 0.65] },
      localTransform: {
        positionMetersXYZ: [0, 1, -0.9],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["head"]
    },
    {
      id: "leg.front-left",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [-0.28, 0.35, -0.48],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["front", "leg", "left"]
    },
    {
      id: "leg.front-right",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [0.28, 0.35, -0.48],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["front", "leg", "right"]
    },
    {
      id: "leg.back-left",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [-0.28, 0.35, 0.48],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["back", "leg", "left"]
    },
    {
      id: "leg.back-right",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [0.28, 0.35, 0.48],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      colliderContribution: "include",
      semanticTags: ["back", "leg", "right"]
    },
    {
      id: "tail",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.08, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [0, 0.9, 0.95],
        rotationEulerRadiansXYZ: [Math.PI / 3, 0, 0]
      },
      colliderContribution: "exclude",
      semanticTags: ["tail"]
    }
  ],
  visualBinding: { mode: "static" },
  sockets: [
    {
      id: "seat.mount",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.3, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["mount-seat"]
    }
  ],
  colliderPolicy: SHARED_COLLIDER_POLICY,
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1"
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1"
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "Ground quadruped proxy",
    description: "A controllable quadruped whitebox proxy for outdoor traversal tests.",
    semanticTags: ["animal", "ground", "quadruped"]
  }
};
const RIGGED_GOLDEN_HUMANOID_DEFINITION = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "humanoid.rigged-golden",
  version: 2,
  resourceRef: "worldkit://subject-definition/humanoid.rigged-golden@2",
  authoringAvailability: "recommended",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid.rigged",
  coordinateConvention: SHARED_COORDINATE_CONVENTION$2,
  visualParts: [
    {
      id: "body.asset",
      kind: "asset",
      subjectAssetRef: "worldkit://subject-asset/humanoid.golden@2",
      localTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1]
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: ["body", "golden", "rigged"]
    }
  ],
  visualBinding: {
    mode: "rigged",
    rigProfileRef: "worldkit://rig-profile/biped.golden@2",
    animationSetRef: "worldkit://animation-set/humanoid.ground.golden@2"
  },
  sockets: [
    {
      id: "hand.right",
      kind: "bone",
      boneId: "hand.right",
      offsetTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["equipment-grip", "hand"]
    }
  ],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1"
  },
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef: SHARED_PROFILES.physicsBodyProfileRef,
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1"
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1"
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://animation-set/humanoid.ground.golden@2",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "Rigged Golden humanoid",
    description: "Project-owned rigged humanoid for the complete asset Subject pipeline.",
    semanticTags: ["biped", "golden", "human", "rigged"]
  }
};
const G_BOT_HUMANOID_DEFINITION = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "humanoid.g-bot",
  version: 2,
  resourceRef: "worldkit://subject-definition/humanoid.g-bot@2",
  authoringAvailability: "recommended",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid.robot",
  coordinateConvention: SHARED_COORDINATE_CONVENTION$2,
  visualParts: [
    {
      id: "body.asset",
      kind: "asset",
      subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
      localTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, Math.PI, 0],
        scaleXYZ: [1, 1, 1]
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: ["body", "g-bot", "rigged", "robot"]
    }
  ],
  visualBinding: {
    mode: "rigged",
    rigProfileRef: "worldkit://rig-profile/biped.mixamo-g-bot@2",
    animationSetRef: "worldkit://animation-set/humanoid.ground.g-bot@2"
  },
  sockets: [
    {
      id: "FootAlignment",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["foot-alignment", "relationship", "rider"]
    },
    {
      id: "FirstPersonView",
      kind: "bone",
      boneId: "head",
      offsetTransform: {
        positionMetersXYZ: [0, 0.09, -0.08],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["camera", "first-person"]
    },
    {
      id: "ThirdPersonTarget",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.25, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["camera", "third-person"]
    },
    {
      id: "CameraTarget3D",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.2, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["camera", "target"]
    },
    {
      id: "LookAhead",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.1, -1],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["camera", "look-ahead"]
    },
    {
      id: "SeatAlignment",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 0.9, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["relationship", "seat"]
    },
    {
      id: "hand.right",
      kind: "bone",
      boneId: "hand.right",
      offsetTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0]
      },
      semanticTags: ["equipment-grip", "hand"]
    }
  ],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef: "worldkit://collider-profile/humanoid.g-bot-capsule@1"
  },
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1"
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1"
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://animation-set/humanoid.ground.g-bot@2",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "G Bot humanoid",
    description: "Product-authored rigged G Bot assembled with canonical ground control and physics profiles.",
    semanticTags: ["biped", "g-bot", "human", "product", "rigged", "robot"]
  }
};
const BUILT_IN_SUBJECT_DEFINITIONS = [
  G_BOT_HUMANOID_DEFINITION,
  RIGGED_GOLDEN_HUMANOID_DEFINITION,
  HUMANOID_THIRD_PERSON_DEFINITION,
  QUADRUPED_GROUND_PROXY_DEFINITION
];
const algorithms = [{ "kind": "camera-rig-algorithm", "id": "socket-first-person", "version": 1, "resourceRef": "worldkit://camera-rig/socket-first-person@1", "authoringAvailability": "recommended", "implementationId": "socket-first-person", "runtimeStatus": "implemented", "aiMetadata": { "displayName": "Socket First Person", "description": "Positions the view at a declared first-person socket.", "semanticTags": ["first-person", "socket"] } }, { "kind": "camera-rig-algorithm", "id": "orbit-follow", "version": 1, "resourceRef": "worldkit://camera-rig/orbit-follow@1", "authoringAvailability": "recommended", "implementationId": "orbit-follow", "runtimeStatus": "implemented", "aiMetadata": { "displayName": "Orbit Follow", "description": "Orbits and follows a stable target frame with collision shortening.", "semanticTags": ["follow", "orbit"] } }, { "kind": "camera-rig-algorithm", "id": "velocity-chase", "version": 1, "resourceRef": "worldkit://camera-rig/velocity-chase@1", "authoringAvailability": "advanced", "implementationId": "velocity-chase", "runtimeStatus": "implemented", "aiMetadata": { "displayName": "Velocity Chase", "description": "Chases a moving target with velocity look-ahead and speed FOV.", "semanticTags": ["chase", "speed", "velocity"] } }, { "kind": "camera-rig-algorithm", "id": "flight-horizon", "version": 1, "resourceRef": "worldkit://camera-rig/flight-horizon@1", "authoringAvailability": "experimental", "implementationId": "flight-horizon", "runtimeStatus": "implemented", "aiMetadata": { "displayName": "Flight Horizon", "description": "Follows flight direction while retaining horizon and landing context.", "semanticTags": ["flight", "horizon"] } }];
const profiles = /* @__PURE__ */ JSON.parse('[{"kind":"camera-rig-profile","id":"first-person.standard","version":1,"resourceRef":"worldkit://camera-profile/first-person.standard@1","authoringAvailability":"recommended","baseMode":"first-person","algorithmRef":"worldkit://camera-rig/socket-first-person@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"off","preferredSocketIds":["FirstPersonView"],"parameters":{"distanceMeters":0,"minimumDistanceMeters":0,"maximumDistanceMeters":0,"targetHeightMeters":1.64,"shoulderOffsetMeters":0,"pitchRadians":0,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":30,"horizontalPositionDampingPerSecond":30,"verticalPositionDampingPerSecond":30,"maximumPositionLagMeters":0.1,"rotationDampingPerSecond":24,"yawDampingPerSecond":24,"pitchDampingPerSecond":20,"collisionRadiusMeters":0.05,"collisionRetractionMetersPerSecond":40,"collisionRecoveryMetersPerSecond":12,"baseFovDegrees":70,"speedFovDegreesPerMeterPerSecond":0,"maximumSpeedFovDegrees":0,"lookAheadSeconds":0,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.25,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":24,"fovDampingPerSecond":12,"horizontalDeadZoneRatio":0,"verticalDeadZoneRatio":0,"recenterDelaySeconds":0,"recenterDurationSeconds":0,"recenterMinimumSpeedMetersPerSecond":0,"teleportSnapDistanceMeters":8,"lookSensitivityXRatio":0.8,"lookSensitivityYRatio":0.7},"authoringRanges":{"targetHeightMeters":{"minimum":0,"maximum":3,"step":0.02},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":5,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Standard First Person","description":"Stable socket first-person view for subjects that expose FirstPersonView.","semanticTags":["first-person","standard"]}},{"kind":"camera-rig-profile","id":"orbit.medium","version":1,"resourceRef":"worldkit://camera-profile/orbit.medium@1","authoringAvailability":"recommended","baseMode":"free-orbit","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"view","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"off","preferredSocketIds":["ThirdPersonTarget","CameraTarget3D"],"parameters":{"distanceMeters":5,"minimumDistanceMeters":0.5,"maximumDistanceMeters":20,"targetHeightMeters":1.25,"shoulderOffsetMeters":0,"pitchRadians":0.22,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":18,"horizontalPositionDampingPerSecond":18,"verticalPositionDampingPerSecond":20,"maximumPositionLagMeters":2.5,"rotationDampingPerSecond":20,"yawDampingPerSecond":16,"pitchDampingPerSecond":14,"collisionRadiusMeters":0.12,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":6,"baseFovDegrees":58,"speedFovDegreesPerMeterPerSecond":0.4,"maximumSpeedFovDegrees":4,"lookAheadSeconds":0,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.35,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":16,"fovDampingPerSecond":8,"horizontalDeadZoneRatio":0.08,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":1,"recenterDurationSeconds":1.2,"recenterMinimumSpeedMetersPerSecond":1.2,"teleportSnapDistanceMeters":12,"lookSensitivityXRatio":1,"lookSensitivityYRatio":0.8},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":20,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":20,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.01},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Medium Orbit","description":"General orbit view for medium controllable subjects.","semanticTags":["medium","orbit"]}},{"kind":"camera-rig-profile","id":"follow.medium","version":1,"resourceRef":"worldkit://camera-profile/follow.medium@1","authoringAvailability":"advanced","baseMode":"stable-follow","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"always","preferredSocketIds":["CameraTarget3D","ThirdPersonTarget"],"parameters":{"distanceMeters":6,"minimumDistanceMeters":0.5,"maximumDistanceMeters":20,"targetHeightMeters":1.1,"shoulderOffsetMeters":0,"pitchRadians":0.26,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":14,"horizontalPositionDampingPerSecond":14,"verticalPositionDampingPerSecond":16,"maximumPositionLagMeters":2,"rotationDampingPerSecond":16,"yawDampingPerSecond":9,"pitchDampingPerSecond":12,"collisionRadiusMeters":0.12,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":6,"baseFovDegrees":60,"speedFovDegreesPerMeterPerSecond":0.6,"maximumSpeedFovDegrees":5,"lookAheadSeconds":0.15,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.4,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":10,"fovDampingPerSecond":8,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.04,"recenterDelaySeconds":0.7,"recenterDurationSeconds":1,"recenterMinimumSpeedMetersPerSecond":0,"teleportSnapDistanceMeters":12,"lookSensitivityXRatio":0.9,"lookSensitivityYRatio":0.75},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":20,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":20,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Medium Follow","description":"Stable follow view for forward-steering subjects.","semanticTags":["follow","medium"]}},{"kind":"camera-rig-profile","id":"chase.surface-fast","version":1,"resourceRef":"worldkit://camera-profile/chase.surface-fast@1","authoringAvailability":"advanced","baseMode":"speed-chase","algorithmRef":"worldkit://camera-rig/velocity-chase@1","headingSource":"target-velocity","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"forward-motion","preferredSocketIds":["CameraTarget3D","LookAhead"],"parameters":{"distanceMeters":8,"minimumDistanceMeters":0.5,"maximumDistanceMeters":30,"targetHeightMeters":1.2,"shoulderOffsetMeters":0,"pitchRadians":0.18,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":11,"horizontalPositionDampingPerSecond":11,"verticalPositionDampingPerSecond":14,"maximumPositionLagMeters":3,"rotationDampingPerSecond":12,"yawDampingPerSecond":8,"pitchDampingPerSecond":10,"collisionRadiusMeters":0.3,"collisionRetractionMetersPerSecond":36,"collisionRecoveryMetersPerSecond":5,"baseFovDegrees":62,"speedFovDegreesPerMeterPerSecond":0.9,"maximumSpeedFovDegrees":12,"lookAheadSeconds":0.45,"accelerationLookAheadSecondsSquared":0.08,"transitionSeconds":0.45,"minimumHeadingSpeedMetersPerSecond":1,"velocityHeadingDampingPerSecond":8,"fovDampingPerSecond":6,"horizontalDeadZoneRatio":0.04,"verticalDeadZoneRatio":0.04,"recenterDelaySeconds":0.5,"recenterDurationSeconds":0.8,"recenterMinimumSpeedMetersPerSecond":2,"teleportSnapDistanceMeters":20,"lookSensitivityXRatio":0.85,"lookSensitivityYRatio":0.7},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":30,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":30,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Fast Surface Chase","description":"Velocity chase view for fast movement along a support surface.","semanticTags":["chase","fast","surface"]}},{"kind":"camera-rig-profile","id":"follow.water-surface","version":1,"resourceRef":"worldkit://camera-profile/follow.water-surface@1","authoringAvailability":"experimental","baseMode":"stable-follow","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"forward-motion","preferredSocketIds":["CameraTarget3D","LookAhead"],"parameters":{"distanceMeters":7,"minimumDistanceMeters":0.5,"maximumDistanceMeters":25,"targetHeightMeters":1.3,"shoulderOffsetMeters":0,"pitchRadians":0.3,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":10,"horizontalPositionDampingPerSecond":10,"verticalPositionDampingPerSecond":14,"maximumPositionLagMeters":2,"rotationDampingPerSecond":10,"yawDampingPerSecond":7,"pitchDampingPerSecond":10,"collisionRadiusMeters":0.3,"collisionRetractionMetersPerSecond":28,"collisionRecoveryMetersPerSecond":5,"baseFovDegrees":60,"speedFovDegreesPerMeterPerSecond":0.5,"maximumSpeedFovDegrees":5,"lookAheadSeconds":0.2,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.45,"minimumHeadingSpeedMetersPerSecond":0.3,"velocityHeadingDampingPerSecond":7,"fovDampingPerSecond":7,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.06,"recenterDelaySeconds":0.8,"recenterDurationSeconds":1.2,"recenterMinimumSpeedMetersPerSecond":0.5,"teleportSnapDistanceMeters":15,"lookSensitivityXRatio":0.8,"lookSensitivityYRatio":0.65},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":25,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":25,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Water Surface Follow","description":"Low-response follow view that preserves water horizon context.","semanticTags":["follow","surface","water"]}},{"kind":"camera-rig-profile","id":"flight.glide","version":1,"resourceRef":"worldkit://camera-profile/flight.glide@1","authoringAvailability":"experimental","baseMode":"flight-horizon","algorithmRef":"worldkit://camera-rig/flight-horizon@1","headingSource":"target-velocity","reverseHeadingPolicy":"follow-velocity","recenterMode":"forward-motion","preferredSocketIds":["CameraTarget3D","LookAhead"],"parameters":{"distanceMeters":9,"minimumDistanceMeters":1,"maximumDistanceMeters":30,"targetHeightMeters":1.4,"shoulderOffsetMeters":0,"pitchRadians":0.12,"minimumPitchRadians":-1,"maximumPitchRadians":1,"positionDampingPerSecond":8,"horizontalPositionDampingPerSecond":8,"verticalPositionDampingPerSecond":10,"maximumPositionLagMeters":5,"rotationDampingPerSecond":9,"yawDampingPerSecond":6,"pitchDampingPerSecond":8,"collisionRadiusMeters":0.25,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":4,"baseFovDegrees":64,"speedFovDegreesPerMeterPerSecond":0.8,"maximumSpeedFovDegrees":10,"lookAheadSeconds":0.6,"accelerationLookAheadSecondsSquared":0.1,"transitionSeconds":0.55,"minimumHeadingSpeedMetersPerSecond":2,"velocityHeadingDampingPerSecond":6,"fovDampingPerSecond":6,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":0.6,"recenterDurationSeconds":1,"recenterMinimumSpeedMetersPerSecond":2,"teleportSnapDistanceMeters":25,"lookSensitivityXRatio":0.75,"lookSensitivityYRatio":0.65},"authoringRanges":{"distanceMeters":{"minimum":1,"maximum":30,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":6,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1,"maximum":1,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":24,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Glide Flight","description":"Flight direction view with horizon and landing context.","semanticTags":["flight","glide","horizon"]}},{"kind":"camera-rig-profile","id":"follow.mounted","version":1,"resourceRef":"worldkit://camera-profile/follow.mounted@1","authoringAvailability":"experimental","baseMode":"stable-follow","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"always","preferredSocketIds":["CameraTarget3D","ThirdPersonTarget"],"parameters":{"distanceMeters":7,"minimumDistanceMeters":0.5,"maximumDistanceMeters":25,"targetHeightMeters":1.5,"shoulderOffsetMeters":0,"pitchRadians":0.24,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":12,"horizontalPositionDampingPerSecond":12,"verticalPositionDampingPerSecond":14,"maximumPositionLagMeters":3,"rotationDampingPerSecond":12,"yawDampingPerSecond":8,"pitchDampingPerSecond":10,"collisionRadiusMeters":0.28,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":5,"baseFovDegrees":61,"speedFovDegreesPerMeterPerSecond":0.6,"maximumSpeedFovDegrees":7,"lookAheadSeconds":0.25,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.5,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":8,"fovDampingPerSecond":7,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":0.6,"recenterDurationSeconds":0.9,"recenterMinimumSpeedMetersPerSecond":0,"teleportSnapDistanceMeters":15,"lookSensitivityXRatio":0.82,"lookSensitivityYRatio":0.68},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":25,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":16,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Mounted Follow","description":"Follow view for committed seat or mount relationships.","semanticTags":["follow","mounted"]}},{"kind":"camera-rig-profile","id":"orbit.quadruped-official","version":1,"resourceRef":"worldkit://camera-profile/orbit.quadruped-official@1","authoringAvailability":"advanced","baseMode":"free-orbit","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"view","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"forward-motion","preferredSocketIds":["ThirdPersonTarget","CameraTarget3D"],"parameters":{"distanceMeters":5,"minimumDistanceMeters":0.5,"maximumDistanceMeters":20,"targetHeightMeters":1.35,"shoulderOffsetMeters":0,"pitchRadians":0.22,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":18,"horizontalPositionDampingPerSecond":18,"verticalPositionDampingPerSecond":20,"maximumPositionLagMeters":2.5,"rotationDampingPerSecond":20,"yawDampingPerSecond":16,"pitchDampingPerSecond":14,"collisionRadiusMeters":0.2,"collisionRetractionMetersPerSecond":4.5,"collisionRecoveryMetersPerSecond":3.25,"baseFovDegrees":58,"speedFovDegreesPerMeterPerSecond":0.4,"maximumSpeedFovDegrees":4,"lookAheadSeconds":0,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.35,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":16,"fovDampingPerSecond":8,"horizontalDeadZoneRatio":0.08,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":1,"recenterDurationSeconds":1.2,"recenterMinimumSpeedMetersPerSecond":1.2,"teleportSnapDistanceMeters":12,"lookSensitivityXRatio":1,"lookSensitivityYRatio":0.8},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":20,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":20,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.01},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Quadruped Official Orbit","description":"Reviewed quadruped orbit default derived from the local tuning workspace.","semanticTags":["official","orbit","quadruped"]}}]');
const modifiers = [{ "kind": "camera-modifier-profile", "id": "water-stability", "version": 1, "resourceRef": "worldkit://camera-modifier/water-stability@1", "authoringAvailability": "advanced", "parameterOverrides": { "distanceMeters": 7, "targetHeightMeters": 1.3, "horizontalPositionDampingPerSecond": 10, "verticalPositionDampingPerSecond": 14, "maximumPositionLagMeters": 2, "yawDampingPerSecond": 7, "pitchDampingPerSecond": 10, "lookAheadSeconds": 0.2, "accelerationLookAheadSecondsSquared": 0, "horizontalDeadZoneRatio": 0.05, "verticalDeadZoneRatio": 0.06 }, "recenterModeOverride": "forward-motion", "aiMetadata": { "displayName": "Water Stability Modifier", "description": "Adds slower vertical response and calmer framing without creating a separate camera mode.", "semanticTags": ["modifier", "stability", "water"] } }, { "kind": "camera-modifier-profile", "id": "mounted-framing", "version": 1, "resourceRef": "worldkit://camera-modifier/mounted-framing@1", "authoringAvailability": "advanced", "parameterOverrides": { "distanceMeters": 7, "targetHeightMeters": 1.5, "maximumPositionLagMeters": 3, "transitionSeconds": 0.45 }, "aiMetadata": { "displayName": "Mounted Framing Modifier", "description": "Widens framing for a committed rider, driver or passenger relationship.", "semanticTags": ["modifier", "mounted", "relationship"] } }, { "kind": "camera-modifier-profile", "id": "reverse-stability", "version": 1, "resourceRef": "worldkit://camera-modifier/reverse-stability@1", "authoringAvailability": "advanced", "parameterOverrides": { "lookAheadSeconds": 0.08, "accelerationLookAheadSecondsSquared": 0, "yawDampingPerSecond": 10 }, "reverseHeadingPolicyOverride": "preserve-target-forward", "aiMetadata": { "displayName": "Reverse Stability Modifier", "description": "Prevents a chase camera from flipping behind reverse velocity.", "semanticTags": ["modifier", "reverse", "stability"] } }, { "kind": "camera-modifier-profile", "id": "sprint-emphasis", "version": 1, "resourceRef": "worldkit://camera-modifier/sprint-emphasis@1", "authoringAvailability": "advanced", "parameterOverrides": { "speedFovDegreesPerMeterPerSecond": 0.8, "maximumSpeedFovDegrees": 10, "fovDampingPerSecond": 6 }, "aiMetadata": { "displayName": "Sprint Emphasis Modifier", "description": "Adds restrained speed framing while sprint or boost intent is committed.", "semanticTags": ["modifier", "speed", "sprint"] } }, { "kind": "camera-modifier-profile", "id": "aim-framing", "version": 1, "resourceRef": "worldkit://camera-modifier/aim-framing@1", "authoringAvailability": "advanced", "parameterOverrides": { "distanceMeters": 3.5, "targetHeightMeters": 1.45, "shoulderOffsetMeters": 0.55, "maximumPositionLagMeters": 1, "baseFovDegrees": 52, "lookAheadSeconds": 0, "transitionSeconds": 0.2 }, "recenterModeOverride": "off", "aiMetadata": { "displayName": "Aim Framing Modifier", "description": "Moves to a tighter shoulder composition while preserving the active base rig.", "semanticTags": ["aim", "modifier", "shoulder"] } }];
const contexts = [{ "kind": "camera-context-profile", "id": "capability-driven.default", "version": 1, "resourceRef": "worldkit://camera-context/capability-driven.default@1", "authoringAvailability": "recommended", "defaultCameraRigProfileRef": "worldkit://camera-profile/follow.medium@1", "firstPersonCameraRigProfileRef": "worldkit://camera-profile/first-person.standard@1", "rules": [{ "id": "aim", "priority": 110, "when": { "requiredCameraContextTags": ["aim"] }, "cameraModifierRefs": ["worldkit://camera-modifier/aim-framing@1"] }, { "id": "mounted", "priority": 100, "when": { "relationshipRoles": ["driver", "passenger", "rider"] }, "cameraModifierRefs": ["worldkit://camera-modifier/mounted-framing@1"] }, { "id": "reverse", "priority": 95, "when": { "requiredCameraContextTags": ["reverse"] }, "cameraModifierRefs": ["worldkit://camera-modifier/reverse-stability@1"] }, { "id": "glide", "priority": 90, "when": { "requiredMotionTags": ["glide"], "movementMediums": ["air"] }, "cameraRigProfileRef": "worldkit://camera-profile/flight.glide@1" }, { "id": "water-surface", "priority": 80, "when": { "requiredMotionTags": ["water"], "movementMediums": ["water"] }, "cameraRigProfileRef": "worldkit://camera-profile/follow.medium@1", "cameraModifierRefs": ["worldkit://camera-modifier/water-stability@1"] }, { "id": "sprint", "priority": 65, "when": { "requiredCameraContextTags": ["sprint"] }, "cameraModifierRefs": ["worldkit://camera-modifier/sprint-emphasis@1"] }, { "id": "surface-fast", "priority": 70, "when": { "requiredMotionTags": ["surface-fast"] }, "cameraRigProfileRef": "worldkit://camera-profile/chase.surface-fast@1" }, { "id": "free-ground", "priority": 60, "when": { "requiredMotionTags": ["free-ground"] }, "cameraRigProfileRef": "worldkit://camera-profile/orbit.medium@1" }], "aiMetadata": { "displayName": "Capability-driven Camera Context", "description": "Selects camera behavior from committed relationship, motion and medium state.", "semanticTags": ["capability-driven", "context", "default"] } }, { "kind": "camera-context-profile", "id": "capability-driven.quadruped-official", "version": 1, "resourceRef": "worldkit://camera-context/capability-driven.quadruped-official@1", "authoringAvailability": "advanced", "defaultCameraRigProfileRef": "worldkit://camera-profile/orbit.quadruped-official@1", "firstPersonCameraRigProfileRef": "worldkit://camera-profile/first-person.standard@1", "rules": [{ "id": "aim", "priority": 110, "when": { "requiredCameraContextTags": ["aim"] }, "cameraModifierRefs": ["worldkit://camera-modifier/aim-framing@1"] }, { "id": "mounted", "priority": 100, "when": { "relationshipRoles": ["driver", "passenger", "rider"] }, "cameraModifierRefs": ["worldkit://camera-modifier/mounted-framing@1"] }, { "id": "reverse", "priority": 95, "when": { "requiredCameraContextTags": ["reverse"] }, "cameraModifierRefs": ["worldkit://camera-modifier/reverse-stability@1"] }, { "id": "glide", "priority": 90, "when": { "requiredMotionTags": ["glide"], "movementMediums": ["air"] }, "cameraRigProfileRef": "worldkit://camera-profile/flight.glide@1" }, { "id": "water-surface", "priority": 80, "when": { "requiredMotionTags": ["water"], "movementMediums": ["water"] }, "cameraRigProfileRef": "worldkit://camera-profile/follow.medium@1", "cameraModifierRefs": ["worldkit://camera-modifier/water-stability@1"] }, { "id": "sprint", "priority": 65, "when": { "requiredCameraContextTags": ["sprint"] }, "cameraModifierRefs": ["worldkit://camera-modifier/sprint-emphasis@1"] }, { "id": "surface-fast", "priority": 70, "when": { "requiredMotionTags": ["surface-fast"] }, "cameraRigProfileRef": "worldkit://camera-profile/chase.surface-fast@1" }, { "id": "free-ground", "priority": 60, "when": { "requiredMotionTags": ["free-ground"] }, "cameraRigProfileRef": "worldkit://camera-profile/orbit.medium@1" }], "aiMetadata": { "displayName": "Quadruped Official Camera Context", "description": "Quadruped public default with the reviewed orbit profile as its base view.", "semanticTags": ["capability-driven", "official", "quadruped"] } }];
const cameraCatalog = {
  algorithms,
  profiles,
  modifiers,
  contexts
};
const controlFeelProfiles = [
  {
    kind: "control-feel-profile",
    id: "humanoid.heavy-ground",
    version: 1,
    resourceRef: "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    authoringAvailability: "advanced",
    walkSpeedMetersPerSecond: 1.6,
    runSpeedMetersPerSecond: 2.6,
    jumpSpeedMetersPerSecond: 4.5,
    accelerationMetersPerSecondSquared: 8,
    decelerationMetersPerSecondSquared: 14,
    turnRateRadiansPerSecond: 4,
    moveResponseExponent: 1.8,
    airControlRatio: 0.12,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.12,
    variableJumpHoldSeconds: 0.18,
    jumpHoldGravityRatio: 0.45,
    jumpReleaseGravityRatio: 2,
    aiMetadata: {
      displayName: "Heavy Ground Humanoid Feel",
      description: "Distinguishable heavier ground traversal with lower acceleration and turn rate.",
      semanticTags: [
        "feel",
        "ground",
        "heavy",
        "humanoid"
      ]
    }
  },
  {
    kind: "control-feel-profile",
    id: "humanoid.medium-ground",
    version: 1,
    resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    authoringAvailability: "recommended",
    walkSpeedMetersPerSecond: 2.4,
    runSpeedMetersPerSecond: 4,
    jumpSpeedMetersPerSecond: 5.5,
    accelerationMetersPerSecondSquared: 16,
    decelerationMetersPerSecondSquared: 22,
    turnRateRadiansPerSecond: 9,
    moveResponseExponent: 1.4,
    airControlRatio: 0.3,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.12,
    variableJumpHoldSeconds: 0.18,
    jumpHoldGravityRatio: 0.45,
    jumpReleaseGravityRatio: 2,
    aiMetadata: {
      displayName: "Medium Ground Humanoid Feel",
      description: "Current medium humanoid ground traversal speeds and response.",
      semanticTags: [
        "feel",
        "ground",
        "humanoid",
        "medium"
      ]
    }
  },
  {
    kind: "control-feel-profile",
    id: "subject.animal.quadruped.forward-steer.default",
    version: 1,
    resourceRef: "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1",
    authoringAvailability: "advanced",
    walkSpeedMetersPerSecond: 2.4,
    runSpeedMetersPerSecond: 4,
    jumpSpeedMetersPerSecond: 3.1,
    accelerationMetersPerSecondSquared: 16,
    decelerationMetersPerSecondSquared: 22,
    turnRateRadiansPerSecond: 2.4,
    moveResponseExponent: 1.4,
    airControlRatio: 0.3,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.12,
    variableJumpHoldSeconds: 0.18,
    jumpHoldGravityRatio: 0.45,
    jumpReleaseGravityRatio: 2,
    aiMetadata: {
      displayName: "Quadruped Official Ground Feel",
      description: "Reviewed quadruped jump and turn response migrated from the local tuning workspace into the P1.5 Control Feel authority.",
      semanticTags: [
        "feel",
        "ground",
        "official",
        "quadruped"
      ]
    }
  }
];
const controlProfiles = [
  {
    kind: "control-profile",
    id: "planar.camera-relative",
    version: 1,
    resourceRef: "worldkit://control-profile/planar.camera-relative@1",
    authoringAvailability: "recommended",
    commandKind: "planar-vector",
    inputSpace: "camera-relative",
    facingPolicy: "align-to-move",
    lateralMovementPolicy: "allowed",
    moveDeadzoneRatio: 0.1,
    aiMetadata: {
      displayName: "Camera-relative Planar Control",
      description: "Maps semantic movement to a camera-relative planar direction.",
      semanticTags: [
        "camera-relative",
        "planar"
      ]
    }
  },
  {
    kind: "control-profile",
    id: "planar.aim-relative",
    version: 1,
    resourceRef: "worldkit://control-profile/planar.aim-relative@1",
    authoringAvailability: "advanced",
    commandKind: "planar-vector",
    inputSpace: "camera-relative",
    facingPolicy: "align-to-view",
    lateralMovementPolicy: "allowed",
    moveDeadzoneRatio: 0.1,
    aiMetadata: {
      displayName: "Aim-relative Planar Control",
      description: "Keeps the subject aligned to the view while allowing camera-relative strafing.",
      semanticTags: [
        "aim",
        "camera-relative",
        "planar",
        "strafe"
      ]
    }
  }
];
const harnessProfiles = [
  {
    kind: "harness-profile",
    id: "subject.standard",
    version: 1,
    resourceRef: "worldkit://harness-profile/subject.standard@1",
    authoringAvailability: "recommended",
    requiredCheckIds: [
      "H01",
      "H02",
      "H03",
      "H04",
      "H05",
      "H06",
      "H07",
      "H08",
      "H09"
    ],
    aiMetadata: {
      displayName: "Standard Subject Harness",
      description: "Runs the complete H01-H09 capability-driven subject acceptance suite.",
      semanticTags: [
        "acceptance",
        "harness",
        "subject"
      ]
    }
  }
];
const mediumProfiles = [
  {
    kind: "medium-profile",
    id: "ground-air.standard",
    version: 1,
    resourceRef: "worldkit://medium-profile/ground-air.standard@1",
    authoringAvailability: "recommended",
    air: {
      gravityRatio: 1,
      linearDragPerSecond: 0.05
    },
    aiMetadata: {
      displayName: "Standard Ground Air",
      description: "Shared air medium facts for the first capability-driven subject packages.",
      semanticTags: [
        "air",
        "ground",
        "standard"
      ]
    }
  }
];
const motionKernels = [
  {
    kind: "motion-kernel",
    id: "K01.free-ground",
    version: 1,
    resourceRef: "worldkit://motion-kernel/free-ground@1",
    authoringAvailability: "recommended",
    implementationId: "free-ground",
    commandKind: "planar-vector",
    supportedMediums: [
      "ground",
      "air",
      "water"
    ],
    supportedBodyKinds: [
      "character"
    ],
    requiredCapabilityRefs: [
      "worldkit://capability/locomotion.ground@1"
    ],
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    deterministic: true,
    runtimeStatus: "implemented",
    aiMetadata: {
      displayName: "K01 Free Ground",
      description: "Camera-relative grounded movement, facing, support and jumping.",
      semanticTags: [
        "free-ground",
        "ground",
        "jump",
        "planar"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K02.forward-steer",
    version: 1,
    resourceRef: "worldkit://motion-kernel/forward-steer@1",
    authoringAvailability: "advanced",
    implementationId: "forward-steer",
    commandKind: "throttle-steer",
    supportedMediums: [
      "ground"
    ],
    supportedBodyKinds: [
      "character"
    ],
    requiredCapabilityRefs: [
      "worldkit://capability/locomotion.forward-steer@1"
    ],
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    deterministic: true,
    runtimeStatus: "implemented",
    aiMetadata: {
      displayName: "K02 Forward Steer",
      description: "Subject-local forward motion with gradual steering and no strafing.",
      semanticTags: [
        "forward",
        "ground",
        "steer"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K03.wheeled-arcade",
    version: 1,
    resourceRef: "worldkit://motion-kernel/wheeled-arcade@1",
    authoringAvailability: "advanced",
    implementationId: "wheeled-arcade",
    commandKind: "throttle-steer",
    supportedMediums: [
      "ground"
    ],
    supportedBodyKinds: [
      "character"
    ],
    requiredCapabilityRefs: [
      "worldkit://capability/locomotion.wheeled@1"
    ],
    fallbackMotionProfileRef: "worldkit://motion-profile/forward-steer.medium@1",
    deterministic: true,
    runtimeStatus: "implemented",
    aiMetadata: {
      displayName: "K03 Wheeled Arcade",
      description: "Deterministic arcade throttle, braking, reverse and speed-coupled steering.",
      semanticTags: [
        "arcade",
        "ground",
        "steer",
        "wheeled"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K04.surface-slide",
    version: 1,
    resourceRef: "worldkit://motion-kernel/surface-slide@1",
    authoringAvailability: "experimental",
    implementationId: "surface-slide",
    commandKind: "throttle-steer",
    supportedMediums: [
      "ground"
    ],
    supportedBodyKinds: [
      "character"
    ],
    requiredCapabilityRefs: [
      "worldkit://capability/locomotion.surface-slide@1"
    ],
    fallbackMotionProfileRef: "worldkit://motion-profile/forward-steer.medium@1",
    deterministic: true,
    runtimeStatus: "implemented",
    aiMetadata: {
      displayName: "K04 Surface Slide",
      description: "Slope, friction and inertia driven movement constrained to a support surface.",
      semanticTags: [
        "ground",
        "inertia",
        "slide",
        "surface"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K05.hover",
    version: 1,
    resourceRef: "worldkit://motion-kernel/hover@1",
    authoringAvailability: "internal",
    implementationId: "hover",
    commandKind: "throttle-steer",
    supportedMediums: [
      "air",
      "ground",
      "water"
    ],
    supportedBodyKinds: [
      "character",
      "rigid-body"
    ],
    requiredCapabilityRefs: [],
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    deterministic: true,
    runtimeStatus: "reserved",
    aiMetadata: {
      displayName: "K05 Hover",
      description: "Reserved height-holding locomotion contract.",
      semanticTags: [
        "height-hold",
        "hover",
        "reserved"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K06.water-surface",
    version: 1,
    resourceRef: "worldkit://motion-kernel/water-surface@1",
    authoringAvailability: "experimental",
    implementationId: "water-surface",
    commandKind: "throttle-steer",
    supportedMediums: [
      "water"
    ],
    supportedBodyKinds: [
      "character"
    ],
    requiredCapabilityRefs: [
      "worldkit://capability/locomotion.water-surface@1"
    ],
    fallbackMotionProfileRef: "worldkit://motion-profile/water-surface.safe@1",
    deterministic: true,
    runtimeStatus: "implemented",
    aiMetadata: {
      displayName: "K06 Water Surface",
      description: "Water-level hold, propulsion, drag and low-speed steering.",
      semanticTags: [
        "drag",
        "surface",
        "water"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K07.underwater",
    version: 1,
    resourceRef: "worldkit://motion-kernel/underwater@1",
    authoringAvailability: "internal",
    implementationId: "underwater",
    commandKind: "flight-attitude",
    supportedMediums: [
      "water"
    ],
    supportedBodyKinds: [
      "character",
      "rigid-body"
    ],
    requiredCapabilityRefs: [],
    fallbackMotionProfileRef: "worldkit://motion-profile/water-surface.safe@1",
    deterministic: true,
    runtimeStatus: "reserved",
    aiMetadata: {
      displayName: "K07 Underwater",
      description: "Reserved three-dimensional underwater locomotion contract.",
      semanticTags: [
        "reserved",
        "underwater",
        "water"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K08.unpowered-glide",
    version: 1,
    resourceRef: "worldkit://motion-kernel/unpowered-glide@1",
    authoringAvailability: "experimental",
    implementationId: "unpowered-glide",
    commandKind: "flight-attitude",
    supportedMediums: [
      "air"
    ],
    supportedBodyKinds: [
      "character"
    ],
    requiredCapabilityRefs: [
      "worldkit://capability/locomotion.unpowered-glide@1"
    ],
    fallbackMotionProfileRef: "worldkit://motion-profile/airborne.fall@1",
    deterministic: true,
    runtimeStatus: "implemented",
    aiMetadata: {
      displayName: "K08 Unpowered Glide",
      description: "Gravity-powered forward glide with pitch, yaw, bank and stall behavior.",
      semanticTags: [
        "air",
        "glide",
        "unpowered"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K09.powered-flight",
    version: 1,
    resourceRef: "worldkit://motion-kernel/powered-flight@1",
    authoringAvailability: "internal",
    implementationId: "powered-flight",
    commandKind: "flight-attitude",
    supportedMediums: [
      "air"
    ],
    supportedBodyKinds: [
      "character",
      "rigid-body"
    ],
    requiredCapabilityRefs: [],
    fallbackMotionProfileRef: "worldkit://motion-profile/airborne.fall@1",
    deterministic: true,
    runtimeStatus: "reserved",
    aiMetadata: {
      displayName: "K09 Powered Flight",
      description: "Reserved thrust, lift, climb and hover-capable flight contract.",
      semanticTags: [
        "air",
        "powered",
        "reserved"
      ]
    }
  },
  {
    kind: "motion-kernel",
    id: "K10.zero-gravity-six-dof",
    version: 1,
    resourceRef: "worldkit://motion-kernel/zero-gravity-six-dof@1",
    authoringAvailability: "internal",
    implementationId: "zero-gravity-six-dof",
    commandKind: "flight-attitude",
    supportedMediums: [
      "air"
    ],
    supportedBodyKinds: [
      "character",
      "rigid-body"
    ],
    requiredCapabilityRefs: [],
    fallbackMotionProfileRef: "worldkit://motion-profile/airborne.fall@1",
    deterministic: true,
    runtimeStatus: "reserved",
    aiMetadata: {
      displayName: "K10 Zero Gravity Six DOF",
      description: "Reserved translation and rotation contract without a fixed up direction.",
      semanticTags: [
        "reserved",
        "six-dof",
        "zero-gravity"
      ]
    }
  }
];
const motionProfiles = [
  {
    kind: "motion-profile",
    id: "safe-ground",
    version: 1,
    resourceRef: "worldkit://motion-profile/safe-ground@1",
    authoringAvailability: "internal",
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionTags: [
      "ground",
      "safe",
      "stopped"
    ],
    aiMetadata: {
      displayName: "Safe Ground Stop",
      description: "Internal zero-input grounded fallback that preserves collision and gravity.",
      semanticTags: [
        "fallback",
        "ground",
        "internal",
        "safe"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "free-ground.humanoid-medium",
    version: 1,
    resourceRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    authoringAvailability: "recommended",
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionTags: [
      "free-ground",
      "ground",
      "jump"
    ],
    aiMetadata: {
      displayName: "Medium Free Ground",
      description: "Golden medium character feel for camera-relative traversal.",
      semanticTags: [
        "ground",
        "humanoid",
        "medium"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "forward-steer.medium",
    version: 1,
    resourceRef: "worldkit://motion-profile/forward-steer.medium@1",
    authoringAvailability: "advanced",
    motionKernelRef: "worldkit://motion-kernel/forward-steer@1",
    motionTags: [
      "forward",
      "ground",
      "steer"
    ],
    aiMetadata: {
      displayName: "Medium Forward Steer",
      description: "Medium subject-local forward and steering feel.",
      semanticTags: [
        "forward",
        "medium",
        "steer"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "wheeled-arcade.medium",
    version: 1,
    resourceRef: "worldkit://motion-profile/wheeled-arcade.medium@1",
    authoringAvailability: "advanced",
    motionKernelRef: "worldkit://motion-kernel/wheeled-arcade@1",
    motionTags: [
      "arcade",
      "ground",
      "surface-fast",
      "wheeled"
    ],
    aiMetadata: {
      displayName: "Medium Wheeled Arcade",
      description: "Deterministic arcade vehicle feel for whitebox validation.",
      semanticTags: [
        "arcade",
        "experimental",
        "wheeled"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "surface-slide.skimmer",
    version: 1,
    resourceRef: "worldkit://motion-profile/surface-slide.skimmer@1",
    authoringAvailability: "experimental",
    motionKernelRef: "worldkit://motion-kernel/surface-slide@1",
    motionTags: [
      "ground",
      "slide",
      "surface-fast"
    ],
    aiMetadata: {
      displayName: "Surface Slide Skimmer",
      description: "Low-friction surface slide profile for the Skimmer PoC.",
      semanticTags: [
        "experimental",
        "skimmer",
        "slide"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "water-surface.safe",
    version: 1,
    resourceRef: "worldkit://motion-profile/water-surface.safe@1",
    authoringAvailability: "internal",
    motionKernelRef: "worldkit://motion-kernel/water-surface@1",
    motionTags: [
      "safe",
      "surface",
      "water"
    ],
    aiMetadata: {
      displayName: "Safe Water Surface",
      description: "Internal passive water-surface fallback.",
      semanticTags: [
        "fallback",
        "internal",
        "safe",
        "water"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "water-surface.kayak",
    version: 1,
    resourceRef: "worldkit://motion-profile/water-surface.kayak@1",
    authoringAvailability: "experimental",
    motionKernelRef: "worldkit://motion-kernel/water-surface@1",
    motionTags: [
      "surface",
      "water",
      "watercraft"
    ],
    aiMetadata: {
      displayName: "Water Surface Kayak",
      description: "Low-speed water surface propulsion and steering for the Kayak PoC.",
      semanticTags: [
        "experimental",
        "kayak",
        "water"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "airborne.fall",
    version: 1,
    resourceRef: "worldkit://motion-profile/airborne.fall@1",
    authoringAvailability: "internal",
    motionKernelRef: "worldkit://motion-kernel/unpowered-glide@1",
    motionTags: [
      "air",
      "fall",
      "safe"
    ],
    aiMetadata: {
      displayName: "Ballistic Fall",
      description: "Internal gravity-only air fallback.",
      semanticTags: [
        "air",
        "fallback",
        "fall",
        "internal"
      ]
    }
  },
  {
    kind: "motion-profile",
    id: "unpowered-glide.paraglider",
    version: 1,
    resourceRef: "worldkit://motion-profile/unpowered-glide.paraglider@1",
    authoringAvailability: "experimental",
    motionKernelRef: "worldkit://motion-kernel/unpowered-glide@1",
    motionTags: [
      "air",
      "flight",
      "glide"
    ],
    aiMetadata: {
      displayName: "Unpowered Glide Paraglider",
      description: "Simplified deterministic paraglider profile.",
      semanticTags: [
        "experimental",
        "glide",
        "paraglider"
      ]
    }
  }
];
const poseSets = [{ "kind": "pose-set-profile", "id": "static.whitebox", "version": 1, "resourceRef": "worldkit://pose-set/static.whitebox@1", "authoringAvailability": "recommended", "poseIds": ["idle", "move", "fall"], "defaultPoseId": "idle", "aiMetadata": { "displayName": "Static Whitebox Pose Set", "description": "Semantic fallback poses for primitive whitebox subjects.", "semanticTags": ["pose", "static", "whitebox"] } }];
const renderBindings = [{ "kind": "render-binding-profile", "id": "subject.standard", "version": 1, "resourceRef": "worldkit://render-binding/subject.standard@1", "authoringAvailability": "recommended", "publishedStateFields": ["semanticClassId", "bodyTopology", "forwardXYZ", "speedMetersPerSecond", "movementMedium", "activeMotionKernelRef", "activeActionId", "relationshipRole"], "aiMetadata": { "displayName": "Standard Subject Render Binding", "description": "Publishes stable movement and relationship facts to whitebox and world-model renderers.", "semanticTags": ["render-binding", "subject"] } }];
const poseAndRenderCatalog = {
  poseSets,
  renderBindings
};
const relationshipProfiles = [
  {
    kind: "relationship-profile",
    id: "R01.seat.driver",
    version: 1,
    resourceRef: "worldkit://relationship-profile/seat.driver@1",
    authoringAvailability: "experimental",
    relationshipType: "seat",
    runtimeStatus: "reserved",
    requiredOccupantSocketIds: [
      "SeatAlignment"
    ],
    requiredSeatSocketIds: [
      "DriverSeat"
    ],
    aiMetadata: {
      displayName: "R01 Driver Seat",
      description: "Frozen seat alignment and control-transfer vocabulary; runtime behavior is reserved in this phase.",
      semanticTags: [
        "driver",
        "seat"
      ]
    }
  },
  {
    kind: "relationship-profile",
    id: "R03.tether.standard",
    version: 1,
    resourceRef: "worldkit://relationship-profile/tether.standard@1",
    authoringAvailability: "experimental",
    relationshipType: "tether",
    runtimeStatus: "reserved",
    requiredTetheredSocketIds: [
      "TetherSource"
    ],
    requiredTetherAnchorSocketIds: [
      "TetherTarget"
    ],
    aiMetadata: {
      displayName: "R03 Standard Tether",
      description: "Frozen bounded tether vocabulary for composite subjects; runtime behavior is reserved in this phase.",
      semanticTags: [
        "constraint",
        "tether"
      ]
    }
  },
  {
    kind: "relationship-profile",
    id: "R02.mounted-on.stand-ground",
    version: 1,
    resourceRef: "worldkit://relationship-profile/mounted-on.stand-ground@1",
    authoringAvailability: "internal",
    relationshipType: "mountedOn",
    runtimeStatus: "implemented",
    requiredRiderSocketIds: [
      "FootAlignment"
    ],
    requiredMountSocketIds: [
      "MountStand"
    ],
    controlTransferMode: "to-mount",
    cameraTargetRole: "controlled-entity",
    maximumMountDistanceMeters: 2,
    aiMetadata: {
      displayName: "R02 Mounted On Stand Ground",
      description: "Implemented mountedOn stand-slot relationship for the Ground skateboard slice.",
      semanticTags: [
        "mountedOn",
        "skateboard",
        "stand"
      ]
    }
  }
];
const CAPABILITY_MANIFESTS = [
  {
    kind: "capability",
    id: "locomotion.forward-steer",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.forward-steer@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["forward-steer", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Forward Steer Locomotion",
      description: "Subject-local forward and reverse travel with steering.",
      semanticTags: ["forward", "locomotion", "steer"]
    }
  },
  {
    kind: "capability",
    id: "locomotion.wheeled",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.wheeled@1",
    requiredCapabilityRefs: ["worldkit://capability/locomotion.forward-steer@1"],
    providedFeatures: ["wheeled-locomotion", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Wheeled Arcade Locomotion",
      description: "Arcade four-wheel motion expressed through the shared steer command.",
      semanticTags: ["arcade", "locomotion", "wheeled"]
    }
  },
  {
    kind: "capability",
    id: "locomotion.surface-slide",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.surface-slide@1",
    requiredCapabilityRefs: ["worldkit://capability/locomotion.forward-steer@1"],
    providedFeatures: ["surface-slide", "controllable", "motion-switch"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Surface Slide Locomotion",
      description: "Inertial travel constrained to a support surface.",
      semanticTags: ["locomotion", "slide", "surface"]
    }
  },
  {
    kind: "capability",
    id: "locomotion.water-surface",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.water-surface@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["water-surface-locomotion", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Water Surface Locomotion",
      description: "Surface-height constrained propulsion and steering.",
      semanticTags: ["locomotion", "surface", "water"]
    }
  },
  {
    kind: "capability",
    id: "locomotion.unpowered-glide",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.unpowered-glide@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["unpowered-glide", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Unpowered Glide",
      description: "Gravity-powered glide using shared flight-attitude intent.",
      semanticTags: ["glide", "locomotion", "unpowered"]
    }
  },
  {
    kind: "capability",
    id: "relationship.seat",
    version: 1,
    resourceRef: "worldkit://capability/relationship.seat@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["seat"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Seat Relationship",
      description: "Seat alignment, control transfer and camera target facts.",
      semanticTags: ["relationship", "seat"]
    }
  },
  {
    kind: "capability",
    id: "relationship.tether",
    version: 1,
    resourceRef: "worldkit://capability/relationship.tether@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["tether"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Tether Relationship",
      description: "Bounded anchor-to-anchor relationship with safe disconnection.",
      semanticTags: ["relationship", "tether"]
    }
  },
  {
    kind: "capability",
    id: "relationship.mounted-on",
    version: 1,
    resourceRef: "worldkit://capability/relationship.mounted-on@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["mountedOn"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Mounted On Relationship",
      description: "Role-qualified mountedOn relationship with implemented Ground stand-slot behavior.",
      semanticTags: ["mountedOn", "relationship", "implemented"]
    }
  }
];
const BUILT_IN_CAPABILITY_RESOURCES = [
  ...motionKernels,
  ...motionProfiles,
  ...controlFeelProfiles,
  ...controlProfiles,
  ...cameraCatalog.algorithms,
  ...cameraCatalog.profiles,
  ...cameraCatalog.modifiers,
  ...cameraCatalog.contexts,
  ...mediumProfiles,
  ...relationshipProfiles,
  ...harnessProfiles,
  ...poseAndRenderCatalog.poseSets,
  ...poseAndRenderCatalog.renderBindings
];
const BUILT_IN_CAPABILITY_MANIFESTS = CAPABILITY_MANIFESTS;
const subjectDefinitionsV3 = /* @__PURE__ */ JSON.parse('[{"kind":"subject-definition","schemaVersion":3,"id":"animal.quadruped.forward-steer","version":1,"resourceRef":"worldkit://subject-definition/animal.quadruped.forward-steer@1","authoringAvailability":"advanced","category":"animal","bodyTopology":"quadruped","semanticClassId":"subject.animal.quadruped","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"body","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.8,0.7,1.5]},"localTransform":{"positionMetersXYZ":[0,0.8,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["body"]},{"id":"head","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.55,0.55,0.6]},"localTransform":{"positionMetersXYZ":[0,0.95,-0.95],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["head"]},{"id":"legs","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.65,0.65,1.1]},"localTransform":{"positionMetersXYZ":[0,0.33,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["legs"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.9,-1.2],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]},{"id":"MountSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,1.25,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["mount","relationship"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1","worldkit://control-feel-profile/humanoid.heavy-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.mounted-on@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","aiMetadata":{"displayName":"Quadruped Forward Steer","description":"Whitebox quadruped using the reusable K02 forward-steer kernel.","semanticTags":["animal","forward-steer","quadruped","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"animal.quadruped.forward-steer","version":2,"resourceRef":"worldkit://subject-definition/animal.quadruped.forward-steer@2","authoringAvailability":"advanced","category":"animal","bodyTopology":"quadruped","semanticClassId":"subject.animal.quadruped","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"body","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.8,0.7,1.5]},"localTransform":{"positionMetersXYZ":[0,0.8,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["body"]},{"id":"head","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.55,0.55,0.6]},"localTransform":{"positionMetersXYZ":[0,0.95,-0.95],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["head"]},{"id":"legs","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.65,0.65,1.1]},"localTransform":{"positionMetersXYZ":[0,0.33,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["legs"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.9,-1.2],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]},{"id":"MountSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,1.25,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["mount","relationship"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.quadruped-official@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.mounted-on@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","aiMetadata":{"displayName":"Quadruped Forward Steer Official v2","description":"Reviewed quadruped public default with versioned P1.5 Control Feel and Camera Profiles.","semanticTags":["animal","forward-steer","official","quadruped","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"glider.paraglider.unpowered","version":1,"resourceRef":"worldkit://subject-definition/glider.paraglider.unpowered@1","authoringAvailability":"experimental","category":"composite","bodyTopology":"glider","semanticClassId":"subject.glider.paraglider","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"pilot","kind":"primitive","shape":{"kind":"capsule","radiusMeters":0.28,"heightMeters":1.45},"localTransform":{"positionMetersXYZ":[0,0.725,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["pilot"]},{"id":"canopy","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[5.5,0.18,1.7]},"localTransform":{"positionMetersXYZ":[0,4.2,0.3],"rotationEulerRadiansXYZ":[0.08,0,0]},"colliderContribution":"exclude","semanticTags":["canopy","wing"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"TetherSource","kind":"local","localTransform":{"positionMetersXYZ":[0,1.55,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["pilot","tether"]},{"id":"TetherTarget","kind":"local","localTransform":{"positionMetersXYZ":[0,3.9,0.2],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["canopy","tether"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1.4,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,1.5,-3],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.unpowered-glide@1","worldkit://capability/relationship.tether@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.tether@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","aiMetadata":{"displayName":"Unpowered Paraglider","description":"Whitebox pilot and canopy package using K08 unpowered glide and R03 tether facts.","semanticTags":["air","glide","paraglider","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"surface-craft.ice-skimmer","version":1,"resourceRef":"worldkit://subject-definition/surface-craft.ice-skimmer@1","authoringAvailability":"experimental","category":"vehicle","bodyTopology":"surface-craft","semanticClassId":"subject.surface-craft.skimmer","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"deck","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[1.4,0.25,2.8]},"localTransform":{"positionMetersXYZ":[0,0.125,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["deck","skimmer"]},{"id":"seat","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.7,0.7,0.8]},"localTransform":{"positionMetersXYZ":[0,0.7,0.3],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["seat"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"DriverSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,0.95,0.25],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["driver","seat"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,0.9,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.5,-2.5],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1","worldkit://capability/locomotion.surface-slide@1","worldkit://capability/relationship.seat@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.seat@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","aiMetadata":{"displayName":"Ice Skimmer","description":"Whitebox surface craft using K04 slope, friction and inertia motion.","semanticTags":["ice","skimmer","surface-slide","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"vehicle.four-wheel.arcade","version":1,"resourceRef":"worldkit://subject-definition/vehicle.four-wheel.arcade@1","authoringAvailability":"experimental","category":"vehicle","bodyTopology":"four-wheel","semanticClassId":"subject.vehicle.four-wheel","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"body","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[1.8,0.8,3.6]},"localTransform":{"positionMetersXYZ":[0,0.4,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["body","vehicle"]},{"id":"cabin","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[1.45,0.75,1.7]},"localTransform":{"positionMetersXYZ":[0,1.3,0.15],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["cabin"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"DriverSeat","kind":"local","localTransform":{"positionMetersXYZ":[-0.35,1.25,0.25],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["driver","seat"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1.1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.8,-3],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1","worldkit://capability/locomotion.wheeled@1","worldkit://capability/relationship.seat@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.seat@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","aiMetadata":{"displayName":"Four-wheel Arcade","description":"Whitebox four-wheel package using simplified deterministic K03 motion.","semanticTags":["arcade","four-wheel","vehicle","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"watercraft.kayak.surface","version":1,"resourceRef":"worldkit://subject-definition/watercraft.kayak.surface@1","authoringAvailability":"experimental","category":"composite","bodyTopology":"watercraft","semanticClassId":"subject.watercraft.kayak","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"hull","kind":"primitive","shape":{"kind":"capsule","radiusMeters":0.42,"heightMeters":3.2},"localTransform":{"positionMetersXYZ":[0,0.42,0],"rotationEulerRadiansXYZ":[1.5707963267948966,0,0]},"colliderContribution":"include","semanticTags":["hull","kayak"]},{"id":"paddler","kind":"primitive","shape":{"kind":"capsule","radiusMeters":0.25,"heightMeters":1.15},"localTransform":{"positionMetersXYZ":[0,0.85,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"exclude","semanticTags":["paddler"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"DriverSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,0.55,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["driver","seat"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.4,-2.3],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.water-surface@1","worldkit://capability/relationship.seat@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.seat@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","aiMetadata":{"displayName":"Kayak Surface Package","description":"Whitebox kayak and paddler package using K06 water-surface motion.","semanticTags":["kayak","water-surface","watercraft","whitebox"]}}]');
function selectableControlFeelProfileRefsV1(profiles2) {
  if (isNil(profiles2.controlFeelProfileRef) || profiles2.controlFeelProfileRef === "") {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: default Control Feel Profile is missing."
    );
  }
  if (!Array.isArray(profiles2.allowedControlFeelProfileRefs) || isEmpty(profiles2.allowedControlFeelProfileRefs)) {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_ALLOWED_REQUIRED: allowed Control Feel Profile refs are missing."
    );
  }
  const uniqueAllowed = uniq(profiles2.allowedControlFeelProfileRefs);
  if (uniqueAllowed.length !== profiles2.allowedControlFeelProfileRefs.length) {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_ALLOWED_DUPLICATE: allowed Control Feel Profile refs must be unique."
    );
  }
  if (!uniqueAllowed.includes(profiles2.controlFeelProfileRef)) {
    throw new Error(
      `SUBJECT_CONTROL_FEEL_DEFAULT_NOT_ALLOWED: '${profiles2.controlFeelProfileRef}' is not in allowedControlFeelProfileRefs.`
    );
  }
  return [
    profiles2.controlFeelProfileRef,
    ...uniqueAllowed.filter((resourceRef) => resourceRef !== profiles2.controlFeelProfileRef)
  ];
}
const RELATIONSHIP_PROFILE_REF_BY_CAPABILITY_REF_V1 = Object.freeze({
  "worldkit://capability/relationship.mounted-on@1": "worldkit://relationship-profile/mounted-on.stand-ground@1",
  "worldkit://capability/relationship.seat@1": "worldkit://relationship-profile/seat.driver@1",
  "worldkit://capability/relationship.tether@1": "worldkit://relationship-profile/tether.standard@1"
});
function edge(sourceResourceRef, sourcePath, targetResourceRef, expectedResourceKinds, type2) {
  return Object.freeze({
    sourceResourceRef,
    sourcePath,
    targetResourceRef,
    expectedResourceKinds: Object.freeze([...expectedResourceKinds]),
    type: type2
  });
}
function edgesForRefs(sourceResourceRef, sourcePath, targetResourceRefs, expectedResourceKinds, type2) {
  return targetResourceRefs.map((targetResourceRef, index) => edge(
    sourceResourceRef,
    `${sourcePath}/${index}`,
    targetResourceRef,
    expectedResourceKinds,
    type2
  ));
}
function listSubjectRegistryReferenceEdgesV1(resource) {
  const sourceResourceRef = resource.resourceRef;
  const edges = [];
  switch (resource.kind) {
    case "rig-profile":
      edges.push(...edgesForRefs(
        sourceResourceRef,
        "/compatibleSubjectAssetRefs",
        resource.compatibleSubjectAssetRefs,
        ["subject-asset"],
        "metadata"
      ));
      break;
    case "animation-set":
      edges.push(
        edge(
          sourceResourceRef,
          "/subjectAssetRef",
          resource.subjectAssetRef,
          ["subject-asset"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/rigProfileRef",
          resource.rigProfileRef,
          ["rig-profile"],
          "dependency"
        )
      );
      break;
    case "capability":
      edges.push(
        ...edgesForRefs(
          sourceResourceRef,
          "/requiredCapabilityRefs",
          resource.requiredCapabilityRefs,
          ["capability"],
          "dependency"
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/conflictingCapabilityRefs",
          resource.conflictingCapabilityRefs,
          ["capability"],
          "metadata"
        )
      );
      break;
    case "locomotion-profile":
      edges.push(...edgesForRefs(
        sourceResourceRef,
        "/requiredCapabilityRefs",
        resource.requiredCapabilityRefs,
        ["capability"],
        "dependency"
      ));
      break;
    case "motion-kernel":
      edges.push(
        ...edgesForRefs(
          sourceResourceRef,
          "/requiredCapabilityRefs",
          resource.requiredCapabilityRefs,
          ["capability"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/fallbackMotionProfileRef",
          resource.fallbackMotionProfileRef,
          ["motion-profile"],
          "back-reference"
        )
      );
      break;
    case "motion-profile":
      edges.push(edge(
        sourceResourceRef,
        "/motionKernelRef",
        resource.motionKernelRef,
        ["motion-kernel"],
        "dependency"
      ));
      break;
    case "camera-rig-profile":
      edges.push(edge(
        sourceResourceRef,
        "/algorithmRef",
        resource.algorithmRef,
        ["camera-rig-algorithm"],
        "dependency"
      ));
      break;
    case "camera-context-profile":
      edges.push(edge(
        sourceResourceRef,
        "/defaultCameraRigProfileRef",
        resource.defaultCameraRigProfileRef,
        ["camera-rig-profile"],
        "dependency"
      ));
      if (resource.firstPersonCameraRigProfileRef !== void 0) {
        edges.push(edge(
          sourceResourceRef,
          "/firstPersonCameraRigProfileRef",
          resource.firstPersonCameraRigProfileRef,
          ["camera-rig-profile"],
          "dependency"
        ));
      }
      resource.rules.forEach((rule, ruleIndex) => {
        edges.push(...edgesForRefs(
          sourceResourceRef,
          `/rules/${ruleIndex}/when/motionKernelRefs`,
          rule.when.motionKernelRefs ?? [],
          ["motion-kernel"],
          "metadata"
        ));
        if (rule.cameraRigProfileRef !== void 0) {
          edges.push(edge(
            sourceResourceRef,
            `/rules/${ruleIndex}/cameraRigProfileRef`,
            rule.cameraRigProfileRef,
            ["camera-rig-profile"],
            "dependency"
          ));
        }
        edges.push(...edgesForRefs(
          sourceResourceRef,
          `/rules/${ruleIndex}/cameraModifierRefs`,
          rule.cameraModifierRefs ?? [],
          ["camera-modifier-profile"],
          "dependency"
        ));
      });
      break;
    case "subject-definition":
      resource.visualParts.forEach((visualPart, partIndex) => {
        if (visualPart.kind !== "asset") return;
        edges.push(edge(
          sourceResourceRef,
          `/visualParts/${partIndex}/subjectAssetRef`,
          visualPart.subjectAssetRef,
          ["subject-asset"],
          "dependency"
        ));
      });
      if (resource.visualBinding.mode === "rigged") {
        edges.push(
          edge(
            sourceResourceRef,
            "/visualBinding/rigProfileRef",
            resource.visualBinding.rigProfileRef,
            ["rig-profile"],
            "dependency"
          ),
          edge(
            sourceResourceRef,
            "/visualBinding/animationSetRef",
            resource.visualBinding.animationSetRef,
            ["animation-set"],
            "dependency"
          )
        );
      }
      edges.push(edge(
        sourceResourceRef,
        resource.colliderPolicy.kind === "profile" ? "/colliderPolicy/colliderProfileRef" : "/colliderPolicy/colliderDerivationProfileRef",
        resource.colliderPolicy.kind === "profile" ? resource.colliderPolicy.colliderProfileRef : resource.colliderPolicy.colliderDerivationProfileRef,
        [resource.colliderPolicy.kind === "profile" ? "collider-profile" : "collider-derivation-profile"],
        "dependency"
      ));
      edges.push(
        ...edgesForRefs(
          sourceResourceRef,
          "/capabilityRefs",
          resource.capabilityRefs,
          ["capability"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/physicsBodyProfileRef",
          resource.profiles.physicsBodyProfileRef,
          ["physics-body-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/locomotionProfileRef",
          resource.profiles.locomotionProfileRef,
          ["locomotion-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/controlFeelProfileRef",
          resource.profiles.controlFeelProfileRef,
          ["control-feel-profile"],
          "dependency"
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/profiles/allowedControlFeelProfileRefs",
          resource.profiles.allowedControlFeelProfileRefs,
          ["control-feel-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/motion/defaultMotionProfileRef",
          resource.profiles.motion.defaultMotionProfileRef,
          ["motion-profile"],
          "dependency"
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/profiles/motion/optionalMotionProfileRefs",
          resource.profiles.motion.optionalMotionProfileRefs,
          ["motion-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/motion/fallbackMotionProfileRef",
          resource.profiles.motion.fallbackMotionProfileRef,
          ["motion-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/controlProfileRef",
          resource.profiles.controlProfileRef,
          ["control-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/cameraContextProfileRef",
          resource.profiles.cameraContextProfileRef,
          ["camera-context-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/mediumProfileRef",
          resource.profiles.mediumProfileRef,
          ["medium-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/profiles/harnessProfileRef",
          resource.profiles.harnessProfileRef,
          ["harness-profile"],
          "dependency"
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/relationshipCapabilityRefs",
          resource.relationshipCapabilityRefs,
          ["capability"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/actionOrPoseSetRef",
          resource.actionOrPoseSetRef,
          ["animation-set", "pose-set-profile"],
          "dependency"
        ),
        edge(
          sourceResourceRef,
          "/renderBindingProfileRef",
          resource.renderBindingProfileRef,
          ["render-binding-profile"],
          "dependency"
        )
      );
      resource.relationshipCapabilityRefs.forEach((capabilityRef, index) => {
        const relationshipProfileRef = RELATIONSHIP_PROFILE_REF_BY_CAPABILITY_REF_V1[capabilityRef];
        if (relationshipProfileRef === void 0) return;
        edges.push(edge(
          sourceResourceRef,
          `/relationshipCapabilityRefs/${index}`,
          relationshipProfileRef,
          ["relationship-profile"],
          "dependency"
        ));
      });
      break;
  }
  return Object.freeze(edges);
}
const LOCOMOTION_ALLOWED_KEYS = /* @__PURE__ */ new Set([
  "kind",
  "id",
  "version",
  "resourceRef",
  "aiMetadata",
  "requiredCapabilityRefs",
  "allowWalk",
  "allowRun",
  "allowJump"
]);
const LOCOMOTION_SPEED_FIELD_PATTERN = /Speed|Acceleration|Deceleration|TurnRate|Gravity|Slope|StepHeight|Seconds|Meters|Radians|Ratio/;
const LOCOMOTION_FORBIDDEN_OBJECT_KEYS = /* @__PURE__ */ new Set([
  "locomotion",
  "parameters",
  "tuning",
  "supportedMediums",
  "allowedMotionKernelRefs"
]);
const MOTION_ALLOWED_KEYS = /* @__PURE__ */ new Set([
  "kind",
  "id",
  "version",
  "resourceRef",
  "authoringAvailability",
  "aiMetadata",
  "motionKernelRef",
  "motionTags"
]);
const MOTION_KERNEL_ALLOWED_KEYS = /* @__PURE__ */ new Set([
  "kind",
  "id",
  "version",
  "resourceRef",
  "authoringAvailability",
  "aiMetadata",
  "implementationId",
  "commandKind",
  "supportedMediums",
  "supportedBodyKinds",
  "requiredCapabilityRefs",
  "fallbackMotionProfileRef",
  "deterministic",
  "runtimeStatus",
  "contentHash"
]);
const MOTION_NUMERIC_FIELD_PATTERN = /Speed|Acceleration|Deceleration|TurnRate|Gravity|Slope|StepHeight|Seconds|Meters|Radians|Ratio/;
const MEDIUM_FORBIDDEN_KEYS = /* @__PURE__ */ new Set([
  "supportedMediums",
  "ground",
  "water",
  "gravityScale"
]);
const CONTROL_FEEL_BOUNDS = {
  walkSpeedMetersPerSecond: [0, 8],
  runSpeedMetersPerSecond: [0, 12],
  jumpSpeedMetersPerSecond: [0, 12],
  accelerationMetersPerSecondSquared: [0, 60],
  decelerationMetersPerSecondSquared: [0, 80],
  turnRateRadiansPerSecond: [0, 20],
  moveResponseExponent: [1, 3],
  airControlRatio: [0, 1],
  coyoteTimeSeconds: [0, 0.4],
  jumpBufferSeconds: [0, 0.4],
  variableJumpHoldSeconds: [0, 0.5],
  jumpHoldGravityRatio: [0.1, 1],
  jumpReleaseGravityRatio: [1, 5]
};
function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function duplicateValue(values) {
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return void 0;
}
function validateAnimationSet(source) {
  const duplicateRequiredActionId = duplicateValue(source.requiredActionIds);
  if (duplicateRequiredActionId !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_ACTION_ID: '${duplicateRequiredActionId}' in '${source.resourceRef}'.`
    );
  }
  const duplicateBindingActionId = duplicateValue(
    source.animationBindings.map((binding) => binding.actionId)
  );
  if (duplicateBindingActionId !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_ACTION_ID: '${duplicateBindingActionId}' in '${source.resourceRef}'.`
    );
  }
  const duplicateClipName = duplicateValue(
    source.animationBindings.map((binding) => binding.sourceClipName)
  );
  if (duplicateClipName !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_CLIP_MAPPING: '${duplicateClipName}' in '${source.resourceRef}'.`
    );
  }
}
function validateSubjectAsset(source) {
  const duplicateClipName = duplicateValue(source.inventory.animationClipNames);
  if (duplicateClipName !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_CLIP_NAME: '${duplicateClipName}' in '${source.resourceRef}'.`
    );
  }
}
function validateCanonicalizedSemanticTags(source) {
  const duplicateSemanticTag = duplicateValue(source.aiMetadata.semanticTags);
  if (duplicateSemanticTag !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_SEMANTIC_TAG: '${duplicateSemanticTag}' in '${source.resourceRef}'.`
    );
  }
}
function validateRigProfile(source) {
  const duplicateBoneId = duplicateValue(source.requiredBoneIds);
  if (duplicateBoneId !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_BONE_ID: '${duplicateBoneId}' in '${source.resourceRef}'.`
    );
  }
  const duplicateCompatibleRef = duplicateValue(source.compatibleSubjectAssetRefs);
  if (duplicateCompatibleRef !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_COMPATIBLE_REF: '${duplicateCompatibleRef}' in '${source.resourceRef}'.`
    );
  }
}
function validateColliderProfile(source) {
  const duplicateBodyTopology = duplicateValue(source.supportedBodyTopologies);
  if (duplicateBodyTopology !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_BODY_TOPOLOGY: '${duplicateBodyTopology}' in '${source.resourceRef}'.`
    );
  }
}
function sortedStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}
function canonicalizeNewResourceCollections(source) {
  const input = structuredClone(source);
  switch (input.kind) {
    case "subject-asset":
      return {
        ...input,
        inventory: {
          ...input.inventory,
          animationClipNames: sortedStrings(input.inventory.animationClipNames)
        },
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags)
        }
      };
    case "rig-profile":
      return {
        ...input,
        compatibleSubjectAssetRefs: sortedStrings(input.compatibleSubjectAssetRefs),
        requiredBoneIds: sortedStrings(input.requiredBoneIds),
        sourceNodeNameByBoneId: Object.fromEntries(
          Object.entries(input.sourceNodeNameByBoneId).sort(([left], [right]) => left.localeCompare(right))
        ),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags)
        }
      };
    case "animation-set":
      return {
        ...input,
        requiredActionIds: sortedStrings(input.requiredActionIds),
        animationBindings: [...input.animationBindings].sort((left, right) => left.actionId.localeCompare(right.actionId)),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags)
        }
      };
    case "collider-profile":
      return {
        ...input,
        supportedBodyTopologies: sortedStrings(input.supportedBodyTopologies),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags)
        }
      };
    default:
      return {
        ...input,
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags)
        }
      };
  }
}
function lockResource(source) {
  const { contentHash: _ignoredContentHash, ...sourceWithoutContentHash } = source;
  const hashInput = canonicalizeNewResourceCollections(
    sourceWithoutContentHash
  );
  return deepFreeze({
    ...hashInput,
    contentHash: sha256CanonicalJson(hashInput)
  });
}
function validateLocomotionProfile(source) {
  const rawSource = source;
  for (const key of Object.keys(rawSource)) {
    if (LOCOMOTION_FORBIDDEN_OBJECT_KEYS.has(key)) {
      throw new Error(
        key === "locomotion" ? `LOCOMOTION_PROFILE_SPEED_FORBIDDEN: '${source.resourceRef}'.` : `LOCOMOTION_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`
      );
    }
    if (!LOCOMOTION_ALLOWED_KEYS.has(key)) {
      throw new Error(
        LOCOMOTION_SPEED_FIELD_PATTERN.test(key) ? `LOCOMOTION_PROFILE_SPEED_FORBIDDEN: '${source.resourceRef}'.` : `LOCOMOTION_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`
      );
    }
  }
  if (source.allowWalk !== true) {
    throw new Error(
      `LOCOMOTION_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}' requires allowWalk === true.`
    );
  }
}
function validateMotionProfile(source) {
  const rawSource = source;
  if ("parameters" in rawSource || "safetyLimits" in rawSource || "authoringRanges" in rawSource) {
    throw new Error(
      `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN: '${source.resourceRef}'.`
    );
  }
  for (const key of Object.keys(rawSource)) {
    if (!MOTION_ALLOWED_KEYS.has(key) && MOTION_NUMERIC_FIELD_PATTERN.test(key)) {
      throw new Error(
        `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN: '${source.resourceRef}'.`
      );
    }
  }
}
function validateMotionKernel(source) {
  const unknownField2 = Object.keys(source).find(
    (fieldName) => !MOTION_KERNEL_ALLOWED_KEYS.has(fieldName)
  );
  if (unknownField2 !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_FIELD: '${unknownField2}' in '${source.resourceRef}'.`
    );
  }
}
function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}
function validateControlFeelProfile(source) {
  for (const [fieldName, [minimum, maximum]] of Object.entries(CONTROL_FEEL_BOUNDS)) {
    const value = source[fieldName];
    if (typeof value !== "number" || !isFiniteInRange(value, minimum, maximum)) {
      throw new Error(
        `CONTROL_FEEL_PROFILE_INVALID: '${fieldName}' in '${source.resourceRef}'.`
      );
    }
  }
  if (source.walkSpeedMetersPerSecond > source.runSpeedMetersPerSecond) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: walkSpeedMetersPerSecond exceeds runSpeedMetersPerSecond in '${source.resourceRef}'.`
    );
  }
  if (source.airControlRatio < 0 || source.airControlRatio > 1) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: airControlRatio in '${source.resourceRef}'.`
    );
  }
  if (source.jumpHoldGravityRatio < 0 || source.jumpHoldGravityRatio > 1) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: jumpHoldGravityRatio in '${source.resourceRef}'.`
    );
  }
  if (source.jumpReleaseGravityRatio < 1) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: jumpReleaseGravityRatio in '${source.resourceRef}'.`
    );
  }
}
function validateControlProfile(source) {
  if (!Number.isFinite(source.moveDeadzoneRatio) || source.moveDeadzoneRatio < 0 || source.moveDeadzoneRatio > 0.4) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CONTROL_INPUT_TUNING: '${source.resourceRef}'.`
    );
  }
  const hasExecutablePolicyCombination = (() => {
    switch (source.commandKind) {
      case "planar-vector":
        return source.inputSpace === "camera-relative" && (source.facingPolicy === "align-to-move" || source.facingPolicy === "align-to-view");
      case "none":
        return source.inputSpace === "none" && source.facingPolicy === "fixed" && source.lateralMovementPolicy === "forbidden";
      default:
        return false;
    }
  })();
  if (!hasExecutablePolicyCombination) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CONTROL_PROFILE_COMBINATION: '${source.resourceRef}'.`
    );
  }
}
function validateMediumProfile(source) {
  const rawSource = source;
  for (const key of Object.keys(rawSource)) {
    if (MEDIUM_FORBIDDEN_KEYS.has(key)) {
      throw new Error(
        `MEDIUM_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`
      );
    }
  }
  const ground = rawSource.ground;
  if (ground !== void 0 && typeof ground === "object" && ground !== null && "groundingToleranceMeters" in ground) {
    throw new Error(
      `MEDIUM_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`
    );
  }
  if (!isFiniteInRange(source.air.gravityRatio, 0, 4) || !isFiniteInRange(source.air.linearDragPerSecond, 0, 20)) {
    throw new Error(
      `MEDIUM_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`
    );
  }
}
function validatePhysicsBodyProfile(source) {
  const { maxSlopeDegrees, maxStepHeightMeters } = source.physicsBody;
  if (!Number.isFinite(maxSlopeDegrees) || maxSlopeDegrees <= 0 || maxSlopeDegrees > 90 || !Number.isFinite(maxStepHeightMeters) || maxStepHeightMeters < 0 || maxStepHeightMeters > 2) {
    throw new Error(
      `PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID: '${source.resourceRef}'.`
    );
  }
}
function validateSubjectDefinitionV3(source) {
  const controlFeelProfileRef = source.profiles.controlFeelProfileRef;
  if (isNil(controlFeelProfileRef) || controlFeelProfileRef === "") {
    throw new Error(
      `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: '${source.resourceRef}'.`
    );
  }
  selectableControlFeelProfileRefsV1(source.profiles);
  if (source.profiles.motion.defaultMotionProfileRef === source.profiles.motion.fallbackMotionProfileRef) {
    throw new Error(`MOTION_FALLBACK_DEFAULT_COLLISION: '${source.resourceRef}'.`);
  }
}
function hasInvalidCameraParameters(parameters) {
  const negativeAllowed = /* @__PURE__ */ new Set([
    "shoulderOffsetMeters",
    "pitchRadians",
    "minimumPitchRadians",
    "maximumPitchRadians"
  ]);
  const containsInvalidNumber = Object.entries(parameters).some(
    ([name, value]) => !Number.isFinite(value) || !negativeAllowed.has(name) && value < 0
  );
  const minimumDistance = parameters.minimumDistanceMeters;
  const maximumDistance = parameters.maximumDistanceMeters;
  const distance = parameters.distanceMeters;
  const minimumPitch = parameters.minimumPitchRadians;
  const maximumPitch = parameters.maximumPitchRadians;
  const pitch = parameters.pitchRadians;
  return containsInvalidNumber || minimumDistance !== void 0 && maximumDistance !== void 0 && minimumDistance > maximumDistance || distance !== void 0 && minimumDistance !== void 0 && distance < minimumDistance || distance !== void 0 && maximumDistance !== void 0 && distance > maximumDistance || minimumPitch !== void 0 && maximumPitch !== void 0 && minimumPitch > maximumPitch || pitch !== void 0 && minimumPitch !== void 0 && pitch < minimumPitch || pitch !== void 0 && maximumPitch !== void 0 && pitch > maximumPitch || parameters.horizontalDeadZoneRatio !== void 0 && parameters.horizontalDeadZoneRatio > 1 || parameters.verticalDeadZoneRatio !== void 0 && parameters.verticalDeadZoneRatio > 1 || parameters.baseFovDegrees !== void 0 && (parameters.baseFovDegrees <= 0 || parameters.baseFovDegrees >= 180) || parameters.baseFovDegrees !== void 0 && parameters.maximumSpeedFovDegrees !== void 0 && parameters.baseFovDegrees + parameters.maximumSpeedFovDegrees >= 180 || parameters.lookSensitivityXRatio !== void 0 && parameters.lookSensitivityXRatio <= 0 || parameters.lookSensitivityYRatio !== void 0 && parameters.lookSensitivityYRatio <= 0;
}
function validateCameraProfile(source) {
  const unknownParameterName = Object.keys(source.parameters).find(
    (parameterName) => !isCameraRigParameterNameV1(parameterName)
  );
  if (unknownParameterName !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_CAMERA_PARAMETER: '${unknownParameterName}' in '${source.resourceRef}'.`
    );
  }
  const missingParameterName = CAMERA_RIG_PARAMETER_NAMES_V1.find(
    (parameterName) => !Object.prototype.hasOwnProperty.call(source.parameters, parameterName)
  );
  if (missingParameterName !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_MISSING_CAMERA_PARAMETER: '${missingParameterName}' in '${source.resourceRef}'.`
    );
  }
  if (hasInvalidCameraParameters(source.parameters)) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CAMERA_PARAMETERS: '${source.resourceRef}'.`
    );
  }
  const expectedAlgorithmRefByBaseMode = {
    "first-person": "worldkit://camera-rig/socket-first-person@1",
    "free-orbit": "worldkit://camera-rig/orbit-follow@1",
    "stable-follow": "worldkit://camera-rig/orbit-follow@1",
    "speed-chase": "worldkit://camera-rig/velocity-chase@1",
    "flight-horizon": "worldkit://camera-rig/flight-horizon@1"
  };
  if (source.algorithmRef !== expectedAlgorithmRefByBaseMode[source.baseMode]) {
    throw new Error(
      `SUBJECT_REGISTRY_CAMERA_MODE_ALGORITHM_MISMATCH: '${source.resourceRef}' declares '${source.baseMode}' with '${source.algorithmRef}'.`
    );
  }
  for (const [parameterName, range] of Object.entries(source.authoringRanges ?? {})) {
    const parameterValue = source.parameters[parameterName];
    if (typeof parameterValue !== "number" || ![range.minimum, range.maximum, range.step].every(Number.isFinite) || range.minimum > range.maximum || range.step <= 0 || parameterValue < range.minimum || parameterValue > range.maximum) {
      throw new Error(
        `SUBJECT_REGISTRY_INVALID_AUTHORING_RANGE: '${parameterName}' in '${source.resourceRef}'.`
      );
    }
  }
}
function validateCameraModifierProfile(source) {
  const unknownParameterName = Object.keys(source.parameterOverrides).find(
    (parameterName) => !isCameraRigParameterNameV1(parameterName)
  );
  if (unknownParameterName !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_CAMERA_PARAMETER: '${unknownParameterName}' in '${source.resourceRef}'.`
    );
  }
  const nonFiniteParameter = Object.entries(source.parameterOverrides).find(
    ([, value]) => !Number.isFinite(value)
  );
  if (nonFiniteParameter !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_NON_FINITE_PARAMETER: '${nonFiniteParameter[0]}' in '${source.resourceRef}'.`
    );
  }
  if (hasInvalidCameraParameters(source.parameterOverrides)) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CAMERA_MODIFIER_PARAMETERS: '${source.resourceRef}'.`
    );
  }
}
function validateReferences(resourcesByRef) {
  for (const resource of resourcesByRef.values()) {
    for (const referenceEdge of listSubjectRegistryReferenceEdgesV1(resource)) {
      const resolved = resourcesByRef.get(referenceEdge.targetResourceRef);
      if (resolved === void 0 || !referenceEdge.expectedResourceKinds.includes(resolved.kind)) {
        const expectedKinds = referenceEdge.expectedResourceKinds.join(" or ");
        throw new Error(
          `SUBJECT_REGISTRY_MISSING_REFERENCE: '${resource.resourceRef}' requires ${expectedKinds} '${referenceEdge.targetResourceRef}' at '${referenceEdge.sourcePath}'.`
        );
      }
    }
  }
  for (const resource of resourcesByRef.values()) {
    if (resource.kind === "motion-profile") {
      const kernel = resourcesByRef.get(resource.motionKernelRef);
      if (kernel?.kind === "motion-kernel" && kernel.runtimeStatus === "reserved") {
        throw new Error(
          `SUBJECT_REGISTRY_RESERVED_KERNEL_PROFILE: '${resource.resourceRef}' targets '${kernel.resourceRef}'.`
        );
      }
    }
    if (resource.kind === "camera-rig-profile") {
      const algorithm = resourcesByRef.get(resource.algorithmRef);
      if (algorithm?.kind === "camera-rig-algorithm" && algorithm.runtimeStatus === "reserved") {
        throw new Error(
          `SUBJECT_REGISTRY_RESERVED_CAMERA_ALGORITHM: '${resource.resourceRef}' targets '${algorithm.resourceRef}'.`
        );
      }
    }
    if (resource.kind === "camera-context-profile") {
      const reachableBaseProfileRefs = /* @__PURE__ */ new Set([
        resource.defaultCameraRigProfileRef,
        ...resource.firstPersonCameraRigProfileRef === void 0 ? [] : [resource.firstPersonCameraRigProfileRef],
        ...resource.rules.flatMap(
          (rule) => rule.cameraRigProfileRef === void 0 ? [] : [rule.cameraRigProfileRef]
        )
      ]);
      const reachableModifiers = [...new Set(
        resource.rules.flatMap((rule) => rule.cameraModifierRefs ?? [])
      )].flatMap((modifierRef) => {
        const modifier = resourcesByRef.get(modifierRef);
        return modifier?.kind === "camera-modifier-profile" ? [modifier] : [];
      });
      const modifierSequences = [
        ...reachableModifiers.map((modifier) => [modifier]),
        ...reachableModifiers.flatMap(
          (first) => reachableModifiers.flatMap(
            (second) => first.resourceRef === second.resourceRef ? [] : [[first, second]]
          )
        )
      ];
      for (const baseProfileRef of reachableBaseProfileRefs) {
        const baseProfile = resourcesByRef.get(baseProfileRef);
        if (baseProfile?.kind !== "camera-rig-profile") continue;
        for (const modifiers2 of modifierSequences) {
          const composedParameters = modifiers2.reduce(
            (parameters, modifier) => applyCameraRigParameterOverridesV1(
              baseProfile.algorithmRef,
              parameters,
              modifier.parameterOverrides
            ),
            { ...baseProfile.parameters }
          );
          if (!hasInvalidCameraParameters(composedParameters)) continue;
          throw new Error(
            `SUBJECT_REGISTRY_INVALID_CAMERA_CONTEXT_PARAMETERS: '${resource.resourceRef}' combines '${baseProfileRef}' with '${modifiers2.map((modifier) => modifier.resourceRef).join("', '")}'.`
          );
        }
      }
    }
    if (resource.kind === "subject-definition" && "schemaVersion" in resource) {
      const subject = resource;
      const defaultMotion = resourcesByRef.get(
        subject.profiles.motion.defaultMotionProfileRef
      );
      const fallbackMotion = resourcesByRef.get(
        subject.profiles.motion.fallbackMotionProfileRef
      );
      if (defaultMotion?.kind === "motion-profile" && fallbackMotion?.kind === "motion-profile") {
        if (!(fallbackMotion.motionTags.includes("safe") && fallbackMotion.motionTags.includes("stopped"))) {
          throw new Error(`MOTION_FALLBACK_NOT_SAFE_STOP: '${subject.resourceRef}'.`);
        }
        if (defaultMotion.motionTags.includes("safe") && defaultMotion.motionTags.includes("stopped")) {
          throw new Error(`MOTION_DEFAULT_SAFE_STOP_FORBIDDEN: '${subject.resourceRef}'.`);
        }
      }
      const motion = resourcesByRef.get(subject.profiles.motion.defaultMotionProfileRef);
      const control = resourcesByRef.get(subject.profiles.controlProfileRef);
      const kernel = motion?.kind === "motion-profile" ? resourcesByRef.get(motion.motionKernelRef) : void 0;
      if (kernel?.kind === "motion-kernel" && control?.kind === "control-profile" && kernel.commandKind !== control.commandKind) {
        throw new Error(
          `SUBJECT_REGISTRY_COMMAND_KIND_MISMATCH: '${subject.resourceRef}' uses '${kernel.commandKind}' with '${control.commandKind}'.`
        );
      }
    }
  }
}
function createSubjectResourceRegistry(resources) {
  const resourcesByRef = /* @__PURE__ */ new Map();
  for (const source of resources) {
    if (resourcesByRef.has(source.resourceRef)) {
      throw new Error(`SUBJECT_REGISTRY_DUPLICATE_REF: '${source.resourceRef}'.`);
    }
    if (source.kind === "subject-asset") validateSubjectAsset(source);
    if (source.kind === "animation-set") validateAnimationSet(source);
    if (source.kind === "rig-profile") validateRigProfile(source);
    if (source.kind === "collider-profile") validateColliderProfile(source);
    if (source.kind === "locomotion-profile") validateLocomotionProfile(source);
    if (source.kind === "physics-body-profile") validatePhysicsBodyProfile(source);
    if (source.kind === "motion-profile") validateMotionProfile(source);
    if (source.kind === "control-feel-profile") validateControlFeelProfile(source);
    if (source.kind === "control-profile") validateControlProfile(source);
    if (source.kind === "medium-profile") validateMediumProfile(source);
    if (source.kind === "camera-rig-profile") validateCameraProfile(source);
    if (source.kind === "camera-modifier-profile") validateCameraModifierProfile(source);
    if (source.kind === "subject-definition") {
      if (!("schemaVersion" in source) || source.schemaVersion !== 3) {
        throw new Error(
          `SUBJECT_REGISTRY_SUBJECT_DEFINITION_VERSION_NOT_SUPPORTED: '${source.resourceRef}'.`
        );
      }
      validateSubjectDefinitionV3(source);
    }
    if (source.kind === "motion-kernel") validateMotionKernel(source);
    validateCanonicalizedSemanticTags(source);
    resourcesByRef.set(source.resourceRef, lockResource(source));
  }
  validateReferences(resourcesByRef);
  const stableResources = deepFreeze(
    [...resourcesByRef.values()].sort(
      (left, right) => left.resourceRef.localeCompare(right.resourceRef)
    )
  );
  const resolveResource = (resourceRef) => resourcesByRef.get(resourceRef);
  function listDiscoverableResources(filter) {
    if (filter?.kind === void 0) return stableResources;
    return deepFreeze(stableResources.filter(
      (resource) => resource.kind === filter.kind
    ));
  }
  return Object.freeze({
    resolveResource,
    listDiscoverableResources,
    listReferenceEdges: listSubjectRegistryReferenceEdgesV1,
    resolveSubjectAsset(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "subject-asset" ? resource : void 0;
    },
    resolveRigProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "rig-profile" ? resource : void 0;
    },
    resolveAnimationSet(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "animation-set" ? resource : void 0;
    },
    resolveColliderProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "collider-profile" ? resource : void 0;
    },
    resolveSubjectDefinition(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "subject-definition" ? resource : void 0;
    },
    resolveCapability(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "capability" ? resource : void 0;
    },
    resolvePhysicsBodyProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "physics-body-profile" ? resource : void 0;
    },
    resolveLocomotionProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "locomotion-profile" ? resource : void 0;
    },
    resolveColliderDerivationProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "collider-derivation-profile" ? resource : void 0;
    },
    resolveMotionKernel(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "motion-kernel" ? resource : void 0;
    },
    resolveMotionProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "motion-profile" ? resource : void 0;
    },
    resolveControlFeelProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "control-feel-profile" ? resource : void 0;
    },
    resolveControlProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "control-profile" ? resource : void 0;
    },
    resolveCameraRigAlgorithm(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-rig-algorithm" ? resource : void 0;
    },
    resolveCameraRigProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-rig-profile" ? resource : void 0;
    },
    resolveCameraModifierProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-modifier-profile" ? resource : void 0;
    },
    resolveCameraContextProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-context-profile" ? resource : void 0;
    },
    resolveMediumProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "medium-profile" ? resource : void 0;
    },
    resolveRelationshipProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "relationship-profile" ? resource : void 0;
    },
    resolveHarnessProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "harness-profile" ? resource : void 0;
    },
    resolvePoseSetProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "pose-set-profile" ? resource : void 0;
    },
    resolveRenderBindingProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "render-binding-profile" ? resource : void 0;
    }
  });
}
const XIER120_STATIC_RESOURCE_ROWS = [
  {
    slug: "aerial-cockpit",
    displayName: "Aerial cockpit composition",
    byteLength: 4001184,
    contentHash: "sha256:b2416d0ee1ce33ac33878850e8f77362f06986dba2c03ca195636f82eed7e341",
    minimumMetersXYZ: [-4.997547149658203, 0, -2.7527832984924316],
    maximumMetersXYZ: [4.997547149658203, 1.7764760255813599, 2.7527832984924316],
    meshCount: 6,
    vertexCount: 147128,
    triangleCount: 49184,
    bodyTopology: "composite",
    colliderRadiusMeters: 0.9,
    colliderHeightMeters: 1.8
  },
  {
    slug: "aerial-hanging",
    displayName: "Aerial hanging composition",
    byteLength: 4086220,
    contentHash: "sha256:0010a055858bda14e6954bf291f57232f9f2eda90e6c20b8ee6ea41bf734f28d",
    minimumMetersXYZ: [-2.270571231842041, 0, -0.8879472017288208],
    maximumMetersXYZ: [2.270571231842041, 2.8275671005249023, 0.8879472017288208],
    meshCount: 6,
    vertexCount: 150388,
    triangleCount: 50300,
    bodyTopology: "composite",
    colliderRadiusMeters: 0.9,
    colliderHeightMeters: 2.85
  },
  {
    slug: "aerial-seated",
    displayName: "Aerial seated composition",
    byteLength: 4527824,
    contentHash: "sha256:012b5eb2af7400f4e85a3c398dc441f702bf19a96c2c754022ba7ea4ff9ee587",
    minimumMetersXYZ: [-4.997547149658203, 0, -2.151205539703369],
    maximumMetersXYZ: [4.997547149658203, 3.5654680728912354, 2.151205539703369],
    meshCount: 6,
    vertexCount: 165954,
    triangleCount: 55436,
    bodyTopology: "composite",
    colliderRadiusMeters: 1,
    colliderHeightMeters: 3.6
  },
  {
    slug: "aerial-seated-variant",
    displayName: "Aerial seated composition variant",
    byteLength: 4521096,
    contentHash: "sha256:ae55ee15fb4e07b232f07cdeac2ddfa653487bab408137651da4edacf90225be",
    minimumMetersXYZ: [-4.997547149658203, 0, -1.954379916191101],
    maximumMetersXYZ: [4.997547149658203, 2.286599636077881, 1.954379916191101],
    meshCount: 5,
    vertexCount: 165726,
    triangleCount: 55356,
    bodyTopology: "composite",
    colliderRadiusMeters: 1,
    colliderHeightMeters: 2.3
  },
  {
    slug: "aerial-standing",
    displayName: "Aerial standing composition",
    byteLength: 3999544,
    contentHash: "sha256:38df41c03aeda89c01d1b39e7333fac0f97305323d390a29f2b8a62dab3bbf92",
    minimumMetersXYZ: [-4.997547149658203, 0, -1.954379916191101],
    maximumMetersXYZ: [4.997547149658203, 3.1471400260925293, 1.954379916191101],
    meshCount: 5,
    vertexCount: 147100,
    triangleCount: 49148,
    bodyTopology: "composite",
    colliderRadiusMeters: 1,
    colliderHeightMeters: 3.15
  },
  {
    slug: "biped-animal",
    displayName: "Biped animal",
    byteLength: 13876,
    contentHash: "sha256:d9885d03000557ec1b1a7838f98b752b16026183add7885ad8ef5233deeb89db",
    minimumMetersXYZ: [-1.6529110670089722, 0, -0.28151267766952515],
    maximumMetersXYZ: [1.6529110670089722, 2.120368242263794, 0.28151267766952515],
    meshCount: 9,
    vertexCount: 244,
    triangleCount: 108,
    bodyTopology: "biped",
    colliderRadiusMeters: 0.3,
    colliderHeightMeters: 2.15
  },
  {
    slug: "flat-seated-glider",
    displayName: "Flat seated glider composition",
    byteLength: 3991972,
    contentHash: "sha256:a58044ad4c8a95beaa1548234079bbd12335cb1fae3d1da9dfc8e646e54aad32",
    minimumMetersXYZ: [-1.4798578023910522, 0, -2.1709389686584473],
    maximumMetersXYZ: [1.4798578023910522, 0.9396214485168457, 2.1709389686584473],
    meshCount: 3,
    vertexCount: 146858,
    triangleCount: 49124,
    bodyTopology: "composite",
    colliderRadiusMeters: 0.475,
    colliderHeightMeters: 0.95
  },
  {
    slug: "four-wheel",
    displayName: "Four-wheel vehicle",
    byteLength: 4543248,
    contentHash: "sha256:90de81af8af617a2714e014e1cdfcd041b5375893ab79cf12d28b9e9655c6afe",
    minimumMetersXYZ: [-1.4247379302978516, 0, -2.579864501953125],
    maximumMetersXYZ: [1.4247379302978516, 2.285374402999878, 2.579864501953125],
    meshCount: 7,
    vertexCount: 166464,
    triangleCount: 55840,
    bodyTopology: "four-wheel",
    colliderRadiusMeters: 1,
    colliderHeightMeters: 2.3
  },
  {
    slug: "four-wheel-variant",
    displayName: "Four-wheel vehicle variant",
    byteLength: 4627976,
    contentHash: "sha256:10ffc48432ae9a4ca15e7161cbac275e1ae90b92cec96ed7c37f18c5d6532044",
    minimumMetersXYZ: [-1.4247379302978516, 0, -2.579864740371704],
    maximumMetersXYZ: [1.4247379302978516, 2.0403995513916016, 2.579864740371704],
    meshCount: 3,
    vertexCount: 169834,
    triangleCount: 57011,
    bodyTopology: "four-wheel",
    colliderRadiusMeters: 1,
    colliderHeightMeters: 2.05
  },
  {
    slug: "hoverboard-standing",
    displayName: "Hoverboard standing composition",
    byteLength: 4514168,
    contentHash: "sha256:8b0afca1e4e679b80944f456d985088837f62e7f17ee40a28b52e7f63f97505d",
    minimumMetersXYZ: [-0.7387374043464661, 0, -1.408867597579956],
    maximumMetersXYZ: [0.7387374043464661, 1.5792903900146484, 1.408867597579956],
    meshCount: 3,
    vertexCount: 165512,
    triangleCount: 55332,
    bodyTopology: "composite",
    colliderRadiusMeters: 0.75,
    colliderHeightMeters: 1.6
  },
  {
    slug: "prone-glider",
    displayName: "Prone glider composition",
    byteLength: 3990160,
    contentHash: "sha256:9577634ecd5c88e2eb79dff5cbd7313fd0f07c1476d2834248c0970cb6453076",
    minimumMetersXYZ: [-1.4798578023910522, 0, -2.1709389686584473],
    maximumMetersXYZ: [1.4798578023910522, 0.6468644142150879, 2.1709389686584473],
    meshCount: 3,
    vertexCount: 146784,
    triangleCount: 49124,
    bodyTopology: "composite",
    colliderRadiusMeters: 0.325,
    colliderHeightMeters: 0.65
  },
  {
    slug: "quadruped-animal",
    displayName: "Quadruped animal",
    byteLength: 27616,
    contentHash: "sha256:70c16cd59ba37ec17ddb5481aa92f9442f54d250c885ffdf778313e5f10f206b",
    minimumMetersXYZ: [-1.4184849262237549, 0, -1.0414180755615234],
    maximumMetersXYZ: [1.4184849262237549, 1.5794458389282227, 1.0414180755615234],
    meshCount: 18,
    vertexCount: 490,
    triangleCount: 216,
    bodyTopology: "quadruped",
    colliderRadiusMeters: 0.8,
    colliderHeightMeters: 1.6
  },
  {
    slug: "quadruped-reptile",
    displayName: "Quadruped reptile",
    byteLength: 4540856,
    contentHash: "sha256:fab6b515fec64d61325291573d615609ab0066d795087a6533143cecedf5a9b3",
    minimumMetersXYZ: [-1.7284713983535767, 0, -0.3477635979652405],
    maximumMetersXYZ: [1.7284713983535767, 1.8047341108322144, 0.3477635979652405],
    meshCount: 20,
    vertexCount: 166036,
    triangleCount: 55536,
    bodyTopology: "quadruped",
    colliderRadiusMeters: 0.35,
    colliderHeightMeters: 1.85
  },
  {
    slug: "quadruped-ridable",
    displayName: "Quadruped ridable composition",
    byteLength: 4001416,
    contentHash: "sha256:a35efef1b768f3aecf28c985cb77ed4528ee64737d514956a97f156bdf941596",
    minimumMetersXYZ: [-0.4912319779396057, 0, -1.0414180755615234],
    maximumMetersXYZ: [0.4912319779396057, 1.9869701862335205, 1.0414180755615234],
    meshCount: 9,
    vertexCount: 147044,
    triangleCount: 49196,
    bodyTopology: "composite",
    colliderRadiusMeters: 0.5,
    colliderHeightMeters: 2
  },
  {
    slug: "snake-animal",
    displayName: "Snake animal",
    byteLength: 41700,
    contentHash: "sha256:660e62620429c492e68a81834a245a5c698ee85c32714817bb5e3da40e18217c",
    minimumMetersXYZ: [-0.874164342880249, 0, -3.380983352661133],
    maximumMetersXYZ: [0.874164342880249, 0.3010602593421936, 3.380983352661133],
    meshCount: 3,
    vertexCount: 1446,
    triangleCount: 678,
    bodyTopology: "custom",
    colliderRadiusMeters: 0.175,
    colliderHeightMeters: 0.35
  },
  {
    slug: "three-wheel",
    displayName: "Three-wheel vehicle",
    byteLength: 4547236,
    contentHash: "sha256:3eec5cb1503bf86c872461dbb8aa3b81a7cdf4b6625a3683a9215b563cfb9906",
    minimumMetersXYZ: [-1.0469019412994385, 0, -1.6943717002868652],
    maximumMetersXYZ: [1.0469019412994385, 1.845245361328125, 1.6943717002868652],
    meshCount: 3,
    vertexCount: 166728,
    triangleCount: 55984,
    bodyTopology: "custom",
    colliderRadiusMeters: 0.925,
    colliderHeightMeters: 1.85
  },
  {
    slug: "tracked",
    displayName: "Tracked vehicle",
    byteLength: 4699792,
    contentHash: "sha256:c0c3e762f956a9cbcfe00fe760c765c220e4b12be1eaafa93696f7cc97652acd",
    minimumMetersXYZ: [-2.730105400085449, 0, -3.183220386505127],
    maximumMetersXYZ: [2.730105400085449, 2.2917604446411133, 3.183220386505127],
    meshCount: 6,
    vertexCount: 172536,
    triangleCount: 57764,
    bodyTopology: "custom",
    colliderRadiusMeters: 1,
    colliderHeightMeters: 2.3
  },
  {
    slug: "two-wheel-motorcycle",
    displayName: "Two-wheel motorcycle",
    byteLength: 4546392,
    contentHash: "sha256:b632297efb15870385d4fc053ae40dbd6f516eb660b698124069e9d36ed1972f",
    minimumMetersXYZ: [-0.40971457958221436, 0, -1.0134267807006836],
    maximumMetersXYZ: [0.40971457958221436, 1.761342167854309, 1.0134267807006836],
    meshCount: 5,
    vertexCount: 166659,
    triangleCount: 55828,
    bodyTopology: "custom",
    colliderRadiusMeters: 0.425,
    colliderHeightMeters: 1.8
  },
  {
    slug: "two-wheel-motorcycle-variant",
    displayName: "Two-wheel motorcycle variant",
    byteLength: 4545392,
    contentHash: "sha256:cbd48d5bd3dd30e4c51fa898dc41a983fcb756843b165d66d8df4aba1c02103b",
    minimumMetersXYZ: [-0.40971457958221436, 0, -1.0134267807006836],
    maximumMetersXYZ: [0.40971457958221436, 1.7613420486450195, 1.0134267807006836],
    meshCount: 5,
    vertexCount: 166615,
    triangleCount: 55828,
    bodyTopology: "custom",
    colliderRadiusMeters: 0.425,
    colliderHeightMeters: 1.8
  }
];
const SHARED_COORDINATE_CONVENTION$1 = {
  forwardAxis: "-Z",
  upAxis: "+Y",
  metersPerUnit: 1,
  pivot: "support-center"
};
const XIER120_SUBJECT_ASSET_MANIFESTS = Object.freeze(
  XIER120_STATIC_RESOURCE_ROWS.map((row) => ({
    kind: "subject-asset",
    id: `xier120.${row.slug}`,
    version: 1,
    resourceRef: `worldkit://subject-asset/xier120.${row.slug}@1`,
    format: "glb",
    artifact: {
      mediaType: "model/gltf-binary",
      byteLength: row.byteLength,
      contentHash: row.contentHash
    },
    coordinateConvention: SHARED_COORDINATE_CONVENTION$1,
    bounds: {
      minimumMetersXYZ: row.minimumMetersXYZ,
      maximumMetersXYZ: row.maximumMetersXYZ
    },
    inventory: {
      meshCount: row.meshCount,
      vertexCount: row.vertexCount,
      triangleCount: row.triangleCount,
      skeletonCount: 0,
      boneCount: 0,
      animationClipCount: 0,
      animationClipNames: []
    },
    provenance: {
      licenseSpdxId: "LicenseRef-Loopit-Company-Private",
      redistributionPolicy: "internal-only",
      author: "xier120"
    },
    runtimeReadiness: {
      productionReady: false,
      runtimeStateBinding: "implemented"
    },
    aiMetadata: {
      displayName: row.displayName,
      description: `Static support-centered GLB baked from the xier120 ${row.slug} source; it contains no rig or animation.`,
      semanticTags: ["static", "subject", "xier120"]
    }
  }))
);
const XIER120_COLLIDER_PROFILES = Object.freeze(
  XIER120_STATIC_RESOURCE_ROWS.map((row) => ({
    kind: "collider-profile",
    id: `xier120.${row.slug}`,
    version: 1,
    resourceRef: `worldkit://collider-profile/xier120.${row.slug}@1`,
    supportedBodyTopologies: [row.bodyTopology],
    collider: {
      kind: "capsule",
      radiusMeters: row.colliderRadiusMeters,
      heightMeters: row.colliderHeightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        0,
        row.colliderHeightMeters / 2,
        0
      ]
    },
    aiMetadata: {
      displayName: `${row.displayName} character capsule`,
      description: "Explicit support-centered Character Controller approximation reviewed against the baked GLB bounds; it is not exact vehicle or flight collision.",
      semanticTags: ["capsule", "character-controller", "static", "xier120"]
    }
  }))
);
const XIER120_SUBJECT_CLASSIFICATIONS = [
  { slug: "aerial-cockpit", displayName: "Aerial cockpit composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-hanging", displayName: "Aerial hanging composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-seated", displayName: "Aerial seated composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-seated-variant", displayName: "Aerial seated composition variant", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-standing", displayName: "Aerial standing composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "biped-animal", displayName: "Biped animal", category: "animal", bodyTopology: "biped", authoringAvailability: "advanced" },
  { slug: "flat-seated-glider", displayName: "Flat seated glider composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "four-wheel", displayName: "Four-wheel vehicle", category: "vehicle", bodyTopology: "four-wheel", authoringAvailability: "experimental" },
  { slug: "four-wheel-variant", displayName: "Four-wheel vehicle variant", category: "vehicle", bodyTopology: "four-wheel", authoringAvailability: "experimental" },
  { slug: "hoverboard-standing", displayName: "Hoverboard standing composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "prone-glider", displayName: "Prone glider composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "quadruped-animal", displayName: "Quadruped animal", category: "animal", bodyTopology: "quadruped", authoringAvailability: "advanced" },
  { slug: "quadruped-reptile", displayName: "Quadruped reptile", category: "animal", bodyTopology: "quadruped", authoringAvailability: "advanced" },
  { slug: "quadruped-ridable", displayName: "Quadruped ridable composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "snake-animal", displayName: "Snake animal", category: "animal", bodyTopology: "custom", authoringAvailability: "advanced" },
  { slug: "three-wheel", displayName: "Three-wheel vehicle", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
  { slug: "tracked", displayName: "Tracked vehicle", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
  { slug: "two-wheel-motorcycle", displayName: "Two-wheel motorcycle", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
  { slug: "two-wheel-motorcycle-variant", displayName: "Two-wheel motorcycle variant", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" }
];
const SHARED_COORDINATE_CONVENTION = {
  forwardAxis: "-Z",
  upAxis: "+Y",
  metersPerUnit: 1,
  pivot: "support-center"
};
const SHARED_GROUND_PROFILES = {
  physicsBodyProfileRef: "worldkit://physics-body-profile/character.capability-medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
  allowedControlFeelProfileRefs: [
    "worldkit://control-feel-profile/humanoid.medium-ground@1",
    "worldkit://control-feel-profile/humanoid.heavy-ground@1"
  ],
  motion: {
    defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1"
  },
  controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
  cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
  mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  harnessProfileRef: "worldkit://harness-profile/subject.standard@1"
};
const XIER120_SUBJECT_DEFINITIONS = Object.freeze(
  XIER120_SUBJECT_CLASSIFICATIONS.map(
    (row) => ({
      kind: "subject-definition",
      schemaVersion: 3,
      id: `xier120.${row.slug}`,
      version: 1,
      resourceRef: `worldkit://subject-definition/xier120.${row.slug}@1`,
      authoringAvailability: row.authoringAvailability,
      category: row.category,
      bodyTopology: row.bodyTopology,
      semanticClassId: `subject.xier120.${row.slug}`,
      coordinateConvention: SHARED_COORDINATE_CONVENTION,
      visualParts: [{
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: `worldkit://subject-asset/xier120.${row.slug}@1`,
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1]
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: ["body", "static", "xier120"]
      }],
      visualBinding: { mode: "static" },
      sockets: [],
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef: `worldkit://collider-profile/xier120.${row.slug}@1`
      },
      capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
      profiles: SHARED_GROUND_PROFILES,
      relationshipCapabilityRefs: [],
      actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
      renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
      aiMetadata: {
        displayName: row.displayName,
        description: `${row.displayName} as one static xier120 visual driven only by the existing ground Character capability; no vehicle, flight, mount, NPC, rig, or animation behavior is claimed.`,
        semanticTags: row.category === row.bodyTopology ? [row.category, "static", "xier120"] : [row.bodyTopology, row.category, "static", "xier120"]
      }
    })
  )
);
const builtInSubjectResourceRegistry = createSubjectResourceRegistry([
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...subjectDefinitionsV3,
  ...XIER120_SUBJECT_DEFINITIONS,
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
  ...XIER120_SUBJECT_ASSET_MANIFESTS,
  ...XIER120_COLLIDER_PROFILES,
  ...BUILT_IN_CAPABILITY_MANIFESTS,
  ...BUILT_IN_CAPABILITY_RESOURCES
]);
const vehicleSourceFbxCatalog = [
  {
    sourceId: "aerial-cockpit",
    originalRelativePath: "飞行载具/飞行载具坐里面驾驶.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/aerial-cockpit/source.fbx",
    byteLength: 3702044,
    contentHash: "sha256:fcc92857a1c4150099175a4bc85bec626453e554a9a09ab3e9cb2b7b38695db9",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "aerial-cockpit-variant",
    originalRelativePath: "飞行载具/飞行载具坐里面驾驶1.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/aerial-cockpit-variant/source.fbx",
    byteLength: 3694796,
    contentHash: "sha256:004f950ceef2fd9dc90ea1e91c163765d1d86f9ccab7d9caf0378f2442710246",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "aerial-hanging",
    originalRelativePath: "飞行载具/飞行挂下面1.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/aerial-hanging/source.fbx",
    byteLength: 3078412,
    contentHash: "sha256:0aade16e02a0024ea79746412011193cc92950891a215e6f0692bc10d1c85cdf",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "aerial-seated",
    originalRelativePath: "飞行载具/飞行坐上面.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/aerial-seated/source.fbx",
    byteLength: 3948556,
    contentHash: "sha256:ec2d874ffc65de020ceba5915ca2088b95c9c87db46275f030e11971e64a0652",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "aerial-seated-variant",
    originalRelativePath: "飞行载具/飞行坐上面1.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/aerial-seated-variant/source.fbx",
    byteLength: 6119644,
    contentHash: "sha256:6070902abfc02ed88e1545c2c90eb7388cb7735f895a16479e50499b987b10f3",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "aerial-standing",
    originalRelativePath: "飞行载具/飞行站上面.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/aerial-standing/source.fbx",
    byteLength: 1923628,
    contentHash: "sha256:1f8d398c3f765e8f3be4ae5bb7f0cce9e4f519f6463b074202e9e1794a7ea56a",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "flat-seated-glider",
    originalRelativePath: "飞行载具/平面飞行坐上面1.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/flat-seated-glider/source.fbx",
    byteLength: 2126460,
    contentHash: "sha256:814cf53eeb2d97abbd13dc16d73cd2951657cd9e4d5d7b774b8a4cf52270efdb",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "four-wheel",
    originalRelativePath: "四轮载具/四轮载具.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/four-wheel/source.fbx",
    byteLength: 2080716,
    contentHash: "sha256:23b5340a15abd2197b1a1ce542417cf8d2a75892b5af65514d05af12658fc6c1",
    coarseClass: "four-wheel-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "hoverboard-standing",
    originalRelativePath: "飞行载具/滑板类上面.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/hoverboard-standing/source.fbx",
    byteLength: 2065420,
    contentHash: "sha256:b3e4021d51f294c79ab6ee45be1c10ff4014479bc8137f3e7554f5b010b9298d",
    coarseClass: "board-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "prone-glider",
    originalRelativePath: "飞行载具/平面飞行趴.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/prone-glider/source.fbx",
    byteLength: 1815276,
    contentHash: "sha256:1ac5f89be95e199177a475d5f94766373264b037f352bd75d22843d4d18895a2",
    coarseClass: "aerial-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "quadruped-ridable",
    originalRelativePath: "四足动物/四足骑行1.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/quadruped-ridable/source.fbx",
    byteLength: 5691164,
    contentHash: "sha256:b3aec424ca5eeb4286a5909703fac502f6a3175882632fac8fec26238572674b",
    coarseClass: "quadruped-ridable",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  },
  {
    sourceId: "two-wheel",
    originalRelativePath: "二轮载具/二轮载具.fbx",
    repositoryRelativePath: "assets/subjects/source-fbx/vehicles/two-wheel/source.fbx",
    byteLength: 2073132,
    contentHash: "sha256:629daebbb9ccf0e0ba3fba82ad6295e84dd10005d0c242ce5bf52daa73d2df31",
    coarseClass: "two-wheel-vehicle",
    format: "fbx",
    runtimeStatus: "source-only",
    conversionRequired: true
  }
];
const xier120SourceFbxCatalog = /* @__PURE__ */ JSON.parse('[{"sourceId":"xier120.aerial-cockpit","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/飞行载具坐里面驾驶1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/aerial-cockpit/source.fbx","byteLength":3697052,"contentHash":"sha256:e49c002b2a192666393e15c2448594ed36092d2df3d0ce9ed3c25f3941720462","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.aerial-hanging","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/飞行挂下面1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/aerial-hanging/source.fbx","byteLength":3078412,"contentHash":"sha256:0aade16e02a0024ea79746412011193cc92950891a215e6f0692bc10d1c85cdf","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.aerial-seated","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/飞行坐上面.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/aerial-seated/source.fbx","byteLength":3948556,"contentHash":"sha256:ec2d874ffc65de020ceba5915ca2088b95c9c87db46275f030e11971e64a0652","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.aerial-seated-variant","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/飞行坐上面1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/aerial-seated-variant/source.fbx","byteLength":6119644,"contentHash":"sha256:6070902abfc02ed88e1545c2c90eb7388cb7735f895a16479e50499b987b10f3","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.aerial-standing","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/飞行站上面.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/aerial-standing/source.fbx","byteLength":1923628,"contentHash":"sha256:1f8d398c3f765e8f3be4ae5bb7f0cce9e4f519f6463b074202e9e1794a7ea56a","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.biped-animal","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"动物类/双足动物.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/animals/biped-animal/source.fbx","byteLength":84812,"contentHash":"sha256:875253ee14c72be66d3e3e58daac6c95171338e800f22d255bf908b424b13003","coarseClass":"biped-animal","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.flat-seated-glider","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/平面飞行坐上面1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/flat-seated-glider/source.fbx","byteLength":2126460,"contentHash":"sha256:814cf53eeb2d97abbd13dc16d73cd2951657cd9e4d5d7b774b8a4cf52270efdb","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.four-wheel","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"四轮载具/四轮载具.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/vehicles/four-wheel/source.fbx","byteLength":2080716,"contentHash":"sha256:23b5340a15abd2197b1a1ce542417cf8d2a75892b5af65514d05af12658fc6c1","coarseClass":"four-wheel-vehicle","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.four-wheel-variant","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"四轮载具/四轮载具1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/vehicles/four-wheel-variant/source.fbx","byteLength":2407948,"contentHash":"sha256:df0864b493df457c8821ebff605320c15357d1f5ae3f37556ce8da2fdbf51189","coarseClass":"four-wheel-vehicle","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.hoverboard-standing","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/滑板类上面.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/hoverboard-standing/source.fbx","byteLength":2065420,"contentHash":"sha256:b3e4021d51f294c79ab6ee45be1c10ff4014479bc8137f3e7554f5b010b9298d","coarseClass":"rider-board-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.prone-glider","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"飞行载具/平面飞行趴.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/prone-glider/source.fbx","byteLength":1815276,"contentHash":"sha256:1ac5f89be95e199177a475d5f94766373264b037f352bd75d22843d4d18895a2","coarseClass":"rider-aerial-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.quadruped-animal","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"动物类/四足动物.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/animals/quadruped-animal/source.fbx","byteLength":2183164,"contentHash":"sha256:df789fffa1526308d5bd0386fd22a2fe62c4e57f0b5dc29b23e662c5879080b7","coarseClass":"quadruped-animal","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.quadruped-reptile","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"动物类/四组爬行动物.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/animals/quadruped-reptile/source.fbx","byteLength":2282156,"contentHash":"sha256:2cfeee63a91cdbf8ba38dc3b4c070a37a1d12997989127ddd11032d7fd68c1bc","coarseClass":"quadruped-reptile","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.quadruped-ridable","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"动物类/四足动物/四足骑行1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/compositions/quadruped-ridable/source.fbx","byteLength":5691164,"contentHash":"sha256:b3aec424ca5eeb4286a5909703fac502f6a3175882632fac8fec26238572674b","coarseClass":"rider-animal-composition","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.snake-animal","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"动物类/蛇类动物.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/animals/snake-animal/source.fbx","byteLength":91372,"contentHash":"sha256:da7668a89bc3cb462749e17c3c3e00ea0db97321e34f60c0fcab7cb5bce32fcd","coarseClass":"snake-animal","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.three-wheel","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"三轮载具/三轮载具.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/vehicles/three-wheel/source.fbx","byteLength":2074028,"contentHash":"sha256:7aca0bd9f7840803d3728bf94100fcaf19a917d8f0c33c385c09aed3879819d1","coarseClass":"three-wheel-vehicle","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.tracked","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"履带载具/履带载具.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/vehicles/tracked/source.fbx","byteLength":2131212,"contentHash":"sha256:b3a37272c0ca792258b5ac528c730461b982bf8073867c6c5c5a41ea94a7c80e","coarseClass":"tracked-vehicle","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.two-wheel-motorcycle","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"二轮载具/二轮载具摩托.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/vehicles/two-wheel-motorcycle/source.fbx","byteLength":2177420,"contentHash":"sha256:6152a9d5b5ed57b64dfe48b889dafe00379bfb06cac4a2dd2a989e47f5880350","coarseClass":"two-wheel-vehicle","format":"fbx","runtimeStatus":"source-only","conversionRequired":true},{"sourceId":"xier120.two-wheel-motorcycle-variant","creatorId":"xier120","authorship":"independent-original-model","originalRelativePath":"二轮载具/二轮载具摩托1.fbx","repositoryRelativePath":"assets/subjects/source-fbx/contributors/xier120/vehicles/two-wheel-motorcycle-variant/source.fbx","byteLength":2387372,"contentHash":"sha256:4a5fb949aadb431b8f69085f78162063be1f7190f701ad2e89b89470095fd2b3","coarseClass":"two-wheel-vehicle","format":"fbx","runtimeStatus":"source-only","conversionRequired":true}]');
Object.freeze(
  vehicleSourceFbxCatalog.map(
    (entry) => Object.freeze(entry)
  )
);
const contributorCatalogs = [xier120SourceFbxCatalog];
Object.freeze(
  contributorCatalogs.flatMap(
    (catalog) => catalog.map(
      (entry) => Object.freeze(entry)
    )
  )
);
const schemaVersion = 1;
const defaults$1 = [{ "subjectDefinitionId": "animal.quadruped.forward-steer", "subjectDefinitionRef": "worldkit://subject-definition/animal.quadruped.forward-steer@2", "subjectDefinitionContentHash": "sha256:4f53ebb7edf027ae8a6dffcc152041cc5343fac9c2244a4d73f4235293e3f69b" }, { "subjectDefinitionId": "glider.paraglider.unpowered", "subjectDefinitionRef": "worldkit://subject-definition/glider.paraglider.unpowered@1", "subjectDefinitionContentHash": "sha256:8d0d7e0dd662703e613f7c143c350d7ab7cd8424e92e37aa8bb914006a5cf06f" }, { "subjectDefinitionId": "humanoid.g-bot", "subjectDefinitionRef": "worldkit://subject-definition/humanoid.g-bot@2", "subjectDefinitionContentHash": "sha256:1f5c9007ce5f7a6e707d4809e51401bf9c0a9532ecc57e88930b9015e2dac92b" }, { "subjectDefinitionId": "surface-craft.ice-skimmer", "subjectDefinitionRef": "worldkit://subject-definition/surface-craft.ice-skimmer@1", "subjectDefinitionContentHash": "sha256:4dfaed753c6417e89ad386473f0c833cc3f75ed6cfdb154aa90e6436fdd2b92b" }, { "subjectDefinitionId": "vehicle.four-wheel.arcade", "subjectDefinitionRef": "worldkit://subject-definition/vehicle.four-wheel.arcade@1", "subjectDefinitionContentHash": "sha256:d9860837867a5125a7b5cdb5570ee9babdd8a93c40dac8b31b349863a2ed1f81" }, { "subjectDefinitionId": "watercraft.kayak.surface", "subjectDefinitionRef": "worldkit://subject-definition/watercraft.kayak.surface@1", "subjectDefinitionContentHash": "sha256:2a02e0520efa69b4d6a4c74481866329418f3dc5c14bb967ba502ee51f6e0d8a" }];
const defaultCatalog = {
  schemaVersion,
  defaults: defaults$1
};
function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
function unknownField(source, allowedFields) {
  const allowed = new Set(allowedFields);
  return Object.keys(source).find((field) => !allowed.has(field));
}
function isV3Definition(value) {
  return value !== void 0 && "schemaVersion" in value && value.schemaVersion === 3;
}
function createSubjectDefaultRegistryV1(source, subjectRegistry) {
  if (!isPlainObject(source)) {
    throw new Error("SUBJECT_DEFAULT_CATALOG_INVALID: expected an object.");
  }
  const catalogUnknownField = unknownField(source, ["schemaVersion", "defaults"]);
  if (catalogUnknownField !== void 0) {
    throw new Error(
      `SUBJECT_DEFAULT_CATALOG_UNKNOWN_FIELD: '${catalogUnknownField}'.`
    );
  }
  if (!Array.isArray(source.defaults)) {
    throw new Error("SUBJECT_DEFAULT_CATALOG_INVALID: expected schemaVersion 1 and defaults array.");
  }
  const entries = [];
  const seenIds = /* @__PURE__ */ new Set();
  let previousId;
  for (const [index, candidate] of source.defaults.entries()) {
    if (!isPlainObject(candidate)) {
      throw new Error(`SUBJECT_DEFAULT_ENTRY_INVALID: defaults[${index}] must be an object.`);
    }
    const entryUnknownField = unknownField(candidate, [
      "subjectDefinitionId",
      "subjectDefinitionRef",
      "subjectDefinitionContentHash"
    ]);
    if (entryUnknownField !== void 0) {
      throw new Error(
        `SUBJECT_DEFAULT_ENTRY_UNKNOWN_FIELD: '${entryUnknownField}' at defaults[${index}].`
      );
    }
    const {
      subjectDefinitionId,
      subjectDefinitionRef,
      subjectDefinitionContentHash
    } = candidate;
    if (typeof subjectDefinitionId !== "string" || subjectDefinitionId.length === 0 || typeof subjectDefinitionRef !== "string" || subjectDefinitionRef.length === 0 || typeof subjectDefinitionContentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(subjectDefinitionContentHash)) {
      throw new Error(`SUBJECT_DEFAULT_ENTRY_INVALID: defaults[${index}] has invalid fields.`);
    }
    if (seenIds.has(subjectDefinitionId)) {
      throw new Error(
        `SUBJECT_DEFAULT_CATALOG_DUPLICATE_ID: '${subjectDefinitionId}'.`
      );
    }
    if (previousId !== void 0 && previousId.localeCompare(subjectDefinitionId) >= 0) {
      throw new Error(
        `SUBJECT_DEFAULT_CATALOG_NOT_SORTED: '${subjectDefinitionId}' follows '${previousId}'.`
      );
    }
    const definition = subjectRegistry.resolveSubjectDefinition(subjectDefinitionRef);
    if (!isV3Definition(definition) || definition.resourceRef !== subjectDefinitionRef || definition.id !== subjectDefinitionId || definition.contentHash !== subjectDefinitionContentHash) {
      throw new Error(
        `SUBJECT_DEFAULT_ENTRY_INVALID: '${subjectDefinitionId}' does not match exact Definition '${subjectDefinitionRef}'.`
      );
    }
    const entry = Object.freeze({
      subjectDefinitionId,
      subjectDefinitionRef,
      subjectDefinitionContentHash
    });
    entries.push(entry);
    seenIds.add(subjectDefinitionId);
    previousId = subjectDefinitionId;
  }
  const stableEntries = Object.freeze(entries);
  const entriesById = new Map(
    stableEntries.map((entry) => [entry.subjectDefinitionId, entry])
  );
  return Object.freeze({
    resolvePublicDefault(subjectDefinitionId) {
      return entriesById.get(subjectDefinitionId);
    },
    listPublicDefaults() {
      return stableEntries;
    }
  });
}
createSubjectDefaultRegistryV1(
  defaultCatalog,
  builtInSubjectResourceRegistry
);
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var _2020 = { exports: {} };
var core$1 = {};
var validate = {};
var boolSchema = {};
var errors = {};
var codegen = {};
var code$1 = {};
var hasRequiredCode$1;
function requireCode$1() {
  if (hasRequiredCode$1) return code$1;
  hasRequiredCode$1 = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.regexpCode = exports2.getEsmExportName = exports2.getProperty = exports2.safeStringify = exports2.stringify = exports2.strConcat = exports2.addCodeArg = exports2.str = exports2._ = exports2.nil = exports2._Code = exports2.Name = exports2.IDENTIFIER = exports2._CodeOrName = void 0;
    class _CodeOrName {
    }
    exports2._CodeOrName = _CodeOrName;
    exports2.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    class Name extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports2.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    }
    exports2.Name = Name;
    class _Code extends _CodeOrName {
      constructor(code2) {
        super();
        this._items = typeof code2 === "string" ? [code2] : code2;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names2, c) => {
          if (c instanceof Name)
            names2[c.str] = (names2[c.str] || 0) + 1;
          return names2;
        }, {});
      }
    }
    exports2._Code = _Code;
    exports2.nil = new _Code("");
    function _(strs, ...args) {
      const code2 = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code2, args[i]);
        code2.push(strs[++i]);
      }
      return new _Code(code2);
    }
    exports2._ = _;
    const plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports2.str = str;
    function addCodeArg(code2, arg) {
      if (arg instanceof _Code)
        code2.push(...arg._items);
      else if (arg instanceof Name)
        code2.push(arg);
      else
        code2.push(interpolate(arg));
    }
    exports2.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports2.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports2.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports2.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports2.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports2.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports2.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports2.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports2.regexpCode = regexpCode;
  })(code$1);
  return code$1;
}
var scope = {};
var hasRequiredScope;
function requireScope() {
  if (hasRequiredScope) return scope;
  hasRequiredScope = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ValueScope = exports2.ValueScopeName = exports2.Scope = exports2.varKinds = exports2.UsedValueState = void 0;
    const code_1 = /* @__PURE__ */ requireCode$1();
    class ValueError extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    }
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports2.UsedValueState = UsedValueState = {}));
    exports2.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    class Scope {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    }
    exports2.Scope = Scope;
    class ValueScopeName extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    }
    exports2.ValueScopeName = ValueScopeName;
    const line = (0, code_1._)`\n`;
    class ValueScope extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code2 = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports2.varKinds.var : exports2.varKinds.const;
              code2 = (0, code_1._)`${code2}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code2 = (0, code_1._)`${code2}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code2;
      }
    }
    exports2.ValueScope = ValueScope;
  })(scope);
  return scope;
}
var hasRequiredCodegen;
function requireCodegen() {
  if (hasRequiredCodegen) return codegen;
  hasRequiredCodegen = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.or = exports2.and = exports2.not = exports2.CodeGen = exports2.operators = exports2.varKinds = exports2.ValueScopeName = exports2.ValueScope = exports2.Scope = exports2.Name = exports2.regexpCode = exports2.stringify = exports2.getProperty = exports2.nil = exports2.strConcat = exports2.str = exports2._ = void 0;
    const code_1 = /* @__PURE__ */ requireCode$1();
    const scope_1 = /* @__PURE__ */ requireScope();
    var code_2 = /* @__PURE__ */ requireCode$1();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports2, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports2, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports2, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = /* @__PURE__ */ requireScope();
    Object.defineProperty(exports2, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports2, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports2, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports2, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports2.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    class Node {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    }
    class Def extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names2, constants) {
        if (!names2[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names2, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    }
    class Assign extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names2, constants) {
        if (this.lhs instanceof code_1.Name && !names2[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names2, constants);
        return this;
      }
      get names() {
        const names2 = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names2, this.rhs);
      }
    }
    class AssignOp extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    }
    class Label extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    }
    class Break extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    }
    class Throw extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    }
    class AnyCode extends Node {
      constructor(code2) {
        super();
        this.code = code2;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names2, constants) {
        this.code = optimizeExpr(this.code, names2, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    }
    class ParentNode extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code2, n) => code2 + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names2, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names2, constants))
            continue;
          subtractNames(names2, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names2, n) => addNames(names2, n.names), {});
      }
    }
    class BlockNode extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    }
    class Root extends ParentNode {
    }
    class Else extends BlockNode {
    }
    Else.kind = "else";
    class If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code2 = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code2 += "else " + this.else.render(opts);
        return code2;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new If(not2(cond), e instanceof If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names2, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names2, constants);
        if (!(super.optimizeNames(names2, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names2, constants);
        return this;
      }
      get names() {
        const names2 = super.names;
        addExprNames(names2, this.condition);
        if (this.else)
          addNames(names2, this.else.names);
        return names2;
      }
    }
    If.kind = "if";
    class For extends BlockNode {
    }
    For.kind = "for";
    class ForLoop extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names2, constants) {
        if (!super.optimizeNames(names2, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names2, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    }
    class ForRange extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names2 = addExprNames(super.names, this.from);
        return addExprNames(names2, this.to);
      }
    }
    class ForIter extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names2, constants) {
        if (!super.optimizeNames(names2, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names2, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    }
    class Func extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    }
    Func.kind = "func";
    class Return extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    }
    Return.kind = "return";
    class Try extends BlockNode {
      render(opts) {
        let code2 = "try" + super.render(opts);
        if (this.catch)
          code2 += this.catch.render(opts);
        if (this.finally)
          code2 += this.finally.render(opts);
        return code2;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names2, constants) {
        var _a, _b;
        super.optimizeNames(names2, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names2, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names2, constants);
        return this;
      }
      get names() {
        const names2 = super.names;
        if (this.catch)
          addNames(names2, this.catch.names);
        if (this.finally)
          addNames(names2, this.finally.names);
        return names2;
      }
    }
    class Catch extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    }
    Catch.kind = "catch";
    class Finally extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    }
    Finally.kind = "finally";
    class CodeGen {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports2.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code2 = ["{"];
        for (const [key, value] of keyValues) {
          if (code2.length > 1)
            code2.push(",");
          code2.push(key);
          if (key !== value || this.opts.es5) {
            code2.push(":");
            (0, code_1.addCodeArg)(code2, value);
          }
        }
        code2.push("}");
        return new code_1._Code(code2);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    }
    exports2.CodeGen = CodeGen;
    function addNames(names2, from) {
      for (const n in from)
        names2[n] = (names2[n] || 0) + (from[n] || 0);
      return names2;
    }
    function addExprNames(names2, from) {
      return from instanceof code_1._CodeOrName ? addNames(names2, from.names) : names2;
    }
    function optimizeExpr(expr, names2, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items2, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items2.push(...c._items);
        else
          items2.push(c);
        return items2;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names2[n.str] !== 1)
          return n;
        delete names2[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names2[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names2, from) {
      for (const n in from)
        names2[n] = (names2[n] || 0) - (from[n] || 0);
    }
    function not2(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports2.not = not2;
    const andCode = mappend(exports2.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports2.and = and;
    const orCode = mappend(exports2.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports2.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  })(codegen);
  return codegen;
}
var util = {};
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  Object.defineProperty(util, "__esModule", { value: true });
  util.checkStrictMode = util.getErrorPath = util.Type = util.useFunc = util.setEvaluated = util.evaluatedPropsToName = util.mergeEvaluated = util.eachItem = util.unescapeJsonPointer = util.escapeJsonPointer = util.escapeFragment = util.unescapeFragment = util.schemaRefOrVal = util.schemaHasRulesButRef = util.schemaHasRules = util.checkUnknownRules = util.alwaysValidSchema = util.toHash = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const code_1 = /* @__PURE__ */ requireCode$1();
  function toHash(arr) {
    const hash = {};
    for (const item of arr)
      hash[item] = true;
    return hash;
  }
  util.toHash = toHash;
  function alwaysValidSchema(it, schema) {
    if (typeof schema == "boolean")
      return schema;
    if (Object.keys(schema).length === 0)
      return true;
    checkUnknownRules(it, schema);
    return !schemaHasRules(schema, it.self.RULES.all);
  }
  util.alwaysValidSchema = alwaysValidSchema;
  function checkUnknownRules(it, schema = it.schema) {
    const { opts, self: self2 } = it;
    if (!opts.strictSchema)
      return;
    if (typeof schema === "boolean")
      return;
    const rules2 = self2.RULES.keywords;
    for (const key in schema) {
      if (!rules2[key])
        checkStrictMode(it, `unknown keyword: "${key}"`);
    }
  }
  util.checkUnknownRules = checkUnknownRules;
  function schemaHasRules(schema, rules2) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (rules2[key])
        return true;
    return false;
  }
  util.schemaHasRules = schemaHasRules;
  function schemaHasRulesButRef(schema, RULES) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (key !== "$ref" && RULES.all[key])
        return true;
    return false;
  }
  util.schemaHasRulesButRef = schemaHasRulesButRef;
  function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword2, $data) {
    if (!$data) {
      if (typeof schema == "number" || typeof schema == "boolean")
        return schema;
      if (typeof schema == "string")
        return (0, codegen_1._)`${schema}`;
    }
    return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword2)}`;
  }
  util.schemaRefOrVal = schemaRefOrVal;
  function unescapeFragment(str) {
    return unescapeJsonPointer(decodeURIComponent(str));
  }
  util.unescapeFragment = unescapeFragment;
  function escapeFragment(str) {
    return encodeURIComponent(escapeJsonPointer(str));
  }
  util.escapeFragment = escapeFragment;
  function escapeJsonPointer(str) {
    if (typeof str == "number")
      return `${str}`;
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  util.escapeJsonPointer = escapeJsonPointer;
  function unescapeJsonPointer(str) {
    return str.replace(/~1/g, "/").replace(/~0/g, "~");
  }
  util.unescapeJsonPointer = unescapeJsonPointer;
  function eachItem(xs, f) {
    if (Array.isArray(xs)) {
      for (const x of xs)
        f(x);
    } else {
      f(xs);
    }
  }
  util.eachItem = eachItem;
  function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
    return (gen, from, to, toName) => {
      const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
      return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
    };
  }
  util.mergeEvaluated = {
    props: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
        gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
      }),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
        if (from === true) {
          gen.assign(to, true);
        } else {
          gen.assign(to, (0, codegen_1._)`${to} || {}`);
          setEvaluated(gen, to, from);
        }
      }),
      mergeValues: (from, to) => from === true ? true : { ...from, ...to },
      resultToName: evaluatedPropsToName
    }),
    items: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
      mergeValues: (from, to) => from === true ? true : Math.max(from, to),
      resultToName: (gen, items2) => gen.var("items", items2)
    })
  };
  function evaluatedPropsToName(gen, ps) {
    if (ps === true)
      return gen.var("props", true);
    const props = gen.var("props", (0, codegen_1._)`{}`);
    if (ps !== void 0)
      setEvaluated(gen, props, ps);
    return props;
  }
  util.evaluatedPropsToName = evaluatedPropsToName;
  function setEvaluated(gen, props, ps) {
    Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
  }
  util.setEvaluated = setEvaluated;
  const snippets = {};
  function useFunc(gen, f) {
    return gen.scopeValue("func", {
      ref: f,
      code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
    });
  }
  util.useFunc = useFunc;
  var Type;
  (function(Type2) {
    Type2[Type2["Num"] = 0] = "Num";
    Type2[Type2["Str"] = 1] = "Str";
  })(Type || (util.Type = Type = {}));
  function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
    if (dataProp instanceof codegen_1.Name) {
      const isNumber = dataPropType === Type.Num;
      return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
    }
    return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
  }
  util.getErrorPath = getErrorPath;
  function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
    if (!mode)
      return;
    msg = `strict mode: ${msg}`;
    if (mode === true)
      throw new Error(msg);
    it.self.logger.warn(msg);
  }
  util.checkStrictMode = checkStrictMode;
  return util;
}
var names = {};
var hasRequiredNames;
function requireNames() {
  if (hasRequiredNames) return names;
  hasRequiredNames = 1;
  Object.defineProperty(names, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names$1 = {
    // validation function arguments
    data: new codegen_1.Name("data"),
    // data passed to validation function
    // args passed from referencing schema
    valCxt: new codegen_1.Name("valCxt"),
    // validation/data context - should not be used directly, it is destructured to the names below
    instancePath: new codegen_1.Name("instancePath"),
    parentData: new codegen_1.Name("parentData"),
    parentDataProperty: new codegen_1.Name("parentDataProperty"),
    rootData: new codegen_1.Name("rootData"),
    // root data - same as the data passed to the first/top validation function
    dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
    // used to support recursiveRef and dynamicRef
    // function scoped variables
    vErrors: new codegen_1.Name("vErrors"),
    // null or array of validation errors
    errors: new codegen_1.Name("errors"),
    // counter of validation errors
    this: new codegen_1.Name("this"),
    // "globals"
    self: new codegen_1.Name("self"),
    scope: new codegen_1.Name("scope"),
    // JTD serialize/parse name for JSON string and position
    json: new codegen_1.Name("json"),
    jsonPos: new codegen_1.Name("jsonPos"),
    jsonLen: new codegen_1.Name("jsonLen"),
    jsonPart: new codegen_1.Name("jsonPart")
  };
  names.default = names$1;
  return names;
}
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendErrors = exports2.resetErrorsCount = exports2.reportExtraError = exports2.reportError = exports2.keyword$DataError = exports2.keywordError = void 0;
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const util_1 = /* @__PURE__ */ requireUtil();
    const names_1 = /* @__PURE__ */ requireNames();
    exports2.keywordError = {
      message: ({ keyword: keyword2 }) => (0, codegen_1.str)`must pass "${keyword2}" keyword validation`
    };
    exports2.keyword$DataError = {
      message: ({ keyword: keyword2, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword2}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword2}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports2.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports2.reportError = reportError;
    function reportExtraError(cxt, error = exports2.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports2.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports2.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword: keyword2, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword2}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports2.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    const E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword: keyword2, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword2}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword: keyword2, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword2], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  })(errors);
  return errors;
}
var hasRequiredBoolSchema;
function requireBoolSchema() {
  if (hasRequiredBoolSchema) return boolSchema;
  hasRequiredBoolSchema = 1;
  Object.defineProperty(boolSchema, "__esModule", { value: true });
  boolSchema.boolOrEmptySchema = boolSchema.topBoolOrEmptySchema = void 0;
  const errors_1 = /* @__PURE__ */ requireErrors();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const boolError = {
    message: "boolean schema is false"
  };
  function topBoolOrEmptySchema(it) {
    const { gen, schema, validateName } = it;
    if (schema === false) {
      falseSchemaError(it, false);
    } else if (typeof schema == "object" && schema.$async === true) {
      gen.return(names_1.default.data);
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, null);
      gen.return(true);
    }
  }
  boolSchema.topBoolOrEmptySchema = topBoolOrEmptySchema;
  function boolOrEmptySchema(it, valid) {
    const { gen, schema } = it;
    if (schema === false) {
      gen.var(valid, false);
      falseSchemaError(it);
    } else {
      gen.var(valid, true);
    }
  }
  boolSchema.boolOrEmptySchema = boolOrEmptySchema;
  function falseSchemaError(it, overrideAllErrors) {
    const { gen, data } = it;
    const cxt = {
      gen,
      keyword: "false schema",
      data,
      schema: false,
      schemaCode: false,
      schemaValue: false,
      params: {},
      it
    };
    (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
  }
  return boolSchema;
}
var dataType = {};
var rules = {};
var hasRequiredRules;
function requireRules() {
  if (hasRequiredRules) return rules;
  hasRequiredRules = 1;
  Object.defineProperty(rules, "__esModule", { value: true });
  rules.getRules = rules.isJSONType = void 0;
  const _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
  const jsonTypes = new Set(_jsonTypes);
  function isJSONType(x) {
    return typeof x == "string" && jsonTypes.has(x);
  }
  rules.isJSONType = isJSONType;
  function getRules() {
    const groups = {
      number: { type: "number", rules: [] },
      string: { type: "string", rules: [] },
      array: { type: "array", rules: [] },
      object: { type: "object", rules: [] }
    };
    return {
      types: { ...groups, integer: true, boolean: true, null: true },
      rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
      post: { rules: [] },
      all: {},
      keywords: {}
    };
  }
  rules.getRules = getRules;
  return rules;
}
var applicability = {};
var hasRequiredApplicability;
function requireApplicability() {
  if (hasRequiredApplicability) return applicability;
  hasRequiredApplicability = 1;
  Object.defineProperty(applicability, "__esModule", { value: true });
  applicability.shouldUseRule = applicability.shouldUseGroup = applicability.schemaHasRulesForType = void 0;
  function schemaHasRulesForType({ schema, self: self2 }, type2) {
    const group = self2.RULES.types[type2];
    return group && group !== true && shouldUseGroup(schema, group);
  }
  applicability.schemaHasRulesForType = schemaHasRulesForType;
  function shouldUseGroup(schema, group) {
    return group.rules.some((rule) => shouldUseRule(schema, rule));
  }
  applicability.shouldUseGroup = shouldUseGroup;
  function shouldUseRule(schema, rule) {
    var _a;
    return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
  }
  applicability.shouldUseRule = shouldUseRule;
  return applicability;
}
var hasRequiredDataType;
function requireDataType() {
  if (hasRequiredDataType) return dataType;
  hasRequiredDataType = 1;
  Object.defineProperty(dataType, "__esModule", { value: true });
  dataType.reportTypeError = dataType.checkDataTypes = dataType.checkDataType = dataType.coerceAndCheckDataType = dataType.getJSONTypes = dataType.getSchemaTypes = dataType.DataType = void 0;
  const rules_1 = /* @__PURE__ */ requireRules();
  const applicability_1 = /* @__PURE__ */ requireApplicability();
  const errors_1 = /* @__PURE__ */ requireErrors();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  var DataType;
  (function(DataType2) {
    DataType2[DataType2["Correct"] = 0] = "Correct";
    DataType2[DataType2["Wrong"] = 1] = "Wrong";
  })(DataType || (dataType.DataType = DataType = {}));
  function getSchemaTypes(schema) {
    const types2 = getJSONTypes(schema.type);
    const hasNull = types2.includes("null");
    if (hasNull) {
      if (schema.nullable === false)
        throw new Error("type: null contradicts nullable: false");
    } else {
      if (!types2.length && schema.nullable !== void 0) {
        throw new Error('"nullable" cannot be used without "type"');
      }
      if (schema.nullable === true)
        types2.push("null");
    }
    return types2;
  }
  dataType.getSchemaTypes = getSchemaTypes;
  function getJSONTypes(ts) {
    const types2 = Array.isArray(ts) ? ts : ts ? [ts] : [];
    if (types2.every(rules_1.isJSONType))
      return types2;
    throw new Error("type must be JSONType or JSONType[]: " + types2.join(","));
  }
  dataType.getJSONTypes = getJSONTypes;
  function coerceAndCheckDataType(it, types2) {
    const { gen, data, opts } = it;
    const coerceTo = coerceToTypes(types2, opts.coerceTypes);
    const checkTypes = types2.length > 0 && !(coerceTo.length === 0 && types2.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types2[0]));
    if (checkTypes) {
      const wrongType = checkDataTypes(types2, data, opts.strictNumbers, DataType.Wrong);
      gen.if(wrongType, () => {
        if (coerceTo.length)
          coerceData(it, types2, coerceTo);
        else
          reportTypeError(it);
      });
    }
    return checkTypes;
  }
  dataType.coerceAndCheckDataType = coerceAndCheckDataType;
  const COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
  function coerceToTypes(types2, coerceTypes) {
    return coerceTypes ? types2.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
  }
  function coerceData(it, types2, coerceTo) {
    const { gen, data, opts } = it;
    const dataType2 = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
    const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
    if (opts.coerceTypes === "array") {
      gen.if((0, codegen_1._)`${dataType2} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType2, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types2, data, opts.strictNumbers), () => gen.assign(coerced, data)));
    }
    gen.if((0, codegen_1._)`${coerced} !== undefined`);
    for (const t of coerceTo) {
      if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
        coerceSpecificType(t);
      }
    }
    gen.else();
    reportTypeError(it);
    gen.endIf();
    gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
      gen.assign(data, coerced);
      assignParentData(it, coerced);
    });
    function coerceSpecificType(t) {
      switch (t) {
        case "string":
          gen.elseIf((0, codegen_1._)`${dataType2} == "number" || ${dataType2} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
          return;
        case "number":
          gen.elseIf((0, codegen_1._)`${dataType2} == "boolean" || ${data} === null
              || (${dataType2} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "integer":
          gen.elseIf((0, codegen_1._)`${dataType2} === "boolean" || ${data} === null
              || (${dataType2} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "boolean":
          gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
          return;
        case "null":
          gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
          gen.assign(coerced, null);
          return;
        case "array":
          gen.elseIf((0, codegen_1._)`${dataType2} === "string" || ${dataType2} === "number"
              || ${dataType2} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
      }
    }
  }
  function assignParentData({ gen, parentData, parentDataProperty }, expr) {
    gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
  }
  function checkDataType(dataType2, data, strictNums, correct = DataType.Correct) {
    const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
    let cond;
    switch (dataType2) {
      case "null":
        return (0, codegen_1._)`${data} ${EQ} null`;
      case "array":
        cond = (0, codegen_1._)`Array.isArray(${data})`;
        break;
      case "object":
        cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
        break;
      case "integer":
        cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
        break;
      case "number":
        cond = numCond();
        break;
      default:
        return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType2}`;
    }
    return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
    function numCond(_cond = codegen_1.nil) {
      return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
    }
  }
  dataType.checkDataType = checkDataType;
  function checkDataTypes(dataTypes, data, strictNums, correct) {
    if (dataTypes.length === 1) {
      return checkDataType(dataTypes[0], data, strictNums, correct);
    }
    let cond;
    const types2 = (0, util_1.toHash)(dataTypes);
    if (types2.array && types2.object) {
      const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
      cond = types2.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
      delete types2.null;
      delete types2.array;
      delete types2.object;
    } else {
      cond = codegen_1.nil;
    }
    if (types2.number)
      delete types2.integer;
    for (const t in types2)
      cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
    return cond;
  }
  dataType.checkDataTypes = checkDataTypes;
  const typeError = {
    message: ({ schema }) => `must be ${schema}`,
    params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
  };
  function reportTypeError(it) {
    const cxt = getTypeErrorContext(it);
    (0, errors_1.reportError)(cxt, typeError);
  }
  dataType.reportTypeError = reportTypeError;
  function getTypeErrorContext(it) {
    const { gen, data, schema } = it;
    const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
    return {
      gen,
      keyword: "type",
      data,
      schema: schema.type,
      schemaCode,
      schemaValue: schemaCode,
      parentSchema: schema,
      params: {},
      it
    };
  }
  return dataType;
}
var defaults = {};
var hasRequiredDefaults;
function requireDefaults() {
  if (hasRequiredDefaults) return defaults;
  hasRequiredDefaults = 1;
  Object.defineProperty(defaults, "__esModule", { value: true });
  defaults.assignDefaults = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  function assignDefaults(it, ty) {
    const { properties: properties2, items: items2 } = it.schema;
    if (ty === "object" && properties2) {
      for (const key in properties2) {
        assignDefault(it, key, properties2[key].default);
      }
    } else if (ty === "array" && Array.isArray(items2)) {
      items2.forEach((sch, i) => assignDefault(it, i, sch.default));
    }
  }
  defaults.assignDefaults = assignDefaults;
  function assignDefault(it, prop, defaultValue) {
    const { gen, compositeRule, data, opts } = it;
    if (defaultValue === void 0)
      return;
    const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
    if (compositeRule) {
      (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
      return;
    }
    let condition = (0, codegen_1._)`${childData} === undefined`;
    if (opts.useDefaults === "empty") {
      condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
    }
    gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
  }
  return defaults;
}
var keyword = {};
var code = {};
var hasRequiredCode;
function requireCode() {
  if (hasRequiredCode) return code;
  hasRequiredCode = 1;
  Object.defineProperty(code, "__esModule", { value: true });
  code.validateUnion = code.validateArray = code.usePattern = code.callValidateCode = code.schemaProperties = code.allSchemaProperties = code.noPropertyInData = code.propertyInData = code.isOwnProperty = code.hasPropFunc = code.reportMissingProp = code.checkMissingProp = code.checkReportMissingProp = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const names_1 = /* @__PURE__ */ requireNames();
  const util_2 = /* @__PURE__ */ requireUtil();
  function checkReportMissingProp(cxt, prop) {
    const { gen, data, it } = cxt;
    gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
      cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
      cxt.error();
    });
  }
  code.checkReportMissingProp = checkReportMissingProp;
  function checkMissingProp({ gen, data, it: { opts } }, properties2, missing) {
    return (0, codegen_1.or)(...properties2.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
  }
  code.checkMissingProp = checkMissingProp;
  function reportMissingProp(cxt, missing) {
    cxt.setParams({ missingProperty: missing }, true);
    cxt.error();
  }
  code.reportMissingProp = reportMissingProp;
  function hasPropFunc(gen) {
    return gen.scopeValue("func", {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ref: Object.prototype.hasOwnProperty,
      code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
    });
  }
  code.hasPropFunc = hasPropFunc;
  function isOwnProperty(gen, data, property) {
    return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
  }
  code.isOwnProperty = isOwnProperty;
  function propertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
    return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
  }
  code.propertyInData = propertyInData;
  function noPropertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
    return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
  }
  code.noPropertyInData = noPropertyInData;
  function allSchemaProperties(schemaMap) {
    return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
  }
  code.allSchemaProperties = allSchemaProperties;
  function schemaProperties(it, schemaMap) {
    return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
  }
  code.schemaProperties = schemaProperties;
  function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
    const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
    const valCxt = [
      [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
      [names_1.default.parentData, it.parentData],
      [names_1.default.parentDataProperty, it.parentDataProperty],
      [names_1.default.rootData, names_1.default.rootData]
    ];
    if (it.opts.dynamicRef)
      valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
    const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
    return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
  }
  code.callValidateCode = callValidateCode;
  const newRegExp = (0, codegen_1._)`new RegExp`;
  function usePattern({ gen, it: { opts } }, pattern2) {
    const u = opts.unicodeRegExp ? "u" : "";
    const { regExp } = opts.code;
    const rx = regExp(pattern2, u);
    return gen.scopeValue("pattern", {
      key: rx.toString(),
      ref: rx,
      code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern2}, ${u})`
    });
  }
  code.usePattern = usePattern;
  function validateArray(cxt) {
    const { gen, data, keyword: keyword2, it } = cxt;
    const valid = gen.name("valid");
    if (it.allErrors) {
      const validArr = gen.let("valid", true);
      validateItems(() => gen.assign(validArr, false));
      return validArr;
    }
    gen.var(valid, true);
    validateItems(() => gen.break());
    return valid;
    function validateItems(notValid) {
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      gen.forRange("i", 0, len, (i) => {
        cxt.subschema({
          keyword: keyword2,
          dataProp: i,
          dataPropType: util_1.Type.Num
        }, valid);
        gen.if((0, codegen_1.not)(valid), notValid);
      });
    }
  }
  code.validateArray = validateArray;
  function validateUnion(cxt) {
    const { gen, schema, keyword: keyword2, it } = cxt;
    if (!Array.isArray(schema))
      throw new Error("ajv implementation error");
    const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
    if (alwaysValid && !it.opts.unevaluated)
      return;
    const valid = gen.let("valid", false);
    const schValid = gen.name("_valid");
    gen.block(() => schema.forEach((_sch, i) => {
      const schCxt = cxt.subschema({
        keyword: keyword2,
        schemaProp: i,
        compositeRule: true
      }, schValid);
      gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
      const merged = cxt.mergeValidEvaluated(schCxt, schValid);
      if (!merged)
        gen.if((0, codegen_1.not)(valid));
    }));
    cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
  }
  code.validateUnion = validateUnion;
  return code;
}
var hasRequiredKeyword;
function requireKeyword() {
  if (hasRequiredKeyword) return keyword;
  hasRequiredKeyword = 1;
  Object.defineProperty(keyword, "__esModule", { value: true });
  keyword.validateKeywordUsage = keyword.validSchemaType = keyword.funcKeywordCode = keyword.macroKeywordCode = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const code_1 = /* @__PURE__ */ requireCode();
  const errors_1 = /* @__PURE__ */ requireErrors();
  function macroKeywordCode(cxt, def) {
    const { gen, keyword: keyword2, schema, parentSchema, it } = cxt;
    const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
    const schemaRef = useKeyword(gen, keyword2, macroSchema);
    if (it.opts.validateSchema !== false)
      it.self.validateSchema(macroSchema, true);
    const valid = gen.name("valid");
    cxt.subschema({
      schema: macroSchema,
      schemaPath: codegen_1.nil,
      errSchemaPath: `${it.errSchemaPath}/${keyword2}`,
      topSchemaRef: schemaRef,
      compositeRule: true
    }, valid);
    cxt.pass(valid, () => cxt.error(true));
  }
  keyword.macroKeywordCode = macroKeywordCode;
  function funcKeywordCode(cxt, def) {
    var _a;
    const { gen, keyword: keyword2, schema, parentSchema, $data, it } = cxt;
    checkAsyncKeyword(it, def);
    const validate2 = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
    const validateRef = useKeyword(gen, keyword2, validate2);
    const valid = gen.let("valid");
    cxt.block$data(valid, validateKeyword);
    cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
    function validateKeyword() {
      if (def.errors === false) {
        assignValid();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => cxt.error());
      } else {
        const ruleErrs = def.async ? validateAsync() : validateSync();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => addErrs(cxt, ruleErrs));
      }
    }
    function validateAsync() {
      const ruleErrs = gen.let("ruleErrs", null);
      gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
      return ruleErrs;
    }
    function validateSync() {
      const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
      gen.assign(validateErrs, null);
      assignValid(codegen_1.nil);
      return validateErrs;
    }
    function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
      const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
      const passSchema = !("compile" in def && !$data || def.schema === false);
      gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
    }
    function reportErrs(errors2) {
      var _a2;
      gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors2);
    }
  }
  keyword.funcKeywordCode = funcKeywordCode;
  function modifyData(cxt) {
    const { gen, data, it } = cxt;
    gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
  }
  function addErrs(cxt, errs) {
    const { gen } = cxt;
    gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      (0, errors_1.extendErrors)(cxt);
    }, () => cxt.error());
  }
  function checkAsyncKeyword({ schemaEnv }, def) {
    if (def.async && !schemaEnv.$async)
      throw new Error("async keyword in sync schema");
  }
  function useKeyword(gen, keyword2, result) {
    if (result === void 0)
      throw new Error(`keyword "${keyword2}" failed to compile`);
    return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
  }
  function validSchemaType(schema, schemaType, allowUndefined = false) {
    return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
  }
  keyword.validSchemaType = validSchemaType;
  function validateKeywordUsage({ schema, opts, self: self2, errSchemaPath }, def, keyword2) {
    if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword2) : def.keyword !== keyword2) {
      throw new Error("ajv implementation error");
    }
    const deps = def.dependencies;
    if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
      throw new Error(`parent schema must have dependencies of ${keyword2}: ${deps.join(",")}`);
    }
    if (def.validateSchema) {
      const valid = def.validateSchema(schema[keyword2]);
      if (!valid) {
        const msg = `keyword "${keyword2}" value is invalid at path "${errSchemaPath}": ` + self2.errorsText(def.validateSchema.errors);
        if (opts.validateSchema === "log")
          self2.logger.error(msg);
        else
          throw new Error(msg);
      }
    }
  }
  keyword.validateKeywordUsage = validateKeywordUsage;
  return keyword;
}
var subschema = {};
var hasRequiredSubschema;
function requireSubschema() {
  if (hasRequiredSubschema) return subschema;
  hasRequiredSubschema = 1;
  Object.defineProperty(subschema, "__esModule", { value: true });
  subschema.extendSubschemaMode = subschema.extendSubschemaData = subschema.getSubschema = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  function getSubschema(it, { keyword: keyword2, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
    if (keyword2 !== void 0 && schema !== void 0) {
      throw new Error('both "keyword" and "schema" passed, only one allowed');
    }
    if (keyword2 !== void 0) {
      const sch = it.schema[keyword2];
      return schemaProp === void 0 ? {
        schema: sch,
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword2)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword2}`
      } : {
        schema: sch[schemaProp],
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword2)}${(0, codegen_1.getProperty)(schemaProp)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword2}/${(0, util_1.escapeFragment)(schemaProp)}`
      };
    }
    if (schema !== void 0) {
      if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
        throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
      }
      return {
        schema,
        schemaPath,
        topSchemaRef,
        errSchemaPath
      };
    }
    throw new Error('either "keyword" or "schema" must be passed');
  }
  subschema.getSubschema = getSubschema;
  function extendSubschemaData(subschema2, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
    if (data !== void 0 && dataProp !== void 0) {
      throw new Error('both "data" and "dataProp" passed, only one allowed');
    }
    const { gen } = it;
    if (dataProp !== void 0) {
      const { errorPath, dataPathArr, opts } = it;
      const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
      dataContextProps(nextData);
      subschema2.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
      subschema2.parentDataProperty = (0, codegen_1._)`${dataProp}`;
      subschema2.dataPathArr = [...dataPathArr, subschema2.parentDataProperty];
    }
    if (data !== void 0) {
      const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
      dataContextProps(nextData);
      if (propertyName !== void 0)
        subschema2.propertyName = propertyName;
    }
    if (dataTypes)
      subschema2.dataTypes = dataTypes;
    function dataContextProps(_nextData) {
      subschema2.data = _nextData;
      subschema2.dataLevel = it.dataLevel + 1;
      subschema2.dataTypes = [];
      it.definedProperties = /* @__PURE__ */ new Set();
      subschema2.parentData = it.data;
      subschema2.dataNames = [...it.dataNames, _nextData];
    }
  }
  subschema.extendSubschemaData = extendSubschemaData;
  function extendSubschemaMode(subschema2, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
    if (compositeRule !== void 0)
      subschema2.compositeRule = compositeRule;
    if (createErrors !== void 0)
      subschema2.createErrors = createErrors;
    if (allErrors !== void 0)
      subschema2.allErrors = allErrors;
    subschema2.jtdDiscriminator = jtdDiscriminator;
    subschema2.jtdMetadata = jtdMetadata;
  }
  subschema.extendSubschemaMode = extendSubschemaMode;
  return subschema;
}
var resolve = {};
var fastDeepEqual;
var hasRequiredFastDeepEqual;
function requireFastDeepEqual() {
  if (hasRequiredFastDeepEqual) return fastDeepEqual;
  hasRequiredFastDeepEqual = 1;
  fastDeepEqual = function equal2(a, b) {
    if (a === b) return true;
    if (a && b && typeof a == "object" && typeof b == "object") {
      if (a.constructor !== b.constructor) return false;
      var length, i, keys;
      if (Array.isArray(a)) {
        length = a.length;
        if (length != b.length) return false;
        for (i = length; i-- !== 0; )
          if (!equal2(a[i], b[i])) return false;
        return true;
      }
      if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
      if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
      if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length) return false;
      for (i = length; i-- !== 0; )
        if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
      for (i = length; i-- !== 0; ) {
        var key = keys[i];
        if (!equal2(a[key], b[key])) return false;
      }
      return true;
    }
    return a !== a && b !== b;
  };
  return fastDeepEqual;
}
var jsonSchemaTraverse = { exports: {} };
var hasRequiredJsonSchemaTraverse;
function requireJsonSchemaTraverse() {
  if (hasRequiredJsonSchemaTraverse) return jsonSchemaTraverse.exports;
  hasRequiredJsonSchemaTraverse = 1;
  var traverse = jsonSchemaTraverse.exports = function(schema, opts, cb) {
    if (typeof opts == "function") {
      cb = opts;
      opts = {};
    }
    cb = opts.cb || cb;
    var pre = typeof cb == "function" ? cb : cb.pre || function() {
    };
    var post = cb.post || function() {
    };
    _traverse(opts, pre, post, schema, "", schema);
  };
  traverse.keywords = {
    additionalItems: true,
    items: true,
    contains: true,
    additionalProperties: true,
    propertyNames: true,
    not: true,
    if: true,
    then: true,
    else: true
  };
  traverse.arrayKeywords = {
    items: true,
    allOf: true,
    anyOf: true,
    oneOf: true
  };
  traverse.propsKeywords = {
    $defs: true,
    definitions: true,
    properties: true,
    patternProperties: true,
    dependencies: true
  };
  traverse.skipKeywords = {
    default: true,
    enum: true,
    const: true,
    required: true,
    maximum: true,
    minimum: true,
    exclusiveMaximum: true,
    exclusiveMinimum: true,
    multipleOf: true,
    maxLength: true,
    minLength: true,
    pattern: true,
    format: true,
    maxItems: true,
    minItems: true,
    uniqueItems: true,
    maxProperties: true,
    minProperties: true
  };
  function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
    if (schema && typeof schema == "object" && !Array.isArray(schema)) {
      pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      for (var key in schema) {
        var sch = schema[key];
        if (Array.isArray(sch)) {
          if (key in traverse.arrayKeywords) {
            for (var i = 0; i < sch.length; i++)
              _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
          }
        } else if (key in traverse.propsKeywords) {
          if (sch && typeof sch == "object") {
            for (var prop in sch)
              _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
          }
        } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
          _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
        }
      }
      post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
    }
  }
  function escapeJsonPtr(str) {
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  return jsonSchemaTraverse.exports;
}
var hasRequiredResolve;
function requireResolve() {
  if (hasRequiredResolve) return resolve;
  hasRequiredResolve = 1;
  Object.defineProperty(resolve, "__esModule", { value: true });
  resolve.getSchemaRefs = resolve.resolveUrl = resolve.normalizeId = resolve._getFullPath = resolve.getFullPath = resolve.inlineRef = void 0;
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal2 = requireFastDeepEqual();
  const traverse = requireJsonSchemaTraverse();
  const SIMPLE_INLINED = /* @__PURE__ */ new Set([
    "type",
    "format",
    "pattern",
    "maxLength",
    "minLength",
    "maxProperties",
    "minProperties",
    "maxItems",
    "minItems",
    "maximum",
    "minimum",
    "uniqueItems",
    "multipleOf",
    "required",
    "enum",
    "const"
  ]);
  function inlineRef(schema, limit2 = true) {
    if (typeof schema == "boolean")
      return true;
    if (limit2 === true)
      return !hasRef(schema);
    if (!limit2)
      return false;
    return countKeys(schema) <= limit2;
  }
  resolve.inlineRef = inlineRef;
  const REF_KEYWORDS = /* @__PURE__ */ new Set([
    "$ref",
    "$recursiveRef",
    "$recursiveAnchor",
    "$dynamicRef",
    "$dynamicAnchor"
  ]);
  function hasRef(schema) {
    for (const key in schema) {
      if (REF_KEYWORDS.has(key))
        return true;
      const sch = schema[key];
      if (Array.isArray(sch) && sch.some(hasRef))
        return true;
      if (typeof sch == "object" && hasRef(sch))
        return true;
    }
    return false;
  }
  function countKeys(schema) {
    let count = 0;
    for (const key in schema) {
      if (key === "$ref")
        return Infinity;
      count++;
      if (SIMPLE_INLINED.has(key))
        continue;
      if (typeof schema[key] == "object") {
        (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
      }
      if (count === Infinity)
        return Infinity;
    }
    return count;
  }
  function getFullPath(resolver, id2 = "", normalize) {
    if (normalize !== false)
      id2 = normalizeId(id2);
    const p = resolver.parse(id2);
    return _getFullPath(resolver, p);
  }
  resolve.getFullPath = getFullPath;
  function _getFullPath(resolver, p) {
    const serialized = resolver.serialize(p);
    return serialized.split("#")[0] + "#";
  }
  resolve._getFullPath = _getFullPath;
  const TRAILING_SLASH_HASH = /#\/?$/;
  function normalizeId(id2) {
    return id2 ? id2.replace(TRAILING_SLASH_HASH, "") : "";
  }
  resolve.normalizeId = normalizeId;
  function resolveUrl(resolver, baseId, id2) {
    id2 = normalizeId(id2);
    return resolver.resolve(baseId, id2);
  }
  resolve.resolveUrl = resolveUrl;
  const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
  function getSchemaRefs(schema, baseId) {
    if (typeof schema == "boolean")
      return {};
    const { schemaId, uriResolver } = this.opts;
    const schId = normalizeId(schema[schemaId] || baseId);
    const baseIds = { "": schId };
    const pathPrefix = getFullPath(uriResolver, schId, false);
    const localRefs = {};
    const schemaRefs = /* @__PURE__ */ new Set();
    traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
      if (parentJsonPtr === void 0)
        return;
      const fullPath = pathPrefix + jsonPtr;
      let innerBaseId = baseIds[parentJsonPtr];
      if (typeof sch[schemaId] == "string")
        innerBaseId = addRef.call(this, sch[schemaId]);
      addAnchor.call(this, sch.$anchor);
      addAnchor.call(this, sch.$dynamicAnchor);
      baseIds[jsonPtr] = innerBaseId;
      function addRef(ref2) {
        const _resolve = this.opts.uriResolver.resolve;
        ref2 = normalizeId(innerBaseId ? _resolve(innerBaseId, ref2) : ref2);
        if (schemaRefs.has(ref2))
          throw ambiguos(ref2);
        schemaRefs.add(ref2);
        let schOrRef = this.refs[ref2];
        if (typeof schOrRef == "string")
          schOrRef = this.refs[schOrRef];
        if (typeof schOrRef == "object") {
          checkAmbiguosRef(sch, schOrRef.schema, ref2);
        } else if (ref2 !== normalizeId(fullPath)) {
          if (ref2[0] === "#") {
            checkAmbiguosRef(sch, localRefs[ref2], ref2);
            localRefs[ref2] = sch;
          } else {
            this.refs[ref2] = fullPath;
          }
        }
        return ref2;
      }
      function addAnchor(anchor) {
        if (typeof anchor == "string") {
          if (!ANCHOR.test(anchor))
            throw new Error(`invalid anchor "${anchor}"`);
          addRef.call(this, `#${anchor}`);
        }
      }
    });
    return localRefs;
    function checkAmbiguosRef(sch1, sch2, ref2) {
      if (sch2 !== void 0 && !equal2(sch1, sch2))
        throw ambiguos(ref2);
    }
    function ambiguos(ref2) {
      return new Error(`reference "${ref2}" resolves to more than one schema`);
    }
  }
  resolve.getSchemaRefs = getSchemaRefs;
  return resolve;
}
var hasRequiredValidate;
function requireValidate() {
  if (hasRequiredValidate) return validate;
  hasRequiredValidate = 1;
  Object.defineProperty(validate, "__esModule", { value: true });
  validate.getData = validate.KeywordCxt = validate.validateFunctionCode = void 0;
  const boolSchema_1 = /* @__PURE__ */ requireBoolSchema();
  const dataType_1 = /* @__PURE__ */ requireDataType();
  const applicability_1 = /* @__PURE__ */ requireApplicability();
  const dataType_2 = /* @__PURE__ */ requireDataType();
  const defaults_1 = /* @__PURE__ */ requireDefaults();
  const keyword_1 = /* @__PURE__ */ requireKeyword();
  const subschema_1 = /* @__PURE__ */ requireSubschema();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const resolve_1 = /* @__PURE__ */ requireResolve();
  const util_1 = /* @__PURE__ */ requireUtil();
  const errors_1 = /* @__PURE__ */ requireErrors();
  function validateFunctionCode(it) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        topSchemaObjCode(it);
        return;
      }
    }
    validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
  }
  validate.validateFunctionCode = validateFunctionCode;
  function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
    if (opts.code.es5) {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
        gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
        destructureValCxtES5(gen, opts);
        gen.code(body);
      });
    } else {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
    }
  }
  function destructureValCxt(opts) {
    return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
  }
  function destructureValCxtES5(gen, opts) {
    gen.if(names_1.default.valCxt, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
      gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
    }, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.rootData, names_1.default.data);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
    });
  }
  function topSchemaObjCode(it) {
    const { schema, opts, gen } = it;
    validateFunction(it, () => {
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      checkNoDefault(it);
      gen.let(names_1.default.vErrors, null);
      gen.let(names_1.default.errors, 0);
      if (opts.unevaluated)
        resetEvaluated(it);
      typeAndKeywords(it);
      returnResults(it);
    });
    return;
  }
  function resetEvaluated(it) {
    const { gen, validateName } = it;
    it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
  }
  function funcSourceUrl(schema, opts) {
    const schId = typeof schema == "object" && schema[opts.schemaId];
    return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
  }
  function subschemaCode(it, valid) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        subSchemaObjCode(it, valid);
        return;
      }
    }
    (0, boolSchema_1.boolOrEmptySchema)(it, valid);
  }
  function schemaCxtHasRules({ schema, self: self2 }) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (self2.RULES.all[key])
        return true;
    return false;
  }
  function isSchemaObj(it) {
    return typeof it.schema != "boolean";
  }
  function subSchemaObjCode(it, valid) {
    const { schema, gen, opts } = it;
    if (opts.$comment && schema.$comment)
      commentKeyword(it);
    updateContext(it);
    checkAsyncSchema(it);
    const errsCount = gen.const("_errs", names_1.default.errors);
    typeAndKeywords(it, errsCount);
    gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
  }
  function checkKeywords(it) {
    (0, util_1.checkUnknownRules)(it);
    checkRefsAndKeywords(it);
  }
  function typeAndKeywords(it, errsCount) {
    if (it.opts.jtd)
      return schemaKeywords(it, [], false, errsCount);
    const types2 = (0, dataType_1.getSchemaTypes)(it.schema);
    const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types2);
    schemaKeywords(it, types2, !checkedTypes, errsCount);
  }
  function checkRefsAndKeywords(it) {
    const { schema, errSchemaPath, opts, self: self2 } = it;
    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self2.RULES)) {
      self2.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
    }
  }
  function checkNoDefault(it) {
    const { schema, opts } = it;
    if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
      (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
    }
  }
  function updateContext(it) {
    const schId = it.schema[it.opts.schemaId];
    if (schId)
      it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
  }
  function checkAsyncSchema(it) {
    if (it.schema.$async && !it.schemaEnv.$async)
      throw new Error("async schema in sync schema");
  }
  function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
    const msg = schema.$comment;
    if (opts.$comment === true) {
      gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
    } else if (typeof opts.$comment == "function") {
      const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
      const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
      gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
    }
  }
  function returnResults(it) {
    const { gen, schemaEnv, validateName, ValidationError, opts } = it;
    if (schemaEnv.$async) {
      gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
      if (opts.unevaluated)
        assignEvaluated(it);
      gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
    }
  }
  function assignEvaluated({ gen, evaluated, props, items: items2 }) {
    if (props instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.props`, props);
    if (items2 instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.items`, items2);
  }
  function schemaKeywords(it, types2, typeErrors, errsCount) {
    const { gen, schema, data, allErrors, opts, self: self2 } = it;
    const { RULES } = self2;
    if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
      gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
      return;
    }
    if (!opts.jtd)
      checkStrictTypes(it, types2);
    gen.block(() => {
      for (const group of RULES.rules)
        groupKeywords(group);
      groupKeywords(RULES.post);
    });
    function groupKeywords(group) {
      if (!(0, applicability_1.shouldUseGroup)(schema, group))
        return;
      if (group.type) {
        gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
        iterateKeywords(it, group);
        if (types2.length === 1 && types2[0] === group.type && typeErrors) {
          gen.else();
          (0, dataType_2.reportTypeError)(it);
        }
        gen.endIf();
      } else {
        iterateKeywords(it, group);
      }
      if (!allErrors)
        gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
    }
  }
  function iterateKeywords(it, group) {
    const { gen, schema, opts: { useDefaults } } = it;
    if (useDefaults)
      (0, defaults_1.assignDefaults)(it, group.type);
    gen.block(() => {
      for (const rule of group.rules) {
        if ((0, applicability_1.shouldUseRule)(schema, rule)) {
          keywordCode(it, rule.keyword, rule.definition, group.type);
        }
      }
    });
  }
  function checkStrictTypes(it, types2) {
    if (it.schemaEnv.meta || !it.opts.strictTypes)
      return;
    checkContextTypes(it, types2);
    if (!it.opts.allowUnionTypes)
      checkMultipleTypes(it, types2);
    checkKeywordTypes(it, it.dataTypes);
  }
  function checkContextTypes(it, types2) {
    if (!types2.length)
      return;
    if (!it.dataTypes.length) {
      it.dataTypes = types2;
      return;
    }
    types2.forEach((t) => {
      if (!includesType(it.dataTypes, t)) {
        strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
      }
    });
    narrowSchemaTypes(it, types2);
  }
  function checkMultipleTypes(it, ts) {
    if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
      strictTypesError(it, "use allowUnionTypes to allow union type keyword");
    }
  }
  function checkKeywordTypes(it, ts) {
    const rules2 = it.self.RULES.all;
    for (const keyword2 in rules2) {
      const rule = rules2[keyword2];
      if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
        const { type: type2 } = rule.definition;
        if (type2.length && !type2.some((t) => hasApplicableType(ts, t))) {
          strictTypesError(it, `missing type "${type2.join(",")}" for keyword "${keyword2}"`);
        }
      }
    }
  }
  function hasApplicableType(schTs, kwdT) {
    return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
  }
  function includesType(ts, t) {
    return ts.includes(t) || t === "integer" && ts.includes("number");
  }
  function narrowSchemaTypes(it, withTypes) {
    const ts = [];
    for (const t of it.dataTypes) {
      if (includesType(withTypes, t))
        ts.push(t);
      else if (withTypes.includes("integer") && t === "number")
        ts.push("integer");
    }
    it.dataTypes = ts;
  }
  function strictTypesError(it, msg) {
    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
    msg += ` at "${schemaPath}" (strictTypes)`;
    (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
  }
  class KeywordCxt {
    constructor(it, def, keyword2) {
      (0, keyword_1.validateKeywordUsage)(it, def, keyword2);
      this.gen = it.gen;
      this.allErrors = it.allErrors;
      this.keyword = keyword2;
      this.data = it.data;
      this.schema = it.schema[keyword2];
      this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
      this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword2, this.$data);
      this.schemaType = def.schemaType;
      this.parentSchema = it.schema;
      this.params = {};
      this.it = it;
      this.def = def;
      if (this.$data) {
        this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
      } else {
        this.schemaCode = this.schemaValue;
        if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
          throw new Error(`${keyword2} value must be ${JSON.stringify(def.schemaType)}`);
        }
      }
      if ("code" in def ? def.trackErrors : def.errors !== false) {
        this.errsCount = it.gen.const("_errs", names_1.default.errors);
      }
    }
    result(condition, successAction, failAction) {
      this.failResult((0, codegen_1.not)(condition), successAction, failAction);
    }
    failResult(condition, successAction, failAction) {
      this.gen.if(condition);
      if (failAction)
        failAction();
      else
        this.error();
      if (successAction) {
        this.gen.else();
        successAction();
        if (this.allErrors)
          this.gen.endIf();
      } else {
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
    }
    pass(condition, failAction) {
      this.failResult((0, codegen_1.not)(condition), void 0, failAction);
    }
    fail(condition) {
      if (condition === void 0) {
        this.error();
        if (!this.allErrors)
          this.gen.if(false);
        return;
      }
      this.gen.if(condition);
      this.error();
      if (this.allErrors)
        this.gen.endIf();
      else
        this.gen.else();
    }
    fail$data(condition) {
      if (!this.$data)
        return this.fail(condition);
      const { schemaCode } = this;
      this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
    }
    error(append, errorParams, errorPaths) {
      if (errorParams) {
        this.setParams(errorParams);
        this._error(append, errorPaths);
        this.setParams({});
        return;
      }
      this._error(append, errorPaths);
    }
    _error(append, errorPaths) {
      (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
    }
    $dataError() {
      (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
    }
    reset() {
      if (this.errsCount === void 0)
        throw new Error('add "trackErrors" to keyword definition');
      (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
    }
    ok(cond) {
      if (!this.allErrors)
        this.gen.if(cond);
    }
    setParams(obj, assign) {
      if (assign)
        Object.assign(this.params, obj);
      else
        this.params = obj;
    }
    block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
      this.gen.block(() => {
        this.check$data(valid, $dataValid);
        codeBlock();
      });
    }
    check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
      if (!this.$data)
        return;
      const { gen, schemaCode, schemaType, def } = this;
      gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
      if (valid !== codegen_1.nil)
        gen.assign(valid, true);
      if (schemaType.length || def.validateSchema) {
        gen.elseIf(this.invalid$data());
        this.$dataError();
        if (valid !== codegen_1.nil)
          gen.assign(valid, false);
      }
      gen.else();
    }
    invalid$data() {
      const { gen, schemaCode, schemaType, def, it } = this;
      return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
      function wrong$DataType() {
        if (schemaType.length) {
          if (!(schemaCode instanceof codegen_1.Name))
            throw new Error("ajv implementation error");
          const st = Array.isArray(schemaType) ? schemaType : [schemaType];
          return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
        }
        return codegen_1.nil;
      }
      function invalid$DataSchema() {
        if (def.validateSchema) {
          const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
          return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
        }
        return codegen_1.nil;
      }
    }
    subschema(appl, valid) {
      const subschema2 = (0, subschema_1.getSubschema)(this.it, appl);
      (0, subschema_1.extendSubschemaData)(subschema2, this.it, appl);
      (0, subschema_1.extendSubschemaMode)(subschema2, appl);
      const nextContext = { ...this.it, ...subschema2, items: void 0, props: void 0 };
      subschemaCode(nextContext, valid);
      return nextContext;
    }
    mergeEvaluated(schemaCxt, toName) {
      const { it, gen } = this;
      if (!it.opts.unevaluated)
        return;
      if (it.props !== true && schemaCxt.props !== void 0) {
        it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
      }
      if (it.items !== true && schemaCxt.items !== void 0) {
        it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
      }
    }
    mergeValidEvaluated(schemaCxt, valid) {
      const { it, gen } = this;
      if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
        gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
        return true;
      }
    }
  }
  validate.KeywordCxt = KeywordCxt;
  function keywordCode(it, keyword2, def, ruleType) {
    const cxt = new KeywordCxt(it, def, keyword2);
    if ("code" in def) {
      def.code(cxt, ruleType);
    } else if (cxt.$data && def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    } else if ("macro" in def) {
      (0, keyword_1.macroKeywordCode)(cxt, def);
    } else if (def.compile || def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    }
  }
  const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
  const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
  function getData($data, { dataLevel, dataNames, dataPathArr }) {
    let jsonPointer;
    let data;
    if ($data === "")
      return names_1.default.rootData;
    if ($data[0] === "/") {
      if (!JSON_POINTER.test($data))
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      jsonPointer = $data;
      data = names_1.default.rootData;
    } else {
      const matches = RELATIVE_JSON_POINTER.exec($data);
      if (!matches)
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      const up = +matches[1];
      jsonPointer = matches[2];
      if (jsonPointer === "#") {
        if (up >= dataLevel)
          throw new Error(errorMsg("property/index", up));
        return dataPathArr[dataLevel - up];
      }
      if (up > dataLevel)
        throw new Error(errorMsg("data", up));
      data = dataNames[dataLevel - up];
      if (!jsonPointer)
        return data;
    }
    let expr = data;
    const segments = jsonPointer.split("/");
    for (const segment of segments) {
      if (segment) {
        data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
        expr = (0, codegen_1._)`${expr} && ${data}`;
      }
    }
    return expr;
    function errorMsg(pointerType, up) {
      return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
    }
  }
  validate.getData = getData;
  return validate;
}
var validation_error = {};
var hasRequiredValidation_error;
function requireValidation_error() {
  if (hasRequiredValidation_error) return validation_error;
  hasRequiredValidation_error = 1;
  Object.defineProperty(validation_error, "__esModule", { value: true });
  class ValidationError extends Error {
    constructor(errors2) {
      super("validation failed");
      this.errors = errors2;
      this.ajv = this.validation = true;
    }
  }
  validation_error.default = ValidationError;
  return validation_error;
}
var ref_error = {};
var hasRequiredRef_error;
function requireRef_error() {
  if (hasRequiredRef_error) return ref_error;
  hasRequiredRef_error = 1;
  Object.defineProperty(ref_error, "__esModule", { value: true });
  const resolve_1 = /* @__PURE__ */ requireResolve();
  class MissingRefError extends Error {
    constructor(resolver, baseId, ref2, msg) {
      super(msg || `can't resolve reference ${ref2} from id ${baseId}`);
      this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref2);
      this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
    }
  }
  ref_error.default = MissingRefError;
  return ref_error;
}
var compile = {};
var hasRequiredCompile;
function requireCompile() {
  if (hasRequiredCompile) return compile;
  hasRequiredCompile = 1;
  Object.defineProperty(compile, "__esModule", { value: true });
  compile.resolveSchema = compile.getCompilingSchema = compile.resolveRef = compile.compileSchema = compile.SchemaEnv = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const validation_error_1 = /* @__PURE__ */ requireValidation_error();
  const names_1 = /* @__PURE__ */ requireNames();
  const resolve_1 = /* @__PURE__ */ requireResolve();
  const util_1 = /* @__PURE__ */ requireUtil();
  const validate_1 = /* @__PURE__ */ requireValidate();
  class SchemaEnv {
    constructor(env) {
      var _a;
      this.refs = {};
      this.dynamicAnchors = {};
      let schema;
      if (typeof env.schema == "object")
        schema = env.schema;
      this.schema = env.schema;
      this.schemaId = env.schemaId;
      this.root = env.root || this;
      this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
      this.schemaPath = env.schemaPath;
      this.localRefs = env.localRefs;
      this.meta = env.meta;
      this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
      this.refs = {};
    }
  }
  compile.SchemaEnv = SchemaEnv;
  function compileSchema(sch) {
    const _sch = getCompilingSchema.call(this, sch);
    if (_sch)
      return _sch;
    const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
    const { es5, lines } = this.opts.code;
    const { ownProperties } = this.opts;
    const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
    let _ValidationError;
    if (sch.$async) {
      _ValidationError = gen.scopeValue("Error", {
        ref: validation_error_1.default,
        code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
      });
    }
    const validateName = gen.scopeName("validate");
    sch.validateName = validateName;
    const schemaCxt = {
      gen,
      allErrors: this.opts.allErrors,
      data: names_1.default.data,
      parentData: names_1.default.parentData,
      parentDataProperty: names_1.default.parentDataProperty,
      dataNames: [names_1.default.data],
      dataPathArr: [codegen_1.nil],
      // TODO can its length be used as dataLevel if nil is removed?
      dataLevel: 0,
      dataTypes: [],
      definedProperties: /* @__PURE__ */ new Set(),
      topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
      validateName,
      ValidationError: _ValidationError,
      schema: sch.schema,
      schemaEnv: sch,
      rootId,
      baseId: sch.baseId || rootId,
      schemaPath: codegen_1.nil,
      errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
      errorPath: (0, codegen_1._)`""`,
      opts: this.opts,
      self: this
    };
    let sourceCode;
    try {
      this._compilations.add(sch);
      (0, validate_1.validateFunctionCode)(schemaCxt);
      gen.optimize(this.opts.code.optimize);
      const validateCode = gen.toString();
      sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
      if (this.opts.code.process)
        sourceCode = this.opts.code.process(sourceCode, sch);
      const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
      const validate2 = makeValidate(this, this.scope.get());
      this.scope.value(validateName, { ref: validate2 });
      validate2.errors = null;
      validate2.schema = sch.schema;
      validate2.schemaEnv = sch;
      if (sch.$async)
        validate2.$async = true;
      if (this.opts.code.source === true) {
        validate2.source = { validateName, validateCode, scopeValues: gen._values };
      }
      if (this.opts.unevaluated) {
        const { props, items: items2 } = schemaCxt;
        validate2.evaluated = {
          props: props instanceof codegen_1.Name ? void 0 : props,
          items: items2 instanceof codegen_1.Name ? void 0 : items2,
          dynamicProps: props instanceof codegen_1.Name,
          dynamicItems: items2 instanceof codegen_1.Name
        };
        if (validate2.source)
          validate2.source.evaluated = (0, codegen_1.stringify)(validate2.evaluated);
      }
      sch.validate = validate2;
      return sch;
    } catch (e) {
      delete sch.validate;
      delete sch.validateName;
      if (sourceCode)
        this.logger.error("Error compiling schema, function code:", sourceCode);
      throw e;
    } finally {
      this._compilations.delete(sch);
    }
  }
  compile.compileSchema = compileSchema;
  function resolveRef(root2, baseId, ref2) {
    var _a;
    ref2 = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref2);
    const schOrFunc = root2.refs[ref2];
    if (schOrFunc)
      return schOrFunc;
    let _sch = resolve2.call(this, root2, ref2);
    if (_sch === void 0) {
      const schema = (_a = root2.localRefs) === null || _a === void 0 ? void 0 : _a[ref2];
      const { schemaId } = this.opts;
      if (schema)
        _sch = new SchemaEnv({ schema, schemaId, root: root2, baseId });
    }
    if (_sch === void 0)
      return;
    return root2.refs[ref2] = inlineOrCompile.call(this, _sch);
  }
  compile.resolveRef = resolveRef;
  function inlineOrCompile(sch) {
    if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
      return sch.schema;
    return sch.validate ? sch : compileSchema.call(this, sch);
  }
  function getCompilingSchema(schEnv) {
    for (const sch of this._compilations) {
      if (sameSchemaEnv(sch, schEnv))
        return sch;
    }
  }
  compile.getCompilingSchema = getCompilingSchema;
  function sameSchemaEnv(s1, s2) {
    return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
  }
  function resolve2(root2, ref2) {
    let sch;
    while (typeof (sch = this.refs[ref2]) == "string")
      ref2 = sch;
    return sch || this.schemas[ref2] || resolveSchema.call(this, root2, ref2);
  }
  function resolveSchema(root2, ref2) {
    const p = this.opts.uriResolver.parse(ref2);
    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root2.baseId, void 0);
    if (Object.keys(root2.schema).length > 0 && refPath === baseId) {
      return getJsonPointer.call(this, p, root2);
    }
    const id2 = (0, resolve_1.normalizeId)(refPath);
    const schOrRef = this.refs[id2] || this.schemas[id2];
    if (typeof schOrRef == "string") {
      const sch = resolveSchema.call(this, root2, schOrRef);
      if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
        return;
      return getJsonPointer.call(this, p, sch);
    }
    if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
      return;
    if (!schOrRef.validate)
      compileSchema.call(this, schOrRef);
    if (id2 === (0, resolve_1.normalizeId)(ref2)) {
      const { schema } = schOrRef;
      const { schemaId } = this.opts;
      const schId = schema[schemaId];
      if (schId)
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      return new SchemaEnv({ schema, schemaId, root: root2, baseId });
    }
    return getJsonPointer.call(this, p, schOrRef);
  }
  compile.resolveSchema = resolveSchema;
  const PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
    "properties",
    "patternProperties",
    "enum",
    "dependencies",
    "definitions"
  ]);
  function getJsonPointer(parsedRef, { baseId, schema, root: root2 }) {
    var _a;
    if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
      return;
    for (const part of parsedRef.fragment.slice(1).split("/")) {
      if (typeof schema === "boolean")
        return;
      const partSchema = schema[(0, util_1.unescapeFragment)(part)];
      if (partSchema === void 0)
        return;
      schema = partSchema;
      const schId = typeof schema === "object" && schema[this.opts.schemaId];
      if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      }
    }
    let env;
    if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
      const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
      env = resolveSchema.call(this, root2, $ref);
    }
    const { schemaId } = this.opts;
    env = env || new SchemaEnv({ schema, schemaId, root: root2, baseId });
    if (env.schema !== env.root.schema)
      return env;
    return void 0;
  }
  return compile;
}
const $id$b = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#";
const description = "Meta-schema for $data reference (JSON AnySchema extension proposal)";
const type$b = "object";
const required$3 = ["$data"];
const properties$c = { "$data": { "type": "string", "anyOf": [{ "format": "relative-json-pointer" }, { "format": "json-pointer" }] } };
const additionalProperties$3 = false;
const require$$9 = {
  $id: $id$b,
  description,
  type: type$b,
  required: required$3,
  properties: properties$c,
  additionalProperties: additionalProperties$3
};
var uri = {};
var fastUri = { exports: {} };
var utils;
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  const isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
  const isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
  const isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
  const isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
  const isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
  function stringArrayToHexStripped(input) {
    let acc = "";
    let code2 = 0;
    let i = 0;
    for (i = 0; i < input.length; i++) {
      code2 = input[i].charCodeAt(0);
      if (code2 === 48) {
        continue;
      }
      if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
        return "";
      }
      acc += input[i];
      break;
    }
    for (i += 1; i < input.length; i++) {
      code2 = input[i].charCodeAt(0);
      if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
        return "";
      }
      acc += input[i];
    }
    return acc;
  }
  const nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
  function consumeIsZone(buffer) {
    buffer.length = 0;
    return true;
  }
  function consumeHextets(buffer, address, output) {
    if (buffer.length) {
      const hex = stringArrayToHexStripped(buffer);
      if (hex !== "") {
        address.push(hex);
      } else {
        output.error = true;
        return false;
      }
      buffer.length = 0;
    }
    return true;
  }
  function getIPV6(input) {
    let tokenCount = 0;
    const output = { error: false, address: "", zone: "" };
    const address = [];
    const buffer = [];
    let endipv6Encountered = false;
    let endIpv6 = false;
    let consume = consumeHextets;
    for (let i = 0; i < input.length; i++) {
      const cursor = input[i];
      if (cursor === "[" || cursor === "]") {
        continue;
      }
      if (cursor === ":") {
        if (endipv6Encountered === true) {
          endIpv6 = true;
        }
        if (!consume(buffer, address, output)) {
          break;
        }
        if (++tokenCount > 7) {
          output.error = true;
          break;
        }
        if (i > 0 && input[i - 1] === ":") {
          endipv6Encountered = true;
        }
        address.push(":");
        continue;
      } else if (cursor === "%") {
        if (!consume(buffer, address, output)) {
          break;
        }
        consume = consumeIsZone;
      } else {
        buffer.push(cursor);
        continue;
      }
    }
    if (buffer.length) {
      if (consume === consumeIsZone) {
        output.zone = buffer.join("");
      } else if (endIpv6) {
        address.push(buffer.join(""));
      } else {
        address.push(stringArrayToHexStripped(buffer));
      }
    }
    output.address = address.join("");
    return output;
  }
  function normalizeIPv6(host) {
    if (findToken(host, ":") < 2) {
      return { host, isIPV6: false };
    }
    const ipv6 = getIPV6(host);
    if (!ipv6.error) {
      let newHost = ipv6.address;
      let escapedHost = ipv6.address;
      if (ipv6.zone) {
        newHost += "%" + ipv6.zone;
        escapedHost += "%25" + ipv6.zone;
      }
      return { host: newHost, isIPV6: true, escapedHost };
    } else {
      return { host, isIPV6: false };
    }
  }
  function findToken(str, token) {
    let ind = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === token) ind++;
    }
    return ind;
  }
  function removeDotSegments(path2) {
    let input = path2;
    const output = [];
    let nextSlash = -1;
    let len = 0;
    while (len = input.length) {
      if (len === 1) {
        if (input === ".") {
          break;
        } else if (input === "/") {
          output.push("/");
          break;
        } else {
          output.push(input);
          break;
        }
      } else if (len === 2) {
        if (input[0] === ".") {
          if (input[1] === ".") {
            break;
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === "." || input[1] === "/") {
            output.push("/");
            break;
          }
        }
      } else if (len === 3) {
        if (input === "/..") {
          if (output.length !== 0) {
            output.pop();
          }
          output.push("/");
          break;
        }
      }
      if (input[0] === ".") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(3);
            continue;
          }
        } else if (input[1] === "/") {
          input = input.slice(2);
          continue;
        }
      } else if (input[0] === "/") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(2);
            continue;
          } else if (input[2] === ".") {
            if (input[3] === "/") {
              input = input.slice(3);
              if (output.length !== 0) {
                output.pop();
              }
              continue;
            }
          }
        }
      }
      if ((nextSlash = input.indexOf("/", 1)) === -1) {
        output.push(input);
        break;
      } else {
        output.push(input.slice(0, nextSlash));
        input = input.slice(nextSlash);
      }
    }
    return output.join("");
  }
  const HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
  const HOST_DELIM_RE = /[@/?#:]/g;
  const HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
  function reescapeHostDelimiters(host, isIP) {
    const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
    re.lastIndex = 0;
    return host.replace(re, (ch) => HOST_DELIMS[ch]);
  }
  function normalizePercentEncoding(input, decodeUnreserved = false) {
    if (input.indexOf("%") === -1) {
      return input;
    }
    let output = "";
    for (let i = 0; i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decodeUnreserved && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      output += input[i];
    }
    return output;
  }
  function normalizePathEncoding(input) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decoded !== "." && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isPathCharacter(input[i])) {
        output += input[i];
      } else {
        output += escape(input[i]);
      }
    }
    return output;
  }
  function escapePreservingEscapes(input) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      output += escape(input[i]);
    }
    return output;
  }
  function recomposeAuthority(component) {
    const uriTokens = [];
    if (component.userinfo !== void 0) {
      uriTokens.push(component.userinfo);
      uriTokens.push("@");
    }
    if (component.host !== void 0) {
      let host = unescape(component.host);
      if (!isIPv4(host)) {
        const ipV6res = normalizeIPv6(host);
        if (ipV6res.isIPV6 === true) {
          host = `[${ipV6res.escapedHost}]`;
        } else {
          host = reescapeHostDelimiters(host, false);
        }
      }
      uriTokens.push(host);
    }
    if (typeof component.port === "number" || typeof component.port === "string") {
      uriTokens.push(":");
      uriTokens.push(String(component.port));
    }
    return uriTokens.length ? uriTokens.join("") : void 0;
  }
  utils = {
    nonSimpleDomain,
    recomposeAuthority,
    reescapeHostDelimiters,
    normalizePercentEncoding,
    normalizePathEncoding,
    escapePreservingEscapes,
    removeDotSegments,
    isIPv4,
    isUUID,
    normalizeIPv6,
    stringArrayToHexStripped
  };
  return utils;
}
var schemes;
var hasRequiredSchemes;
function requireSchemes() {
  if (hasRequiredSchemes) return schemes;
  hasRequiredSchemes = 1;
  const { isUUID } = requireUtils();
  const URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
  const supportedSchemeNames = (
    /** @type {const} */
    [
      "http",
      "https",
      "ws",
      "wss",
      "urn",
      "urn:uuid"
    ]
  );
  function isValidSchemeName(name) {
    return supportedSchemeNames.indexOf(
      /** @type {*} */
      name
    ) !== -1;
  }
  function wsIsSecure(wsComponent) {
    if (wsComponent.secure === true) {
      return true;
    } else if (wsComponent.secure === false) {
      return false;
    } else if (wsComponent.scheme) {
      return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
    } else {
      return false;
    }
  }
  function httpParse(component) {
    if (!component.host) {
      component.error = component.error || "HTTP URIs must have a host.";
    }
    return component;
  }
  function httpSerialize(component) {
    const secure = String(component.scheme).toLowerCase() === "https";
    if (component.port === (secure ? 443 : 80) || component.port === "") {
      component.port = void 0;
    }
    if (!component.path) {
      component.path = "/";
    }
    return component;
  }
  function wsParse(wsComponent) {
    wsComponent.secure = wsIsSecure(wsComponent);
    wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
    wsComponent.path = void 0;
    wsComponent.query = void 0;
    return wsComponent;
  }
  function wsSerialize(wsComponent) {
    if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
      wsComponent.port = void 0;
    }
    if (typeof wsComponent.secure === "boolean") {
      wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
      wsComponent.secure = void 0;
    }
    if (wsComponent.resourceName) {
      const [path2, query] = wsComponent.resourceName.split("?");
      wsComponent.path = path2 && path2 !== "/" ? path2 : void 0;
      wsComponent.query = query;
      wsComponent.resourceName = void 0;
    }
    wsComponent.fragment = void 0;
    return wsComponent;
  }
  function urnParse(urnComponent, options) {
    if (!urnComponent.path) {
      urnComponent.error = "URN can not be parsed";
      return urnComponent;
    }
    const matches = urnComponent.path.match(URN_REG);
    if (matches) {
      const scheme = options.scheme || urnComponent.scheme || "urn";
      urnComponent.nid = matches[1].toLowerCase();
      urnComponent.nss = matches[2];
      const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      urnComponent.path = void 0;
      if (schemeHandler) {
        urnComponent = schemeHandler.parse(urnComponent, options);
      }
    } else {
      urnComponent.error = urnComponent.error || "URN can not be parsed.";
    }
    return urnComponent;
  }
  function urnSerialize(urnComponent, options) {
    if (urnComponent.nid === void 0) {
      throw new Error("URN without nid cannot be serialized");
    }
    const scheme = options.scheme || urnComponent.scheme || "urn";
    const nid = urnComponent.nid.toLowerCase();
    const urnScheme = `${scheme}:${options.nid || nid}`;
    const schemeHandler = getSchemeHandler(urnScheme);
    if (schemeHandler) {
      urnComponent = schemeHandler.serialize(urnComponent, options);
    }
    const uriComponent = urnComponent;
    const nss = urnComponent.nss;
    uriComponent.path = `${nid || options.nid}:${nss}`;
    options.skipEscape = true;
    return uriComponent;
  }
  function urnuuidParse(urnComponent, options) {
    const uuidComponent = urnComponent;
    uuidComponent.uuid = uuidComponent.nss;
    uuidComponent.nss = void 0;
    if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
      uuidComponent.error = uuidComponent.error || "UUID is not valid.";
    }
    return uuidComponent;
  }
  function urnuuidSerialize(uuidComponent) {
    const urnComponent = uuidComponent;
    urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
    return urnComponent;
  }
  const http = (
    /** @type {SchemeHandler} */
    {
      scheme: "http",
      domainHost: true,
      parse: httpParse,
      serialize: httpSerialize
    }
  );
  const https = (
    /** @type {SchemeHandler} */
    {
      scheme: "https",
      domainHost: http.domainHost,
      parse: httpParse,
      serialize: httpSerialize
    }
  );
  const ws = (
    /** @type {SchemeHandler} */
    {
      scheme: "ws",
      domainHost: true,
      parse: wsParse,
      serialize: wsSerialize
    }
  );
  const wss = (
    /** @type {SchemeHandler} */
    {
      scheme: "wss",
      domainHost: ws.domainHost,
      parse: ws.parse,
      serialize: ws.serialize
    }
  );
  const urn = (
    /** @type {SchemeHandler} */
    {
      scheme: "urn",
      parse: urnParse,
      serialize: urnSerialize,
      skipNormalize: true
    }
  );
  const urnuuid = (
    /** @type {SchemeHandler} */
    {
      scheme: "urn:uuid",
      parse: urnuuidParse,
      serialize: urnuuidSerialize,
      skipNormalize: true
    }
  );
  const SCHEMES = (
    /** @type {Record<SchemeName, SchemeHandler>} */
    {
      http,
      https,
      ws,
      wss,
      urn,
      "urn:uuid": urnuuid
    }
  );
  Object.setPrototypeOf(SCHEMES, null);
  function getSchemeHandler(scheme) {
    return scheme && (SCHEMES[
      /** @type {SchemeName} */
      scheme
    ] || SCHEMES[
      /** @type {SchemeName} */
      scheme.toLowerCase()
    ]) || void 0;
  }
  schemes = {
    wsIsSecure,
    SCHEMES,
    isValidSchemeName,
    getSchemeHandler
  };
  return schemes;
}
var hasRequiredFastUri;
function requireFastUri() {
  if (hasRequiredFastUri) return fastUri.exports;
  hasRequiredFastUri = 1;
  const { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = requireUtils();
  const { SCHEMES, getSchemeHandler } = requireSchemes();
  function normalize(uri2, options) {
    if (typeof uri2 === "string") {
      uri2 = /** @type {T} */
      normalizeString(uri2, options);
    } else if (typeof uri2 === "object") {
      uri2 = /** @type {T} */
      parse(serialize(uri2, options), options);
    }
    return uri2;
  }
  function resolve2(baseURI, relativeURI, options) {
    const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
    const { parsed: baseParsed, malformedAuthorityOrPort: baseMalformed } = parseWithStatus(baseURI, schemelessOptions);
    const { parsed: relativeParsed, malformedAuthorityOrPort: relativeMalformed } = parseWithStatus(relativeURI, schemelessOptions);
    if (baseMalformed || relativeMalformed) {
      throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
    }
    const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
    schemelessOptions.skipEscape = true;
    return serialize(resolved, schemelessOptions);
  }
  function resolveComponent(base, relative, options, skipNormalization) {
    const target = {};
    if (!skipNormalization) {
      base = parse(serialize(base, options), options);
      relative = parse(serialize(relative, options), options);
    }
    options = options || {};
    if (!options.tolerant && relative.scheme) {
      target.scheme = relative.scheme;
      target.userinfo = relative.userinfo;
      target.host = relative.host;
      target.port = relative.port;
      target.path = removeDotSegments(relative.path || "");
      target.query = relative.query;
    } else {
      if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (!relative.path) {
          target.path = base.path;
          if (relative.query !== void 0) {
            target.query = relative.query;
          } else {
            target.query = base.query;
          }
        } else {
          if (relative.path[0] === "/") {
            target.path = removeDotSegments(relative.path);
          } else {
            if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
              target.path = "/" + relative.path;
            } else if (!base.path) {
              target.path = relative.path;
            } else {
              target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
            }
            target.path = removeDotSegments(target.path);
          }
          target.query = relative.query;
        }
        target.userinfo = base.userinfo;
        target.host = base.host;
        target.port = base.port;
      }
      target.scheme = base.scheme;
    }
    target.fragment = relative.fragment;
    return target;
  }
  function equal2(uriA, uriB, options) {
    const normalizedA = normalizeComparableURI(uriA, options);
    const normalizedB = normalizeComparableURI(uriB, options);
    return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }
  function serialize(cmpts, opts) {
    const component = {
      host: cmpts.host,
      scheme: cmpts.scheme,
      userinfo: cmpts.userinfo,
      port: cmpts.port,
      path: cmpts.path,
      query: cmpts.query,
      nid: cmpts.nid,
      nss: cmpts.nss,
      uuid: cmpts.uuid,
      fragment: cmpts.fragment,
      reference: cmpts.reference,
      resourceName: cmpts.resourceName,
      secure: cmpts.secure,
      error: ""
    };
    const options = Object.assign({}, opts);
    const uriTokens = [];
    const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
    if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
    if (component.path !== void 0) {
      if (!options.skipEscape) {
        component.path = escapePreservingEscapes(component.path);
        if (component.scheme !== void 0) {
          component.path = component.path.split("%3A").join(":");
        }
      } else {
        component.path = normalizePercentEncoding(component.path);
      }
    }
    if (options.reference !== "suffix" && component.scheme) {
      uriTokens.push(component.scheme, ":");
    }
    const authority = recomposeAuthority(component);
    if (authority !== void 0) {
      if (options.reference !== "suffix") {
        uriTokens.push("//");
      }
      uriTokens.push(authority);
      if (component.path && component.path[0] !== "/") {
        uriTokens.push("/");
      }
    }
    if (component.path !== void 0) {
      let s = component.path;
      if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
        s = removeDotSegments(s);
      }
      if (authority === void 0 && s[0] === "/" && s[1] === "/") {
        s = "/%2F" + s.slice(2);
      }
      uriTokens.push(s);
    }
    if (component.query !== void 0) {
      uriTokens.push("?", component.query);
    }
    if (component.fragment !== void 0) {
      uriTokens.push("#", component.fragment);
    }
    return uriTokens.join("");
  }
  const URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
  const AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
  const AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
  function getParseError(parsed, matches) {
    if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
      return 'URI path must start with "/" when authority is present.';
    }
    if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
      return "URI port is malformed.";
    }
    return void 0;
  }
  function parseWithStatus(uri2, opts) {
    const options = Object.assign({}, opts);
    const parsed = {
      scheme: void 0,
      userinfo: void 0,
      host: "",
      port: void 0,
      path: "",
      query: void 0,
      fragment: void 0
    };
    let malformedAuthorityOrPort = false;
    let isIP = false;
    if (options.reference === "suffix") {
      if (options.scheme) {
        uri2 = options.scheme + ":" + uri2;
      } else {
        uri2 = "//" + uri2;
      }
    }
    const authorityMatch = uri2.match(AUTHORITY_PREFIX);
    if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
      parsed.error = "URI authority must not contain a literal backslash.";
      malformedAuthorityOrPort = true;
    }
    const introducerMatch = uri2.match(AUTHORITY_INTRODUCER_REGION);
    if (introducerMatch !== null) {
      const region = introducerMatch[1];
      const normalizedRegion = region.replace(/[\t\n\r]/g, "");
      if (normalizedRegion.length >= 2) {
        if (normalizedRegion.slice(0, 2) !== "//") {
          parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
          malformedAuthorityOrPort = true;
        } else if (region.length !== normalizedRegion.length) {
          parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
          malformedAuthorityOrPort = true;
        }
      }
    }
    const matches = uri2.match(URI_PARSE);
    if (matches) {
      parsed.scheme = matches[1];
      parsed.userinfo = matches[3];
      parsed.host = matches[4];
      parsed.port = parseInt(matches[5], 10);
      parsed.path = matches[6] || "";
      parsed.query = matches[7];
      parsed.fragment = matches[8];
      if (isNaN(parsed.port)) {
        parsed.port = matches[5];
      }
      const parseError = getParseError(parsed, matches);
      if (parseError !== void 0) {
        parsed.error = parsed.error || parseError;
        malformedAuthorityOrPort = true;
      }
      if (parsed.host) {
        const ipv4result = isIPv4(parsed.host);
        if (ipv4result === false) {
          const ipv6result = normalizeIPv6(parsed.host);
          parsed.host = ipv6result.host.toLowerCase();
          isIP = ipv6result.isIPV6;
        } else {
          isIP = true;
        }
      }
      if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
        parsed.reference = "same-document";
      } else if (parsed.scheme === void 0) {
        parsed.reference = "relative";
      } else if (parsed.fragment === void 0) {
        parsed.reference = "absolute";
      } else {
        parsed.reference = "uri";
      }
      if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
        parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
      }
      const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
      if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
        if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
          try {
            parsed.host = new URL("http://" + parsed.host).hostname;
          } catch (e) {
            parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
          }
        }
      }
      if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
        if (uri2.indexOf("%") !== -1) {
          if (parsed.scheme !== void 0) {
            parsed.scheme = unescape(parsed.scheme);
          }
          if (parsed.host !== void 0) {
            parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
          }
        }
        if (parsed.path) {
          parsed.path = normalizePathEncoding(parsed.path);
        }
        if (parsed.fragment) {
          try {
            parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
          } catch {
            parsed.error = parsed.error || "URI malformed";
          }
        }
      }
      if (schemeHandler && schemeHandler.parse) {
        schemeHandler.parse(parsed, options);
      }
    } else {
      parsed.error = parsed.error || "URI can not be parsed.";
    }
    return { parsed, malformedAuthorityOrPort };
  }
  function parse(uri2, opts) {
    return parseWithStatus(uri2, opts).parsed;
  }
  function normalizeString(uri2, opts) {
    return normalizeStringWithStatus(uri2, opts).normalized;
  }
  function normalizeStringWithStatus(uri2, opts) {
    const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri2, opts);
    return {
      normalized: malformedAuthorityOrPort ? uri2 : serialize(parsed, opts),
      malformedAuthorityOrPort
    };
  }
  function normalizeComparableURI(uri2, opts) {
    if (typeof uri2 === "string") {
      const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri2, opts);
      return malformedAuthorityOrPort ? void 0 : normalized;
    }
    if (typeof uri2 === "object") {
      return serialize(uri2, opts);
    }
  }
  const fastUri$1 = {
    SCHEMES,
    normalize,
    resolve: resolve2,
    resolveComponent,
    equal: equal2,
    serialize,
    parse
  };
  fastUri.exports = fastUri$1;
  fastUri.exports.default = fastUri$1;
  fastUri.exports.fastUri = fastUri$1;
  return fastUri.exports;
}
var hasRequiredUri;
function requireUri() {
  if (hasRequiredUri) return uri;
  hasRequiredUri = 1;
  Object.defineProperty(uri, "__esModule", { value: true });
  const uri$1 = requireFastUri();
  uri$1.code = 'require("ajv/dist/runtime/uri").default';
  uri.default = uri$1;
  return uri;
}
var hasRequiredCore$1;
function requireCore$1() {
  if (hasRequiredCore$1) return core$1;
  hasRequiredCore$1 = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = void 0;
    var validate_1 = /* @__PURE__ */ requireValidate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = /* @__PURE__ */ requireCodegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    const validation_error_1 = /* @__PURE__ */ requireValidation_error();
    const ref_error_1 = /* @__PURE__ */ requireRef_error();
    const rules_1 = /* @__PURE__ */ requireRules();
    const compile_1 = /* @__PURE__ */ requireCompile();
    const codegen_2 = /* @__PURE__ */ requireCodegen();
    const resolve_1 = /* @__PURE__ */ requireResolve();
    const dataType_1 = /* @__PURE__ */ requireDataType();
    const util_1 = /* @__PURE__ */ requireUtil();
    const $dataRefSchema = require$$9;
    const uri_1 = /* @__PURE__ */ requireUri();
    const defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    const META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    const EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    const removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    const deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    const MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    class Ajv {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref2, missingRef }) {
          if (this.refs[ref2]) {
            throw new Error(`AnySchema ${ref2} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref2) {
          const _schema = await _loadSchema.call(this, ref2);
          if (!this.refs[ref2])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref2])
            this.addSchema(_schema, ref2, meta);
        }
        async function _loadSchema(ref2) {
          const p = this._loading[ref2];
          if (p)
            return p;
          try {
            return await (this._loading[ref2] = loadSchema(ref2));
          } finally {
            delete this._loading[ref2];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id2;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id2 = schema[schemaId];
          if (id2 !== void 0 && typeof id2 != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id2);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema2;
        $schema2 = schema.$schema;
        if ($schema2 !== void 0 && typeof $schema2 != "string") {
          throw new Error("$schema must be a string");
        }
        $schema2 = $schema2 || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema2) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema2, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root2 = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root2, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id2 = schemaKeyRef[this.opts.schemaId];
            if (id2) {
              id2 = (0, resolve_1.normalizeId)(id2);
              delete this.schemas[id2];
              delete this.refs[id2];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions2) {
        for (const def of definitions2)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword2;
        if (typeof kwdOrDef == "string") {
          keyword2 = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword2;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword2 = def.keyword;
          if (Array.isArray(keyword2) && !keyword2.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword2, def);
        if (!def) {
          (0, util_1.eachItem)(keyword2, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword2, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword2) {
        const rule = this.RULES.all[keyword2];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword2) {
        const { RULES } = this;
        delete RULES.keywords[keyword2];
        delete RULES.all[keyword2];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword2);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format2) {
        if (typeof format2 == "string")
          format2 = new RegExp(format2);
        this.formats[name] = format2;
        return this;
      }
      errorsText(errors2 = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors2 || errors2.length === 0)
          return "No errors";
        return errors2.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules2 = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules2) {
            const rule = rules2[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id2;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id2 = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id2 || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id2) {
        if (this.schemas[id2] || this.refs[id2]) {
          throw new Error(`schema with key or id "${id2}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    }
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports2.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format2 = this.opts.formats[name];
        if (format2)
          this.addFormat(name, format2);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword2 in defs) {
        const def = defs[keyword2];
        if (!def.keyword)
          def.keyword = keyword2;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    const noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword2, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword2, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword2, definition, dataType2) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType2 && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType2);
      if (!ruleGroup) {
        ruleGroup = { type: dataType2, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword2] = true;
      if (!definition)
        return;
      const rule = {
        keyword: keyword2,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword2] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    const $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  })(core$1);
  return core$1;
}
var draft2020 = {};
var core = {};
var id = {};
var hasRequiredId;
function requireId() {
  if (hasRequiredId) return id;
  hasRequiredId = 1;
  Object.defineProperty(id, "__esModule", { value: true });
  const def = {
    keyword: "id",
    code() {
      throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
    }
  };
  id.default = def;
  return id;
}
var ref = {};
var hasRequiredRef;
function requireRef() {
  if (hasRequiredRef) return ref;
  hasRequiredRef = 1;
  Object.defineProperty(ref, "__esModule", { value: true });
  ref.callRef = ref.getValidate = void 0;
  const ref_error_1 = /* @__PURE__ */ requireRef_error();
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const compile_1 = /* @__PURE__ */ requireCompile();
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "$ref",
    schemaType: "string",
    code(cxt) {
      const { gen, schema: $ref, it } = cxt;
      const { baseId, schemaEnv: env, validateName, opts, self: self2 } = it;
      const { root: root2 } = env;
      if (($ref === "#" || $ref === "#/") && baseId === root2.baseId)
        return callRootRef();
      const schOrEnv = compile_1.resolveRef.call(self2, root2, baseId, $ref);
      if (schOrEnv === void 0)
        throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
      if (schOrEnv instanceof compile_1.SchemaEnv)
        return callValidate(schOrEnv);
      return inlineRefSchema(schOrEnv);
      function callRootRef() {
        if (env === root2)
          return callRef(cxt, validateName, env, env.$async);
        const rootName = gen.scopeValue("root", { ref: root2 });
        return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root2, root2.$async);
      }
      function callValidate(sch) {
        const v = getValidate(cxt, sch);
        callRef(cxt, v, sch, sch.$async);
      }
      function inlineRefSchema(sch) {
        const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
        const valid = gen.name("valid");
        const schCxt = cxt.subschema({
          schema: sch,
          dataTypes: [],
          schemaPath: codegen_1.nil,
          topSchemaRef: schName,
          errSchemaPath: $ref
        }, valid);
        cxt.mergeEvaluated(schCxt);
        cxt.ok(valid);
      }
    }
  };
  function getValidate(cxt, sch) {
    const { gen } = cxt;
    return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
  }
  ref.getValidate = getValidate;
  function callRef(cxt, v, sch, $async) {
    const { gen, it } = cxt;
    const { allErrors, schemaEnv: env, opts } = it;
    const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
    if ($async)
      callAsyncRef();
    else
      callSyncRef();
    function callAsyncRef() {
      if (!env.$async)
        throw new Error("async schema referenced by sync schema");
      const valid = gen.let("valid");
      gen.try(() => {
        gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
        addEvaluatedFrom(v);
        if (!allErrors)
          gen.assign(valid, true);
      }, (e) => {
        gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
        addErrorsFrom(e);
        if (!allErrors)
          gen.assign(valid, false);
      });
      cxt.ok(valid);
    }
    function callSyncRef() {
      cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
    }
    function addErrorsFrom(source) {
      const errs = (0, codegen_1._)`${source}.errors`;
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
      gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
    }
    function addEvaluatedFrom(source) {
      var _a;
      if (!it.opts.unevaluated)
        return;
      const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
      if (it.props !== true) {
        if (schEvaluated && !schEvaluated.dynamicProps) {
          if (schEvaluated.props !== void 0) {
            it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
          }
        } else {
          const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
          it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
        }
      }
      if (it.items !== true) {
        if (schEvaluated && !schEvaluated.dynamicItems) {
          if (schEvaluated.items !== void 0) {
            it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
          }
        } else {
          const items2 = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
          it.items = util_1.mergeEvaluated.items(gen, items2, it.items, codegen_1.Name);
        }
      }
    }
  }
  ref.callRef = callRef;
  ref.default = def;
  return ref;
}
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  Object.defineProperty(core, "__esModule", { value: true });
  const id_1 = /* @__PURE__ */ requireId();
  const ref_1 = /* @__PURE__ */ requireRef();
  const core$12 = [
    "$schema",
    "$id",
    "$defs",
    "$vocabulary",
    { keyword: "$comment" },
    "definitions",
    id_1.default,
    ref_1.default
  ];
  core.default = core$12;
  return core;
}
var validation = {};
var limitNumber = {};
var hasRequiredLimitNumber;
function requireLimitNumber() {
  if (hasRequiredLimitNumber) return limitNumber;
  hasRequiredLimitNumber = 1;
  Object.defineProperty(limitNumber, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const ops = codegen_1.operators;
  const KWDs = {
    maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
  };
  const error = {
    message: ({ keyword: keyword2, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword2].okStr} ${schemaCode}`,
    params: ({ keyword: keyword2, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword2].okStr}, limit: ${schemaCode}}`
  };
  const def = {
    keyword: Object.keys(KWDs),
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode } = cxt;
      cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword2].fail} ${schemaCode} || isNaN(${data})`);
    }
  };
  limitNumber.default = def;
  return limitNumber;
}
var multipleOf = {};
var hasRequiredMultipleOf;
function requireMultipleOf() {
  if (hasRequiredMultipleOf) return multipleOf;
  hasRequiredMultipleOf = 1;
  Object.defineProperty(multipleOf, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
    params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
  };
  const def = {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, schemaCode, it } = cxt;
      const prec = it.opts.multipleOfPrecision;
      const res = gen.let("res");
      const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
      cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
    }
  };
  multipleOf.default = def;
  return multipleOf;
}
var limitLength = {};
var ucs2length = {};
var hasRequiredUcs2length;
function requireUcs2length() {
  if (hasRequiredUcs2length) return ucs2length;
  hasRequiredUcs2length = 1;
  Object.defineProperty(ucs2length, "__esModule", { value: true });
  function ucs2length$1(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
      length++;
      value = str.charCodeAt(pos++);
      if (value >= 55296 && value <= 56319 && pos < len) {
        value = str.charCodeAt(pos);
        if ((value & 64512) === 56320)
          pos++;
      }
    }
    return length;
  }
  ucs2length.default = ucs2length$1;
  ucs2length$1.code = 'require("ajv/dist/runtime/ucs2length").default';
  return ucs2length;
}
var hasRequiredLimitLength;
function requireLimitLength() {
  if (hasRequiredLimitLength) return limitLength;
  hasRequiredLimitLength = 1;
  Object.defineProperty(limitLength, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const ucs2length_1 = /* @__PURE__ */ requireUcs2length();
  const error = {
    message({ keyword: keyword2, schemaCode }) {
      const comp = keyword2 === "maxLength" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  const def = {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode, it } = cxt;
      const op = keyword2 === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
      const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
      cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
    }
  };
  limitLength.default = def;
  return limitLength;
}
var pattern = {};
var hasRequiredPattern;
function requirePattern() {
  if (hasRequiredPattern) return pattern;
  hasRequiredPattern = 1;
  Object.defineProperty(pattern, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const util_1 = /* @__PURE__ */ requireUtil();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
  };
  const def = {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const u = it.opts.unicodeRegExp ? "u" : "";
      if ($data) {
        const { regExp } = it.opts.code;
        const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
        const valid = gen.let("valid");
        gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
        cxt.fail$data((0, codegen_1._)`!${valid}`);
      } else {
        const regExp = (0, code_1.usePattern)(cxt, schema);
        cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
      }
    }
  };
  pattern.default = def;
  return pattern;
}
var limitProperties = {};
var hasRequiredLimitProperties;
function requireLimitProperties() {
  if (hasRequiredLimitProperties) return limitProperties;
  hasRequiredLimitProperties = 1;
  Object.defineProperty(limitProperties, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message({ keyword: keyword2, schemaCode }) {
      const comp = keyword2 === "maxProperties" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  const def = {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode } = cxt;
      const op = keyword2 === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
    }
  };
  limitProperties.default = def;
  return limitProperties;
}
var required$2 = {};
var hasRequiredRequired;
function requireRequired() {
  if (hasRequiredRequired) return required$2;
  hasRequiredRequired = 1;
  Object.defineProperty(required$2, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
    params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
  };
  const def = {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, schema, schemaCode, data, $data, it } = cxt;
      const { opts } = it;
      if (!$data && schema.length === 0)
        return;
      const useLoop = schema.length >= opts.loopRequired;
      if (it.allErrors)
        allErrorsMode();
      else
        exitOnErrorMode();
      if (opts.strictRequired) {
        const props = cxt.parentSchema.properties;
        const { definedProperties } = cxt.it;
        for (const requiredKey of schema) {
          if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
            const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
            const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
            (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
          }
        }
      }
      function allErrorsMode() {
        if (useLoop || $data) {
          cxt.block$data(codegen_1.nil, loopAllRequired);
        } else {
          for (const prop of schema) {
            (0, code_1.checkReportMissingProp)(cxt, prop);
          }
        }
      }
      function exitOnErrorMode() {
        const missing = gen.let("missing");
        if (useLoop || $data) {
          const valid = gen.let("valid", true);
          cxt.block$data(valid, () => loopUntilMissing(missing, valid));
          cxt.ok(valid);
        } else {
          gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
      function loopAllRequired() {
        gen.forOf("prop", schemaCode, (prop) => {
          cxt.setParams({ missingProperty: prop });
          gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
        });
      }
      function loopUntilMissing(missing, valid) {
        cxt.setParams({ missingProperty: missing });
        gen.forOf(missing, schemaCode, () => {
          gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error();
            gen.break();
          });
        }, codegen_1.nil);
      }
    }
  };
  required$2.default = def;
  return required$2;
}
var limitItems = {};
var hasRequiredLimitItems;
function requireLimitItems() {
  if (hasRequiredLimitItems) return limitItems;
  hasRequiredLimitItems = 1;
  Object.defineProperty(limitItems, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message({ keyword: keyword2, schemaCode }) {
      const comp = keyword2 === "maxItems" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  const def = {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode } = cxt;
      const op = keyword2 === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
    }
  };
  limitItems.default = def;
  return limitItems;
}
var uniqueItems = {};
var equal = {};
var hasRequiredEqual;
function requireEqual() {
  if (hasRequiredEqual) return equal;
  hasRequiredEqual = 1;
  Object.defineProperty(equal, "__esModule", { value: true });
  const equal$1 = requireFastDeepEqual();
  equal$1.code = 'require("ajv/dist/runtime/equal").default';
  equal.default = equal$1;
  return equal;
}
var hasRequiredUniqueItems;
function requireUniqueItems() {
  if (hasRequiredUniqueItems) return uniqueItems;
  hasRequiredUniqueItems = 1;
  Object.defineProperty(uniqueItems, "__esModule", { value: true });
  const dataType_1 = /* @__PURE__ */ requireDataType();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal_1 = /* @__PURE__ */ requireEqual();
  const error = {
    message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
    params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
  };
  const def = {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
      if (!$data && !schema)
        return;
      const valid = gen.let("valid");
      const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
      cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
      cxt.ok(valid);
      function validateUniqueItems() {
        const i = gen.let("i", (0, codegen_1._)`${data}.length`);
        const j = gen.let("j");
        cxt.setParams({ i, j });
        gen.assign(valid, true);
        gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
      }
      function canOptimize() {
        return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
      }
      function loopN(i, j) {
        const item = gen.name("item");
        const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
        const indices = gen.const("indices", (0, codegen_1._)`{}`);
        gen.for((0, codegen_1._)`;${i}--;`, () => {
          gen.let(item, (0, codegen_1._)`${data}[${i}]`);
          gen.if(wrongType, (0, codegen_1._)`continue`);
          if (itemTypes.length > 1)
            gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
          gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
            gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
            cxt.error();
            gen.assign(valid, false).break();
          }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
        });
      }
      function loopN2(i, j) {
        const eql = (0, util_1.useFunc)(gen, equal_1.default);
        const outer = gen.name("outer");
        gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
          cxt.error();
          gen.assign(valid, false).break(outer);
        })));
      }
    }
  };
  uniqueItems.default = def;
  return uniqueItems;
}
var _const = {};
var hasRequired_const;
function require_const() {
  if (hasRequired_const) return _const;
  hasRequired_const = 1;
  Object.defineProperty(_const, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal_1 = /* @__PURE__ */ requireEqual();
  const error = {
    message: "must be equal to constant",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
  };
  const def = {
    keyword: "const",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schemaCode, schema } = cxt;
      if ($data || schema && typeof schema == "object") {
        cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
      } else {
        cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
      }
    }
  };
  _const.default = def;
  return _const;
}
var _enum = {};
var hasRequired_enum;
function require_enum() {
  if (hasRequired_enum) return _enum;
  hasRequired_enum = 1;
  Object.defineProperty(_enum, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal_1 = /* @__PURE__ */ requireEqual();
  const error = {
    message: "must be equal to one of the allowed values",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
  };
  const def = {
    keyword: "enum",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      if (!$data && schema.length === 0)
        throw new Error("enum must have non-empty array");
      const useLoop = schema.length >= it.opts.loopEnum;
      let eql;
      const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
      let valid;
      if (useLoop || $data) {
        valid = gen.let("valid");
        cxt.block$data(valid, loopEnum);
      } else {
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const vSchema = gen.const("vSchema", schemaCode);
        valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
      }
      cxt.pass(valid);
      function loopEnum() {
        gen.assign(valid, false);
        gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
      }
      function equalCode(vSchema, i) {
        const sch = schema[i];
        return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
      }
    }
  };
  _enum.default = def;
  return _enum;
}
var hasRequiredValidation;
function requireValidation() {
  if (hasRequiredValidation) return validation;
  hasRequiredValidation = 1;
  Object.defineProperty(validation, "__esModule", { value: true });
  const limitNumber_1 = /* @__PURE__ */ requireLimitNumber();
  const multipleOf_1 = /* @__PURE__ */ requireMultipleOf();
  const limitLength_1 = /* @__PURE__ */ requireLimitLength();
  const pattern_1 = /* @__PURE__ */ requirePattern();
  const limitProperties_1 = /* @__PURE__ */ requireLimitProperties();
  const required_1 = /* @__PURE__ */ requireRequired();
  const limitItems_1 = /* @__PURE__ */ requireLimitItems();
  const uniqueItems_1 = /* @__PURE__ */ requireUniqueItems();
  const const_1 = /* @__PURE__ */ require_const();
  const enum_1 = /* @__PURE__ */ require_enum();
  const validation$1 = [
    // number
    limitNumber_1.default,
    multipleOf_1.default,
    // string
    limitLength_1.default,
    pattern_1.default,
    // object
    limitProperties_1.default,
    required_1.default,
    // array
    limitItems_1.default,
    uniqueItems_1.default,
    // any
    { keyword: "type", schemaType: ["string", "array"] },
    { keyword: "nullable", schemaType: "boolean" },
    const_1.default,
    enum_1.default
  ];
  validation.default = validation$1;
  return validation;
}
var applicator = {};
var additionalItems = {};
var hasRequiredAdditionalItems;
function requireAdditionalItems() {
  if (hasRequiredAdditionalItems) return additionalItems;
  hasRequiredAdditionalItems = 1;
  Object.defineProperty(additionalItems, "__esModule", { value: true });
  additionalItems.validateAdditionalItems = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  const def = {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { parentSchema, it } = cxt;
      const { items: items2 } = parentSchema;
      if (!Array.isArray(items2)) {
        (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
        return;
      }
      validateAdditionalItems(cxt, items2);
    }
  };
  function validateAdditionalItems(cxt, items2) {
    const { gen, schema, data, keyword: keyword2, it } = cxt;
    it.items = true;
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    if (schema === false) {
      cxt.setParams({ len: items2.length });
      cxt.pass((0, codegen_1._)`${len} <= ${items2.length}`);
    } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
      const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items2.length}`);
      gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
      cxt.ok(valid);
    }
    function validateItems(valid) {
      gen.forRange("i", items2.length, len, (i) => {
        cxt.subschema({ keyword: keyword2, dataProp: i, dataPropType: util_1.Type.Num }, valid);
        if (!it.allErrors)
          gen.if((0, codegen_1.not)(valid), () => gen.break());
      });
    }
  }
  additionalItems.validateAdditionalItems = validateAdditionalItems;
  additionalItems.default = def;
  return additionalItems;
}
var prefixItems = {};
var items = {};
var hasRequiredItems;
function requireItems() {
  if (hasRequiredItems) return items;
  hasRequiredItems = 1;
  Object.defineProperty(items, "__esModule", { value: true });
  items.validateTuple = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const code_1 = /* @__PURE__ */ requireCode();
  const def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code(cxt) {
      const { schema, it } = cxt;
      if (Array.isArray(schema))
        return validateTuple(cxt, "additionalItems", schema);
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  function validateTuple(cxt, extraItems, schArr = cxt.schema) {
    const { gen, parentSchema, data, keyword: keyword2, it } = cxt;
    checkStrictTuple(parentSchema);
    if (it.opts.unevaluated && schArr.length && it.items !== true) {
      it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
    }
    const valid = gen.name("valid");
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    schArr.forEach((sch, i) => {
      if ((0, util_1.alwaysValidSchema)(it, sch))
        return;
      gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
        keyword: keyword2,
        schemaProp: i,
        dataProp: i
      }, valid));
      cxt.ok(valid);
    });
    function checkStrictTuple(sch) {
      const { opts, errSchemaPath } = it;
      const l = schArr.length;
      const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
      if (opts.strictTuples && !fullTuple) {
        const msg = `"${keyword2}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
        (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
      }
    }
  }
  items.validateTuple = validateTuple;
  items.default = def;
  return items;
}
var hasRequiredPrefixItems;
function requirePrefixItems() {
  if (hasRequiredPrefixItems) return prefixItems;
  hasRequiredPrefixItems = 1;
  Object.defineProperty(prefixItems, "__esModule", { value: true });
  const items_1 = /* @__PURE__ */ requireItems();
  const def = {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
  };
  prefixItems.default = def;
  return prefixItems;
}
var items2020 = {};
var hasRequiredItems2020;
function requireItems2020() {
  if (hasRequiredItems2020) return items2020;
  hasRequiredItems2020 = 1;
  Object.defineProperty(items2020, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const code_1 = /* @__PURE__ */ requireCode();
  const additionalItems_1 = /* @__PURE__ */ requireAdditionalItems();
  const error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  const def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { schema, parentSchema, it } = cxt;
      const { prefixItems: prefixItems2 } = parentSchema;
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      if (prefixItems2)
        (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems2);
      else
        cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  items2020.default = def;
  return items2020;
}
var contains = {};
var hasRequiredContains;
function requireContains() {
  if (hasRequiredContains) return contains;
  hasRequiredContains = 1;
  Object.defineProperty(contains, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
    params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
  };
  const def = {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      let min;
      let max;
      const { minContains, maxContains } = parentSchema;
      if (it.opts.next) {
        min = minContains === void 0 ? 1 : minContains;
        max = maxContains;
      } else {
        min = 1;
      }
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      cxt.setParams({ min, max });
      if (max === void 0 && min === 0) {
        (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
        return;
      }
      if (max !== void 0 && min > max) {
        (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
        cxt.fail();
        return;
      }
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        let cond = (0, codegen_1._)`${len} >= ${min}`;
        if (max !== void 0)
          cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
        cxt.pass(cond);
        return;
      }
      it.items = true;
      const valid = gen.name("valid");
      if (max === void 0 && min === 1) {
        validateItems(valid, () => gen.if(valid, () => gen.break()));
      } else if (min === 0) {
        gen.let(valid, true);
        if (max !== void 0)
          gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
      } else {
        gen.let(valid, false);
        validateItemsWithCount();
      }
      cxt.result(valid, () => cxt.reset());
      function validateItemsWithCount() {
        const schValid = gen.name("_valid");
        const count = gen.let("count", 0);
        validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
      }
      function validateItems(_valid, block) {
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword: "contains",
            dataProp: i,
            dataPropType: util_1.Type.Num,
            compositeRule: true
          }, _valid);
          block();
        });
      }
      function checkLimits(count) {
        gen.code((0, codegen_1._)`${count}++`);
        if (max === void 0) {
          gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
        } else {
          gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
          if (min === 1)
            gen.assign(valid, true);
          else
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
        }
      }
    }
  };
  contains.default = def;
  return contains;
}
var dependencies = {};
var hasRequiredDependencies;
function requireDependencies() {
  if (hasRequiredDependencies) return dependencies;
  hasRequiredDependencies = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateSchemaDeps = exports2.validatePropertyDeps = exports2.error = void 0;
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const util_1 = /* @__PURE__ */ requireUtil();
    const code_1 = /* @__PURE__ */ requireCode();
    exports2.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    const def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports2.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports2.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword: keyword2, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword: keyword2, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports2.validateSchemaDeps = validateSchemaDeps;
    exports2.default = def;
  })(dependencies);
  return dependencies;
}
var propertyNames = {};
var hasRequiredPropertyNames;
function requirePropertyNames() {
  if (hasRequiredPropertyNames) return propertyNames;
  hasRequiredPropertyNames = 1;
  Object.defineProperty(propertyNames, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: "property name must be valid",
    params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
  };
  const def = {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      const valid = gen.name("valid");
      gen.forIn("key", data, (key) => {
        cxt.setParams({ propertyName: key });
        cxt.subschema({
          keyword: "propertyNames",
          data: key,
          dataTypes: ["string"],
          propertyName: key,
          compositeRule: true
        }, valid);
        gen.if((0, codegen_1.not)(valid), () => {
          cxt.error(true);
          if (!it.allErrors)
            gen.break();
        });
      });
      cxt.ok(valid);
    }
  };
  propertyNames.default = def;
  return propertyNames;
}
var additionalProperties$2 = {};
var hasRequiredAdditionalProperties;
function requireAdditionalProperties() {
  if (hasRequiredAdditionalProperties) return additionalProperties$2;
  hasRequiredAdditionalProperties = 1;
  Object.defineProperty(additionalProperties$2, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: "must NOT have additional properties",
    params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
  };
  const def = {
    keyword: "additionalProperties",
    type: ["object"],
    schemaType: ["boolean", "object"],
    allowUndefined: true,
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, opts } = it;
      it.props = true;
      if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
        return;
      const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
      const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
      checkAdditionalProperties();
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function checkAdditionalProperties() {
        gen.forIn("key", data, (key) => {
          if (!props.length && !patProps.length)
            additionalPropertyCode(key);
          else
            gen.if(isAdditional(key), () => additionalPropertyCode(key));
        });
      }
      function isAdditional(key) {
        let definedProp;
        if (props.length > 8) {
          const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
          definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
        } else if (props.length) {
          definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
        } else {
          definedProp = codegen_1.nil;
        }
        if (patProps.length) {
          definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
        }
        return (0, codegen_1.not)(definedProp);
      }
      function deleteAdditional(key) {
        gen.code((0, codegen_1._)`delete ${data}[${key}]`);
      }
      function additionalPropertyCode(key) {
        if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
          deleteAdditional(key);
          return;
        }
        if (schema === false) {
          cxt.setParams({ additionalProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.name("valid");
          if (opts.removeAdditional === "failing") {
            applyAdditionalSchema(key, valid, false);
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.reset();
              deleteAdditional(key);
            });
          } else {
            applyAdditionalSchema(key, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
      }
      function applyAdditionalSchema(key, valid, errors2) {
        const subschema2 = {
          keyword: "additionalProperties",
          dataProp: key,
          dataPropType: util_1.Type.Str
        };
        if (errors2 === false) {
          Object.assign(subschema2, {
            compositeRule: true,
            createErrors: false,
            allErrors: false
          });
        }
        cxt.subschema(subschema2, valid);
      }
    }
  };
  additionalProperties$2.default = def;
  return additionalProperties$2;
}
var properties$b = {};
var hasRequiredProperties;
function requireProperties() {
  if (hasRequiredProperties) return properties$b;
  hasRequiredProperties = 1;
  Object.defineProperty(properties$b, "__esModule", { value: true });
  const validate_1 = /* @__PURE__ */ requireValidate();
  const code_1 = /* @__PURE__ */ requireCode();
  const util_1 = /* @__PURE__ */ requireUtil();
  const additionalProperties_1 = /* @__PURE__ */ requireAdditionalProperties();
  const def = {
    keyword: "properties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
        additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
      }
      const allProps = (0, code_1.allSchemaProperties)(schema);
      for (const prop of allProps) {
        it.definedProperties.add(prop);
      }
      if (it.opts.unevaluated && allProps.length && it.props !== true) {
        it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
      }
      const properties2 = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
      if (properties2.length === 0)
        return;
      const valid = gen.name("valid");
      for (const prop of properties2) {
        if (hasDefault(prop)) {
          applyPropertySchema(prop);
        } else {
          gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
          applyPropertySchema(prop);
          if (!it.allErrors)
            gen.else().var(valid, true);
          gen.endIf();
        }
        cxt.it.definedProperties.add(prop);
        cxt.ok(valid);
      }
      function hasDefault(prop) {
        return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
      }
      function applyPropertySchema(prop) {
        cxt.subschema({
          keyword: "properties",
          schemaProp: prop,
          dataProp: prop
        }, valid);
      }
    }
  };
  properties$b.default = def;
  return properties$b;
}
var patternProperties = {};
var hasRequiredPatternProperties;
function requirePatternProperties() {
  if (hasRequiredPatternProperties) return patternProperties;
  hasRequiredPatternProperties = 1;
  Object.defineProperty(patternProperties, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const util_2 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "patternProperties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, data, parentSchema, it } = cxt;
      const { opts } = it;
      const patterns = (0, code_1.allSchemaProperties)(schema);
      const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
      if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
        return;
      }
      const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
      const valid = gen.name("valid");
      if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
        it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
      }
      const { props } = it;
      validatePatternProperties();
      function validatePatternProperties() {
        for (const pat of patterns) {
          if (checkProperties)
            checkMatchingProperties(pat);
          if (it.allErrors) {
            validateProperties(pat);
          } else {
            gen.var(valid, true);
            validateProperties(pat);
            gen.if(valid);
          }
        }
      }
      function checkMatchingProperties(pat) {
        for (const prop in checkProperties) {
          if (new RegExp(pat).test(prop)) {
            (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
          }
        }
      }
      function validateProperties(pat) {
        gen.forIn("key", data, (key) => {
          gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
            const alwaysValid = alwaysValidPatterns.includes(pat);
            if (!alwaysValid) {
              cxt.subschema({
                keyword: "patternProperties",
                schemaProp: pat,
                dataProp: key,
                dataPropType: util_2.Type.Str
              }, valid);
            }
            if (it.opts.unevaluated && props !== true) {
              gen.assign((0, codegen_1._)`${props}[${key}]`, true);
            } else if (!alwaysValid && !it.allErrors) {
              gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          });
        });
      }
    }
  };
  patternProperties.default = def;
  return patternProperties;
}
var not = {};
var hasRequiredNot;
function requireNot() {
  if (hasRequiredNot) return not;
  hasRequiredNot = 1;
  Object.defineProperty(not, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    code(cxt) {
      const { gen, schema, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        cxt.fail();
        return;
      }
      const valid = gen.name("valid");
      cxt.subschema({
        keyword: "not",
        compositeRule: true,
        createErrors: false,
        allErrors: false
      }, valid);
      cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
    },
    error: { message: "must NOT be valid" }
  };
  not.default = def;
  return not;
}
var anyOf = {};
var hasRequiredAnyOf;
function requireAnyOf() {
  if (hasRequiredAnyOf) return anyOf;
  hasRequiredAnyOf = 1;
  Object.defineProperty(anyOf, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const def = {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: true,
    code: code_1.validateUnion,
    error: { message: "must match a schema in anyOf" }
  };
  anyOf.default = def;
  return anyOf;
}
var oneOf = {};
var hasRequiredOneOf;
function requireOneOf() {
  if (hasRequiredOneOf) return oneOf;
  hasRequiredOneOf = 1;
  Object.defineProperty(oneOf, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: "must match exactly one schema in oneOf",
    params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
  };
  const def = {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      if (it.opts.discriminator && parentSchema.discriminator)
        return;
      const schArr = schema;
      const valid = gen.let("valid", false);
      const passing = gen.let("passing", null);
      const schValid = gen.name("_valid");
      cxt.setParams({ passing });
      gen.block(validateOneOf);
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
      function validateOneOf() {
        schArr.forEach((sch, i) => {
          let schCxt;
          if ((0, util_1.alwaysValidSchema)(it, sch)) {
            gen.var(schValid, true);
          } else {
            schCxt = cxt.subschema({
              keyword: "oneOf",
              schemaProp: i,
              compositeRule: true
            }, schValid);
          }
          if (i > 0) {
            gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
          }
          gen.if(schValid, () => {
            gen.assign(valid, true);
            gen.assign(passing, i);
            if (schCxt)
              cxt.mergeEvaluated(schCxt, codegen_1.Name);
          });
        });
      }
    }
  };
  oneOf.default = def;
  return oneOf;
}
var allOf$2 = {};
var hasRequiredAllOf;
function requireAllOf() {
  if (hasRequiredAllOf) return allOf$2;
  hasRequiredAllOf = 1;
  Object.defineProperty(allOf$2, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "allOf",
    schemaType: "array",
    code(cxt) {
      const { gen, schema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const valid = gen.name("valid");
      schema.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
        cxt.ok(valid);
        cxt.mergeEvaluated(schCxt);
      });
    }
  };
  allOf$2.default = def;
  return allOf$2;
}
var _if = {};
var hasRequired_if;
function require_if() {
  if (hasRequired_if) return _if;
  hasRequired_if = 1;
  Object.defineProperty(_if, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
    params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
  };
  const def = {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, parentSchema, it } = cxt;
      if (parentSchema.then === void 0 && parentSchema.else === void 0) {
        (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
      }
      const hasThen = hasSchema(it, "then");
      const hasElse = hasSchema(it, "else");
      if (!hasThen && !hasElse)
        return;
      const valid = gen.let("valid", true);
      const schValid = gen.name("_valid");
      validateIf();
      cxt.reset();
      if (hasThen && hasElse) {
        const ifClause = gen.let("ifClause");
        cxt.setParams({ ifClause });
        gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
      } else if (hasThen) {
        gen.if(schValid, validateClause("then"));
      } else {
        gen.if((0, codegen_1.not)(schValid), validateClause("else"));
      }
      cxt.pass(valid, () => cxt.error(true));
      function validateIf() {
        const schCxt = cxt.subschema({
          keyword: "if",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, schValid);
        cxt.mergeEvaluated(schCxt);
      }
      function validateClause(keyword2, ifClause) {
        return () => {
          const schCxt = cxt.subschema({ keyword: keyword2 }, schValid);
          gen.assign(valid, schValid);
          cxt.mergeValidEvaluated(schCxt, valid);
          if (ifClause)
            gen.assign(ifClause, (0, codegen_1._)`${keyword2}`);
          else
            cxt.setParams({ ifClause: keyword2 });
        };
      }
    }
  };
  function hasSchema(it, keyword2) {
    const schema = it.schema[keyword2];
    return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
  }
  _if.default = def;
  return _if;
}
var thenElse = {};
var hasRequiredThenElse;
function requireThenElse() {
  if (hasRequiredThenElse) return thenElse;
  hasRequiredThenElse = 1;
  Object.defineProperty(thenElse, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code({ keyword: keyword2, parentSchema, it }) {
      if (parentSchema.if === void 0)
        (0, util_1.checkStrictMode)(it, `"${keyword2}" without "if" is ignored`);
    }
  };
  thenElse.default = def;
  return thenElse;
}
var hasRequiredApplicator;
function requireApplicator() {
  if (hasRequiredApplicator) return applicator;
  hasRequiredApplicator = 1;
  Object.defineProperty(applicator, "__esModule", { value: true });
  const additionalItems_1 = /* @__PURE__ */ requireAdditionalItems();
  const prefixItems_1 = /* @__PURE__ */ requirePrefixItems();
  const items_1 = /* @__PURE__ */ requireItems();
  const items2020_1 = /* @__PURE__ */ requireItems2020();
  const contains_1 = /* @__PURE__ */ requireContains();
  const dependencies_1 = /* @__PURE__ */ requireDependencies();
  const propertyNames_1 = /* @__PURE__ */ requirePropertyNames();
  const additionalProperties_1 = /* @__PURE__ */ requireAdditionalProperties();
  const properties_1 = /* @__PURE__ */ requireProperties();
  const patternProperties_1 = /* @__PURE__ */ requirePatternProperties();
  const not_1 = /* @__PURE__ */ requireNot();
  const anyOf_1 = /* @__PURE__ */ requireAnyOf();
  const oneOf_1 = /* @__PURE__ */ requireOneOf();
  const allOf_1 = /* @__PURE__ */ requireAllOf();
  const if_1 = /* @__PURE__ */ require_if();
  const thenElse_1 = /* @__PURE__ */ requireThenElse();
  function getApplicator(draft20202 = false) {
    const applicator2 = [
      // any
      not_1.default,
      anyOf_1.default,
      oneOf_1.default,
      allOf_1.default,
      if_1.default,
      thenElse_1.default,
      // object
      propertyNames_1.default,
      additionalProperties_1.default,
      dependencies_1.default,
      properties_1.default,
      patternProperties_1.default
    ];
    if (draft20202)
      applicator2.push(prefixItems_1.default, items2020_1.default);
    else
      applicator2.push(additionalItems_1.default, items_1.default);
    applicator2.push(contains_1.default);
    return applicator2;
  }
  applicator.default = getApplicator;
  return applicator;
}
var dynamic = {};
var dynamicAnchor = {};
var hasRequiredDynamicAnchor;
function requireDynamicAnchor() {
  if (hasRequiredDynamicAnchor) return dynamicAnchor;
  hasRequiredDynamicAnchor = 1;
  Object.defineProperty(dynamicAnchor, "__esModule", { value: true });
  dynamicAnchor.dynamicAnchor = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const compile_1 = /* @__PURE__ */ requireCompile();
  const ref_1 = /* @__PURE__ */ requireRef();
  const def = {
    keyword: "$dynamicAnchor",
    schemaType: "string",
    code: (cxt) => dynamicAnchor$1(cxt, cxt.schema)
  };
  function dynamicAnchor$1(cxt, anchor) {
    const { gen, it } = cxt;
    it.schemaEnv.root.dynamicAnchors[anchor] = true;
    const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
    const validate2 = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
    gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate2));
  }
  dynamicAnchor.dynamicAnchor = dynamicAnchor$1;
  function _getValidate(cxt) {
    const { schemaEnv, schema, self: self2 } = cxt.it;
    const { root: root2, baseId, localRefs, meta } = schemaEnv.root;
    const { schemaId } = self2.opts;
    const sch = new compile_1.SchemaEnv({ schema, schemaId, root: root2, baseId, localRefs, meta });
    compile_1.compileSchema.call(self2, sch);
    return (0, ref_1.getValidate)(cxt, sch);
  }
  dynamicAnchor.default = def;
  return dynamicAnchor;
}
var dynamicRef = {};
var hasRequiredDynamicRef;
function requireDynamicRef() {
  if (hasRequiredDynamicRef) return dynamicRef;
  hasRequiredDynamicRef = 1;
  Object.defineProperty(dynamicRef, "__esModule", { value: true });
  dynamicRef.dynamicRef = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const ref_1 = /* @__PURE__ */ requireRef();
  const def = {
    keyword: "$dynamicRef",
    schemaType: "string",
    code: (cxt) => dynamicRef$1(cxt, cxt.schema)
  };
  function dynamicRef$1(cxt, ref2) {
    const { gen, keyword: keyword2, it } = cxt;
    if (ref2[0] !== "#")
      throw new Error(`"${keyword2}" only supports hash fragment reference`);
    const anchor = ref2.slice(1);
    if (it.allErrors) {
      _dynamicRef();
    } else {
      const valid = gen.let("valid", false);
      _dynamicRef(valid);
      cxt.ok(valid);
    }
    function _dynamicRef(valid) {
      if (it.schemaEnv.root.dynamicAnchors[anchor]) {
        const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
        gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
      } else {
        _callRef(it.validateName, valid)();
      }
    }
    function _callRef(validate2, valid) {
      return valid ? () => gen.block(() => {
        (0, ref_1.callRef)(cxt, validate2);
        gen.let(valid, true);
      }) : () => (0, ref_1.callRef)(cxt, validate2);
    }
  }
  dynamicRef.dynamicRef = dynamicRef$1;
  dynamicRef.default = def;
  return dynamicRef;
}
var recursiveAnchor = {};
var hasRequiredRecursiveAnchor;
function requireRecursiveAnchor() {
  if (hasRequiredRecursiveAnchor) return recursiveAnchor;
  hasRequiredRecursiveAnchor = 1;
  Object.defineProperty(recursiveAnchor, "__esModule", { value: true });
  const dynamicAnchor_1 = /* @__PURE__ */ requireDynamicAnchor();
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "$recursiveAnchor",
    schemaType: "boolean",
    code(cxt) {
      if (cxt.schema)
        (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
      else
        (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
    }
  };
  recursiveAnchor.default = def;
  return recursiveAnchor;
}
var recursiveRef = {};
var hasRequiredRecursiveRef;
function requireRecursiveRef() {
  if (hasRequiredRecursiveRef) return recursiveRef;
  hasRequiredRecursiveRef = 1;
  Object.defineProperty(recursiveRef, "__esModule", { value: true });
  const dynamicRef_1 = /* @__PURE__ */ requireDynamicRef();
  const def = {
    keyword: "$recursiveRef",
    schemaType: "string",
    code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
  };
  recursiveRef.default = def;
  return recursiveRef;
}
var hasRequiredDynamic;
function requireDynamic() {
  if (hasRequiredDynamic) return dynamic;
  hasRequiredDynamic = 1;
  Object.defineProperty(dynamic, "__esModule", { value: true });
  const dynamicAnchor_1 = /* @__PURE__ */ requireDynamicAnchor();
  const dynamicRef_1 = /* @__PURE__ */ requireDynamicRef();
  const recursiveAnchor_1 = /* @__PURE__ */ requireRecursiveAnchor();
  const recursiveRef_1 = /* @__PURE__ */ requireRecursiveRef();
  const dynamic$1 = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
  dynamic.default = dynamic$1;
  return dynamic;
}
var next = {};
var dependentRequired = {};
var hasRequiredDependentRequired;
function requireDependentRequired() {
  if (hasRequiredDependentRequired) return dependentRequired;
  hasRequiredDependentRequired = 1;
  Object.defineProperty(dependentRequired, "__esModule", { value: true });
  const dependencies_1 = /* @__PURE__ */ requireDependencies();
  const def = {
    keyword: "dependentRequired",
    type: "object",
    schemaType: "object",
    error: dependencies_1.error,
    code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
  };
  dependentRequired.default = def;
  return dependentRequired;
}
var dependentSchemas = {};
var hasRequiredDependentSchemas;
function requireDependentSchemas() {
  if (hasRequiredDependentSchemas) return dependentSchemas;
  hasRequiredDependentSchemas = 1;
  Object.defineProperty(dependentSchemas, "__esModule", { value: true });
  const dependencies_1 = /* @__PURE__ */ requireDependencies();
  const def = {
    keyword: "dependentSchemas",
    type: "object",
    schemaType: "object",
    code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
  };
  dependentSchemas.default = def;
  return dependentSchemas;
}
var limitContains = {};
var hasRequiredLimitContains;
function requireLimitContains() {
  if (hasRequiredLimitContains) return limitContains;
  hasRequiredLimitContains = 1;
  Object.defineProperty(limitContains, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: ["maxContains", "minContains"],
    type: "array",
    schemaType: "number",
    code({ keyword: keyword2, parentSchema, it }) {
      if (parentSchema.contains === void 0) {
        (0, util_1.checkStrictMode)(it, `"${keyword2}" without "contains" is ignored`);
      }
    }
  };
  limitContains.default = def;
  return limitContains;
}
var hasRequiredNext;
function requireNext() {
  if (hasRequiredNext) return next;
  hasRequiredNext = 1;
  Object.defineProperty(next, "__esModule", { value: true });
  const dependentRequired_1 = /* @__PURE__ */ requireDependentRequired();
  const dependentSchemas_1 = /* @__PURE__ */ requireDependentSchemas();
  const limitContains_1 = /* @__PURE__ */ requireLimitContains();
  const next$1 = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
  next.default = next$1;
  return next;
}
var unevaluated = {};
var unevaluatedProperties = {};
var hasRequiredUnevaluatedProperties;
function requireUnevaluatedProperties() {
  if (hasRequiredUnevaluatedProperties) return unevaluatedProperties;
  hasRequiredUnevaluatedProperties = 1;
  Object.defineProperty(unevaluatedProperties, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const names_1 = /* @__PURE__ */ requireNames();
  const error = {
    message: "must NOT have unevaluated properties",
    params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
  };
  const def = {
    keyword: "unevaluatedProperties",
    type: "object",
    schemaType: ["boolean", "object"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, props } = it;
      if (props instanceof codegen_1.Name) {
        gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
      } else if (props !== true) {
        gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
      }
      it.props = true;
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function unevaluatedPropCode(key) {
        if (schema === false) {
          cxt.setParams({ unevaluatedProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (!(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.name("valid");
          cxt.subschema({
            keyword: "unevaluatedProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          }, valid);
          if (!allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        }
      }
      function unevaluatedDynamic(evaluatedProps, key) {
        return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
      }
      function unevaluatedStatic(evaluatedProps, key) {
        const ps = [];
        for (const p in evaluatedProps) {
          if (evaluatedProps[p] === true)
            ps.push((0, codegen_1._)`${key} !== ${p}`);
        }
        return (0, codegen_1.and)(...ps);
      }
    }
  };
  unevaluatedProperties.default = def;
  return unevaluatedProperties;
}
var unevaluatedItems = {};
var hasRequiredUnevaluatedItems;
function requireUnevaluatedItems() {
  if (hasRequiredUnevaluatedItems) return unevaluatedItems;
  hasRequiredUnevaluatedItems = 1;
  Object.defineProperty(unevaluatedItems, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  const def = {
    keyword: "unevaluatedItems",
    type: "array",
    schemaType: ["boolean", "object"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      const items2 = it.items || 0;
      if (items2 === true)
        return;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items2 });
        cxt.fail((0, codegen_1._)`${len} > ${items2}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items2}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items2));
        cxt.ok(valid);
      }
      it.items = true;
      function validateItems(valid, from) {
        gen.forRange("i", from, len, (i) => {
          cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
  };
  unevaluatedItems.default = def;
  return unevaluatedItems;
}
var hasRequiredUnevaluated;
function requireUnevaluated() {
  if (hasRequiredUnevaluated) return unevaluated;
  hasRequiredUnevaluated = 1;
  Object.defineProperty(unevaluated, "__esModule", { value: true });
  const unevaluatedProperties_1 = /* @__PURE__ */ requireUnevaluatedProperties();
  const unevaluatedItems_1 = /* @__PURE__ */ requireUnevaluatedItems();
  const unevaluated$1 = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
  unevaluated.default = unevaluated$1;
  return unevaluated;
}
var format$1 = {};
var format = {};
var hasRequiredFormat$1;
function requireFormat$1() {
  if (hasRequiredFormat$1) return format;
  hasRequiredFormat$1 = 1;
  Object.defineProperty(format, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
  };
  const def = {
    keyword: "format",
    type: ["number", "string"],
    schemaType: "string",
    $data: true,
    error,
    code(cxt, ruleType) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const { opts, errSchemaPath, schemaEnv, self: self2 } = it;
      if (!opts.validateFormats)
        return;
      if ($data)
        validate$DataFormat();
      else
        validateFormat();
      function validate$DataFormat() {
        const fmts = gen.scopeValue("formats", {
          ref: self2.formats,
          code: opts.code.formats
        });
        const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
        const fType = gen.let("fType");
        const format2 = gen.let("format");
        gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format2, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format2, fDef));
        cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
        function unknownFmt() {
          if (opts.strictSchema === false)
            return codegen_1.nil;
          return (0, codegen_1._)`${schemaCode} && !${format2}`;
        }
        function invalidFmt() {
          const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format2}(${data}) : ${format2}(${data}))` : (0, codegen_1._)`${format2}(${data})`;
          const validData = (0, codegen_1._)`(typeof ${format2} == "function" ? ${callFormat} : ${format2}.test(${data}))`;
          return (0, codegen_1._)`${format2} && ${format2} !== true && ${fType} === ${ruleType} && !${validData}`;
        }
      }
      function validateFormat() {
        const formatDef = self2.formats[schema];
        if (!formatDef) {
          unknownFormat();
          return;
        }
        if (formatDef === true)
          return;
        const [fmtType, format2, fmtRef] = getFormat(formatDef);
        if (fmtType === ruleType)
          cxt.pass(validCondition());
        function unknownFormat() {
          if (opts.strictSchema === false) {
            self2.logger.warn(unknownMsg());
            return;
          }
          throw new Error(unknownMsg());
          function unknownMsg() {
            return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
          }
        }
        function getFormat(fmtDef) {
          const code2 = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
          const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code: code2 });
          if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
            return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
          }
          return ["string", fmtDef, fmt];
        }
        function validCondition() {
          if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
            if (!schemaEnv.$async)
              throw new Error("async format in sync schema");
            return (0, codegen_1._)`await ${fmtRef}(${data})`;
          }
          return typeof format2 == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
        }
      }
    }
  };
  format.default = def;
  return format;
}
var hasRequiredFormat;
function requireFormat() {
  if (hasRequiredFormat) return format$1;
  hasRequiredFormat = 1;
  Object.defineProperty(format$1, "__esModule", { value: true });
  const format_1 = /* @__PURE__ */ requireFormat$1();
  const format2 = [format_1.default];
  format$1.default = format2;
  return format$1;
}
var metadata = {};
var hasRequiredMetadata;
function requireMetadata() {
  if (hasRequiredMetadata) return metadata;
  hasRequiredMetadata = 1;
  Object.defineProperty(metadata, "__esModule", { value: true });
  metadata.contentVocabulary = metadata.metadataVocabulary = void 0;
  metadata.metadataVocabulary = [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples"
  ];
  metadata.contentVocabulary = [
    "contentMediaType",
    "contentEncoding",
    "contentSchema"
  ];
  return metadata;
}
var hasRequiredDraft2020;
function requireDraft2020() {
  if (hasRequiredDraft2020) return draft2020;
  hasRequiredDraft2020 = 1;
  Object.defineProperty(draft2020, "__esModule", { value: true });
  const core_1 = /* @__PURE__ */ requireCore();
  const validation_1 = /* @__PURE__ */ requireValidation();
  const applicator_1 = /* @__PURE__ */ requireApplicator();
  const dynamic_1 = /* @__PURE__ */ requireDynamic();
  const next_1 = /* @__PURE__ */ requireNext();
  const unevaluated_1 = /* @__PURE__ */ requireUnevaluated();
  const format_1 = /* @__PURE__ */ requireFormat();
  const metadata_1 = /* @__PURE__ */ requireMetadata();
  const draft2020Vocabularies = [
    dynamic_1.default,
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(true),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary,
    next_1.default,
    unevaluated_1.default
  ];
  draft2020.default = draft2020Vocabularies;
  return draft2020;
}
var discriminator = {};
var types = {};
var hasRequiredTypes;
function requireTypes() {
  if (hasRequiredTypes) return types;
  hasRequiredTypes = 1;
  Object.defineProperty(types, "__esModule", { value: true });
  types.DiscrError = void 0;
  var DiscrError;
  (function(DiscrError2) {
    DiscrError2["Tag"] = "tag";
    DiscrError2["Mapping"] = "mapping";
  })(DiscrError || (types.DiscrError = DiscrError = {}));
  return types;
}
var hasRequiredDiscriminator;
function requireDiscriminator() {
  if (hasRequiredDiscriminator) return discriminator;
  hasRequiredDiscriminator = 1;
  Object.defineProperty(discriminator, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const types_1 = /* @__PURE__ */ requireTypes();
  const compile_1 = /* @__PURE__ */ requireCompile();
  const ref_error_1 = /* @__PURE__ */ requireRef_error();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
    params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
  };
  const def = {
    keyword: "discriminator",
    type: "object",
    schemaType: "object",
    error,
    code(cxt) {
      const { gen, data, schema, parentSchema, it } = cxt;
      const { oneOf: oneOf2 } = parentSchema;
      if (!it.opts.discriminator) {
        throw new Error("discriminator: requires discriminator option");
      }
      const tagName = schema.propertyName;
      if (typeof tagName != "string")
        throw new Error("discriminator: requires propertyName");
      if (schema.mapping)
        throw new Error("discriminator: mapping is not supported");
      if (!oneOf2)
        throw new Error("discriminator: requires oneOf keyword");
      const valid = gen.let("valid", false);
      const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
      gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
      cxt.ok(valid);
      function validateMapping() {
        const mapping = getMapping();
        gen.if(false);
        for (const tagValue in mapping) {
          gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
          gen.assign(valid, applyTagSchema(mapping[tagValue]));
        }
        gen.else();
        cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
        gen.endIf();
      }
      function applyTagSchema(schemaProp) {
        const _valid = gen.name("valid");
        const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
        cxt.mergeEvaluated(schCxt, codegen_1.Name);
        return _valid;
      }
      function getMapping() {
        var _a;
        const oneOfMapping = {};
        const topRequired = hasRequired(parentSchema);
        let tagRequired = true;
        for (let i = 0; i < oneOf2.length; i++) {
          let sch = oneOf2[i];
          if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
            const ref2 = sch.$ref;
            sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref2);
            if (sch instanceof compile_1.SchemaEnv)
              sch = sch.schema;
            if (sch === void 0)
              throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref2);
          }
          const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
          if (typeof propSch != "object") {
            throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
          }
          tagRequired = tagRequired && (topRequired || hasRequired(sch));
          addMappings(propSch, i);
        }
        if (!tagRequired)
          throw new Error(`discriminator: "${tagName}" must be required`);
        return oneOfMapping;
        function hasRequired({ required: required2 }) {
          return Array.isArray(required2) && required2.includes(tagName);
        }
        function addMappings(sch, i) {
          if (sch.const) {
            addMapping(sch.const, i);
          } else if (sch.enum) {
            for (const tagValue of sch.enum) {
              addMapping(tagValue, i);
            }
          } else {
            throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
          }
        }
        function addMapping(tagValue, i) {
          if (typeof tagValue != "string" || tagValue in oneOfMapping) {
            throw new Error(`discriminator: "${tagName}" values must be unique strings`);
          }
          oneOfMapping[tagValue] = i;
        }
      }
    }
  };
  discriminator.default = def;
  return discriminator;
}
var jsonSchema202012 = {};
const $schema$a = "https://json-schema.org/draft/2020-12/schema";
const $id$a = "https://json-schema.org/draft/2020-12/schema";
const $vocabulary$7 = { "https://json-schema.org/draft/2020-12/vocab/core": true, "https://json-schema.org/draft/2020-12/vocab/applicator": true, "https://json-schema.org/draft/2020-12/vocab/unevaluated": true, "https://json-schema.org/draft/2020-12/vocab/validation": true, "https://json-schema.org/draft/2020-12/vocab/meta-data": true, "https://json-schema.org/draft/2020-12/vocab/format-annotation": true, "https://json-schema.org/draft/2020-12/vocab/content": true };
const $dynamicAnchor$7 = "meta";
const title$8 = "Core and Validation specifications meta-schema";
const allOf$1 = [{ "$ref": "meta/core" }, { "$ref": "meta/applicator" }, { "$ref": "meta/unevaluated" }, { "$ref": "meta/validation" }, { "$ref": "meta/meta-data" }, { "$ref": "meta/format-annotation" }, { "$ref": "meta/content" }];
const type$a = ["object", "boolean"];
const $comment = "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.";
const properties$a = { "definitions": { "$comment": '"definitions" has been replaced by "$defs".', "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "deprecated": true, "default": {} }, "dependencies": { "$comment": '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.', "type": "object", "additionalProperties": { "anyOf": [{ "$dynamicRef": "#meta" }, { "$ref": "meta/validation#/$defs/stringArray" }] }, "deprecated": true, "default": {} }, "$recursiveAnchor": { "$comment": '"$recursiveAnchor" has been replaced by "$dynamicAnchor".', "$ref": "meta/core#/$defs/anchorString", "deprecated": true }, "$recursiveRef": { "$comment": '"$recursiveRef" has been replaced by "$dynamicRef".', "$ref": "meta/core#/$defs/uriReferenceString", "deprecated": true } };
const require$$0 = {
  $schema: $schema$a,
  $id: $id$a,
  $vocabulary: $vocabulary$7,
  $dynamicAnchor: $dynamicAnchor$7,
  title: title$8,
  allOf: allOf$1,
  type: type$a,
  $comment,
  properties: properties$a
};
const $schema$9 = "https://json-schema.org/draft/2020-12/schema";
const $id$9 = "https://json-schema.org/draft/2020-12/meta/applicator";
const $vocabulary$6 = { "https://json-schema.org/draft/2020-12/vocab/applicator": true };
const $dynamicAnchor$6 = "meta";
const title$7 = "Applicator vocabulary meta-schema";
const type$9 = ["object", "boolean"];
const properties$9 = { "prefixItems": { "$ref": "#/$defs/schemaArray" }, "items": { "$dynamicRef": "#meta" }, "contains": { "$dynamicRef": "#meta" }, "additionalProperties": { "$dynamicRef": "#meta" }, "properties": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "default": {} }, "patternProperties": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "propertyNames": { "format": "regex" }, "default": {} }, "dependentSchemas": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "default": {} }, "propertyNames": { "$dynamicRef": "#meta" }, "if": { "$dynamicRef": "#meta" }, "then": { "$dynamicRef": "#meta" }, "else": { "$dynamicRef": "#meta" }, "allOf": { "$ref": "#/$defs/schemaArray" }, "anyOf": { "$ref": "#/$defs/schemaArray" }, "oneOf": { "$ref": "#/$defs/schemaArray" }, "not": { "$dynamicRef": "#meta" } };
const $defs$4 = { "schemaArray": { "type": "array", "minItems": 1, "items": { "$dynamicRef": "#meta" } } };
const require$$1 = {
  $schema: $schema$9,
  $id: $id$9,
  $vocabulary: $vocabulary$6,
  $dynamicAnchor: $dynamicAnchor$6,
  title: title$7,
  type: type$9,
  properties: properties$9,
  $defs: $defs$4
};
const $schema$8 = "https://json-schema.org/draft/2020-12/schema";
const $id$8 = "https://json-schema.org/draft/2020-12/meta/unevaluated";
const $vocabulary$5 = { "https://json-schema.org/draft/2020-12/vocab/unevaluated": true };
const $dynamicAnchor$5 = "meta";
const title$6 = "Unevaluated applicator vocabulary meta-schema";
const type$8 = ["object", "boolean"];
const properties$8 = { "unevaluatedItems": { "$dynamicRef": "#meta" }, "unevaluatedProperties": { "$dynamicRef": "#meta" } };
const require$$2 = {
  $schema: $schema$8,
  $id: $id$8,
  $vocabulary: $vocabulary$5,
  $dynamicAnchor: $dynamicAnchor$5,
  title: title$6,
  type: type$8,
  properties: properties$8
};
const $schema$7 = "https://json-schema.org/draft/2020-12/schema";
const $id$7 = "https://json-schema.org/draft/2020-12/meta/content";
const $vocabulary$4 = { "https://json-schema.org/draft/2020-12/vocab/content": true };
const $dynamicAnchor$4 = "meta";
const title$5 = "Content vocabulary meta-schema";
const type$7 = ["object", "boolean"];
const properties$7 = { "contentEncoding": { "type": "string" }, "contentMediaType": { "type": "string" }, "contentSchema": { "$dynamicRef": "#meta" } };
const require$$3$1 = {
  $schema: $schema$7,
  $id: $id$7,
  $vocabulary: $vocabulary$4,
  $dynamicAnchor: $dynamicAnchor$4,
  title: title$5,
  type: type$7,
  properties: properties$7
};
const $schema$6 = "https://json-schema.org/draft/2020-12/schema";
const $id$6 = "https://json-schema.org/draft/2020-12/meta/core";
const $vocabulary$3 = { "https://json-schema.org/draft/2020-12/vocab/core": true };
const $dynamicAnchor$3 = "meta";
const title$4 = "Core vocabulary meta-schema";
const type$6 = ["object", "boolean"];
const properties$6 = { "$id": { "$ref": "#/$defs/uriReferenceString", "$comment": "Non-empty fragments not allowed.", "pattern": "^[^#]*#?$" }, "$schema": { "$ref": "#/$defs/uriString" }, "$ref": { "$ref": "#/$defs/uriReferenceString" }, "$anchor": { "$ref": "#/$defs/anchorString" }, "$dynamicRef": { "$ref": "#/$defs/uriReferenceString" }, "$dynamicAnchor": { "$ref": "#/$defs/anchorString" }, "$vocabulary": { "type": "object", "propertyNames": { "$ref": "#/$defs/uriString" }, "additionalProperties": { "type": "boolean" } }, "$comment": { "type": "string" }, "$defs": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" } } };
const $defs$3 = { "anchorString": { "type": "string", "pattern": "^[A-Za-z_][-A-Za-z0-9._]*$" }, "uriString": { "type": "string", "format": "uri" }, "uriReferenceString": { "type": "string", "format": "uri-reference" } };
const require$$4 = {
  $schema: $schema$6,
  $id: $id$6,
  $vocabulary: $vocabulary$3,
  $dynamicAnchor: $dynamicAnchor$3,
  title: title$4,
  type: type$6,
  properties: properties$6,
  $defs: $defs$3
};
const $schema$5 = "https://json-schema.org/draft/2020-12/schema";
const $id$5 = "https://json-schema.org/draft/2020-12/meta/format-annotation";
const $vocabulary$2 = { "https://json-schema.org/draft/2020-12/vocab/format-annotation": true };
const $dynamicAnchor$2 = "meta";
const title$3 = "Format vocabulary meta-schema for annotation results";
const type$5 = ["object", "boolean"];
const properties$5 = { "format": { "type": "string" } };
const require$$5 = {
  $schema: $schema$5,
  $id: $id$5,
  $vocabulary: $vocabulary$2,
  $dynamicAnchor: $dynamicAnchor$2,
  title: title$3,
  type: type$5,
  properties: properties$5
};
const $schema$4 = "https://json-schema.org/draft/2020-12/schema";
const $id$4 = "https://json-schema.org/draft/2020-12/meta/meta-data";
const $vocabulary$1 = { "https://json-schema.org/draft/2020-12/vocab/meta-data": true };
const $dynamicAnchor$1 = "meta";
const title$2 = "Meta-data vocabulary meta-schema";
const type$4 = ["object", "boolean"];
const properties$4 = { "title": { "type": "string" }, "description": { "type": "string" }, "default": true, "deprecated": { "type": "boolean", "default": false }, "readOnly": { "type": "boolean", "default": false }, "writeOnly": { "type": "boolean", "default": false }, "examples": { "type": "array", "items": true } };
const require$$6 = {
  $schema: $schema$4,
  $id: $id$4,
  $vocabulary: $vocabulary$1,
  $dynamicAnchor: $dynamicAnchor$1,
  title: title$2,
  type: type$4,
  properties: properties$4
};
const $schema$3 = "https://json-schema.org/draft/2020-12/schema";
const $id$3 = "https://json-schema.org/draft/2020-12/meta/validation";
const $vocabulary = { "https://json-schema.org/draft/2020-12/vocab/validation": true };
const $dynamicAnchor = "meta";
const title$1 = "Validation vocabulary meta-schema";
const type$3 = ["object", "boolean"];
const properties$3 = { "type": { "anyOf": [{ "$ref": "#/$defs/simpleTypes" }, { "type": "array", "items": { "$ref": "#/$defs/simpleTypes" }, "minItems": 1, "uniqueItems": true }] }, "const": true, "enum": { "type": "array", "items": true }, "multipleOf": { "type": "number", "exclusiveMinimum": 0 }, "maximum": { "type": "number" }, "exclusiveMaximum": { "type": "number" }, "minimum": { "type": "number" }, "exclusiveMinimum": { "type": "number" }, "maxLength": { "$ref": "#/$defs/nonNegativeInteger" }, "minLength": { "$ref": "#/$defs/nonNegativeIntegerDefault0" }, "pattern": { "type": "string", "format": "regex" }, "maxItems": { "$ref": "#/$defs/nonNegativeInteger" }, "minItems": { "$ref": "#/$defs/nonNegativeIntegerDefault0" }, "uniqueItems": { "type": "boolean", "default": false }, "maxContains": { "$ref": "#/$defs/nonNegativeInteger" }, "minContains": { "$ref": "#/$defs/nonNegativeInteger", "default": 1 }, "maxProperties": { "$ref": "#/$defs/nonNegativeInteger" }, "minProperties": { "$ref": "#/$defs/nonNegativeIntegerDefault0" }, "required": { "$ref": "#/$defs/stringArray" }, "dependentRequired": { "type": "object", "additionalProperties": { "$ref": "#/$defs/stringArray" } } };
const $defs$2 = { "nonNegativeInteger": { "type": "integer", "minimum": 0 }, "nonNegativeIntegerDefault0": { "$ref": "#/$defs/nonNegativeInteger", "default": 0 }, "simpleTypes": { "enum": ["array", "boolean", "integer", "null", "number", "object", "string"] }, "stringArray": { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "default": [] } };
const require$$7 = {
  $schema: $schema$3,
  $id: $id$3,
  $vocabulary,
  $dynamicAnchor,
  title: title$1,
  type: type$3,
  properties: properties$3,
  $defs: $defs$2
};
var hasRequiredJsonSchema202012;
function requireJsonSchema202012() {
  if (hasRequiredJsonSchema202012) return jsonSchema202012;
  hasRequiredJsonSchema202012 = 1;
  Object.defineProperty(jsonSchema202012, "__esModule", { value: true });
  const metaSchema = require$$0;
  const applicator2 = require$$1;
  const unevaluated2 = require$$2;
  const content = require$$3$1;
  const core2 = require$$4;
  const format2 = require$$5;
  const metadata2 = require$$6;
  const validation2 = require$$7;
  const META_SUPPORT_DATA = ["/properties"];
  function addMetaSchema2020($data) {
    [
      metaSchema,
      applicator2,
      unevaluated2,
      content,
      core2,
      with$data(this, format2),
      metadata2,
      with$data(this, validation2)
    ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
    return this;
    function with$data(ajv2, sch) {
      return $data ? ajv2.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
    }
  }
  jsonSchema202012.default = addMetaSchema2020;
  return jsonSchema202012;
}
var hasRequired_2020;
function require_2020() {
  if (hasRequired_2020) return _2020.exports;
  hasRequired_2020 = 1;
  (function(module2, exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MissingRefError = exports2.ValidationError = exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = exports2.Ajv2020 = void 0;
    const core_1 = /* @__PURE__ */ requireCore$1();
    const draft2020_1 = /* @__PURE__ */ requireDraft2020();
    const discriminator_1 = /* @__PURE__ */ requireDiscriminator();
    const json_schema_2020_12_1 = /* @__PURE__ */ requireJsonSchema202012();
    const META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    class Ajv20202 extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    }
    exports2.Ajv2020 = Ajv20202;
    module2.exports = exports2 = Ajv20202;
    module2.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = Ajv20202;
    var validate_1 = /* @__PURE__ */ requireValidate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = /* @__PURE__ */ requireCodegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = /* @__PURE__ */ requireValidation_error();
    Object.defineProperty(exports2, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = /* @__PURE__ */ requireRef_error();
    Object.defineProperty(exports2, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  })(_2020, _2020.exports);
  return _2020.exports;
}
var _2020Exports = /* @__PURE__ */ require_2020();
const Ajv2020 = /* @__PURE__ */ getDefaultExportFromCjs(_2020Exports);
var dist = { exports: {} };
var formats = {};
var hasRequiredFormats;
function requireFormats() {
  if (hasRequiredFormats) return formats;
  hasRequiredFormats = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.formatNames = exports2.fastFormats = exports2.fullFormats = void 0;
    function fmtDef(validate2, compare) {
      return { validate: validate2, compare };
    }
    exports2.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri: uri2,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports2.fastFormats = {
      ...exports2.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports2.formatNames = Object.keys(exports2.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str) {
      const matches = DATE.exec(str);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str) {
        const matches = TIME.exec(str);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    const DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str) {
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    const NOT_URI_FRAGMENT = /\/|:/;
    const URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri2(str) {
      return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    const BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str) {
      BYTE.lastIndex = 0;
      return BYTE.test(str);
    }
    const MIN_INT32 = -2147483648;
    const MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    const Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
      if (Z_ANCHOR.test(str))
        return false;
      try {
        new RegExp(str);
        return true;
      } catch (e) {
        return false;
      }
    }
  })(formats);
  return formats;
}
var limit = {};
var ajv$2 = { exports: {} };
var draft7 = {};
var hasRequiredDraft7;
function requireDraft7() {
  if (hasRequiredDraft7) return draft7;
  hasRequiredDraft7 = 1;
  Object.defineProperty(draft7, "__esModule", { value: true });
  const core_1 = /* @__PURE__ */ requireCore();
  const validation_1 = /* @__PURE__ */ requireValidation();
  const applicator_1 = /* @__PURE__ */ requireApplicator();
  const format_1 = /* @__PURE__ */ requireFormat();
  const metadata_1 = /* @__PURE__ */ requireMetadata();
  const draft7Vocabularies = [
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary
  ];
  draft7.default = draft7Vocabularies;
  return draft7;
}
const $schema$2 = "http://json-schema.org/draft-07/schema#";
const $id$2 = "http://json-schema.org/draft-07/schema#";
const title = "Core schema meta-schema";
const definitions = { "schemaArray": { "type": "array", "minItems": 1, "items": { "$ref": "#" } }, "nonNegativeInteger": { "type": "integer", "minimum": 0 }, "nonNegativeIntegerDefault0": { "allOf": [{ "$ref": "#/definitions/nonNegativeInteger" }, { "default": 0 }] }, "simpleTypes": { "enum": ["array", "boolean", "integer", "null", "number", "object", "string"] }, "stringArray": { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "default": [] } };
const type$2 = ["object", "boolean"];
const properties$2 = { "$id": { "type": "string", "format": "uri-reference" }, "$schema": { "type": "string", "format": "uri" }, "$ref": { "type": "string", "format": "uri-reference" }, "$comment": { "type": "string" }, "title": { "type": "string" }, "description": { "type": "string" }, "default": true, "readOnly": { "type": "boolean", "default": false }, "examples": { "type": "array", "items": true }, "multipleOf": { "type": "number", "exclusiveMinimum": 0 }, "maximum": { "type": "number" }, "exclusiveMaximum": { "type": "number" }, "minimum": { "type": "number" }, "exclusiveMinimum": { "type": "number" }, "maxLength": { "$ref": "#/definitions/nonNegativeInteger" }, "minLength": { "$ref": "#/definitions/nonNegativeIntegerDefault0" }, "pattern": { "type": "string", "format": "regex" }, "additionalItems": { "$ref": "#" }, "items": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/schemaArray" }], "default": true }, "maxItems": { "$ref": "#/definitions/nonNegativeInteger" }, "minItems": { "$ref": "#/definitions/nonNegativeIntegerDefault0" }, "uniqueItems": { "type": "boolean", "default": false }, "contains": { "$ref": "#" }, "maxProperties": { "$ref": "#/definitions/nonNegativeInteger" }, "minProperties": { "$ref": "#/definitions/nonNegativeIntegerDefault0" }, "required": { "$ref": "#/definitions/stringArray" }, "additionalProperties": { "$ref": "#" }, "definitions": { "type": "object", "additionalProperties": { "$ref": "#" }, "default": {} }, "properties": { "type": "object", "additionalProperties": { "$ref": "#" }, "default": {} }, "patternProperties": { "type": "object", "additionalProperties": { "$ref": "#" }, "propertyNames": { "format": "regex" }, "default": {} }, "dependencies": { "type": "object", "additionalProperties": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/stringArray" }] } }, "propertyNames": { "$ref": "#" }, "const": true, "enum": { "type": "array", "items": true, "minItems": 1, "uniqueItems": true }, "type": { "anyOf": [{ "$ref": "#/definitions/simpleTypes" }, { "type": "array", "items": { "$ref": "#/definitions/simpleTypes" }, "minItems": 1, "uniqueItems": true }] }, "format": { "type": "string" }, "contentMediaType": { "type": "string" }, "contentEncoding": { "type": "string" }, "if": { "$ref": "#" }, "then": { "$ref": "#" }, "else": { "$ref": "#" }, "allOf": { "$ref": "#/definitions/schemaArray" }, "anyOf": { "$ref": "#/definitions/schemaArray" }, "oneOf": { "$ref": "#/definitions/schemaArray" }, "not": { "$ref": "#" } };
const require$$3 = {
  $schema: $schema$2,
  $id: $id$2,
  title,
  definitions,
  type: type$2,
  properties: properties$2,
  "default": true
};
var hasRequiredAjv;
function requireAjv() {
  if (hasRequiredAjv) return ajv$2.exports;
  hasRequiredAjv = 1;
  (function(module2, exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MissingRefError = exports2.ValidationError = exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = exports2.Ajv = void 0;
    const core_1 = /* @__PURE__ */ requireCore$1();
    const draft7_1 = /* @__PURE__ */ requireDraft7();
    const discriminator_1 = /* @__PURE__ */ requireDiscriminator();
    const draft7MetaSchema = require$$3;
    const META_SUPPORT_DATA = ["/properties"];
    const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    class Ajv extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    }
    exports2.Ajv = Ajv;
    module2.exports = exports2 = Ajv;
    module2.exports.Ajv = Ajv;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = Ajv;
    var validate_1 = /* @__PURE__ */ requireValidate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = /* @__PURE__ */ requireCodegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = /* @__PURE__ */ requireValidation_error();
    Object.defineProperty(exports2, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = /* @__PURE__ */ requireRef_error();
    Object.defineProperty(exports2, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  })(ajv$2, ajv$2.exports);
  return ajv$2.exports;
}
var hasRequiredLimit;
function requireLimit() {
  if (hasRequiredLimit) return limit;
  hasRequiredLimit = 1;
  (function(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.formatLimitDefinition = void 0;
    const ajv_1 = /* @__PURE__ */ requireAjv();
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const ops = codegen_1.operators;
    const KWDs = {
      formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    const error = {
      message: ({ keyword: keyword2, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword2].okStr} ${schemaCode}`,
      params: ({ keyword: keyword2, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword2].okStr}, limit: ${schemaCode}}`
    };
    exports2.formatLimitDefinition = {
      keyword: Object.keys(KWDs),
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, keyword: keyword2, it } = cxt;
        const { opts, self: self2 } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self2.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self2.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format2 = fCxt.schema;
          const fmtDef = self2.formats[format2];
          if (!fmtDef || fmtDef === true)
            return;
          if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
            throw new Error(`"${keyword2}": format "${format2}" does not define "compare" function`);
          }
          const fmt = gen.scopeValue("formats", {
            key: format2,
            ref: fmtDef,
            code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format2)}` : void 0
          });
          cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
          return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword2].fail} 0`;
        }
      },
      dependencies: ["format"]
    };
    const formatLimitPlugin = (ajv2) => {
      ajv2.addKeyword(exports2.formatLimitDefinition);
      return ajv2;
    };
    exports2.default = formatLimitPlugin;
  })(limit);
  return limit;
}
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist.exports;
  hasRequiredDist = 1;
  (function(module2, exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    const formats_1 = requireFormats();
    const limit_1 = requireLimit();
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const fullName = new codegen_1.Name("fullFormats");
    const fastName = new codegen_1.Name("fastFormats");
    const formatsPlugin = (ajv2, opts = { keywords: true }) => {
      if (Array.isArray(opts)) {
        addFormats2(ajv2, opts, formats_1.fullFormats, fullName);
        return ajv2;
      }
      const [formats2, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
      const list = opts.formats || formats_1.formatNames;
      addFormats2(ajv2, list, formats2, exportName);
      if (opts.keywords)
        (0, limit_1.default)(ajv2);
      return ajv2;
    };
    formatsPlugin.get = (name, mode = "full") => {
      const formats2 = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
      const f = formats2[name];
      if (!f)
        throw new Error(`Unknown format "${name}"`);
      return f;
    };
    function addFormats2(ajv2, list, fs, exportName) {
      var _a;
      var _b;
      (_a = (_b = ajv2.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`;
      for (const f of list)
        ajv2.addFormat(f, fs[f]);
    }
    module2.exports = exports2 = formatsPlugin;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = formatsPlugin;
  })(dist, dist.exports);
  return dist.exports;
}
var distExports = requireDist();
const addFormats = /* @__PURE__ */ getDefaultExportFromCjs(distExports);
const $schema$1 = "https://json-schema.org/draft/2020-12/schema";
const $id$1 = "worldkit://schema/authoring-spec@4";
const type$1 = "object";
const additionalProperties$1 = false;
const required$1 = ["kind", "schemaVersion", "id", "seed", "layout", "spatial", "world", "resources", "nodes", "relationships", "rules", "startup", "constraints"];
const properties$1 = { "kind": { "const": "worldkit-authoring-spec" }, "schemaVersion": { "const": 4 }, "id": { "$ref": "#/$defs/id" }, "seed": { "type": "integer", "minimum": 0, "maximum": 4294967295 }, "provenance": { "$ref": "#/$defs/provenance" }, "layout": { "type": "object", "additionalProperties": false, "required": ["solverProfileRef"], "properties": { "solverProfileRef": { "type": "string", "format": "layout-solver-profile-ref" } } }, "spatial": { "type": "object", "additionalProperties": false, "required": ["regions", "routes", "traversalAreas", "screenRegions"], "properties": { "regions": { "type": "array", "maxItems": 256, "items": { "$ref": "#/$defs/spatialRegion" } }, "routes": { "type": "array", "maxItems": 256, "items": { "$ref": "#/$defs/route" } }, "traversalAreas": { "type": "array", "maxItems": 64, "items": { "$ref": "#/$defs/traversalArea" } }, "screenRegions": { "type": "array", "maxItems": 64, "items": { "$ref": "#/$defs/screenRegion" } } } }, "world": { "$ref": "#/$defs/world" }, "resources": { "type": "object", "additionalProperties": false, "required": ["prototypes", "subjectDefinitions"], "properties": { "prototypes": { "type": "array", "maxItems": 4096, "items": { "$ref": "#/$defs/prototype" } }, "subjectDefinitions": { "type": "array", "maxItems": 256, "items": { "$ref": "worldkit://schema/subject-definition@1" } } } }, "nodes": { "type": "array", "minItems": 4, "maxItems": 1e4, "items": { "oneOf": [{ "$ref": "#/$defs/terrainNode" }, { "$ref": "#/$defs/waterNode" }, { "$ref": "#/$defs/objectNode" }, { "$ref": "#/$defs/subjectNode" }, { "$ref": "#/$defs/cameraNode" }, { "$ref": "#/$defs/anchorNode" }] } }, "relationships": { "type": "array", "maxItems": 1e4, "items": { "$ref": "#/$defs/relationship" } }, "rules": { "type": "array", "maxItems": 1e4, "items": { "$ref": "#/$defs/rule" } }, "startup": { "$ref": "#/$defs/startup" }, "constraints": { "type": "object", "additionalProperties": false, "required": ["placements", "connectivity"], "properties": { "placements": { "type": "array", "maxItems": 128, "items": { "$ref": "#/$defs/placementConstraint" } }, "connectivity": { "type": "array", "maxItems": 128, "items": { "$ref": "#/$defs/connectivityConstraint" } } } } };
const $defs$1 = /* @__PURE__ */ JSON.parse('{"uv":{"type":"array","prefixItems":[{"type":"number","minimum":0,"maximum":1},{"type":"number","minimum":0,"maximum":1}],"items":false,"minItems":2,"maxItems":2},"spatialRegion":{"type":"object","additionalProperties":false,"required":["id","kind","pointsMetersXZ","semanticClassId"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"polygon-xz"},"pointsMetersXZ":{"type":"array","minItems":3,"maxItems":4096,"items":{"$ref":"#/$defs/vec2"}},"minimumHeightMeters":{"type":"number"},"maximumHeightMeters":{"type":"number"},"semanticClassId":{"type":"string","minLength":1,"maxLength":128}}},"route":{"type":"object","additionalProperties":false,"required":["id","kind","pointsMetersXZ","widthMeters","locomotionProfileRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"polyline-xz"},"pointsMetersXZ":{"type":"array","minItems":2,"maxItems":4096,"items":{"$ref":"#/$defs/vec2"}},"widthMeters":{"type":"number","exclusiveMinimum":0},"locomotionProfileRef":{"type":"string","format":"locomotion-profile-ref"}}},"traversalArea":{"type":"object","additionalProperties":false,"required":["id","kind","pointsMetersXZ","surfaceEntityId","mode"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"polygon-xz"},"pointsMetersXZ":{"type":"array","minItems":3,"maxItems":128,"items":{"$ref":"#/$defs/vec2"}},"surfaceEntityId":{"$ref":"#/$defs/id"},"mode":{"const":"blocked"}}},"screenRegion":{"type":"object","additionalProperties":false,"required":["id","kind","minimumUv","maximumUv"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"rectangle-uv"},"minimumUv":{"$ref":"#/$defs/uv"},"maximumUv":{"$ref":"#/$defs/uv"}}},"placement":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","transform"],"properties":{"kind":{"const":"fixed"},"transform":{"$ref":"#/$defs/transform"}}},{"type":"object","additionalProperties":false,"required":["kind","placementConstraintIds"],"properties":{"kind":{"const":"solved"},"initialTransform":{"$ref":"#/$defs/transform"},"placementConstraintIds":{"type":"array","minItems":1,"maxItems":128,"uniqueItems":true,"items":{"$ref":"#/$defs/id"}}}}]},"objectNode":{"type":"object","additionalProperties":false,"required":["id","kind","prototypeRef","placement"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"object"},"prototypeRef":{"type":"string","format":"package-prototype-ref"},"placement":{"$ref":"#/$defs/placement"}}},"anchorNode":{"type":"object","additionalProperties":false,"required":["id","kind","placement","semantic"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"anchor"},"placement":{"$ref":"#/$defs/placement"},"semantic":{"$ref":"#/$defs/semantic"}}},"cameraNode":{"type":"object","additionalProperties":false,"required":["id","kind","components"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"camera"},"components":{"type":"object","additionalProperties":false,"required":["cameraRig"],"properties":{"cameraRig":{"type":"object","additionalProperties":false,"required":["defaultRigRef","allowedRigRefs","target","thirdPerson","manualSwitchAllowed"],"properties":{"defaultRigRef":{"$ref":"#/$defs/resourceRef"},"allowedRigRefs":{"type":"array","minItems":1,"maxItems":16,"uniqueItems":true,"items":{"$ref":"#/$defs/resourceRef"}},"target":{"type":"object","additionalProperties":false,"required":["targetEntityId"],"properties":{"targetEntityId":{"$ref":"#/$defs/id"},"targetHeightMeters":{"type":"number"}}},"thirdPerson":{"type":"object","additionalProperties":false,"required":["pitchRadians","distanceMeters","targetHeightMeters","fovDegrees","aspectRatio"],"properties":{"pitchRadians":{"type":"number","minimum":-0.95,"maximum":0.65},"distanceMeters":{"type":"number","minimum":1.8,"maximum":8},"targetHeightMeters":{"type":"number","minimum":0.5,"maximum":4.5},"fovDegrees":{"type":"number","minimum":35,"maximum":90},"aspectRatio":{"type":"number","minimum":0.25,"maximum":4}}},"manualSwitchAllowed":{"type":"boolean"}}}}}}},"insideRegionConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","regionId","boundaryClearanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"inside-region"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"regionId":{"$ref":"#/$defs/id"},"boundaryClearanceMeters":{"type":"number","minimum":0}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"outsideRegionConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","regionId","boundaryClearanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"outside-region"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"regionId":{"$ref":"#/$defs/id"},"boundaryClearanceMeters":{"type":"number","minimum":0}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"distanceRangeConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","referenceEntityId","minimumDistanceMeters","maximumDistanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"distance-range"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"referenceEntityId":{"$ref":"#/$defs/id"},"minimumDistanceMeters":{"type":"number","minimum":0},"maximumDistanceMeters":{"type":"number","minimum":0}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"facesEntityConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","facingEntityId","targetEntityId","maximumAngularDeviationDegrees"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"faces-entity"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"facingEntityId":{"$ref":"#/$defs/id"},"targetEntityId":{"$ref":"#/$defs/id"},"maximumAngularDeviationDegrees":{"type":"number","minimum":0,"maximum":180}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"supportedByConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","supportedEntityId","supportingEntityId","maximumSupportGapMeters","minimumSupportRatio"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"supported-by"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"supportedEntityId":{"$ref":"#/$defs/id"},"supportingEntityId":{"$ref":"#/$defs/id"},"maximumSupportGapMeters":{"type":"number","minimum":0},"minimumSupportRatio":{"type":"number","minimum":0,"maximum":1}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"minimumClearanceConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","clearanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"minimum-clearance"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"clearanceMeters":{"type":"number","minimum":0},"otherEntityIds":{"type":"array","minItems":1,"maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/id"}},"semanticClassIds":{"type":"array","minItems":1,"maxItems":256,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":128}}},"oneOf":[{"type":"object","properties":{"otherEntityIds":true},"required":["otherEntityIds"],"not":{"type":"object","properties":{"semanticClassIds":true},"required":["semanticClassIds"]}},{"type":"object","properties":{"semanticClassIds":true},"required":["semanticClassIds"],"not":{"type":"object","properties":{"otherEntityIds":true},"required":["otherEntityIds"]}}],"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"withinSlopeLimitConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","terrainEntityId","maximumSlopeDegrees"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"within-slope-limit"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"routeId":{"$ref":"#/$defs/id"},"terrainEntityId":{"$ref":"#/$defs/id"},"maximumSlopeDegrees":{"type":"number","minimum":0,"maximum":90}},"oneOf":[{"type":"object","properties":{"entityId":true},"required":["entityId"],"not":{"type":"object","properties":{"routeId":true},"required":["routeId"]}},{"type":"object","properties":{"routeId":true},"required":["routeId"],"not":{"type":"object","properties":{"entityId":true},"required":["entityId"]}}],"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"visibleInCameraRegionConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","visibleEntityId","cameraEntityId","screenRegionId","minimumVisibleRatio","minimumProjectedAreaRatio"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"visible-in-camera-region"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"visibleEntityId":{"$ref":"#/$defs/id"},"cameraEntityId":{"$ref":"#/$defs/id"},"screenRegionId":{"$ref":"#/$defs/id"},"minimumVisibleRatio":{"type":"number","minimum":0,"maximum":1},"minimumProjectedAreaRatio":{"type":"number","minimum":0,"maximum":1}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"requirementWeight":{"type":"object","properties":{"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1}},"if":{"type":"object","properties":{"requirement":{"const":"preferred"}},"required":["requirement"]},"then":{"type":"object","properties":{"preferenceWeightRatio":true},"required":["preferenceWeightRatio"]},"else":{"type":"object","not":{"type":"object","properties":{"preferenceWeightRatio":true},"required":["preferenceWeightRatio"]}}},"connectedByRouteConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","traversingEntityId","startAnchorEntityId","destinationAnchorEntityId","routeId"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"connected-by-route"},"requirement":{"const":"required"},"traversingEntityId":{"$ref":"#/$defs/id"},"startAnchorEntityId":{"$ref":"#/$defs/id"},"destinationAnchorEntityId":{"$ref":"#/$defs/id"},"routeId":{"$ref":"#/$defs/id"}}},"connectivityConstraint":{"oneOf":[{"$ref":"#/$defs/connectedByRouteConstraint"}]},"placementConstraint":{"oneOf":[{"$ref":"#/$defs/insideRegionConstraint"},{"$ref":"#/$defs/outsideRegionConstraint"},{"$ref":"#/$defs/distanceRangeConstraint"},{"$ref":"#/$defs/facesEntityConstraint"},{"$ref":"#/$defs/supportedByConstraint"},{"$ref":"#/$defs/minimumClearanceConstraint"},{"$ref":"#/$defs/withinSlopeLimitConstraint"},{"$ref":"#/$defs/visibleInCameraRegionConstraint"}]},"id":{"type":"string","pattern":"^[a-z0-9][a-z0-9.-]{0,63}$"},"resourceRef":{"type":"string","format":"worldkit-resource-ref"},"positiveNumber":{"type":"number","exclusiveMinimum":0},"vec2":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"}],"items":false,"minItems":2,"maxItems":2},"positiveVec2":{"type":"array","prefixItems":[{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"}],"items":false,"minItems":2,"maxItems":2},"vec3":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"},{"type":"number"}],"items":false,"minItems":3,"maxItems":3},"positiveVec3":{"type":"array","prefixItems":[{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"}],"items":false,"minItems":3,"maxItems":3},"semantic":{"type":"object","additionalProperties":false,"required":["classId"],"properties":{"classId":{"type":"string","minLength":1,"maxLength":128}}},"transform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"},"scaleXYZ":{"$ref":"#/$defs/positiveVec3"}}},"provenance":{"type":"object","additionalProperties":false,"properties":{"userPrompt":{"type":"string","maxLength":20000},"referenceImages":{"type":"array","maxItems":64,"items":{"type":"object","additionalProperties":false,"required":["assetRef","evidenceClass"],"properties":{"assetRef":{"$ref":"#/$defs/resourceRef"},"evidenceClass":{"enum":["user-explicit","reference-visible","planner-inferred"]}}}}}},"world":{"type":"object","additionalProperties":false,"required":["coordinateSystem","bounds","gravityMetersPerSecondSquaredXYZ","environment","resourceBudget"],"properties":{"coordinateSystem":{"const":"right-handed-y-up-minus-z-forward"},"bounds":{"type":"object","additionalProperties":false,"required":["centerMetersXZ","sizeMetersXZ","heightRangeMeters"],"properties":{"centerMetersXZ":{"$ref":"#/$defs/vec2"},"sizeMetersXZ":{"$ref":"#/$defs/positiveVec2"},"heightRangeMeters":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"}],"items":false,"minItems":2,"maxItems":2}}},"gravityMetersPerSecondSquaredXYZ":{"$ref":"#/$defs/vec3"},"environment":{"type":"object","additionalProperties":false,"required":["preset"],"properties":{"preset":{"enum":["clear-day","golden-hour","overcast","night"]}}},"resourceBudget":{"type":"object","additionalProperties":false,"required":["maxVertices","maxTriangles","maxColliders"],"properties":{"maxVertices":{"type":"integer","minimum":1},"maxTriangles":{"type":"integer","minimum":1},"maxColliders":{"type":"integer","minimum":1}}}}},"traversalSurfaceBinding":{"type":"object","additionalProperties":false,"required":["id","kind","logicalSubshapeId","traversalSurfaceProfileRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"collider-subshape"},"logicalSubshapeId":{"$ref":"#/$defs/id"},"traversalSurfaceProfileRef":{"type":"string","format":"traversal-surface-profile-ref"}}},"prototype":{"oneOf":[{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","sizeMetersXYZ","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"box"},"sizeMetersXYZ":{"$ref":"#/$defs/positiveVec3"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}},{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","radiusMeters","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"sphere"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}},{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","radiusMeters","heightMeters","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"cylinder"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}},{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","radiusMeters","heightMeters","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"cone"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}}]},"proceduralSource":{"type":"object","additionalProperties":false,"required":["kind","relief"],"properties":{"kind":{"const":"procedural"},"relief":{"enum":["flat","plain","hills","mountains"]},"baseHeightMeters":{"type":"number"},"amplitudeMeters":{"type":"number","minimum":0},"frequencyPerMeter":{"$ref":"#/$defs/positiveNumber"},"octaves":{"type":"integer","minimum":1,"maximum":8},"lacunarityRatio":{"$ref":"#/$defs/positiveNumber"},"persistenceRatio":{"type":"number","exclusiveMinimum":0,"maximum":1}}},"terrainNode":{"type":"object","additionalProperties":false,"required":["id","kind","components"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"terrain"},"components":{"type":"object","additionalProperties":false,"required":["terrain"],"properties":{"terrain":{"type":"object","additionalProperties":false,"required":["source","grid"],"properties":{"source":{"$ref":"#/$defs/proceduralSource"},"grid":{"type":"object","additionalProperties":false,"required":["centerMetersXZ","sizeMetersXZ","resolutionCellsXZ"],"properties":{"centerMetersXZ":{"$ref":"#/$defs/vec2"},"sizeMetersXZ":{"$ref":"#/$defs/positiveVec2"},"resolutionCellsXZ":{"type":"array","prefixItems":[{"type":"integer","minimum":2,"maximum":1025},{"type":"integer","minimum":2,"maximum":1025}],"items":false,"minItems":2,"maxItems":2},"heightSamplesMeters":{"type":"array","minItems":4,"maxItems":1048576,"items":{"type":"number"}}}},"semantic":{"$ref":"#/$defs/semantic"}}}}}}},"waterBoundary":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","centerMetersXZ","radiusMeters"],"properties":{"kind":{"const":"circle"},"centerMetersXZ":{"$ref":"#/$defs/vec2"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"}}},{"type":"object","additionalProperties":false,"required":["kind","centerMetersXZ","radiusMetersXZ"],"properties":{"kind":{"const":"ellipse"},"centerMetersXZ":{"$ref":"#/$defs/vec2"},"radiusMetersXZ":{"$ref":"#/$defs/positiveVec2"}}},{"type":"object","additionalProperties":false,"required":["kind","pointsMetersXZ"],"properties":{"kind":{"const":"polygon"},"pointsMetersXZ":{"type":"array","minItems":3,"maxItems":4096,"items":{"$ref":"#/$defs/vec2"}}}}]},"waterNode":{"type":"object","additionalProperties":false,"required":["id","kind","components"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"water"},"components":{"type":"object","additionalProperties":false,"required":["water"],"properties":{"water":{"type":"object","additionalProperties":false,"required":["terrainEntityId","boundary","depthMeters"],"properties":{"terrainEntityId":{"$ref":"#/$defs/id"},"boundary":{"$ref":"#/$defs/waterBoundary"},"depthMeters":{"$ref":"#/$defs/positiveNumber"},"shoreWidthMeters":{"type":"number","minimum":0},"waterLevelMeters":{"type":"number"},"traversalMode":{"enum":["blocked","swimmable","walkable"]},"semantic":{"$ref":"#/$defs/semantic"}}}}}}},"subjectNode":{"type":"object","additionalProperties":false,"required":["id","kind","subjectDefinitionRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"subject"},"subjectDefinitionRef":{"type":"string","format":"subject-definition-ref"},"spawnAnchorEntityId":{"$ref":"#/$defs/id"}}},"relationship":{"type":"object","additionalProperties":false,"required":["id","type","schemaVersion","riderEntityId","mountEntityId","mountSlotId"],"properties":{"id":{"$ref":"#/$defs/id"},"type":{"const":"mountedOn"},"schemaVersion":{"const":1},"riderEntityId":{"$ref":"#/$defs/id"},"mountEntityId":{"$ref":"#/$defs/id"},"mountSlotId":{"$ref":"#/$defs/id"}}},"rule":{"type":"object","additionalProperties":false,"required":["id","kind"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"type":"string","minLength":1}}},"startup":{"type":"object","additionalProperties":false,"required":["spawnAnchorEntityId","controlledEntityId","cameraEntityId"],"properties":{"spawnAnchorEntityId":{"$ref":"#/$defs/id"},"controlledEntityId":{"$ref":"#/$defs/id"},"cameraEntityId":{"$ref":"#/$defs/id"}}}}');
const authoringSpecV4Schema = {
  $schema: $schema$1,
  $id: $id$1,
  type: type$1,
  additionalProperties: additionalProperties$1,
  required: required$1,
  properties: properties$1,
  $defs: $defs$1
};
const $schema = "https://json-schema.org/draft/2020-12/schema";
const $id = "worldkit://schema/subject-definition@1";
const type = "object";
const additionalProperties = false;
const required = ["id", "version", "kind", "authoringAvailability", "category", "bodyTopology", "semanticClassId", "coordinateConvention", "visualParts", "visualBinding", "sockets", "mountSlots", "colliderPolicy", "capabilityRefs", "profiles", "relationshipCapabilityRefs", "actionOrPoseSetRef", "renderBindingProfileRef", "aiMetadata"];
const properties = { "id": { "$ref": "#/$defs/id" }, "version": { "const": 1 }, "kind": { "const": "subject-definition" }, "authoringAvailability": { "enum": ["recommended", "advanced", "experimental"] }, "category": { "enum": ["human", "animal", "custom"] }, "bodyTopology": { "enum": ["biped", "quadruped", "custom"] }, "semanticClassId": { "$ref": "#/$defs/nonEmptyString" }, "coordinateConvention": { "type": "object", "additionalProperties": false, "required": ["forwardAxis", "upAxis", "metersPerUnit", "pivot"], "properties": { "forwardAxis": { "const": "-Z" }, "upAxis": { "const": "+Y" }, "metersPerUnit": { "const": 1 }, "pivot": { "const": "support-center" } } }, "visualParts": { "type": "array", "minItems": 1, "maxItems": 128, "items": { "$ref": "#/$defs/visualPart" } }, "visualBinding": { "$ref": "#/$defs/visualBinding" }, "sockets": { "type": "array", "maxItems": 64, "items": { "$ref": "#/$defs/socket" } }, "mountSlots": { "type": "array", "maxItems": 16, "items": { "$ref": "#/$defs/mountSlot" } }, "colliderPolicy": { "$ref": "#/$defs/colliderPolicy" }, "capabilityRefs": { "type": "array", "minItems": 1, "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "format": "capability-ref" } }, "profiles": { "type": "object", "additionalProperties": false, "required": ["physicsBodyProfileRef", "locomotionProfileRef", "controlFeelProfileRef", "allowedControlFeelProfileRefs", "motion", "controlProfileRef", "cameraContextProfileRef", "mediumProfileRef", "harnessProfileRef"], "properties": { "physicsBodyProfileRef": { "type": "string", "format": "physics-body-profile-ref" }, "locomotionProfileRef": { "type": "string", "format": "locomotion-profile-ref" }, "controlFeelProfileRef": { "type": "string", "pattern": "^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "allowedControlFeelProfileRefs": { "type": "array", "minItems": 1, "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "pattern": "^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } }, "motion": { "type": "object", "additionalProperties": false, "required": ["defaultMotionProfileRef", "optionalMotionProfileRefs", "fallbackMotionProfileRef"], "properties": { "defaultMotionProfileRef": { "type": "string", "pattern": "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "optionalMotionProfileRefs": { "type": "array", "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "pattern": "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } }, "fallbackMotionProfileRef": { "type": "string", "pattern": "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } } }, "controlProfileRef": { "type": "string", "pattern": "^worldkit://control-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "cameraContextProfileRef": { "type": "string", "pattern": "^worldkit://camera-context/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "mediumProfileRef": { "type": "string", "pattern": "^worldkit://medium-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "harnessProfileRef": { "type": "string", "pattern": "^worldkit://harness-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } } }, "relationshipCapabilityRefs": { "type": "array", "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "format": "capability-ref" } }, "actionOrPoseSetRef": { "type": "string", "pattern": "^worldkit://(?:animation-set|pose-set)/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "renderBindingProfileRef": { "type": "string", "pattern": "^worldkit://render-binding/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "aiMetadata": { "type": "object", "additionalProperties": false, "required": ["displayName", "description", "semanticTags"], "properties": { "displayName": { "type": "string", "minLength": 1, "maxLength": 120 }, "description": { "type": "string", "minLength": 1, "maxLength": 1e3 }, "semanticTags": { "$ref": "#/$defs/semanticTags" } } } };
const allOf = [{ "if": { "properties": { "visualBinding": { "type": "object", "required": ["mode"], "properties": { "mode": { "const": "rigged" } } } } }, "then": { "properties": { "visualParts": { "type": "array", "contains": { "type": "object", "required": ["kind"], "properties": { "kind": { "const": "asset" } } }, "minContains": 1 } } } }];
const $defs = { "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9.-]{0,63}$" }, "socketId": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$" }, "nonEmptyString": { "type": "string", "minLength": 1, "maxLength": 128 }, "positiveNumber": { "type": "number", "exclusiveMinimum": 0 }, "vec3": { "type": "array", "prefixItems": [{ "type": "number" }, { "type": "number" }, { "type": "number" }], "items": false, "minItems": 3, "maxItems": 3 }, "positiveVec3": { "type": "array", "prefixItems": [{ "$ref": "#/$defs/positiveNumber" }, { "$ref": "#/$defs/positiveNumber" }, { "$ref": "#/$defs/positiveNumber" }], "items": false, "minItems": 3, "maxItems": 3 }, "semanticTags": { "type": "array", "maxItems": 32, "uniqueItems": true, "items": { "type": "string", "pattern": "^[a-z0-9][a-z0-9.-]{0,63}$" } }, "localTransform": { "type": "object", "additionalProperties": false, "required": ["positionMetersXYZ"], "properties": { "positionMetersXYZ": { "$ref": "#/$defs/vec3" }, "rotationEulerRadiansXYZ": { "$ref": "#/$defs/vec3" } } }, "assetLocalTransform": { "type": "object", "additionalProperties": false, "required": ["positionMetersXYZ", "scaleXYZ"], "properties": { "positionMetersXYZ": { "$ref": "#/$defs/vec3" }, "rotationEulerRadiansXYZ": { "$ref": "#/$defs/vec3" }, "scaleXYZ": { "$ref": "#/$defs/positiveVec3" } } }, "shape": { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["kind", "sizeMetersXYZ"], "properties": { "kind": { "const": "box" }, "sizeMetersXYZ": { "$ref": "#/$defs/positiveVec3" } } }, { "type": "object", "additionalProperties": false, "required": ["kind", "radiusMeters"], "properties": { "kind": { "const": "sphere" }, "radiusMeters": { "$ref": "#/$defs/positiveNumber" } } }, { "type": "object", "additionalProperties": false, "required": ["kind", "radiusMeters", "heightMeters"], "properties": { "kind": { "const": "cylinder" }, "radiusMeters": { "$ref": "#/$defs/positiveNumber" }, "heightMeters": { "$ref": "#/$defs/positiveNumber" } } }, { "type": "object", "additionalProperties": false, "required": ["kind", "radiusMeters", "heightMeters"], "properties": { "kind": { "const": "capsule" }, "radiusMeters": { "$ref": "#/$defs/positiveNumber" }, "heightMeters": { "$ref": "#/$defs/positiveNumber" } } }] }, "visualPart": { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["id", "kind", "shape", "localTransform", "colliderContribution", "semanticTags"], "properties": { "id": { "$ref": "#/$defs/id" }, "kind": { "const": "primitive" }, "shape": { "$ref": "#/$defs/shape" }, "localTransform": { "$ref": "#/$defs/localTransform" }, "colliderContribution": { "enum": ["include", "exclude"] }, "semanticTags": { "$ref": "#/$defs/semanticTags" } } }, { "type": "object", "additionalProperties": false, "required": ["id", "kind", "subjectAssetRef", "localTransform", "appearance", "semanticTags"], "properties": { "id": { "$ref": "#/$defs/id" }, "kind": { "const": "asset" }, "subjectAssetRef": { "type": "string", "pattern": "^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "localTransform": { "$ref": "#/$defs/assetLocalTransform" }, "appearance": { "type": "object", "additionalProperties": false, "required": ["mode"], "properties": { "mode": { "const": "whitebox-neutral" } } }, "semanticTags": { "$ref": "#/$defs/semanticTags" } } }] }, "visualBinding": { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["mode"], "properties": { "mode": { "const": "static" } } }, { "type": "object", "additionalProperties": false, "required": ["mode", "rigProfileRef", "animationSetRef"], "properties": { "mode": { "const": "rigged" }, "rigProfileRef": { "type": "string", "pattern": "^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "animationSetRef": { "type": "string", "pattern": "^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } } }] }, "colliderPolicy": { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["kind", "colliderDerivationProfileRef"], "properties": { "kind": { "const": "derive" }, "colliderDerivationProfileRef": { "type": "string", "format": "collider-derivation-profile-ref" } } }, { "type": "object", "additionalProperties": false, "required": ["kind", "colliderProfileRef"], "properties": { "kind": { "const": "profile" }, "colliderProfileRef": { "type": "string", "pattern": "^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } } }] }, "socket": { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["id", "kind", "localTransform", "semanticTags"], "properties": { "id": { "$ref": "#/$defs/socketId" }, "kind": { "const": "local" }, "localTransform": { "$ref": "#/$defs/localTransform" }, "semanticTags": { "$ref": "#/$defs/semanticTags" } } }, { "type": "object", "additionalProperties": false, "required": ["id", "kind", "boneId", "offsetTransform", "semanticTags"], "properties": { "id": { "$ref": "#/$defs/socketId" }, "kind": { "const": "bone" }, "boneId": { "enum": ["hips", "spine", "chest", "neck", "head", "upper-arm.left", "lower-arm.left", "hand.left", "upper-arm.right", "lower-arm.right", "hand.right", "upper-leg.left", "lower-leg.left", "foot.left", "upper-leg.right", "lower-leg.right", "foot.right"] }, "offsetTransform": { "$ref": "#/$defs/localTransform" }, "semanticTags": { "$ref": "#/$defs/semanticTags" } } }] }, "mountSlot": { "type": "object", "additionalProperties": false, "required": ["id", "kind", "mode", "mountSocketId", "riderSubjectOriginOffsetMetersXYZ", "dismountCandidateOffsetsMetersXYZ"], "properties": { "id": { "$ref": "#/$defs/id" }, "kind": { "const": "mount-slot" }, "mode": { "const": "stand" }, "mountSocketId": { "$ref": "#/$defs/socketId" }, "riderSubjectOriginOffsetMetersXYZ": { "$ref": "#/$defs/vec3" }, "dismountCandidateOffsetsMetersXYZ": { "type": "array", "minItems": 1, "maxItems": 8, "uniqueItems": true, "items": { "$ref": "#/$defs/vec3" } } } } };
const subjectDefinitionV1Schema = {
  $schema,
  $id,
  type,
  additionalProperties,
  required,
  properties,
  allOf,
  $defs
};
const ajv$1 = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true
});
addFormats(ajv$1);
ajv$1.addFormat("worldkit-resource-ref", {
  type: "string",
  validate: (value) => /^(?:worldkit|package|asset):\/\/[a-z0-9][a-z0-9./_-]*(?:@[1-9][0-9]*)?$/.test(value)
});
ajv$1.addFormat("subject-definition-ref", {
  type: "string",
  validate: (value) => /^(?:worldkit|package):\/\/subject-definition\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv$1.addFormat("capability-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/capability\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value)
});
ajv$1.addFormat("physics-body-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/physics-body-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv$1.addFormat("locomotion-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/locomotion-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv$1.addFormat("collider-derivation-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/collider-derivation-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv$1.addFormat("package-prototype-ref", {
  type: "string",
  validate: (value) => /^package:\/\/prototype\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value)
});
ajv$1.addFormat("layout-solver-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/layout-solver-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv$1.addFormat("traversal-surface-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/traversal-surface-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv$1.addSchema(subjectDefinitionV1Schema);
ajv$1.compile(
  authoringSpecV4Schema
);
var CharacterCodes;
(function(CharacterCodes2) {
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));
new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
const maxCachedValues = 200;
({
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + " ".repeat(index);
    })
  },
  "	": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + "	".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "	".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + "	".repeat(index);
    })
  }
});
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
var ScanError;
(function(ScanError2) {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind2) {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var ParseErrorCode;
(function(ParseErrorCode2) {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));
const REQUIRED_SECTIONS = [
  "场景",
  "主体",
  "用户事实",
  "可见参考证据",
  "推断的世界延伸",
  "仅视觉层设想",
  "运动模式",
  "空间",
  "通行",
  "首帧",
  "视觉目标"
];
const MOVEMENT_LABELS = /* @__PURE__ */ new Map([
  ["陆地步行", "ground-walk"],
  ["陆地滑行", "ground-slide"],
  ["陆地骑乘", "ground-ride"],
  ["陆地驾驶", "ground-drive"],
  ["水面航行", "water-surface"],
  ["水下游动", "underwater"],
  ["空中飞行", "flight"]
]);
const TARGET_KIND_LABELS = /* @__PURE__ */ new Map([
  ["主体", "subject"],
  ["标志物", "landmark"],
  ["重复标志物", "repeated-landmark"]
]);
function fail(...diagnostics) {
  return { ok: false, diagnostics };
}
function splitSections(source) {
  const normalized = source.replaceAll("\r\n", "\n").trim();
  if (new TextEncoder().encode(normalized).byteLength > 12 * 1024) {
    return fail("SCENE_BRIEF_TOO_LARGE: Scene Brief must be at most 12 KiB.");
  }
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "# WorldKit Scene Brief") {
    return fail("SCENE_BRIEF_HEADER_INVALID: first line must be '# WorldKit Scene Brief'.");
  }
  const sections = /* @__PURE__ */ new Map();
  let current;
  for (const line of lines.slice(1)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    if (heading !== void 0) {
      if (!REQUIRED_SECTIONS.includes(heading)) {
        return fail(`SCENE_BRIEF_SECTION_UNKNOWN: '${heading}'.`);
      }
      if (sections.has(heading)) {
        return fail(`SCENE_BRIEF_SECTION_DUPLICATE: '${heading}'.`);
      }
      current = heading;
      sections.set(heading, []);
      continue;
    }
    if (current !== void 0) sections.get(current).push(line);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!sections.has(section)) return fail(`SCENE_BRIEF_SECTION_MISSING: '${section}'.`);
    const value = sections.get(section).join("\n").trim();
    if (!value) return fail(`SCENE_BRIEF_SECTION_EMPTY: '${section}'.`);
    sections.set(section, [value]);
  }
  return new Map([...sections].map(([key, value]) => [key, value[0]]));
}
function parseMovement(value) {
  const match = /^([^：:\n]+)[：:]\s*([^\n]+)$/.exec(value.trim());
  if (match === null) {
    return fail("SCENE_BRIEF_MOVEMENT_INVALID: use '<运动模式>：<一句自然语言说明>'.");
  }
  const label = match[1].trim();
  if (label.length > 48) {
    return fail("SCENE_BRIEF_MOVEMENT_LABEL_TOO_LONG: movement label must be at most 48 characters.");
  }
  return {
    mode: MOVEMENT_LABELS.get(label) ?? "custom",
    label,
    description: match[2].trim()
  };
}
function parseVisualTargets(value) {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 5) {
    return fail("SCENE_BRIEF_VISUAL_TARGET_COUNT: visual targets must contain 1-5 entries.");
  }
  const targets = [];
  const names2 = /* @__PURE__ */ new Set();
  for (const [index, line] of lines.entries()) {
    const match = /^-\s*(主体|标志物|重复标志物)\s*[｜|]\s*([^：:\n｜|]{1,48})\s*[：:]\s*(.+)$/.exec(line);
    if (match === null) {
      return fail(
        `SCENE_BRIEF_VISUAL_TARGET_INVALID: entry ${index + 1} must use '- 主体｜名称：说明', '- 标志物｜名称：说明', or '- 重复标志物｜名称：说明'.`
      );
    }
    const kind = TARGET_KIND_LABELS.get(match[1]);
    const name = match[2].trim();
    const description2 = match[3].trim();
    if (names2.has(name)) {
      return fail(`SCENE_BRIEF_VISUAL_TARGET_DUPLICATE: '${name}'.`);
    }
    names2.add(name);
    targets.push({
      id: `visual-target-${index + 1}`,
      kind,
      name,
      description: description2,
      role: kind === "subject" ? "primary-subject" : targets.some((target) => target.kind !== "subject") ? "secondary-landmark" : "primary-landmark",
      semanticClassId: kind === "subject" ? "visual.subject" : kind === "repeated-landmark" ? "visual.landmark.repeated" : "visual.landmark"
    });
  }
  if (targets[0]?.kind !== "subject" || targets.filter(({ kind }) => kind === "subject").length !== 1) {
    return fail("SCENE_BRIEF_PRIMARY_SUBJECT: the first and only Subject visual target is required.");
  }
  return targets;
}
function parseSceneBriefV1(source) {
  const sections = splitSections(source);
  if ("ok" in sections) return sections;
  const movement = parseMovement(sections.get("运动模式"));
  if ("ok" in movement) return movement;
  const visualTargets = parseVisualTargets(sections.get("视觉目标"));
  if ("ok" in visualTargets) return visualTargets;
  const value = {
    kind: "worldkit-scene-brief",
    schemaVersion: 1,
    scene: sections.get("场景"),
    subject: sections.get("主体"),
    userFacts: sections.get("用户事实"),
    visibleReferenceEvidence: sections.get("可见参考证据"),
    inferredContinuation: sections.get("推断的世界延伸"),
    renderLayerIdeas: sections.get("仅视觉层设想"),
    movement,
    space: sections.get("空间"),
    navigation: sections.get("通行"),
    openingShot: sections.get("首帧"),
    visualTargets
  };
  return {
    ok: true,
    value,
    sceneBriefHash: sha256CanonicalJson(value),
    diagnostics: []
  };
}
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true
});
addFormats(ajv);
ajv.addFormat("worldkit-resource-ref", {
  type: "string",
  validate: (value) => /^(?:worldkit|package|asset):\/\/[a-z0-9][a-z0-9./_-]*(?:@[1-9][0-9]*)?$/.test(value)
});
ajv.addFormat("subject-definition-ref", {
  type: "string",
  validate: (value) => /^(?:worldkit|package):\/\/subject-definition\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv.addFormat("capability-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/capability\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value)
});
ajv.addFormat("physics-body-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/physics-body-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv.addFormat("locomotion-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/locomotion-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value)
});
ajv.addFormat("collider-derivation-profile-ref", {
  type: "string",
  validate: (value) => /^worldkit:\/\/collider-derivation-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    value
  )
});
ajv.addFormat("package-prototype-ref", {
  type: "string",
  validate: (value) => /^package:\/\/prototype\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value)
});
ajv.addSchema(subjectDefinitionV1Schema);
(() => {
  const registeredValidator = ajv.getSchema(
    "worldkit://schema/subject-definition@1"
  );
  if (registeredValidator === void 0) {
    throw new Error("SUBJECT_DEFINITION_SCHEMA_NOT_REGISTERED");
  }
  return registeredValidator;
})();
const PLANNER_SELF_CHECK_VERSION = "worldkit-planner-self-check-v2";
const MAXIMUM_CENTER_ERROR_RATIO = 0.015;
function option(arguments_, name) {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? void 0 : arguments_[index + 1];
  if (value === void 0 || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
function contentHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
}
function decodePng(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Image must be PNG.");
  }
  let offset = 8;
  let width;
  let height;
  let channels;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type2 = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type2 === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0 || colorType !== 2 && colorType !== 6) {
        throw new Error(
          "Planner self-check supports non-interlaced 8-bit RGB/RGBA PNG files."
        );
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type2 === "IDAT") {
      compressed.push(data);
    } else if (type2 === "IEND") {
      break;
    }
  }
  if (width === void 0 || height === void 0 || channels === void 0 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || compressed.length === 0) {
    throw new Error("PNG structure is incomplete.");
  }
  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (scanlines.length !== (stride + 1) * height) {
    throw new Error("PNG scanline size is invalid.");
  }
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const reconstructed = filter === 0 ? raw : filter === 1 ? raw + left : filter === 2 ? raw + above : filter === 3 ? raw + Math.floor((left + above) / 2) : filter === 4 ? raw + paeth(left, above, upperLeft) : Number.NaN;
      if (!Number.isFinite(reconstructed)) {
        throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      pixels[y * stride + x] = reconstructed & 255;
    }
  }
  return { width, height, channels, pixels };
}
function rgbHueSaturation(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = 60 * ((g - b) / delta % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    brightness: maximum
  };
}
function centerMeasurement(bytes) {
  const image = decodePng(bytes);
  let xTotal = 0;
  let count = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * image.channels;
    const color = rgbHueSaturation(
      image.pixels[offset],
      image.pixels[offset + 1],
      image.pixels[offset + 2]
    );
    const hueDistance = Math.min(color.hue, 360 - color.hue);
    if (hueDistance <= 12 && color.saturation >= 0.3 && color.brightness >= 0.2) {
      xTotal += index % image.width;
      count += 1;
    }
  }
  const minimumPixels = Math.max(
    64,
    Math.round(image.width * image.height * 1e-3)
  );
  if (count < minimumPixels) {
    throw new Error(
      `Primary-subject red mask is missing or too small (${count} pixels).`
    );
  }
  const centerXRatio = (xTotal / count + 0.5) / image.width;
  return {
    widthPixels: image.width,
    heightPixels: image.height,
    subjectMaskPixelCount: count,
    subjectCenterXRatio: centerXRatio,
    subjectCenterErrorRatio: Math.abs(centerXRatio - 0.5),
    maximumCenterErrorRatio: MAXIMUM_CENTER_ERROR_RATIO
  };
}
function sceneBriefDiagnostics(source) {
  const result = parseSceneBriefV1(source);
  if (result.ok) return [];
  return result.diagnostics.map((message) => ({
    code: message.split(":", 1)[0] || "SCENE_BRIEF_INVALID",
    message
  }));
}
async function runPlannerSelfCheck(options) {
  const [briefBytes, worldPlanBytes, entryBytes] = await Promise.all([
    readFile(options.briefPath),
    readFile(options.worldPlanPath),
    readFile(options.entryPath)
  ]);
  const diagnostics = sceneBriefDiagnostics(briefBytes.toString("utf8"));
  let imageMeasurements = null;
  try {
    decodePng(worldPlanBytes);
    imageMeasurements = centerMeasurement(entryBytes);
    if (imageMeasurements.subjectCenterErrorRatio > MAXIMUM_CENTER_ERROR_RATIO) {
      diagnostics.push({
        code: "ENTRY_SUBJECT_NOT_CENTERED",
        message: `Primary Subject center is x=${imageMeasurements.subjectCenterXRatio.toFixed(4)}; required 0.5000±${MAXIMUM_CENTER_ERROR_RATIO.toFixed(4)}.`
      });
    }
  } catch (error) {
    diagnostics.push({
      code: "PLANNER_IMAGE_INVALID",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  const report = {
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: PLANNER_SELF_CHECK_VERSION,
    sceneId: options.sceneId,
    status: diagnostics.length === 0 ? "passed" : "failed",
    inputs: {
      sceneBriefHash: contentHash(briefBytes),
      worldPlanHash: contentHash(worldPlanBytes),
      entryWhiteboxTargetHash: contentHash(entryBytes)
    },
    imageMeasurements,
    diagnostics
  };
  await writeFile(options.reportPath, `${JSON.stringify(report)}
`, "utf8");
  return { status: report.status, diagnostics };
}
async function main(arguments_ = process.argv.slice(2)) {
  const result = await runPlannerSelfCheck({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldPlanPath: path.resolve(option(arguments_, "--world-plan")),
    entryPath: path.resolve(option(arguments_, "--entry")),
    reportPath: path.resolve(option(arguments_, "--report"))
  });
  process.stdout.write(`${JSON.stringify(result)}
`);
  if (result.status !== "passed") process.exitCode = 2;
}
const entryPath = process.argv[1] === void 0 ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
export {
  PLANNER_SELF_CHECK_VERSION,
  main,
  runPlannerSelfCheck
};
