import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
  const min2 = instance.outputLen;
  if (out.length < min2) {
    throw new Error("digestInto() expects output buffer of length at least " + min2);
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
    const { A, B: B2, C, D: D2, E, F, G, H } = this;
    return [A, B2, C, D2, E, F, G, H];
  }
  // prettier-ignore
  set(A, B2, C, D2, E, F, G, H) {
    this.A = A | 0;
    this.B = B2 | 0;
    this.C = C | 0;
    this.D = D2 | 0;
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
    let { A, B: B2, C, D: D2, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B2, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D2 + T1 | 0;
      D2 = C;
      C = B2;
      B2 = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B2 = B2 + this.B | 0;
    C = C + this.C | 0;
    D2 = D2 + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B2, C, D2, E, F, G, H);
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
function assertCanonicalJsonValue(value) {
  canonicalize(value, "");
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
  var result2 = nativeObjectToString$1.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag$1] = tag;
    } else {
      delete value[symToStringTag$1];
    }
  }
  return result2;
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
var symbolTag = "[object Symbol]";
function isSymbol(value) {
  return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
}
var isArray = Array.isArray;
function isObject(value) {
  var type2 = typeof value;
  return value != null && (type2 == "object" || type2 == "function");
}
function identity(value) {
  return value;
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
var Buffer = moduleExports$1 ? root.Buffer : void 0;
var nativeIsBuffer = Buffer ? Buffer.isBuffer : void 0;
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
  var result2 = [];
  for (var key in Object(object)) {
    if (hasOwnProperty$3.call(object, key) && key != "constructor") {
      result2.push(key);
    }
  }
  return result2;
}
var nativeCreate = getNative(Object, "create");
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}
function hashDelete(key) {
  var result2 = this.has(key) && delete this.__data__[key];
  this.size -= result2 ? 1 : 0;
  return result2;
}
var HASH_UNDEFINED$2 = "__lodash_hash_undefined__";
var objectProto$2 = Object.prototype;
var hasOwnProperty$2 = objectProto$2.hasOwnProperty;
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result2 = data[key];
    return result2 === HASH_UNDEFINED$2 ? void 0 : result2;
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
  var result2 = getMapData(this, key)["delete"](key);
  this.size -= result2 ? 1 : 0;
  return result2;
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
    var result2 = baseGetTag(value), Ctor = result2 == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
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
    return result2;
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
  var index = -1, result2 = Array(set.size);
  set.forEach(function(value) {
    result2[++index] = value;
  });
  return result2;
}
function baseGt(value, other) {
  return value > other;
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
function baseLt(value, other) {
  return value < other;
}
function baseExtremum(array, iteratee, comparator) {
  var index = -1, length = array.length;
  while (++index < length) {
    var value = array[index], current = iteratee(value);
    if (current != null && (computed === void 0 ? current === current && !isSymbol(current) : comparator(current, computed))) {
      var computed = current, result2 = value;
    }
  }
  return result2;
}
function max(array) {
  return array && array.length ? baseExtremum(array, identity, baseGt) : void 0;
}
function min(array) {
  return array && array.length ? baseExtremum(array, identity, baseLt) : void 0;
}
var INFINITY = 1 / 0;
var createSet = !(Set$1 && 1 / setToArray(new Set$1([, -0]))[1] == INFINITY) ? noop : function(values) {
  return new Set$1(values);
};
var LARGE_ARRAY_SIZE = 200;
function baseUniq(array, iteratee, comparator) {
  var index = -1, includes = arrayIncludes, length = array.length, isCommon = true, result2 = [], seen = result2;
  if (length >= LARGE_ARRAY_SIZE) {
    var set = createSet(array);
    if (set) {
      return setToArray(set);
    }
    isCommon = false;
    includes = cacheHas;
    seen = new SetCache();
  } else {
    seen = result2;
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
        result2.push(value);
      } else if (!includes(seen, computed, comparator)) {
        if (seen !== result2) {
          seen.push(computed);
        }
        result2.push(value);
      }
    }
  return result2;
}
function uniq(array) {
  return array && array.length ? baseUniq(array) : [];
}
const BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF = "worldkit://traversal-surface-profile/ground.static@1";
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
const TRAVERSAL_SURFACE_PROFILE_ALLOWED_KEYS = new Set(
  TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS
);
const BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE = {
  kind: "traversal-surface-profile",
  schemaVersion: 1,
  traversalMode: "ground",
  faceSelectionMode: "subject-slope-compatible"
};
function deepFreeze$5(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze$5(child);
  return Object.freeze(value);
}
function contentHashOf(value) {
  return sha256CanonicalJson(value);
}
function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function requirePlainProfile(value, notPlainCode) {
  if (!isPlainRecord(value)) {
    throw new Error(`${notPlainCode}: expected a plain object.`);
  }
  return value;
}
function rejectForbiddenAndMissingKeys(source, allowedKeys, requiredKeys, forbiddenCode, missingCode) {
  const forbiddenKeys = Object.keys(source).filter((key) => !allowedKeys.has(key));
  if (!isEmpty(forbiddenKeys)) {
    const forbiddenKey = forbiddenKeys[0];
    if (isNil(forbiddenKey)) {
      throw new Error(forbiddenCode);
    }
    throw new Error(`${forbiddenCode}: '${forbiddenKey}'.`);
  }
  const missingKey = requiredKeys.find(
    (key) => !Object.prototype.hasOwnProperty.call(source, key)
  );
  if (missingKey !== void 0) {
    throw new Error(`${missingCode}: '${missingKey}'.`);
  }
}
function validateTraversalSurfaceProfileV1(value) {
  const source = requirePlainProfile(value, "TRAVERSAL_SURFACE_PROFILE_NOT_PLAIN");
  rejectForbiddenAndMissingKeys(
    source,
    TRAVERSAL_SURFACE_PROFILE_ALLOWED_KEYS,
    TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS,
    "TRAVERSAL_SURFACE_PROFILE_FIELD_FORBIDDEN",
    "TRAVERSAL_SURFACE_PROFILE_FIELD_MISSING"
  );
  if (source.kind !== "traversal-surface-profile") {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_KIND_MISMATCH: kind must be traversal-surface-profile."
    );
  }
  if (source.schemaVersion !== 1) {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_SCHEMA_VERSION_MISMATCH: schemaVersion must be 1."
    );
  }
  if (source.traversalMode !== "ground") {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_ENUM_INVALID: traversalMode must be ground."
    );
  }
  if (source.faceSelectionMode !== "subject-slope-compatible") {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_ENUM_INVALID: faceSelectionMode must be subject-slope-compatible."
    );
  }
}
function resolveTraversalSurfaceProfileV1(resourceRef) {
  if (resourceRef !== BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF) {
    throw new Error(`TRAVERSAL_SURFACE_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }
  const profile = structuredClone(BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE);
  validateTraversalSurfaceProfileV1(profile);
  return deepFreeze$5({
    resourceRef: BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile: deepFreeze$5(profile)
  });
}
const TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1 = 1e-10;
class TriangleWorldGeometryNonFiniteErrorV1 extends Error {
  constructor(label) {
    super(`TRIANGLE_WORLD_GEOMETRY_NON_FINITE: ${label}`);
    this.name = "TriangleWorldGeometryNonFiniteErrorV1";
  }
}
function requireFiniteDerived(values, label) {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TriangleWorldGeometryNonFiniteErrorV1(label);
  }
}
function describeWorldTriangleV1(aMetersXYZ, bMetersXYZ, cMetersXYZ) {
  const edgeAX = bMetersXYZ[0] - aMetersXYZ[0];
  const edgeAY = bMetersXYZ[1] - aMetersXYZ[1];
  const edgeAZ = bMetersXYZ[2] - aMetersXYZ[2];
  const edgeBX = cMetersXYZ[0] - aMetersXYZ[0];
  const edgeBY = cMetersXYZ[1] - aMetersXYZ[1];
  const edgeBZ = cMetersXYZ[2] - aMetersXYZ[2];
  requireFiniteDerived(
    [edgeAX, edgeAY, edgeAZ, edgeBX, edgeBY, edgeBZ],
    "triangle edges must remain finite"
  );
  const normalX = edgeAY * edgeBZ - edgeAZ * edgeBY;
  const normalY = edgeAZ * edgeBX - edgeAX * edgeBZ;
  const normalZ = edgeAX * edgeBY - edgeAY * edgeBX;
  requireFiniteDerived(
    [normalX, normalY, normalZ],
    "triangle cross product must remain finite"
  );
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  requireFiniteDerived(
    [normalLength],
    "triangle normal length must remain finite"
  );
  if (!(normalLength > 0)) {
    return void 0;
  }
  const projectedTwiceArea = (bMetersXYZ[0] - aMetersXYZ[0]) * (cMetersXYZ[2] - aMetersXYZ[2]) - (bMetersXYZ[2] - aMetersXYZ[2]) * (cMetersXYZ[0] - aMetersXYZ[0]);
  const unitNormalXYZ = [
    normalX / normalLength,
    normalY / normalLength,
    normalZ / normalLength
  ];
  const threeDimensionalAreaSquareMeters = normalLength / 2;
  const projectedAreaSquareMeters = Math.abs(projectedTwiceArea) / 2;
  requireFiniteDerived(
    [
      projectedTwiceArea,
      ...unitNormalXYZ,
      threeDimensionalAreaSquareMeters,
      projectedAreaSquareMeters
    ],
    "triangle normal and area must remain finite"
  );
  return {
    verticesMetersXYZ: [aMetersXYZ, bMetersXYZ, cMetersXYZ],
    unitNormalXYZ,
    threeDimensionalAreaSquareMeters,
    projectedAreaSquareMeters,
    aabbMinimumMetersXZ: [
      Math.min(aMetersXYZ[0], bMetersXYZ[0], cMetersXYZ[0]),
      Math.min(aMetersXYZ[2], bMetersXYZ[2], cMetersXYZ[2])
    ],
    aabbMaximumMetersXZ: [
      Math.max(aMetersXYZ[0], bMetersXYZ[0], cMetersXYZ[0]),
      Math.max(aMetersXYZ[2], bMetersXYZ[2], cMetersXYZ[2])
    ]
  };
}
function samplePointOnWorldTriangleV1(triangle, pointMetersXZ) {
  if (triangle.projectedAreaSquareMeters < TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1) {
    return void 0;
  }
  const [aMetersXYZ, bMetersXYZ, cMetersXYZ] = triangle.verticesMetersXYZ;
  const [pointX, pointZ] = pointMetersXZ;
  const denominator = (bMetersXYZ[2] - cMetersXYZ[2]) * (aMetersXYZ[0] - cMetersXYZ[0]) + (cMetersXYZ[0] - bMetersXYZ[0]) * (aMetersXYZ[2] - cMetersXYZ[2]);
  requireFiniteDerived(
    [denominator],
    "barycentric denominator must remain finite"
  );
  if (Math.abs(denominator) <= Number.EPSILON) {
    return void 0;
  }
  const weightA = ((bMetersXYZ[2] - cMetersXYZ[2]) * (pointX - cMetersXYZ[0]) + (cMetersXYZ[0] - bMetersXYZ[0]) * (pointZ - cMetersXYZ[2])) / denominator;
  const weightB = ((cMetersXYZ[2] - aMetersXYZ[2]) * (pointX - cMetersXYZ[0]) + (aMetersXYZ[0] - cMetersXYZ[0]) * (pointZ - cMetersXYZ[2])) / denominator;
  const weightC = 1 - weightA - weightB;
  const heightMeters = aMetersXYZ[1] * weightA + bMetersXYZ[1] * weightB + cMetersXYZ[1] * weightC;
  const inwardEdgeDistancesMeters = [
    inwardEdgeDistanceMeters(aMetersXYZ, bMetersXYZ, cMetersXYZ, pointX, pointZ),
    inwardEdgeDistanceMeters(bMetersXYZ, cMetersXYZ, aMetersXYZ, pointX, pointZ),
    inwardEdgeDistanceMeters(cMetersXYZ, aMetersXYZ, bMetersXYZ, pointX, pointZ)
  ];
  requireFiniteDerived(
    [weightA, weightB, weightC, heightMeters, ...inwardEdgeDistancesMeters],
    "barycentric weights, height, and edge distances must remain finite"
  );
  return {
    barycentricUVW: [weightA, weightB, weightC],
    heightMeters,
    inwardEdgeDistancesMeters
  };
}
function isBarycentricInsideFacadeV1(barycentricUVW) {
  return barycentricUVW[0] >= -1e-12 && barycentricUVW[1] >= -1e-12 && barycentricUVW[2] >= -1e-12;
}
function inwardEdgeDistanceMeters(startMetersXYZ, endMetersXYZ, thirdMetersXYZ, pointX, pointZ) {
  const edgeX = endMetersXYZ[0] - startMetersXYZ[0];
  const edgeZ = endMetersXYZ[2] - startMetersXYZ[2];
  const edgeLength = Math.hypot(edgeX, edgeZ);
  requireFiniteDerived(
    [edgeX, edgeZ, edgeLength],
    "projected edge must remain finite"
  );
  if (!(edgeLength > 0)) {
    return Number.NEGATIVE_INFINITY;
  }
  const crossPoint = edgeX * (pointZ - startMetersXYZ[2]) - edgeZ * (pointX - startMetersXYZ[0]);
  const crossThird = edgeX * (thirdMetersXYZ[2] - startMetersXYZ[2]) - edgeZ * (thirdMetersXYZ[0] - startMetersXYZ[0]);
  const signedDistance = crossPoint / edgeLength;
  requireFiniteDerived(
    [crossPoint, crossThird, signedDistance],
    "projected edge distance must remain finite"
  );
  return crossThird < 0 ? -signedDistance : signedDistance;
}
const BARYCENTRIC_EPSILON = 1e-7;
function rotationMatrixFromEuler(rotationEulerRadiansXYZ) {
  const [x, y, z] = rotationEulerRadiansXYZ;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx]
  ];
}
function unsupportedQueryError(reason) {
  return new Error(`OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED: ${reason}`);
}
function boxSupportHeightMeters(collider, pointMetersXZ) {
  const rotation = rotationMatrixFromEuler(collider.rotationEulerRadiansXYZ);
  const deltaX = pointMetersXZ[0] - collider.centerMetersXYZ[0];
  const deltaZ = pointMetersXZ[1] - collider.centerMetersXYZ[2];
  const localX = rotation[0][0] * deltaX + rotation[2][0] * deltaZ;
  const localZ = rotation[0][2] * deltaX + rotation[2][2] * deltaZ;
  const [halfX, halfY, halfZ] = collider.halfExtentsMetersXYZ;
  if (Math.abs(localX) > halfX || Math.abs(localZ) > halfZ) return void 0;
  return collider.centerMetersXYZ[1] + rotation[1][0] * localX + rotation[1][1] * halfY + rotation[1][2] * localZ;
}
function roundSupportHeightMeters(collider, pointMetersXZ) {
  const deltaX = pointMetersXZ[0] - collider.centerMetersXYZ[0];
  const deltaZ = pointMetersXZ[1] - collider.centerMetersXYZ[2];
  const radialSquared = deltaX * deltaX + deltaZ * deltaZ;
  const radiusSquared = collider.radiusMeters * collider.radiusMeters;
  if (radialSquared > radiusSquared) return void 0;
  if (collider.kind === "sphere") {
    return collider.centerMetersXYZ[1] + Math.sqrt(radiusSquared - radialSquared);
  }
  const heightMeters = collider.heightMeters ?? collider.radiusMeters * 2;
  return collider.centerMetersXYZ[1] + heightMeters / 2;
}
function convexSupportHeightMeters(collider, pointMetersXZ) {
  const vertices = collider.verticesMetersXYZ;
  if (vertices.length === 0 || vertices.some((vertex) => vertex.some((component) => !Number.isFinite(component)))) {
    throw unsupportedQueryError(
      "The convex support query cannot be determined from the locked vertex set."
    );
  }
  const [px, pz] = pointMetersXZ;
  let highestHitMeters;
  const consider = (candidateMeters) => {
    if (highestHitMeters === void 0 || candidateMeters > highestHitMeters) {
      highestHitMeters = candidateMeters;
    }
  };
  for (let a = 0; a < vertices.length; a += 1) {
    const [ax, ay, az] = vertices[a];
    if (Math.hypot(px - ax, pz - az) <= BARYCENTRIC_EPSILON) consider(ay);
    for (let b = a + 1; b < vertices.length; b += 1) {
      const [bx, by, bz] = vertices[b];
      const segmentDx = bx - ax;
      const segmentDz = bz - az;
      const segmentLengthSquared = segmentDx * segmentDx + segmentDz * segmentDz;
      if (segmentLengthSquared > BARYCENTRIC_EPSILON) {
        const t = ((px - ax) * segmentDx + (pz - az) * segmentDz) / segmentLengthSquared;
        const offMeters = Math.hypot(
          ax + segmentDx * t - px,
          az + segmentDz * t - pz
        );
        if (t >= -BARYCENTRIC_EPSILON && t <= 1 + BARYCENTRIC_EPSILON && offMeters <= BARYCENTRIC_EPSILON) {
          consider(ay + (by - ay) * Math.min(1, Math.max(0, t)));
        }
      }
      for (let c = b + 1; c < vertices.length; c += 1) {
        const [cx, cy, cz] = vertices[c];
        const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(area) <= BARYCENTRIC_EPSILON) continue;
        const lambdaB = ((px - ax) * (cz - az) - (pz - az) * (cx - ax)) / area;
        const lambdaC = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) / area;
        const lambdaA = 1 - lambdaB - lambdaC;
        if (lambdaA >= -BARYCENTRIC_EPSILON && lambdaB >= -BARYCENTRIC_EPSILON && lambdaC >= -BARYCENTRIC_EPSILON) {
          consider(lambdaA * ay + lambdaB * by + lambdaC * cy);
        }
      }
    }
  }
  return highestHitMeters;
}
function queryLockedColliderSupportHeightMeters(collider, pointMetersXZ) {
  switch (collider.kind) {
    case "box":
      return boxSupportHeightMeters(collider, pointMetersXZ);
    case "capsule":
    case "cylinder":
    case "sphere":
      return roundSupportHeightMeters(collider, pointMetersXZ);
    case "convex":
      return convexSupportHeightMeters(collider, pointMetersXZ);
    default:
      throw unsupportedQueryError(
        `Collider kind "${collider.kind}" has no support surface query.`
      );
  }
}
const DEFAULT_HUMANOID_TRAVERSAL = Object.freeze({
  maxSlopeClimbDegrees: 42,
  minSlopeSlideDegrees: 48,
  autostepHeight: 0.35,
  snapToGroundDistance: 0.3
});
const DEFAULT_RADIUS = 0.35;
const DEFAULT_HEIGHT = 1.8;
const EPSILON$1 = 1e-5;
function isFiniteVector(value) {
  return value.every(Number.isFinite);
}
function isInsideBounds(point, bounds) {
  return point.every(
    (axis, index) => axis >= bounds.min[index] && axis <= bounds.max[index]
  );
}
function overlaps(a, b) {
  return a.min[0] < b.max[0] - EPSILON$1 && a.max[0] > b.min[0] + EPSILON$1 && a.min[1] < b.max[1] - EPSILON$1 && a.max[1] > b.min[1] + EPSILON$1 && a.min[2] < b.max[2] - EPSILON$1 && a.max[2] > b.min[2] + EPSILON$1;
}
function intervalsStrictlyOverlap(leftMinimum, leftMaximum, rightMinimum, rightMaximum) {
  return leftMinimum < rightMaximum - EPSILON$1 && leftMaximum > rightMinimum + EPSILON$1;
}
function playerBounds(position, radius, height) {
  return {
    min: [position[0] - radius, position[1], position[2] - radius],
    max: [position[0] + radius, position[1] + height, position[2] + radius]
  };
}
function pointOnSegment$1(point, from, to) {
  const edgeX = to[0] - from[0];
  const edgeZ = to[1] - from[1];
  const pointX = point[0] - from[0];
  const pointZ = point[1] - from[1];
  const cross2 = edgeX * pointZ - edgeZ * pointX;
  if (Math.abs(cross2) > EPSILON$1) return false;
  const dot2 = pointX * edgeX + pointZ * edgeZ;
  return dot2 >= -EPSILON$1 && dot2 <= edgeX * edgeX + edgeZ * edgeZ + EPSILON$1;
}
function footprintContains(boundary, point) {
  if (boundary.kind === "circle") {
    return Math.hypot(
      point[0] - boundary.centerMetersXZ[0],
      point[1] - boundary.centerMetersXZ[1]
    ) <= boundary.radiusMeters + EPSILON$1;
  }
  if (boundary.kind === "ellipse") {
    const x = (point[0] - boundary.centerMetersXZ[0]) / boundary.radiusMetersXZ[0];
    const z = (point[1] - boundary.centerMetersXZ[1]) / boundary.radiusMetersXZ[1];
    return x * x + z * z <= 1 + EPSILON$1;
  }
  let inside = false;
  for (let current = 0, previous = boundary.pointsMetersXZ.length - 1; current < boundary.pointsMetersXZ.length; previous = current, current += 1) {
    const from = boundary.pointsMetersXZ[previous];
    const to = boundary.pointsMetersXZ[current];
    if (from === void 0 || to === void 0) continue;
    if (pointOnSegment$1(point, from, to)) return true;
    const crosses = to[1] > point[1] !== from[1] > point[1] && point[0] < (from[0] - to[0]) * (point[1] - to[1]) / (from[1] - to[1]) + to[0];
    if (crosses) inside = !inside;
  }
  return inside;
}
function pointToSegmentDistanceSquared(point, from, to) {
  const edgeX = to[0] - from[0];
  const edgeZ = to[1] - from[1];
  const lengthSquared = edgeX * edgeX + edgeZ * edgeZ;
  if (lengthSquared === 0) {
    return (point[0] - from[0]) ** 2 + (point[1] - from[1]) ** 2;
  }
  const projection = Math.max(0, Math.min(
    1,
    ((point[0] - from[0]) * edgeX + (point[1] - from[1]) * edgeZ) / lengthSquared
  ));
  const closestX = from[0] + projection * edgeX;
  const closestZ = from[1] + projection * edgeZ;
  return (point[0] - closestX) ** 2 + (point[1] - closestZ) ** 2;
}
function pointToEllipseDistanceSquared(point, center, radii) {
  const x = Math.abs(point[0] - center[0]);
  const z = Math.abs(point[1] - center[1]);
  const radiusX = radii[0];
  const radiusZ = radii[1];
  const normalizedDistanceSquared = (x / radiusX) ** 2 + (z / radiusZ) ** 2;
  if (normalizedDistanceSquared <= 1) return 0;
  const equation = (lambda) => (radiusX * x / (lambda + radiusX * radiusX)) ** 2 + (radiusZ * z / (lambda + radiusZ * radiusZ)) ** 2 - 1;
  let lower = 0;
  let upper = Math.max(
    1,
    radiusX * radiusX,
    radiusZ * radiusZ,
    radiusX * x,
    radiusZ * z
  );
  while (equation(upper) > 0) upper *= 2;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (equation(middle) > 0) lower = middle;
    else upper = middle;
  }
  const closestX = radiusX * radiusX * x / (upper + radiusX * radiusX);
  const closestZ = radiusZ * radiusZ * z / (upper + radiusZ * radiusZ);
  return (x - closestX) ** 2 + (z - closestZ) ** 2;
}
function discIntersectsFootprint(boundary, center, radius) {
  const maximumDistanceSquared = (radius + EPSILON$1) ** 2;
  if (boundary.kind === "circle") {
    return Math.hypot(
      center[0] - boundary.centerMetersXZ[0],
      center[1] - boundary.centerMetersXZ[1]
    ) <= boundary.radiusMeters + radius + EPSILON$1;
  }
  if (boundary.kind === "ellipse") {
    return pointToEllipseDistanceSquared(
      center,
      boundary.centerMetersXZ,
      boundary.radiusMetersXZ
    ) <= maximumDistanceSquared;
  }
  if (footprintContains(boundary, center)) return true;
  return boundary.pointsMetersXZ.some((from, index) => {
    const to = boundary.pointsMetersXZ[(index + 1) % boundary.pointsMetersXZ.length];
    return to !== void 0 && pointToSegmentDistanceSquared(center, from, to) <= maximumDistanceSquared;
  });
}
function validateSpawnSafety(input) {
  const diagnostics = [];
  const radius = input.capsule?.radius ?? DEFAULT_RADIUS;
  const height = input.capsule?.height ?? DEFAULT_HEIGHT;
  if (!isFiniteVector(input.position) || !Number.isFinite(radius) || !Number.isFinite(height)) {
    return [
      {
        severity: "error",
        code: "SPAWN_NOT_FINITE",
        message: `Spawn ${input.entityId} contains a non-finite position or capsule dimension.`,
        entityId: input.entityId
      }
    ];
  }
  if (radius <= 0 || height <= 0) {
    diagnostics.push({
      severity: "error",
      code: "SPAWN_INVALID_CAPSULE",
      message: `Spawn ${input.entityId} requires positive capsule dimensions.`,
      entityId: input.entityId,
      suggestions: ["Use the humanoid SubjectKit default capsule dimensions."]
    });
    return diagnostics;
  }
  if (input.worldBounds !== void 0) {
    const head = [
      input.position[0],
      input.position[1] + height,
      input.position[2]
    ];
    if (!isInsideBounds(input.position, input.worldBounds) || !isInsideBounds(head, input.worldBounds)) {
      diagnostics.push({
        severity: "error",
        code: "SPAWN_OUTSIDE_WORLD",
        message: `Spawn ${input.entityId} is outside the configured world bounds.`,
        entityId: input.entityId,
        suggestions: ["Move the spawn point inside the playable bounds."]
      });
    }
  }
  const bounds = playerBounds(input.position, radius, height);
  for (const collider of input.colliders ?? []) {
    if (collider.isTrigger === true || !overlaps(bounds, collider.bounds)) continue;
    diagnostics.push({
      severity: "error",
      code: "SPAWN_INTERSECTS_COLLIDER",
      message: `Spawn ${input.entityId} intersects collider${collider.entityId === void 0 ? "" : ` ${collider.entityId}`}.`,
      entityId: input.entityId,
      ...collider.featureId === void 0 ? {} : { featureId: collider.featureId },
      suggestions: ["Move the spawn point or resize the blocking collider."]
    });
  }
  const positionXZ = [input.position[0], input.position[2]];
  for (const water of input.waterSurfaces ?? []) {
    const subjectMinimum = input.position[1];
    const subjectMaximum = input.position[1] + height;
    const waterMinimum = water.waterLevelMeters - water.depthMeters;
    if (water.traversalMode !== "blocked" || !discIntersectsFootprint(water.boundary, positionXZ, radius) || !intervalsStrictlyOverlap(
      subjectMinimum,
      subjectMaximum,
      waterMinimum,
      water.waterLevelMeters
    )) continue;
    diagnostics.push({
      severity: "error",
      code: "SPAWN_IN_BLOCKED_WATER",
      message: `Spawn ${input.entityId} is inside blocked water ${water.entityId}.`,
      entityId: input.entityId,
      ...water.featureId === void 0 ? {} : { featureId: water.featureId },
      suggestions: [
        "Move the spawn outside blocked water or mark an intentionally walkable surface as walkable."
      ]
    });
  }
  for (const blocker of input.staticBlockingObjects ?? []) {
    if (!discIntersectsFootprint(blocker.footprint, positionXZ, radius)) continue;
    if (blocker.heightRangeMeters !== void 0) {
      const [minimum, maximum] = blocker.heightRangeMeters;
      const subjectMinimum = input.position[1];
      const subjectMaximum = input.position[1] + height;
      if (!intervalsStrictlyOverlap(
        subjectMinimum,
        subjectMaximum,
        minimum,
        maximum
      )) continue;
    }
    diagnostics.push({
      severity: "error",
      code: "SPAWN_INSIDE_STATIC_BLOCKER",
      message: `Spawn ${input.entityId} is inside static blocking object ${blocker.entityId}.`,
      entityId: input.entityId,
      ...blocker.featureId === void 0 ? {} : { featureId: blocker.featureId },
      suggestions: ["Move the spawn outside the blocking object's footprint."]
    });
  }
  if (input.ground !== void 0) {
    const groundHeight = input.ground.heightAt(input.position[0], input.position[2]);
    const tolerance = input.ground.tolerance ?? 0.15;
    const maxDrop = input.ground.maxDrop ?? 1;
    if (groundHeight === void 0 || !Number.isFinite(groundHeight)) {
      diagnostics.push({
        severity: "error",
        code: "SPAWN_HAS_NO_GROUND",
        message: `Spawn ${input.entityId} has no finite ground sample beneath it.`,
        entityId: input.entityId,
        suggestions: ["Choose a spawn point on generated terrain."]
      });
    } else {
      const offset = input.position[1] - groundHeight;
      if (offset < -tolerance) {
        diagnostics.push({
          severity: "error",
          code: "SPAWN_BELOW_GROUND",
          message: `Spawn ${input.entityId} is ${Math.abs(offset).toFixed(2)}m below the terrain.`,
          entityId: input.entityId,
          suggestions: ["Snap the spawn feet position to terrain height."]
        });
      } else if (offset > maxDrop) {
        diagnostics.push({
          severity: "warning",
          code: "SPAWN_ABOVE_GROUND",
          message: `Spawn ${input.entityId} is ${offset.toFixed(2)}m above the terrain.`,
          entityId: input.entityId,
          suggestions: ["Snap the spawn feet position to terrain height unless an intentional drop is desired."]
        });
      }
      const slope = input.ground.slopeDegreesAt?.(
        input.position[0],
        input.position[2]
      );
      const maxWalkableSlope = input.ground.maxWalkableSlopeDegrees ?? DEFAULT_HUMANOID_TRAVERSAL.maxSlopeClimbDegrees;
      if (slope !== void 0 && Number.isFinite(slope) && slope > maxWalkableSlope) {
        diagnostics.push({
          severity: "error",
          code: "SPAWN_SLOPE_NOT_WALKABLE",
          message: `Spawn ${input.entityId} is on a ${slope.toFixed(1)}° slope, above the ${maxWalkableSlope}° climb limit.`,
          entityId: input.entityId,
          suggestions: ["Flatten and smooth the spawn area or choose another point."]
        });
      }
    }
  }
  return diagnostics;
}
const epsilon = 11102230246251565e-32;
const splitter = 134217729;
const resulterrbound = (3 + 8 * epsilon) * epsilon;
function sum(elen, e, flen, f, h) {
  let Q, Qnew, hh, bvirt;
  let enow = e[0];
  let fnow = f[0];
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q = enow;
    enow = e[++eindex];
  } else {
    Q = fnow;
    fnow = f[++findex];
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      enow = e[++eindex];
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      fnow = f[++findex];
    }
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex];
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f[++findex];
      }
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f[++findex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  if (Q !== 0 || hindex === 0) {
    h[hindex++] = Q;
  }
  return hindex;
}
function estimate(elen, e) {
  let Q = e[0];
  for (let i = 1; i < elen; i++) Q += e[i];
  return Q;
}
function vec(n) {
  return new Float64Array(n);
}
const ccwerrboundA = (3 + 16 * epsilon) * epsilon;
const ccwerrboundB = (2 + 12 * epsilon) * epsilon;
const ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
const B = vec(4);
const C1 = vec(8);
const C2 = vec(12);
const D = vec(16);
const u = vec(4);
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  s1 = acx * bcy;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  B[2] = _j - (u3 - bvirt) + (_i - bvirt);
  B[3] = u3;
  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) {
    return det;
  }
  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
    return det;
  }
  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;
  s1 = acxtail * bcy;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u[3] = u3;
  const C1len = sum(4, B, 4, u, C1);
  s1 = acx * bcytail;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u[3] = u3;
  const C2len = sum(C1len, C1, 4, u, C2);
  s1 = acxtail * bcytail;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u[3] = u3;
  const Dlen = sum(C2len, C2, 4, u, D);
  return D[Dlen - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;
  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum) return det;
  return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}
function orientXZV1(a, b, c) {
  return -orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
}
const TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1 = Object.freeze({
  maximumAreaCount: 64,
  maximumPointsPerArea: 128,
  maximumTotalPointCount: 2048,
  maximumTrianglePointTestCount: 4e6
});
function validateTraversalAreaComplexityV1(input) {
  const limits = TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1;
  if (input.pointCountsByArea.length > limits.maximumAreaCount) {
    return {
      ok: false,
      issueCode: "area-count-exceeded",
      actualCount: input.pointCountsByArea.length,
      maximumCount: limits.maximumAreaCount
    };
  }
  let totalPointCount = 0;
  for (const [areaIndex, pointCount] of input.pointCountsByArea.entries()) {
    if (!Number.isSafeInteger(pointCount) || pointCount < 0) {
      return {
        ok: false,
        issueCode: "points-per-area-exceeded",
        areaIndex,
        actualCount: pointCount,
        maximumCount: limits.maximumPointsPerArea
      };
    }
    if (pointCount > limits.maximumPointsPerArea) {
      return {
        ok: false,
        issueCode: "points-per-area-exceeded",
        areaIndex,
        actualCount: pointCount,
        maximumCount: limits.maximumPointsPerArea
      };
    }
    totalPointCount += pointCount;
  }
  if (totalPointCount > limits.maximumTotalPointCount) {
    return {
      ok: false,
      issueCode: "total-point-count-exceeded",
      actualCount: totalPointCount,
      maximumCount: limits.maximumTotalPointCount
    };
  }
  const sourceTriangleCount = isNil(input.sourceTriangleCount) ? 0 : input.sourceTriangleCount;
  if (!Number.isSafeInteger(sourceTriangleCount) || sourceTriangleCount < 0) {
    return {
      ok: false,
      issueCode: "operation-budget-exceeded",
      actualCount: sourceTriangleCount,
      maximumCount: limits.maximumTrianglePointTestCount
    };
  }
  const estimatedTrianglePointTestCount = totalPointCount * sourceTriangleCount;
  if (!Number.isSafeInteger(estimatedTrianglePointTestCount) || estimatedTrianglePointTestCount > limits.maximumTrianglePointTestCount) {
    return {
      ok: false,
      issueCode: "operation-budget-exceeded",
      actualCount: estimatedTrianglePointTestCount,
      maximumCount: limits.maximumTrianglePointTestCount
    };
  }
  return { ok: true, totalPointCount, estimatedTrianglePointTestCount };
}
function samePoint(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}
function cross$1(a, b, c) {
  return orientXZV1(a, b, c);
}
function isBetweenInclusive(value, first, second) {
  return value >= Math.min(first, second) && value <= Math.max(first, second);
}
function isPointOnSegment(point, start, end) {
  return cross$1(start, end, point) === 0 && isBetweenInclusive(point[0], start[0], end[0]) && isBetweenInclusive(point[1], start[1], end[1]);
}
function collinearOverlapLength(a, b, c, d) {
  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const [a0, b0, c0, d0] = useX ? [a[0], b[0], c[0], d[0]] : [a[1], b[1], c[1], d[1]];
  return Math.min(Math.max(a0, b0), Math.max(c0, d0)) - Math.max(Math.min(a0, b0), Math.min(c0, d0));
}
function segmentRelation(a, b, c, d) {
  const abc = cross$1(a, b, c);
  const abd = cross$1(a, b, d);
  const cda = cross$1(c, d, a);
  const cdb = cross$1(c, d, b);
  if (![abc, abd, cda, cdb].every(Number.isFinite)) return "point";
  if (abc === 0 && abd === 0 && cda === 0 && cdb === 0) {
    const overlapLength = collinearOverlapLength(a, b, c, d);
    if (overlapLength > 0) return "collinear-overlap";
    return overlapLength === 0 ? "point" : "none";
  }
  if (abc === 0 && isPointOnSegment(c, a, b) || abd === 0 && isPointOnSegment(d, a, b) || cda === 0 && isPointOnSegment(a, c, d) || cdb === 0 && isPointOnSegment(b, c, d) || abc > 0 !== abd > 0 && cda > 0 !== cdb > 0) return "point";
  return "none";
}
function validateSimplePolygonXZV1(value) {
  if (!Array.isArray(value) || value.length < 3) {
    return { ok: false, issueCode: "point-count-invalid" };
  }
  const points = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return { ok: false, issueCode: "coordinate-invalid" };
    points.push([point[0], point[1]]);
  }
  for (let index = 0; index < points.length; index += 1) {
    if (samePoint(points[index], points[(index + 1) % points.length])) {
      return { ok: false, issueCode: "zero-length-edge" };
    }
  }
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (samePoint(points[first], points[second])) {
        return { ok: false, issueCode: "duplicate-vertex" };
      }
    }
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstEnd = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondEnd = (second + 1) % points.length;
      const relation = segmentRelation(
        points[first],
        points[firstEnd],
        points[second],
        points[secondEnd]
      );
      if (relation === "collinear-overlap") {
        return { ok: false, issueCode: "collinear-overlap" };
      }
      const isAdjacent = firstEnd === second || secondEnd === first;
      if (!isAdjacent && relation !== "none") {
        return { ok: false, issueCode: "self-intersection" };
      }
    }
  }
  const origin = points[0];
  let twiceArea = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next2 = points[index + 1];
    twiceArea += orientXZV1(origin, point, next2);
  }
  if (!Number.isFinite(twiceArea)) {
    return { ok: false, issueCode: "coordinate-invalid" };
  }
  if (twiceArea === 0) return { ok: false, issueCode: "zero-area" };
  return { ok: true };
}
function failHeightfieldInput(message) {
  throw new Error(`TRIANGLE_HEIGHTFIELD_INPUT_INVALID: ${message}`);
}
function validateTriangleHeightfieldSurfaceInput(input) {
  const [centerX, centerZ] = input.centerMetersXZ;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    failHeightfieldInput("centerMetersXZ must contain finite numbers.");
  }
  const [sizeX, sizeZ] = input.sizeMetersXZ;
  if (!Number.isFinite(sizeX) || !Number.isFinite(sizeZ) || sizeX <= 0 || sizeZ <= 0) {
    failHeightfieldInput("sizeMetersXZ must contain positive finite numbers.");
  }
  const [columns, rows] = input.resolutionVerticesXZ;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2) {
    failHeightfieldInput(
      "resolutionVerticesXZ must contain integers greater than or equal to 2."
    );
  }
  const expectedSampleCount = columns * rows;
  if (!Number.isSafeInteger(expectedSampleCount) || input.heightSamplesMeters.length !== expectedSampleCount) {
    failHeightfieldInput(
      "heightSamplesMeters length must equal columns multiplied by rows."
    );
  }
  for (let index = 0; index < expectedSampleCount; index += 1) {
    if (!Number.isFinite(input.heightSamplesMeters[index])) {
      failHeightfieldInput("heightSamplesMeters must contain only finite numbers.");
    }
  }
  return [columns, rows];
}
function cellTriangleIndices(columns, column, row) {
  const topLeft = row * columns + column;
  const topRight = topLeft + 1;
  const bottomLeft = topLeft + columns;
  const bottomRight = bottomLeft + 1;
  return [
    topLeft,
    bottomLeft,
    topRight,
    topRight,
    bottomLeft,
    bottomRight
  ];
}
function localVertex(input, columns, rows, vertexIndex) {
  const column = vertexIndex % columns;
  const row = Math.floor(vertexIndex / columns);
  const [sizeX, sizeZ] = input.sizeMetersXZ;
  return [
    column / (columns - 1) * sizeX - sizeX / 2,
    input.heightSamplesMeters[vertexIndex],
    row / (rows - 1) * sizeZ - sizeZ / 2
  ];
}
function triangleSample(point, first, second, third) {
  const geometry = describeWorldTriangleV1(first, second, third);
  if (isNil(geometry)) {
    return void 0;
  }
  const sample = samplePointOnWorldTriangleV1(geometry, point);
  if (isNil(sample) || !isBarycentricInsideFacadeV1(sample.barycentricUVW)) {
    return void 0;
  }
  const unitNormalXYZ = geometry.unitNormalXYZ;
  return {
    heightMeters: sample.heightMeters,
    normalXYZ: [unitNormalXYZ[0], unitNormalXYZ[1], unitNormalXYZ[2]],
    slopeDegrees: Math.acos(unitNormalXYZ[1]) * (180 / Math.PI)
  };
}
function sampleTriangleHeightfieldSurface(input, pointMetersXZ) {
  const [columns, rows] = validateTriangleHeightfieldSurfaceInput(input);
  if (!Number.isFinite(pointMetersXZ[0]) || !Number.isFinite(pointMetersXZ[1])) {
    failHeightfieldInput("pointMetersXZ must contain finite numbers.");
  }
  const minimumX = input.centerMetersXZ[0] - input.sizeMetersXZ[0] / 2;
  const minimumZ = input.centerMetersXZ[1] - input.sizeMetersXZ[1] / 2;
  const u2 = (pointMetersXZ[0] - minimumX) / input.sizeMetersXZ[0];
  const v = (pointMetersXZ[1] - minimumZ) / input.sizeMetersXZ[1];
  if (u2 < 0 || u2 > 1 || v < 0 || v > 1) return void 0;
  const columnPosition = u2 * (columns - 1);
  const rowPosition = v * (rows - 1);
  const column = Math.min(columns - 2, Math.floor(columnPosition));
  const row = Math.min(rows - 2, Math.floor(rowPosition));
  const localPoint = [
    pointMetersXZ[0] - input.centerMetersXZ[0],
    pointMetersXZ[1] - input.centerMetersXZ[1]
  ];
  const indices = cellTriangleIndices(columns, column, row);
  for (let triangleOffset = 0; triangleOffset < indices.length; triangleOffset += 3) {
    const sample = triangleSample(
      localPoint,
      localVertex(input, columns, rows, indices[triangleOffset]),
      localVertex(input, columns, rows, indices[triangleOffset + 1]),
      localVertex(input, columns, rows, indices[triangleOffset + 2])
    );
    if (sample !== void 0) return sample;
  }
  failHeightfieldInput("pointMetersXZ did not resolve to an indexed triangle.");
}
function deriveColliderSubshapeIdV1(entityId, logicalSubshapeId) {
  if (entityId.length === 0 || logicalSubshapeId.length === 0) {
    throw new Error(
      "COLLIDER_SUBSHAPE_ID_INVALID: entityId and logicalSubshapeId must be non-empty."
    );
  }
  return `collider-subshape:${sha256CanonicalJson({ entityId, logicalSubshapeId })}`;
}
const MAXIMUM_VISUAL_CAPTURE_GROUPS_V1 = 5;
const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
function diagnostic$1(code2, instancePath, message) {
  return { code: code2, instancePath, message };
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function exactKeys(value, allowedKeys, instancePath) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).filter((key) => !allowed.has(key)).sort().map((key) => diagnostic$1(
    "HOSTED_VISUAL_UNKNOWN_FIELD",
    `${instancePath}/${key}`,
    `Unknown Hosted visual contract field '${key}'.`
  ));
}
function validIdArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && ID.test(item)) && new Set(value).size === value.length;
}
function validateVisualTargetMappings(value, instancePath) {
  if (!Array.isArray(value)) {
    return [diagnostic$1(
      "HOSTED_VISUAL_MAPPINGS_REQUIRED",
      instancePath,
      "visualTargetMappings must be an array."
    )];
  }
  const diagnostics = [];
  if (value.length < 1 || value.length > MAXIMUM_VISUAL_CAPTURE_GROUPS_V1) {
    diagnostics.push(diagnostic$1(
      "HOSTED_VISUAL_MAPPING_COUNT_INVALID",
      instancePath,
      `visualTargetMappings must contain 1-${MAXIMUM_VISUAL_CAPTURE_GROUPS_V1} entries.`
    ));
  }
  const visualTargetIds = [];
  const runtimeEntityIds = [];
  value.forEach((candidate, index) => {
    const path2 = `${instancePath}/${index}`;
    const mapping = record(candidate);
    if (mapping === void 0) {
      diagnostics.push(diagnostic$1(
        "HOSTED_VISUAL_MAPPING_INVALID",
        path2,
        "Visual target mapping must be an object."
      ));
      return;
    }
    diagnostics.push(...exactKeys(mapping, ["visualTargetId", "runtimeEntityIds"], path2));
    if (typeof mapping.visualTargetId !== "string" || !ID.test(mapping.visualTargetId)) {
      diagnostics.push(diagnostic$1(
        "HOSTED_VISUAL_TARGET_ID_INVALID",
        `${path2}/visualTargetId`,
        "visualTargetId is invalid."
      ));
    } else {
      visualTargetIds.push(mapping.visualTargetId);
    }
    if (!validIdArray(mapping.runtimeEntityIds)) {
      diagnostics.push(diagnostic$1(
        "HOSTED_VISUAL_RUNTIME_ENTITY_IDS_INVALID",
        `${path2}/runtimeEntityIds`,
        "runtimeEntityIds must be a non-empty unique ID array."
      ));
    } else {
      runtimeEntityIds.push(...mapping.runtimeEntityIds);
    }
  });
  if (new Set(visualTargetIds).size !== visualTargetIds.length) {
    diagnostics.push(diagnostic$1(
      "HOSTED_VISUAL_TARGET_ID_REUSED",
      instancePath,
      "visualTargetId may appear in only one mapping."
    ));
  }
  if (new Set(runtimeEntityIds).size !== runtimeEntityIds.length) {
    diagnostics.push(diagnostic$1(
      "HOSTED_VISUAL_RUNTIME_ENTITY_REUSED",
      instancePath,
      "A runtime entity may appear in only one visual target mapping."
    ));
  }
  return diagnostics;
}
const DRAFT_KEYS = [
  "kind",
  "schemaVersion",
  "sceneId",
  "authoringSpecId",
  "visualTargetMappings"
];
function validateSceneBriefImplementationMapDraftV1(value) {
  const draft = record(value);
  if (draft === void 0) {
    return [diagnostic$1(
      "HOSTED_VISUAL_DRAFT_OBJECT_REQUIRED",
      "",
      "Scene Brief implementation-map draft must be an object."
    )];
  }
  const diagnostics = exactKeys(draft, DRAFT_KEYS, "");
  if (draft.kind !== "worldkit-scene-brief-implementation-map-draft") {
    diagnostics.push(diagnostic$1(
      "HOSTED_VISUAL_DRAFT_KIND_INVALID",
      "/kind",
      "Scene Brief implementation-map draft kind is invalid."
    ));
  }
  if (draft.schemaVersion !== 1) {
    diagnostics.push(diagnostic$1(
      "HOSTED_VISUAL_SCHEMA_VERSION_INVALID",
      "/schemaVersion",
      "Scene Brief implementation-map draft schemaVersion is invalid."
    ));
  }
  if (typeof draft.sceneId !== "string" || !ID.test(draft.sceneId)) {
    diagnostics.push(diagnostic$1("HOSTED_VISUAL_SCENE_ID_INVALID", "/sceneId", "sceneId is invalid."));
  }
  if (typeof draft.authoringSpecId !== "string" || !ID.test(draft.authoringSpecId)) {
    diagnostics.push(diagnostic$1(
      "HOSTED_VISUAL_AUTHORING_SPEC_ID_INVALID",
      "/authoringSpecId",
      "authoringSpecId is invalid."
    ));
  }
  diagnostics.push(...validateVisualTargetMappings(
    draft.visualTargetMappings,
    "/visualTargetMappings"
  ));
  return diagnostics;
}
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
  "render-binding-profile",
  "ai-schema-projection-profile"
]);
const GROUND_HUMANOID_ACTION_IDS_V1 = Object.freeze([
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
const SUBJECT_BODY_TOPOLOGIES_V2 = Object.freeze([
  "biped",
  "quadruped",
  "four-wheel",
  "surface-craft",
  "watercraft",
  "glider",
  "composite",
  "custom"
]);
function includesSerializedTerm(values, value) {
  return typeof value === "string" && values.includes(value);
}
function isGroundHumanoidActionIdV1(value) {
  return includesSerializedTerm(GROUND_HUMANOID_ACTION_IDS_V1, value);
}
function isBipedBoneIdV1(value) {
  return includesSerializedTerm(BIPED_BONE_IDS_V1, value);
}
function isSubjectBodyTopologyV2(value) {
  return includesSerializedTerm(SUBJECT_BODY_TOPOLOGIES_V2, value);
}
const EXECUTION_RESOURCE_KINDS_V1 = Object.freeze([
  ...SUBJECT_RESOURCE_KINDS_V1,
  "traversal-surface-profile",
  "gameplay-bootstrap"
]);
const EXECUTION_RESOURCE_LOCK_ENTRY_FIELDS_V1 = [
  "resourceRef",
  "resourceKind",
  "resolvedVersion",
  "contentHash"
];
const EXECUTION_RESOURCE_HASH_PATTERN_V1 = /^sha256:[a-f0-9]{64}$/;
function canonicalExecutionResourceLockEntriesV1(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
  }
  const seenResourceKeys = /* @__PURE__ */ new Set();
  const rows = value.map((candidate) => {
    if (isNil(candidate) || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
    }
    const record2 = candidate;
    const fields = Object.keys(record2).sort();
    const expectedFields = [...EXECUTION_RESOURCE_LOCK_ENTRY_FIELDS_V1].sort();
    if (fields.length !== expectedFields.length || fields.some((field, index) => field !== expectedFields[index]) || typeof record2.resourceRef !== "string" || record2.resourceRef.length === 0 || typeof record2.resolvedVersion !== "string" || record2.resolvedVersion.length === 0 || typeof record2.contentHash !== "string" || !EXECUTION_RESOURCE_HASH_PATTERN_V1.test(record2.contentHash) || !EXECUTION_RESOURCE_KINDS_V1.includes(
      record2.resourceKind
    )) {
      throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
    }
    const resourceKey = `${record2.resourceKind}\0${record2.resourceRef}`;
    if (seenResourceKeys.has(resourceKey)) {
      throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
    }
    seenResourceKeys.add(resourceKey);
    return Object.freeze({
      resourceRef: record2.resourceRef,
      resourceKind: record2.resourceKind,
      resolvedVersion: record2.resolvedVersion,
      contentHash: record2.contentHash
    });
  });
  rows.sort(
    (left, right) => left.resourceRef < right.resourceRef ? -1 : left.resourceRef > right.resourceRef ? 1 : left.resourceKind < right.resourceKind ? -1 : left.resourceKind > right.resourceKind ? 1 : 0
  );
  return Object.freeze(rows);
}
const EXECUTION_PLAN_V5_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "seed",
  "runtimeBackend",
  "normalizedWorldIrHash",
  "resourceLockHash",
  "coordinateSystem",
  "gravityMetersPerSecondSquaredXYZ",
  "atmospherePreset",
  "terrain",
  "waters",
  "objects",
  "subjectAssets",
  "rigProfiles",
  "animationSets",
  "colliderProfiles",
  "initialControlledEntityId",
  "subjects",
  "initialRelationships",
  "camera",
  "resourceUsage",
  "layout",
  "authoringSpecHash",
  "resourceLockEntries",
  "traversal",
  "staticColliders"
];
function invalidExecutionPlanV5() {
  throw new TypeError("EXECUTION_PLAN_V5_INVALID");
}
function snapshotExecutionPlanData(input) {
  if (isNil(input)) return invalidExecutionPlanV5();
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) {
      return invalidExecutionPlanV5();
    }
    return input;
  }
  if (Array.isArray(input)) {
    if (Reflect.getPrototypeOf(input) !== Array.prototype || Reflect.ownKeys(input).some((key) => typeof key === "symbol") || Object.getOwnPropertyNames(input).length !== input.length + 1) return invalidExecutionPlanV5();
    const snapshot2 = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) return invalidExecutionPlanV5();
      snapshot2.push(snapshotExecutionPlanData(descriptor.value));
    }
    return snapshot2;
  }
  if (typeof input !== "object" || isNil(input)) {
    return invalidExecutionPlanV5();
  }
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype) {
    return invalidExecutionPlanV5();
  }
  const snapshot = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor) || isNil(descriptor.value)) return invalidExecutionPlanV5();
    snapshot[key] = snapshotExecutionPlanData(descriptor.value);
  }
  return snapshot;
}
function dataRecord(input) {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidExecutionPlanV5();
  }
  return input;
}
function exactDataRecord(input, requiredFields, optionalFields = []) {
  const record2 = dataRecord(input);
  const keys = Object.keys(record2);
  if (requiredFields.some((field) => !Object.hasOwn(record2, field)) || keys.some(
    (field) => !requiredFields.includes(field) && !optionalFields.includes(field)
  )) return invalidExecutionPlanV5();
  return record2;
}
function dataArray(input) {
  if (!Array.isArray(input)) return invalidExecutionPlanV5();
  return input;
}
function requireString(input) {
  if (typeof input !== "string" || input.length === 0) {
    return invalidExecutionPlanV5();
  }
  return input;
}
function requireHash(input) {
  if (typeof input !== "string" || !EXECUTION_RESOURCE_HASH_PATTERN_V1.test(input)) return invalidExecutionPlanV5();
  return input;
}
function requireFinite(input) {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return invalidExecutionPlanV5();
  }
  return input;
}
function requireSafeNonNegativeInteger(input) {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) return invalidExecutionPlanV5();
  return input;
}
function requireSafePositiveInteger(input) {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input <= 0) return invalidExecutionPlanV5();
  return input;
}
function requireBoolean(input) {
  if (typeof input !== "boolean") return invalidExecutionPlanV5();
  return input;
}
function requireLiteral(input, values) {
  if (!values.includes(input)) return invalidExecutionPlanV5();
  return input;
}
function requireTuple(input, length) {
  const values = dataArray(input);
  if (values.length !== length) return invalidExecutionPlanV5();
  values.forEach(requireFinite);
  return values;
}
function requireStringArray(input) {
  dataArray(input).forEach(requireString);
}
function requireBipedBoneId(input) {
  if (!isBipedBoneIdV1(input)) return invalidExecutionPlanV5();
  return input;
}
function requireGroundHumanoidActionId(input) {
  if (!isGroundHumanoidActionIdV1(input)) return invalidExecutionPlanV5();
  return input;
}
function requireSubjectBodyTopology(input) {
  if (!isSubjectBodyTopologyV2(input)) return invalidExecutionPlanV5();
  return input;
}
function validateTransform(input) {
  const value = exactDataRecord(input, [
    "positionMetersXYZ",
    "rotationEulerRadiansXYZ",
    "scaleXYZ"
  ]);
  requireTuple(value.positionMetersXYZ, 3);
  requireTuple(value.rotationEulerRadiansXYZ, 3);
  requireTuple(value.scaleXYZ, 3);
}
function validatePrimitive(input, allowedKinds) {
  const value = dataRecord(input);
  const kind = requireLiteral(value.kind, allowedKinds);
  if (kind === "box") {
    const box = exactDataRecord(value, ["kind", "sizeMetersXYZ"]);
    requireTuple(box.sizeMetersXYZ, 3);
  } else if (kind === "sphere") {
    requireFinite(exactDataRecord(value, ["kind", "radiusMeters"]).radiusMeters);
  } else {
    const cylinder = exactDataRecord(value, [
      "kind",
      "radiusMeters",
      "heightMeters"
    ]);
    requireFinite(cylinder.radiusMeters);
    requireFinite(cylinder.heightMeters);
  }
}
function validateTerrain(input) {
  const value = exactDataRecord(input, [
    "entityId",
    "centerMetersXZ",
    "sizeMetersXZ",
    "resolutionCellsXZ",
    "heightSamplesMeters",
    "heightSamplesHash",
    "minimumHeightMeters",
    "maximumHeightMeters",
    "semanticClassId"
  ]);
  requireString(value.entityId);
  requireTuple(value.centerMetersXZ, 2);
  requireTuple(value.sizeMetersXZ, 2);
  const resolution = requireTuple(value.resolutionCellsXZ, 2).map(requireSafePositiveInteger);
  const heightSamplesMeters = dataArray(value.heightSamplesMeters).map(requireFinite);
  if (heightSamplesMeters.length !== resolution[0] * resolution[1] || requireHash(value.heightSamplesHash) !== sha256CanonicalJson(heightSamplesMeters)) return invalidExecutionPlanV5();
  const minimumHeightMeters = heightSamplesMeters.reduce(
    (minimum, sample) => Math.min(minimum, sample),
    Number.POSITIVE_INFINITY
  );
  const maximumHeightMeters = heightSamplesMeters.reduce(
    (maximum, sample) => Math.max(maximum, sample),
    Number.NEGATIVE_INFINITY
  );
  if (requireFinite(value.minimumHeightMeters) !== minimumHeightMeters || requireFinite(value.maximumHeightMeters) !== maximumHeightMeters || minimumHeightMeters > maximumHeightMeters) return invalidExecutionPlanV5();
  requireString(value.semanticClassId);
}
function validateWater(input) {
  const value = exactDataRecord(input, [
    "entityId",
    "terrainEntityId",
    "boundary",
    "depthMeters",
    "shoreWidthMeters",
    "waterLevelMeters",
    "traversalMode",
    "semanticClassId"
  ]);
  requireString(value.entityId);
  requireString(value.terrainEntityId);
  const boundary = dataRecord(value.boundary);
  const kind = requireLiteral(boundary.kind, ["circle", "ellipse", "polygon"]);
  if (kind === "circle") {
    const circle = exactDataRecord(boundary, ["kind", "centerMetersXZ", "radiusMeters"]);
    requireTuple(circle.centerMetersXZ, 2);
    requireFinite(circle.radiusMeters);
  } else if (kind === "ellipse") {
    const ellipse = exactDataRecord(boundary, ["kind", "centerMetersXZ", "radiusMetersXZ"]);
    requireTuple(ellipse.centerMetersXZ, 2);
    requireTuple(ellipse.radiusMetersXZ, 2);
  } else {
    const polygon = exactDataRecord(boundary, ["kind", "pointsMetersXZ"]);
    dataArray(polygon.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
  }
  requireFinite(value.depthMeters);
  requireFinite(value.shoreWidthMeters);
  requireFinite(value.waterLevelMeters);
  requireLiteral(value.traversalMode, ["blocked", "swimmable", "walkable"]);
  requireString(value.semanticClassId);
}
function validateObject(input) {
  const value = exactDataRecord(input, [
    "entityId",
    "prototypeId",
    "primitive",
    "transform",
    "collisionEnabled",
    "semanticClassId"
  ]);
  requireString(value.entityId);
  requireString(value.prototypeId);
  validatePrimitive(value.primitive, ["box", "sphere", "cylinder", "cone"]);
  validateTransform(value.transform);
  requireBoolean(value.collisionEnabled);
  requireString(value.semanticClassId);
}
function validateSubjectAsset$1(input) {
  const value = exactDataRecord(input, [
    "subjectAssetRef",
    "artifactContentHash",
    "byteLength",
    "mediaType",
    "format",
    "inventory"
  ]);
  requireString(value.subjectAssetRef);
  requireHash(value.artifactContentHash);
  requireSafeNonNegativeInteger(value.byteLength);
  requireLiteral(value.mediaType, ["model/gltf-binary"]);
  requireLiteral(value.format, ["glb"]);
  const inventory = exactDataRecord(value.inventory, [
    "meshCount",
    "vertexCount",
    "triangleCount",
    "skeletonCount",
    "boneCount",
    "animationClipNames"
  ]);
  [
    inventory.meshCount,
    inventory.vertexCount,
    inventory.triangleCount,
    inventory.skeletonCount,
    inventory.boneCount
  ].forEach(requireSafeNonNegativeInteger);
  requireStringArray(inventory.animationClipNames);
}
function validateRigProfile$1(input) {
  const value = exactDataRecord(input, [
    "rigProfileRef",
    "bodyTopology",
    "skeletonRootBoneName",
    "requiredBoneIds",
    "sourceNodeNameByBoneId"
  ]);
  requireString(value.rigProfileRef);
  requireLiteral(value.bodyTopology, ["biped"]);
  requireString(value.skeletonRootBoneName);
  dataArray(value.requiredBoneIds).forEach(requireBipedBoneId);
  Object.entries(dataRecord(value.sourceNodeNameByBoneId)).forEach(
    ([boneId, sourceNodeName]) => {
      requireBipedBoneId(boneId);
      requireString(sourceNodeName);
    }
  );
}
function validateAnimationSet$1(input) {
  const value = exactDataRecord(input, [
    "animationSetRef",
    "subjectAssetRef",
    "rigProfileRef",
    "defaultActionId",
    "requiredActionIds",
    "animationBindings"
  ]);
  requireString(value.animationSetRef);
  requireString(value.subjectAssetRef);
  requireString(value.rigProfileRef);
  requireGroundHumanoidActionId(value.defaultActionId);
  dataArray(value.requiredActionIds).forEach(requireGroundHumanoidActionId);
  dataArray(value.animationBindings).forEach((binding) => {
    const row = exactDataRecord(binding, [
      "actionId",
      "sourceClipName",
      "loopMode",
      "playbackSpeedRatio",
      "blendDurationSeconds",
      "rootMotionMode"
    ]);
    requireGroundHumanoidActionId(row.actionId);
    requireString(row.sourceClipName);
    requireLiteral(row.loopMode, ["repeat", "once"]);
    requireFinite(row.playbackSpeedRatio);
    requireFinite(row.blendDurationSeconds);
    requireLiteral(row.rootMotionMode, ["in-place"]);
  });
}
function validateColliderProfile$1(input) {
  const value = exactDataRecord(input, [
    "colliderProfileRef",
    "supportedBodyTopologies",
    "collider"
  ]);
  requireString(value.colliderProfileRef);
  dataArray(value.supportedBodyTopologies).forEach(requireSubjectBodyTopology);
  const collider = exactDataRecord(value.collider, [
    "kind",
    "radiusMeters",
    "heightMeters",
    "centerOffsetFromSubjectOriginMetersXYZ"
  ]);
  requireLiteral(collider.kind, ["capsule"]);
  requireFinite(collider.radiusMeters);
  requireFinite(collider.heightMeters);
  requireTuple(collider.centerOffsetFromSubjectOriginMetersXYZ, 3);
}
function validateMotionProfile$1(input) {
  const value = exactDataRecord(input, [
    "resourceRef",
    "contentHash",
    "motionKernelRef",
    "motionTags"
  ]);
  requireString(value.resourceRef);
  requireHash(value.contentHash);
  requireString(value.motionKernelRef);
  requireStringArray(value.motionTags);
}
function validateCameraRigParameters(input, partial) {
  const value = dataRecord(input);
  const keys = Object.keys(value);
  if (keys.some(
    (key) => !CAMERA_RIG_PARAMETER_NAMES_V1.includes(key)
  ) || !partial && keys.length !== CAMERA_RIG_PARAMETER_NAMES_V1.length || !partial && CAMERA_RIG_PARAMETER_NAMES_V1.some((key) => !Object.hasOwn(value, key))) return invalidExecutionPlanV5();
  Object.values(value).forEach(requireFinite);
}
function validateCameraContextRule(input) {
  const value = exactDataRecord(
    input,
    ["id", "priority", "when"],
    ["cameraRigProfileRef", "cameraModifierRefs"]
  );
  requireString(value.id);
  requireFinite(value.priority);
  const when = exactDataRecord(value.when, [], [
    "relationshipRoles",
    "motionKernelRefs",
    "requiredMotionTags",
    "movementMediums",
    "minimumSpeedMetersPerSecond",
    "maximumSpeedMetersPerSecond",
    "requiredSocketIds",
    "requiredCameraContextTags"
  ]);
  for (const key of [
    "relationshipRoles",
    "motionKernelRefs",
    "requiredMotionTags",
    "movementMediums",
    "requiredSocketIds",
    "requiredCameraContextTags"
  ]) {
    if (Object.hasOwn(when, key)) requireStringArray(when[key]);
  }
  if (Object.hasOwn(when, "minimumSpeedMetersPerSecond")) {
    requireFinite(when.minimumSpeedMetersPerSecond);
  }
  if (Object.hasOwn(when, "maximumSpeedMetersPerSecond")) {
    requireFinite(when.maximumSpeedMetersPerSecond);
  }
  if (Object.hasOwn(value, "cameraRigProfileRef")) {
    requireString(value.cameraRigProfileRef);
  }
  if (Object.hasOwn(value, "cameraModifierRefs")) {
    requireStringArray(value.cameraModifierRefs);
  }
}
function validateCapabilityAssembly(input) {
  const value = exactDataRecord(input, [
    "authoringAvailability",
    "physicsBodyProfileRef",
    "locomotionProfileRef",
    "defaultMotionProfile",
    "optionalMotionProfiles",
    "fallbackMotionProfile",
    "motionKernels",
    "controlProfile",
    "cameraContext",
    "mediumProfile",
    "relationshipProfiles",
    "harnessProfileRef",
    "requiredHarnessCheckIds",
    "actionOrPoseSetRef",
    "renderBindingProfileRef"
  ]);
  requireLiteral(value.authoringAvailability, [
    "recommended",
    "advanced",
    "experimental"
  ]);
  requireString(value.physicsBodyProfileRef);
  requireString(value.locomotionProfileRef);
  validateMotionProfile$1(value.defaultMotionProfile);
  dataArray(value.optionalMotionProfiles).forEach(validateMotionProfile$1);
  validateMotionProfile$1(value.fallbackMotionProfile);
  dataArray(value.motionKernels).forEach((kernel) => {
    const row = exactDataRecord(kernel, [
      "resourceRef",
      "implementationId",
      "commandKind",
      "supportedMediums",
      "fallbackMotionProfileRef",
      "deterministic"
    ]);
    requireString(row.resourceRef);
    requireLiteral(row.implementationId, [
      "free-ground",
      "forward-steer",
      "wheeled-arcade",
      "surface-slide",
      "water-surface",
      "unpowered-glide"
    ]);
    requireLiteral(row.commandKind, [
      "planar-vector",
      "throttle-steer",
      "flight-attitude",
      "none"
    ]);
    requireStringArray(row.supportedMediums);
    requireString(row.fallbackMotionProfileRef);
    requireLiteral(row.deterministic, [true]);
  });
  const control = exactDataRecord(value.controlProfile, [
    "resourceRef",
    "contentHash",
    "commandKind",
    "inputSpace",
    "facingPolicy",
    "lateralMovementPolicy",
    "moveDeadzoneRatio"
  ]);
  requireString(control.resourceRef);
  requireHash(control.contentHash);
  requireLiteral(control.commandKind, [
    "planar-vector",
    "throttle-steer",
    "flight-attitude",
    "none"
  ]);
  requireLiteral(control.inputSpace, [
    "camera-relative",
    "subject-local",
    "flight-frame",
    "none"
  ]);
  requireLiteral(control.facingPolicy, [
    "align-to-move",
    "align-to-view",
    "steering-derived",
    "flight-derived",
    "fixed"
  ]);
  requireLiteral(control.lateralMovementPolicy, ["allowed", "forbidden"]);
  requireFinite(control.moveDeadzoneRatio);
  const camera = exactDataRecord(value.cameraContext, [
    "resourceRef",
    "defaultCameraRigProfileRef",
    "rules",
    "cameraRigProfiles",
    "cameraModifierProfiles"
  ], ["firstPersonCameraRigProfileRef"]);
  requireString(camera.resourceRef);
  requireString(camera.defaultCameraRigProfileRef);
  if (Object.hasOwn(camera, "firstPersonCameraRigProfileRef")) {
    requireString(camera.firstPersonCameraRigProfileRef);
  }
  dataArray(camera.rules).forEach(validateCameraContextRule);
  dataArray(camera.cameraRigProfiles).forEach((profile) => {
    const row = exactDataRecord(profile, [
      "resourceRef",
      "contentHash",
      "baseMode",
      "algorithmRef",
      "headingSource",
      "reverseHeadingPolicy",
      "recenterMode",
      "preferredSocketIds",
      "parameters"
    ], ["authoringRanges"]);
    requireString(row.resourceRef);
    requireHash(row.contentHash);
    requireLiteral(row.baseMode, [
      "first-person",
      "free-orbit",
      "stable-follow",
      "speed-chase",
      "flight-horizon"
    ]);
    requireString(row.algorithmRef);
    requireLiteral(row.headingSource, ["view", "target-forward", "target-velocity"]);
    requireLiteral(row.reverseHeadingPolicy, [
      "follow-velocity",
      "preserve-target-forward"
    ]);
    requireLiteral(row.recenterMode, ["off", "forward-motion", "always"]);
    requireStringArray(row.preferredSocketIds);
    validateCameraRigParameters(row.parameters, false);
    if (Object.hasOwn(row, "authoringRanges")) {
      const ranges = dataRecord(row.authoringRanges);
      for (const [key, range] of Object.entries(ranges)) {
        if (!CAMERA_RIG_PARAMETER_NAMES_V1.includes(key)) {
          return invalidExecutionPlanV5();
        }
        const bounds = exactDataRecord(range, ["minimum", "maximum", "step"]);
        requireFinite(bounds.minimum);
        requireFinite(bounds.maximum);
        requireFinite(bounds.step);
      }
    }
  });
  dataArray(camera.cameraModifierProfiles).forEach((profile) => {
    const row = exactDataRecord(profile, [
      "resourceRef",
      "parameterOverrides"
    ], [
      "headingSourceOverride",
      "reverseHeadingPolicyOverride",
      "recenterModeOverride"
    ]);
    requireString(row.resourceRef);
    validateCameraRigParameters(row.parameterOverrides, true);
    if (Object.hasOwn(row, "headingSourceOverride")) {
      requireLiteral(row.headingSourceOverride, ["view", "target-forward", "target-velocity"]);
    }
    if (Object.hasOwn(row, "reverseHeadingPolicyOverride")) {
      requireLiteral(row.reverseHeadingPolicyOverride, [
        "follow-velocity",
        "preserve-target-forward"
      ]);
    }
    if (Object.hasOwn(row, "recenterModeOverride")) {
      requireLiteral(row.recenterModeOverride, ["off", "forward-motion", "always"]);
    }
  });
  const medium = exactDataRecord(value.mediumProfile, ["resourceRef", "air"]);
  requireString(medium.resourceRef);
  const air = exactDataRecord(medium.air, ["gravityRatio", "linearDragPerSecond"]);
  requireFinite(air.gravityRatio);
  requireFinite(air.linearDragPerSecond);
  dataArray(value.relationshipProfiles).forEach((profile) => {
    const source = dataRecord(profile);
    const relationshipType = requireLiteral(source.relationshipType, [
      "mountedOn",
      "seat",
      "tether"
    ]);
    if (relationshipType === "mountedOn") {
      const row2 = exactDataRecord(profile, [
        "resourceRef",
        "relationshipType",
        "requiredRiderSocketIds",
        "requiredMountSocketIds",
        "controlTransferMode",
        "cameraTargetRole"
      ], ["maximumMountDistanceMeters"]);
      requireString(row2.resourceRef);
      requireStringArray(row2.requiredRiderSocketIds);
      requireStringArray(row2.requiredMountSocketIds);
      requireLiteral(row2.controlTransferMode, ["keep-rider", "to-mount", "none"]);
      requireLiteral(row2.cameraTargetRole, ["controlled-entity", "rider", "mount"]);
      if (Object.hasOwn(row2, "maximumMountDistanceMeters")) {
        requireFinite(row2.maximumMountDistanceMeters);
      }
      return;
    }
    const row = relationshipType === "seat" ? exactDataRecord(profile, [
      "resourceRef",
      "relationshipType",
      "requiredOccupantSocketIds",
      "requiredSeatSocketIds"
    ]) : exactDataRecord(profile, [
      "resourceRef",
      "relationshipType",
      "requiredTetheredSocketIds",
      "requiredTetherAnchorSocketIds"
    ]);
    requireString(row.resourceRef);
    if (relationshipType === "seat") {
      requireStringArray(row.requiredOccupantSocketIds);
      requireStringArray(row.requiredSeatSocketIds);
    } else {
      requireStringArray(row.requiredTetheredSocketIds);
      requireStringArray(row.requiredTetherAnchorSocketIds);
    }
  });
  requireString(value.harnessProfileRef);
  requireStringArray(value.requiredHarnessCheckIds);
  requireString(value.actionOrPoseSetRef);
  requireString(value.renderBindingProfileRef);
}
function validateSubject(input) {
  const value = exactDataRecord(input, [
    "entityId",
    "subjectDefinitionRef",
    "subjectDefinitionHash",
    "bodyTopology",
    "semanticClassId",
    "spawnAnchorEntityId",
    "spawnSubjectOriginPositionMetersXYZ",
    "spawnSubjectFacingRadians",
    "forwardDirection",
    "visualParts",
    "visualBinding",
    "sockets",
    "mountSlots",
    "collider",
    "locomotion",
    "locomotionCapabilityRef",
    "locomotionCapabilityHash",
    "physicsBodyProfileRef",
    "locomotionProfileRef",
    "controlFeel",
    "availableControlFeels",
    "capabilityAssembly"
  ]);
  requireString(value.entityId);
  requireString(value.subjectDefinitionRef);
  requireHash(value.subjectDefinitionHash);
  requireSubjectBodyTopology(value.bodyTopology);
  requireString(value.semanticClassId);
  requireString(value.spawnAnchorEntityId);
  requireTuple(value.spawnSubjectOriginPositionMetersXYZ, 3);
  requireFinite(value.spawnSubjectFacingRadians);
  requireLiteral(value.forwardDirection, ["-z"]);
  let assetPartCount = 0;
  dataArray(value.visualParts).forEach((part) => {
    const row = dataRecord(part);
    const kind = requireLiteral(row.kind, ["primitive", "asset"]);
    if (kind === "primitive") {
      const primitive = exactDataRecord(row, [
        "id",
        "kind",
        "shape",
        "localTransform",
        "semanticTags"
      ]);
      requireString(primitive.id);
      validatePrimitive(primitive.shape, ["box", "sphere", "cylinder", "capsule"]);
      const transform = exactDataRecord(primitive.localTransform, [
        "positionMetersXYZ",
        "rotationEulerRadiansXYZ"
      ]);
      requireTuple(transform.positionMetersXYZ, 3);
      requireTuple(transform.rotationEulerRadiansXYZ, 3);
      requireStringArray(primitive.semanticTags);
    } else {
      assetPartCount += 1;
      const asset = exactDataRecord(row, [
        "id",
        "kind",
        "subjectAssetRef",
        "localTransform",
        "appearance",
        "semanticTags"
      ]);
      requireString(asset.id);
      requireString(asset.subjectAssetRef);
      validateTransform(asset.localTransform);
      requireLiteral(exactDataRecord(asset.appearance, ["mode"]).mode, [
        "whitebox-neutral"
      ]);
      requireStringArray(asset.semanticTags);
    }
  });
  const visualBinding = dataRecord(value.visualBinding);
  const bindingMode = requireLiteral(visualBinding.mode, ["static", "rigged"]);
  if (bindingMode === "static") {
    exactDataRecord(visualBinding, ["mode"]);
    if (assetPartCount > 1) return invalidExecutionPlanV5();
  } else {
    if (assetPartCount !== 1) return invalidExecutionPlanV5();
    const rigged = exactDataRecord(visualBinding, [
      "mode",
      "rigProfileRef",
      "animationSetRef"
    ]);
    requireString(rigged.rigProfileRef);
    requireString(rigged.animationSetRef);
  }
  const socketIds = /* @__PURE__ */ new Set();
  dataArray(value.sockets).forEach((socket) => {
    const row = dataRecord(socket);
    const kind = requireLiteral(row.kind, ["local", "bone"]);
    const socketValue = kind === "local" ? exactDataRecord(row, ["id", "kind", "localTransform", "semanticTags"]) : exactDataRecord(row, ["id", "kind", "boneId", "offsetTransform", "semanticTags"]);
    const socketId = requireString(socketValue.id);
    if (socketIds.has(socketId)) return invalidExecutionPlanV5();
    socketIds.add(socketId);
    requireStringArray(socketValue.semanticTags);
    if (kind === "local") {
      const transform = exactDataRecord(socketValue.localTransform, [
        "positionMetersXYZ",
        "rotationEulerRadiansXYZ"
      ]);
      requireTuple(transform.positionMetersXYZ, 3);
      requireTuple(transform.rotationEulerRadiansXYZ, 3);
    } else {
      requireBipedBoneId(socketValue.boneId);
      const transform = exactDataRecord(socketValue.offsetTransform, [
        "positionMetersXYZ",
        "rotationEulerRadiansXYZ"
      ]);
      requireTuple(transform.positionMetersXYZ, 3);
      requireTuple(transform.rotationEulerRadiansXYZ, 3);
    }
  });
  const mountSlotIds = /* @__PURE__ */ new Set();
  dataArray(value.mountSlots).forEach((slot) => {
    const row = exactDataRecord(slot, [
      "id",
      "kind",
      "mode",
      "mountSocketId",
      "riderSubjectOriginOffsetMetersXYZ",
      "dismountCandidateOffsetsMetersXYZ"
    ]);
    const mountSlotId = requireString(row.id);
    if (mountSlotIds.has(mountSlotId)) return invalidExecutionPlanV5();
    mountSlotIds.add(mountSlotId);
    requireLiteral(row.kind, ["mount-slot"]);
    requireLiteral(row.mode, ["stand"]);
    const mountSocketId = requireString(row.mountSocketId);
    if (!socketIds.has(mountSocketId)) return invalidExecutionPlanV5();
    requireTuple(row.riderSubjectOriginOffsetMetersXYZ, 3);
    const dismountCandidateOffsets = dataArray(
      row.dismountCandidateOffsetsMetersXYZ
    );
    if (dismountCandidateOffsets.length < 1 || dismountCandidateOffsets.length > 8) {
      return invalidExecutionPlanV5();
    }
    dismountCandidateOffsets.forEach((offset) => requireTuple(offset, 3));
  });
  const collider = exactDataRecord(value.collider, [
    "kind",
    "radiusMeters",
    "heightMeters",
    "centerOffsetFromSubjectOriginMetersXYZ",
    "massKilograms",
    "maxSlopeDegrees",
    "maxStepHeightMeters"
  ]);
  requireLiteral(collider.kind, ["capsule"]);
  requireFinite(collider.radiusMeters);
  requireFinite(collider.heightMeters);
  requireTuple(collider.centerOffsetFromSubjectOriginMetersXYZ, 3);
  requireFinite(collider.massKilograms);
  requireFinite(collider.maxSlopeDegrees);
  requireFinite(collider.maxStepHeightMeters);
  const locomotion = exactDataRecord(value.locomotion, [
    "allowWalk",
    "allowRun",
    "allowJump"
  ]);
  requireBoolean(locomotion.allowWalk);
  requireBoolean(locomotion.allowRun);
  requireBoolean(locomotion.allowJump);
  requireString(value.locomotionCapabilityRef);
  requireHash(value.locomotionCapabilityHash);
  requireString(value.physicsBodyProfileRef);
  requireString(value.locomotionProfileRef);
  const validateFeel = (inputValue) => {
    const feel = exactDataRecord(inputValue, [
      "resourceRef",
      "contentHash",
      "walkSpeedMetersPerSecond",
      "runSpeedMetersPerSecond",
      "jumpSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "decelerationMetersPerSecondSquared",
      "turnRateRadiansPerSecond",
      "moveResponseExponent",
      "airControlRatio",
      "coyoteTimeSeconds",
      "jumpBufferSeconds",
      "variableJumpHoldSeconds",
      "jumpHoldGravityRatio",
      "jumpReleaseGravityRatio"
    ]);
    requireString(feel.resourceRef);
    requireHash(feel.contentHash);
    Object.entries(feel).filter(([key]) => key !== "resourceRef" && key !== "contentHash").forEach(([, number]) => requireFinite(number));
  };
  validateFeel(value.controlFeel);
  dataArray(value.availableControlFeels).forEach(validateFeel);
  validateCapabilityAssembly(value.capabilityAssembly);
}
function validateCamera(input) {
  const value = exactDataRecord(input, [
    "cameraEntityId",
    "rigRef",
    "targetEntityId",
    "pitchRadians",
    "distanceMeters",
    "targetHeightMeters",
    "fovDegrees",
    "manualSwitchAllowed",
    "aspectRatio"
  ]);
  requireString(value.cameraEntityId);
  requireLiteral(value.rigRef, ["worldkit://camera/third-person.standard@1"]);
  requireString(value.targetEntityId);
  requireFinite(value.pitchRadians);
  requireFinite(value.distanceMeters);
  requireFinite(value.targetHeightMeters);
  requireFinite(value.fovDegrees);
  requireBoolean(value.manualSwitchAllowed);
  requireFinite(value.aspectRatio);
}
function validateLayoutAssertion(input) {
  const value = dataRecord(input);
  const kind = requireLiteral(value.kind, [
    "inside-region",
    "outside-region",
    "distance-range",
    "faces-entity",
    "supported-by",
    "minimum-clearance",
    "within-slope-limit",
    "visible-in-camera-region"
  ]);
  const baseFields = [
    "constraintId",
    "kind",
    "evidenceEntityIds",
    "measurements",
    "tolerances"
  ];
  let required2 = [...baseFields];
  let optional = [];
  if (kind === "inside-region" || kind === "outside-region") {
    required2.push("entityId", "regionId", "boundaryClearanceMeters");
  } else if (kind === "distance-range") {
    required2.push(
      "entityId",
      "referenceEntityId",
      "minimumDistanceMeters",
      "maximumDistanceMeters"
    );
  } else if (kind === "faces-entity") {
    required2.push("facingEntityId", "targetEntityId", "maximumAngularDeviationDegrees");
  } else if (kind === "supported-by") {
    required2.push(
      "supportedEntityId",
      "supportingEntityId",
      "maximumSupportGapMeters",
      "minimumSupportRatio"
    );
  } else if (kind === "minimum-clearance") {
    required2.push("entityId", "clearanceMeters");
    const hasEntities = Object.hasOwn(value, "otherEntityIds");
    const hasClasses = Object.hasOwn(value, "semanticClassIds");
    if (hasEntities === hasClasses) return invalidExecutionPlanV5();
    required2.push(hasEntities ? "otherEntityIds" : "semanticClassIds");
  } else if (kind === "within-slope-limit") {
    required2.push("terrainEntityId", "maximumSlopeDegrees");
    const hasEntity = Object.hasOwn(value, "entityId");
    const hasRoute = Object.hasOwn(value, "routeId");
    if (hasEntity === hasRoute) return invalidExecutionPlanV5();
    required2.push(hasEntity ? "entityId" : "routeId");
  } else {
    required2.push(
      "visibleEntityId",
      "cameraEntityId",
      "screenRegionId",
      "minimumVisibleRatio",
      "minimumProjectedAreaRatio"
    );
  }
  const row = exactDataRecord(value, required2, optional);
  requireString(row.constraintId);
  requireStringArray(row.evidenceEntityIds);
  Object.values(dataRecord(row.measurements)).forEach((measurement) => {
    if (typeof measurement !== "string" && typeof measurement !== "boolean" && (typeof measurement !== "number" || !Number.isFinite(measurement))) return invalidExecutionPlanV5();
  });
  Object.values(dataRecord(row.tolerances)).forEach(requireFinite);
  for (const [key, field] of Object.entries(row)) {
    if (baseFields.includes(key) || key === "kind") continue;
    if (key.endsWith("Ids")) requireStringArray(field);
    else if (key.endsWith("Id")) requireString(field);
    else requireFinite(field);
  }
}
function validateLayout(input) {
  const value = exactDataRecord(input, [
    "solverProfileRef",
    "resolvedVersion",
    "solverProfileHash",
    "layoutSolveReportHash",
    "regions",
    "routes",
    "screenRegions",
    "placementsByEntityId",
    "layoutAssertions"
  ]);
  requireString(value.solverProfileRef);
  requireString(value.resolvedVersion);
  requireHash(value.solverProfileHash);
  requireHash(value.layoutSolveReportHash);
  dataArray(value.regions).forEach((region) => {
    const row = exactDataRecord(region, [
      "id",
      "kind",
      "pointsMetersXZ",
      "semanticClassId"
    ], ["minimumHeightMeters", "maximumHeightMeters"]);
    requireString(row.id);
    requireLiteral(row.kind, ["polygon-xz"]);
    dataArray(row.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
    requireString(row.semanticClassId);
    if (Object.hasOwn(row, "minimumHeightMeters")) requireFinite(row.minimumHeightMeters);
    if (Object.hasOwn(row, "maximumHeightMeters")) requireFinite(row.maximumHeightMeters);
  });
  dataArray(value.routes).forEach((route) => {
    const row = exactDataRecord(route, [
      "id",
      "kind",
      "pointsMetersXZ",
      "widthMeters",
      "locomotionProfileRef"
    ]);
    requireString(row.id);
    requireLiteral(row.kind, ["polyline-xz"]);
    dataArray(row.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
    requireFinite(row.widthMeters);
    requireString(row.locomotionProfileRef);
  });
  dataArray(value.screenRegions).forEach((region) => {
    const row = exactDataRecord(region, [
      "id",
      "kind",
      "minimumUv",
      "maximumUv"
    ]);
    requireString(row.id);
    requireLiteral(row.kind, ["rectangle-uv"]);
    requireTuple(row.minimumUv, 2);
    requireTuple(row.maximumUv, 2);
  });
  for (const [entityId, placement] of Object.entries(
    dataRecord(value.placementsByEntityId)
  )) {
    const row = exactDataRecord(placement, [
      "entityId",
      "transform",
      "placementProvenance"
    ]);
    if (requireString(row.entityId) !== entityId) return invalidExecutionPlanV5();
    validateTransform(row.transform);
    const provenance = exactDataRecord(row.placementProvenance, [
      "kind",
      "candidateId",
      "placementConstraintIds",
      "solverProfileRef",
      "layoutSolveReportHash"
    ]);
    requireLiteral(provenance.kind, ["fixed", "solved"]);
    requireString(provenance.candidateId);
    requireStringArray(provenance.placementConstraintIds);
    requireString(provenance.solverProfileRef);
    requireHash(provenance.layoutSolveReportHash);
  }
  dataArray(value.layoutAssertions).forEach(validateLayoutAssertion);
}
function validateTraversalSurface(input) {
  const value = dataRecord(input);
  const kind = requireLiteral(value.kind, ["heightfield", "static-collider"]);
  const base = [
    "kind",
    "traversalSurfaceId",
    "surfaceEntityId",
    "colliderSubshapeId",
    "resourceRef",
    "resolvedVersion",
    "resourceHash"
  ];
  const row = kind === "heightfield" ? exactDataRecord(value, base) : exactDataRecord(value, [
    ...base,
    "logicalSurfaceId",
    "logicalSubshapeId",
    "colliderHash",
    "traversalSurfaceProfileRef",
    "traversalSurfaceProfileResolvedVersion",
    "traversalSurfaceProfileHash"
  ]);
  requireString(row.traversalSurfaceId);
  requireString(row.surfaceEntityId);
  requireString(row.colliderSubshapeId);
  requireString(row.resourceRef);
  requireString(row.resolvedVersion);
  requireHash(row.resourceHash);
  if (kind === "static-collider") {
    requireString(row.logicalSurfaceId);
    requireString(row.logicalSubshapeId);
    requireHash(row.colliderHash);
    requireString(row.traversalSurfaceProfileRef);
    requireString(row.traversalSurfaceProfileResolvedVersion);
    requireHash(row.traversalSurfaceProfileHash);
  }
}
function validateTraversal(input) {
  const value = exactDataRecord(input, [
    "surfaces",
    "traversalAreas",
    "connectivityRequirements",
    "anchorEntityIds"
  ]);
  dataArray(value.surfaces).forEach(validateTraversalSurface);
  dataArray(value.traversalAreas).forEach((area) => {
    const row = exactDataRecord(area, [
      "id",
      "kind",
      "pointsMetersXZ",
      "surfaceEntityId",
      "mode"
    ]);
    requireString(row.id);
    requireLiteral(row.kind, ["polygon-xz"]);
    dataArray(row.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
    requireString(row.surfaceEntityId);
    requireLiteral(row.mode, ["blocked"]);
  });
  dataArray(value.connectivityRequirements).forEach((requirement) => {
    const row = exactDataRecord(requirement, [
      "constraintId",
      "kind",
      "traversingEntityId",
      "startAnchorEntityId",
      "destinationAnchorEntityId",
      "routeId"
    ]);
    requireString(row.constraintId);
    requireLiteral(row.kind, ["connected-by-route"]);
    requireString(row.traversingEntityId);
    requireString(row.startAnchorEntityId);
    requireString(row.destinationAnchorEntityId);
    requireString(row.routeId);
  });
  requireStringArray(value.anchorEntityIds);
}
function validateStaticCollider(input) {
  const value = exactDataRecord(input, [
    "entityId",
    "logicalSubshapeId",
    "colliderSubshapeId",
    "transform",
    "shape",
    "colliderHash"
  ]);
  requireString(value.entityId);
  requireString(value.logicalSubshapeId);
  requireString(value.colliderSubshapeId);
  validateTransform(value.transform);
  validatePrimitive(value.shape, ["box", "sphere", "cylinder"]);
  requireHash(value.colliderHash);
}
function validateInitialRelationships(input, subjectsByEntityId, initialControlledEntityId) {
  const relationshipIds = /* @__PURE__ */ new Set();
  const occupiedRiderEntityIds = /* @__PURE__ */ new Set();
  const occupiedMountSlotKeys = /* @__PURE__ */ new Set();
  let previousRelationshipId;
  dataArray(input).forEach((relationship) => {
    const row = exactDataRecord(relationship, [
      "id",
      "type",
      "schemaVersion",
      "riderEntityId",
      "mountEntityId",
      "mountSlotId",
      "establishedSimulationTick"
    ]);
    const id2 = requireString(row.id);
    if (relationshipIds.has(id2) || previousRelationshipId !== void 0 && id2.localeCompare(previousRelationshipId) <= 0) return invalidExecutionPlanV5();
    relationshipIds.add(id2);
    previousRelationshipId = id2;
    requireLiteral(row.type, ["mountedOn"]);
    requireLiteral(row.schemaVersion, [1]);
    const riderEntityId = requireString(row.riderEntityId);
    const mountEntityId = requireString(row.mountEntityId);
    const mountSlotId = requireString(row.mountSlotId);
    if (riderEntityId === mountEntityId) return invalidExecutionPlanV5();
    if (requireSafeNonNegativeInteger(row.establishedSimulationTick) !== 0) {
      return invalidExecutionPlanV5();
    }
    const rider = subjectsByEntityId.get(riderEntityId);
    const mount = subjectsByEntityId.get(mountEntityId);
    if (rider === void 0 || mount === void 0) return invalidExecutionPlanV5();
    if (occupiedRiderEntityIds.has(riderEntityId)) return invalidExecutionPlanV5();
    occupiedRiderEntityIds.add(riderEntityId);
    const mountSlotKey = `${mountEntityId}\0${mountSlotId}`;
    if (occupiedMountSlotKeys.has(mountSlotKey)) return invalidExecutionPlanV5();
    occupiedMountSlotKeys.add(mountSlotKey);
    if (initialControlledEntityId !== mountEntityId) return invalidExecutionPlanV5();
    const mountSlot = dataArray(mount.mountSlots).map(dataRecord).find((slot) => slot.id === mountSlotId);
    if (mountSlot === void 0) return invalidExecutionPlanV5();
    const mountSocketId = requireString(mountSlot.mountSocketId);
    const relationshipProfile = dataArray(
      dataRecord(mount.capabilityAssembly).relationshipProfiles
    ).map(dataRecord).find(
      (profile) => profile.resourceRef === "worldkit://relationship-profile/mounted-on.stand-ground@1" && profile.relationshipType === "mountedOn"
    );
    if (relationshipProfile === void 0) return invalidExecutionPlanV5();
    const requiredRiderSocketIds = dataArray(
      relationshipProfile.requiredRiderSocketIds
    ).map(requireString);
    const requiredMountSocketIds = dataArray(
      relationshipProfile.requiredMountSocketIds
    ).map(requireString);
    const riderSocketIds = new Set(
      dataArray(rider.sockets).map((socket) => requireString(dataRecord(socket).id))
    );
    const mountSocketIds = new Set(
      dataArray(mount.sockets).map((socket) => requireString(dataRecord(socket).id))
    );
    if (requiredRiderSocketIds.some((socketId) => !riderSocketIds.has(socketId)) || requiredMountSocketIds.some((socketId) => !mountSocketIds.has(socketId)) || !requiredMountSocketIds.includes(mountSocketId)) return invalidExecutionPlanV5();
  });
}
function deepFreezeExecutionPlan(value) {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreezeExecutionPlan);
  return Object.freeze(value);
}
function parseExecutionPlanV5(input) {
  try {
    const snapshot = snapshotExecutionPlanData(input);
    const plan = exactDataRecord(snapshot, EXECUTION_PLAN_V5_FIELDS);
    requireLiteral(plan.kind, ["worldkit-execution-plan"]);
    requireLiteral(plan.schemaVersion, [5]);
    requireString(plan.id);
    requireSafeNonNegativeInteger(plan.seed);
    requireLiteral(plan.runtimeBackend, ["babylon-havok"]);
    requireHash(plan.normalizedWorldIrHash);
    requireHash(plan.resourceLockHash);
    requireLiteral(plan.coordinateSystem, [
      "right-handed-y-up-minus-z-forward"
    ]);
    requireTuple(plan.gravityMetersPerSecondSquaredXYZ, 3);
    requireLiteral(plan.atmospherePreset, [
      "clear-day",
      "golden-hour",
      "overcast",
      "night"
    ]);
    validateTerrain(plan.terrain);
    dataArray(plan.waters).forEach(validateWater);
    dataArray(plan.objects).forEach(validateObject);
    dataArray(plan.subjectAssets).forEach(validateSubjectAsset$1);
    dataArray(plan.rigProfiles).forEach(validateRigProfile$1);
    dataArray(plan.animationSets).forEach(validateAnimationSet$1);
    dataArray(plan.colliderProfiles).forEach(validateColliderProfile$1);
    const initialControlledEntityId = requireString(
      plan.initialControlledEntityId
    );
    const subjectEntityIds = /* @__PURE__ */ new Set();
    const subjectsByEntityId = /* @__PURE__ */ new Map();
    dataArray(plan.subjects).forEach((subject) => {
      validateSubject(subject);
      const entityId = requireString(dataRecord(subject).entityId);
      if (subjectEntityIds.has(entityId)) return invalidExecutionPlanV5();
      subjectEntityIds.add(entityId);
      subjectsByEntityId.set(entityId, dataRecord(subject));
    });
    if (!subjectEntityIds.has(initialControlledEntityId)) {
      return invalidExecutionPlanV5();
    }
    validateInitialRelationships(
      plan.initialRelationships,
      subjectsByEntityId,
      initialControlledEntityId
    );
    validateCamera(plan.camera);
    if (!subjectEntityIds.has(
      requireString(dataRecord(plan.camera).targetEntityId)
    )) return invalidExecutionPlanV5();
    const usage = exactDataRecord(plan.resourceUsage, [
      "vertices",
      "triangles",
      "colliders"
    ]);
    requireSafeNonNegativeInteger(usage.vertices);
    requireSafeNonNegativeInteger(usage.triangles);
    requireSafeNonNegativeInteger(usage.colliders);
    validateLayout(plan.layout);
    requireHash(plan.authoringSpecHash);
    const resourceLockEntries = canonicalExecutionResourceLockEntriesV1(
      plan.resourceLockEntries
    );
    if (sha256CanonicalJson(resourceLockEntries) !== plan.resourceLockHash) return invalidExecutionPlanV5();
    plan.resourceLockEntries = resourceLockEntries;
    validateTraversal(plan.traversal);
    dataArray(plan.staticColliders).forEach(validateStaticCollider);
    return deepFreezeExecutionPlan(plan);
  } catch {
    return invalidExecutionPlanV5();
  }
}
function hashExecutionPlanV5(input) {
  return sha256CanonicalJson(parseExecutionPlanV5(input));
}
const TRAVERSAL_SURFACE_PROFILE_RESOURCE_KIND = "traversal-surface-profile";
function canonicalIdentityBaseV4(spec, normalizedBase) {
  return {
    kind: spec.kind,
    schemaVersion: spec.schemaVersion,
    id: spec.id,
    seed: spec.seed,
    ...spec.provenance === void 0 ? {} : { provenance: structuredClone(spec.provenance) },
    world: structuredClone(spec.world),
    resources: structuredClone(normalizedBase.resources),
    layout: structuredClone(spec.layout),
    spatial: {
      regions: [...spec.spatial.regions].sort((left, right) => left.id.localeCompare(right.id)).map((row) => structuredClone(row)),
      routes: [...spec.spatial.routes].sort((left, right) => left.id.localeCompare(right.id)).map((row) => structuredClone(row)),
      screenRegions: [...spec.spatial.screenRegions].sort((left, right) => left.id.localeCompare(right.id)).map((row) => structuredClone(row))
    },
    nodes: [...spec.nodes].sort((left, right) => left.id.localeCompare(right.id)).map((node) => {
      if ((node.kind === "object" || node.kind === "anchor") && node.placement.kind === "solved") {
        return {
          ...structuredClone(node),
          placement: {
            ...structuredClone(node.placement),
            placementConstraintIds: [
              ...node.placement.placementConstraintIds
            ].sort()
          }
        };
      }
      if (node.kind === "camera") {
        return {
          ...structuredClone(node),
          components: {
            cameraRig: {
              ...structuredClone(node.components.cameraRig),
              allowedRigRefs: [
                ...node.components.cameraRig.allowedRigRefs
              ].sort()
            }
          }
        };
      }
      return structuredClone(node);
    }),
    relationships: [...spec.relationships].sort((left, right) => left.id.localeCompare(right.id)).map((row) => structuredClone(row)),
    rules: [...spec.rules].sort((left, right) => left.id.localeCompare(right.id)).map((row) => structuredClone(row)),
    startup: structuredClone(spec.startup),
    constraints: {
      placements: [...spec.constraints.placements].sort((left, right) => left.id.localeCompare(right.id)).map((constraint) => {
        if (constraint.kind !== "minimum-clearance") {
          return structuredClone(constraint);
        }
        return constraint.otherEntityIds === void 0 ? {
          ...structuredClone(constraint),
          semanticClassIds: [...constraint.semanticClassIds].sort()
        } : {
          ...structuredClone(constraint),
          otherEntityIds: [...constraint.otherEntityIds].sort()
        };
      })
    }
  };
}
function projectNormalizedWorldResourcesToLayoutIdentityV4(resources) {
  const prototypes = resources.prototypes.map((prototype) => {
    const {
      traversalSurfaceBindings: _traversalSurfaceBindings,
      ...projectedPrototype
    } = structuredClone(prototype);
    return projectedPrototype;
  });
  const resourceLock = canonicalExecutionResourceLockEntriesV1(
    resources.resourceLock.filter(
      (entry) => entry.resourceKind !== TRAVERSAL_SURFACE_PROFILE_RESOURCE_KIND
    )
  );
  return {
    ...structuredClone(resources),
    prototypes,
    resourceLock,
    resourceLockHash: sha256CanonicalJson(resourceLock)
  };
}
function hashAuthoringDocumentV4(spec) {
  return sha256CanonicalJson(spec);
}
function canonicalAuthoringLayoutIdentityV4(spec, normalizedBase) {
  return canonicalIdentityBaseV4(spec, {
    ...normalizedBase,
    resources: projectNormalizedWorldResourcesToLayoutIdentityV4(
      normalizedBase.resources
    )
  });
}
function hashAuthoringLayoutInputV4(spec, normalizedBase) {
  return sha256CanonicalJson(
    canonicalAuthoringLayoutIdentityV4(spec, normalizedBase)
  );
}
const BUILT_IN_LAYOUT_SOLVER_PROFILE_REF = "worldkit://layout-solver-profile/outdoor.s1@1";
const BUILT_IN_OUTDOOR_PROFILE = {
  kind: "layout-solver-profile",
  schemaVersion: 1,
  candidateGeneration: {
    gridSpacingMeters: 2,
    boundarySampleSpacingMeters: 1,
    routeSampleSpacingMeters: 1,
    yawStepDegrees: 45
  },
  quantization: {
    positionStepMeters: 1e-3,
    rotationStepRadians: 1e-6,
    ratioStep: 1e-6,
    scoreStep: 1e-6
  },
  tolerances: {
    distanceMeters: 0.01,
    angleDegrees: 1,
    supportGapMeters: 0.02,
    overlapMeters: 1e-3
  },
  budgets: {
    maximumConstraints: 128,
    maximumCandidatesPerEntity: 4096,
    maximumSearchNodes: 1e5,
    maximumConflictChecks: 1e5,
    maximumDiagnostics: 256
  }
};
function deepFreeze$4(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze$4(child);
  return Object.freeze(value);
}
function resolveLayoutSolverProfileV1(resourceRef) {
  if (resourceRef !== BUILT_IN_LAYOUT_SOLVER_PROFILE_REF) {
    throw new Error(`LAYOUT_SOLVER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }
  const profile = deepFreeze$4(structuredClone(BUILT_IN_OUTDOOR_PROFILE));
  const contentHash2 = sha256Bytes(canonicalJsonBytes(profile));
  return deepFreeze$4({
    resourceRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHash2,
    profile
  });
}
const EPSILON = 1e-9;
function assertFinite(value) {
  if (!Number.isFinite(value)) throw new Error("LAYOUT_GEOMETRY_NON_FINITE");
}
function assertFiniteVector(values) {
  values.forEach(assertFinite);
}
function quantizeFinite(value, step) {
  assertFinite(value);
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("LAYOUT_QUANTIZATION_STEP_INVALID");
  }
  const quantized = Math.round(value / step) * step;
  const normalized = Number(quantized.toPrecision(15));
  return Object.is(normalized, -0) ? 0 : normalized;
}
function validatePolygonXZ(points) {
  if (points.length < 3) return "LAYOUT_POLYGON_DEGENERATE";
  points.forEach(assertFiniteVector);
  const origin = points[0];
  let doubledArea = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next2 = points[index + 1];
    doubledArea += orientXZV1(origin, current, next2);
  }
  return Math.abs(doubledArea) <= EPSILON ? "LAYOUT_POLYGON_DEGENERATE" : void 0;
}
function pointOnSegment(point, start, end) {
  const cross2 = orientXZV1(start, end, point);
  if (Math.abs(cross2) > EPSILON) return false;
  const dot2 = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return dot2 >= -EPSILON && dot2 <= squaredLength + EPSILON;
}
function pointInPolygonXZ(point, polygon) {
  assertFiniteVector(point);
  const invalid2 = validatePolygonXZ(polygon);
  if (invalid2 !== void 0) throw new Error(invalid2);
  let inside = false;
  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const crosses = current[1] > point[1] !== previous[1] > point[1] && point[0] < (previous[0] - current[0]) * (point[1] - current[1]) / (previous[1] - current[1]) + current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}
function pointToSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared)
  );
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dz));
}
function pointToPolygonBoundaryDistanceMeters(point, polygon) {
  assertFiniteVector(point);
  const invalid2 = validatePolygonXZ(polygon);
  if (invalid2 !== void 0) throw new Error(invalid2);
  let distance2 = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    distance2 = Math.min(
      distance2,
      pointToSegmentDistance(point, polygon[index], polygon[(index + 1) % polygon.length])
    );
  }
  return distance2;
}
function validateAabb(bounds) {
  assertFiniteVector(bounds.minimumMetersXYZ);
  assertFiniteVector(bounds.maximumMetersXYZ);
  for (let axis = 0; axis < 3; axis += 1) {
    if (bounds.minimumMetersXYZ[axis] > bounds.maximumMetersXYZ[axis]) {
      throw new Error("LAYOUT_AABB_INVALID");
    }
  }
}
function aabbSeparationMeters(left, right) {
  validateAabb(left);
  validateAabb(right);
  const gaps = [0, 1, 2].map(
    (axis) => Math.max(
      0,
      right.minimumMetersXYZ[axis] - left.maximumMetersXYZ[axis],
      left.minimumMetersXYZ[axis] - right.maximumMetersXYZ[axis]
    )
  );
  return Math.hypot(gaps[0], gaps[1], gaps[2]);
}
function aabbOverlapDepthMetersXYZ(left, right) {
  validateAabb(left);
  validateAabb(right);
  const overlap = [0, 1, 2].map(
    (axis) => Math.min(left.maximumMetersXYZ[axis], right.maximumMetersXYZ[axis]) - Math.max(left.minimumMetersXYZ[axis], right.minimumMetersXYZ[axis])
  );
  return overlap.some((value) => value <= 0) ? void 0 : overlap;
}
function validateHeightfield(heightfield) {
  assertFiniteVector(heightfield.centerMetersXZ);
  assertFiniteVector(heightfield.sizeMetersXZ);
  const [columns, rows] = heightfield.resolutionVerticesXZ;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2 || heightfield.sizeMetersXZ[0] <= 0 || heightfield.sizeMetersXZ[1] <= 0 || heightfield.heightSamplesMeters.length !== columns * rows) {
    throw new Error("LAYOUT_HEIGHTFIELD_INVALID");
  }
  heightfield.heightSamplesMeters.forEach(assertFinite);
}
function sampleHeightfieldV1(heightfield, pointMetersXZ) {
  validateHeightfield(heightfield);
  assertFiniteVector(pointMetersXZ);
  const sample = sampleTriangleHeightfieldSurface(heightfield, pointMetersXZ);
  if (sample === void 0) return void 0;
  const normalXYZ = [
    quantizeFinite(sample.normalXYZ[0], 1e-6),
    quantizeFinite(sample.normalXYZ[1], 1e-6),
    quantizeFinite(sample.normalXYZ[2], 1e-6)
  ];
  return {
    heightMeters: quantizeFinite(sample.heightMeters, 1e-6),
    normalXYZ,
    slopeDegrees: quantizeFinite(sample.slopeDegrees, 1e-6)
  };
}
function sampleRoutePolylineV1(points, spacingMeters) {
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0 || points.length < 2) {
    throw new Error("LAYOUT_ROUTE_INVALID");
  }
  points.forEach(assertFiniteVector);
  const samples = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= EPSILON) throw new Error("LAYOUT_ROUTE_INVALID");
    for (let distance2 = spacingMeters; distance2 < length - EPSILON; distance2 += spacingMeters) {
      const ratio = distance2 / length;
      samples.push([
        quantizeFinite(start[0] + (end[0] - start[0]) * ratio, 1e-6),
        quantizeFinite(start[1] + (end[1] - start[1]) * ratio, 1e-6)
      ]);
    }
    samples.push(end);
  }
  return samples.filter(
    (point, index) => index === 0 || point[0] !== samples[index - 1][0] || point[1] !== samples[index - 1][1]
  );
}
function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}
function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}
function normalize(vector) {
  assertFiniteVector(vector);
  const length = Math.hypot(...vector);
  if (length <= EPSILON) throw new Error("LAYOUT_CAMERA_INVALID");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
function projectToScreenUv(camera, pointMetersXYZ) {
  assertFiniteVector(camera.positionMetersXYZ);
  assertFiniteVector(camera.targetMetersXYZ);
  assertFiniteVector(pointMetersXYZ);
  if (!Number.isFinite(camera.verticalFovDegrees) || camera.verticalFovDegrees <= 0 || camera.verticalFovDegrees >= 180 || !Number.isFinite(camera.aspectRatio) || camera.aspectRatio <= 0 || !Number.isFinite(camera.nearClipMeters) || !Number.isFinite(camera.farClipMeters) || camera.nearClipMeters <= 0 || camera.nearClipMeters >= camera.farClipMeters) {
    throw new Error("LAYOUT_CAMERA_INVALID");
  }
  const forward = normalize(subtract(camera.targetMetersXYZ, camera.positionMetersXYZ));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const delta = subtract(pointMetersXYZ, camera.positionMetersXYZ);
  const depth = dot(delta, forward);
  if (depth < camera.nearClipMeters || depth > camera.farClipMeters) return void 0;
  const halfHeight = depth * Math.tan(camera.verticalFovDegrees * Math.PI / 360);
  const ndcX = dot(delta, right) / (halfHeight * camera.aspectRatio);
  const ndcY = dot(delta, up) / halfHeight;
  return [
    quantizeFinite(0.5 + ndcX / 2, 1e-6),
    quantizeFinite(0.5 - ndcY / 2, 1e-6)
  ];
}
function normalizedTransform(transform, profile) {
  const rotation = transform.rotationEulerRadiansXYZ ?? [0, 0, 0];
  const scale = transform.scaleXYZ ?? [1, 1, 1];
  return {
    positionMetersXYZ: transform.positionMetersXYZ.map(
      (value) => quantizeFinite(value, profile.quantization.positionStepMeters)
    ),
    rotationEulerRadiansXYZ: rotation.map(
      (value) => quantizeFinite(value, profile.quantization.rotationStepRadians)
    ),
    scaleXYZ: scale.map(
      (value) => quantizeFinite(value, profile.quantization.ratioStep)
    )
  };
}
function boundsFor(transform, halfExtentsMetersXYZ, profile) {
  const scaledHalfExtents = halfExtentsMetersXYZ.map(
    (value, axis) => value * transform.scaleXYZ[axis]
  );
  if (scaledHalfExtents.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("LAYOUT_ENTITY_BOUNDS_INVALID");
  }
  const [x, y, z] = transform.rotationEulerRadiansXYZ;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rotation = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx]
  ];
  const rotatedHalfExtents = rotation.map(
    (row) => row.reduce(
      (sum2, coefficient, axis) => sum2 + Math.abs(coefficient) * scaledHalfExtents[axis],
      0
    )
  );
  return {
    minimumMetersXYZ: transform.positionMetersXYZ.map(
      (value, axis) => quantizeFinite(
        value - rotatedHalfExtents[axis],
        profile.quantization.positionStepMeters
      )
    ),
    maximumMetersXYZ: transform.positionMetersXYZ.map(
      (value, axis) => quantizeFinite(
        value + rotatedHalfExtents[axis],
        profile.quantization.positionStepMeters
      )
    )
  };
}
function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
function regionGridPoints(polygon, spacingMeters) {
  const xs = polygon.map((point) => point[0]);
  const zs = polygon.map((point) => point[1]);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumZ = Math.min(...zs);
  const maximumZ = Math.max(...zs);
  const result2 = [];
  for (let x = minimumX; x <= maximumX + 1e-9; x += spacingMeters) {
    for (let z = minimumZ; z <= maximumZ + 1e-9; z += spacingMeters) {
      const point = [x, z];
      if (pointInPolygonXZ(point, polygon)) result2.push(point);
    }
  }
  return result2;
}
function yawDegrees(profile) {
  const step = profile.candidateGeneration.yawStepDegrees;
  if (!Number.isFinite(step) || step <= 0 || step > 360) {
    throw new Error("LAYOUT_YAW_STEP_INVALID");
  }
  const values = [];
  for (let yaw = 0; yaw < 360 - 1e-9; yaw += step) values.push(yaw);
  return values;
}
function generateLayoutCandidatesV1(input, profile) {
  const candidateNumbers = [
    profile.candidateGeneration.gridSpacingMeters,
    profile.candidateGeneration.boundarySampleSpacingMeters,
    profile.candidateGeneration.routeSampleSpacingMeters,
    profile.candidateGeneration.yawStepDegrees
  ];
  if (candidateNumbers.some((value) => !Number.isFinite(value) || value <= 0) || profile.candidateGeneration.yawStepDegrees > 360 || !Number.isInteger(profile.budgets.maximumCandidatesPerEntity) || profile.budgets.maximumCandidatesPerEntity < 1) {
    throw new Error("LAYOUT_CANDIDATE_PROFILE_INVALID");
  }
  const { entity } = input;
  const candidates = [];
  const transformKeys = /* @__PURE__ */ new Set();
  const push = (source, transformInput, isInitial = false) => {
    const transform = normalizedTransform(transformInput, profile);
    const key = JSON.stringify(transform);
    if (transformKeys.has(key)) return;
    if (candidates.length >= profile.budgets.maximumCandidatesPerEntity) {
      throw new Error(
        `LAYOUT_CANDIDATE_BUDGET_EXCEEDED: '${entity.id}' exceeds ${profile.budgets.maximumCandidatesPerEntity} candidates.`
      );
    }
    transformKeys.add(key);
    candidates.push({
      entityId: entity.id,
      isInitial,
      source,
      transform,
      bounds: boundsFor(transform, entity.halfExtentsMetersXYZ, profile),
      localCostRatio: source.kind === "fixed" || source.kind === "initial" ? 0 : source.kind === "region-grid" ? 0.1 : source.kind === "region-boundary" ? 0.2 : source.kind === "route" ? 0.3 : 0.4
    });
  };
  if (entity.placement.kind === "fixed") {
    push({ kind: "fixed" }, entity.placement.transform, true);
  } else {
    if (entity.placement.initialTransform !== void 0) {
      push({ kind: "initial" }, entity.placement.initialTransform, true);
    }
    const regionsById = new Map(input.regions.map((region) => [region.id, region]));
    const routesById = new Map(input.routes.map((route) => [route.id, route]));
    const heightfield = entity.supportingTerrainEntityId === void 0 ? void 0 : input.geometry.heightfieldsByTerrainEntityId[entity.supportingTerrainEntityId];
    const yFor = (point) => {
      const sample = heightfield === void 0 ? void 0 : sampleHeightfieldV1(heightfield, point);
      return (sample?.heightMeters ?? 0) + entity.halfExtentsMetersXYZ[1];
    };
    const addPointWithYaws = (point, sourceForYaw) => {
      for (const yaw of yawDegrees(profile)) {
        push(sourceForYaw(yaw), {
          positionMetersXYZ: [point[0], yFor(point), point[1]],
          rotationEulerRadiansXYZ: [0, yaw * Math.PI / 180, 0],
          scaleXYZ: [1, 1, 1]
        });
      }
    };
    for (const regionId of sortedUnique(entity.candidateRegionIds)) {
      const region = regionsById.get(regionId);
      if (region === void 0) throw new Error(`LAYOUT_REGION_NOT_FOUND: '${regionId}'.`);
      const invalid2 = validatePolygonXZ(region.pointsMetersXZ);
      if (invalid2 !== void 0) throw new Error(`${invalid2}: '${regionId}'.`);
      regionGridPoints(
        region.pointsMetersXZ,
        profile.candidateGeneration.gridSpacingMeters
      ).forEach(
        (point, sampleIndex) => addPointWithYaws(point, (yaw) => ({
          kind: "region-grid",
          regionId,
          sampleIndex,
          yawDegrees: yaw
        }))
      );
    }
    for (const regionId of sortedUnique(entity.candidateRegionIds)) {
      const region = regionsById.get(regionId);
      const closed = [...region.pointsMetersXZ, region.pointsMetersXZ[0]];
      sampleRoutePolylineV1(
        closed,
        profile.candidateGeneration.boundarySampleSpacingMeters
      ).forEach(
        (point, sampleIndex) => addPointWithYaws(point, (yaw) => ({
          kind: "region-boundary",
          regionId,
          sampleIndex,
          yawDegrees: yaw
        }))
      );
    }
    for (const routeId of sortedUnique(entity.candidateRouteIds)) {
      const route = routesById.get(routeId);
      if (route === void 0) throw new Error(`LAYOUT_ROUTE_NOT_FOUND: '${routeId}'.`);
      sampleRoutePolylineV1(
        route.pointsMetersXZ,
        profile.candidateGeneration.routeSampleSpacingMeters
      ).forEach(
        (point, sampleIndex) => addPointWithYaws(point, (yaw) => ({
          kind: "route",
          routeId,
          sampleIndex,
          yawDegrees: yaw
        }))
      );
    }
    for (const anchorEntityId of sortedUnique(entity.explicitAnchorEntityIds)) {
      const transform = input.anchorsByEntityId[anchorEntityId];
      if (transform === void 0) {
        throw new Error(`LAYOUT_ANCHOR_NOT_FOUND: '${anchorEntityId}'.`);
      }
      push({ kind: "anchor", anchorEntityId }, transform);
    }
  }
  return candidates.map((candidate, index) => ({
    ...candidate,
    id: `${entity.id}:${candidate.source.kind}:${String(index).padStart(6, "0")}`
  }));
}
function resolveCamera(camera, assignments) {
  if (camera.kind === "fixed") return { camera };
  const targetAnchor = assignments[camera.targetAnchorEntityId];
  if (targetAnchor === void 0) return void 0;
  const target = [
    targetAnchor.transform.positionMetersXYZ[0],
    targetAnchor.transform.positionMetersXYZ[1] + camera.targetHeightMeters,
    targetAnchor.transform.positionMetersXYZ[2]
  ];
  const horizontalDistance = Math.cos(camera.pitchRadians) * camera.distanceMeters;
  return {
    camera: {
      kind: "fixed",
      cameraEntityId: camera.cameraEntityId,
      positionMetersXYZ: [
        target[0],
        target[1] + Math.sin(camera.pitchRadians) * camera.distanceMeters,
        target[2] + horizontalDistance
      ],
      targetMetersXYZ: target,
      verticalFovDegrees: camera.verticalFovDegrees,
      aspectRatio: camera.aspectRatio,
      nearClipMeters: camera.nearClipMeters,
      farClipMeters: camera.farClipMeters
    },
    targetAnchorEntityId: camera.targetAnchorEntityId
  };
}
function hasNonFinite(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasNonFinite);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasNonFinite);
  }
  return false;
}
function result(constraint, satisfied, measurements, tolerances, evidenceIds, violationCode) {
  return {
    constraintId: constraint.id,
    kind: constraint.kind,
    requirement: constraint.requirement,
    satisfied,
    preferenceCostRatio: constraint.requirement === "preferred" && !satisfied ? 1 : 0,
    measurements,
    tolerances,
    evidenceIds: [...evidenceIds].sort((left, right) => left.localeCompare(right)),
    ...violationCode === void 0 ? {} : { violationCode }
  };
}
function missing(constraint, evidenceIds) {
  return result(
    constraint,
    false,
    {},
    {},
    evidenceIds,
    "PLACEMENT_REFERENCE_NOT_FOUND"
  );
}
function nonFinite(constraint) {
  return result(
    constraint,
    false,
    {},
    {},
    [],
    "PLACEMENT_NON_FINITE_MEASUREMENT"
  );
}
function footprintCorners(bounds) {
  return [
    [bounds.minimumMetersXYZ[0], bounds.minimumMetersXYZ[2]],
    [bounds.maximumMetersXYZ[0], bounds.minimumMetersXYZ[2]],
    [bounds.maximumMetersXYZ[0], bounds.maximumMetersXYZ[2]],
    [bounds.minimumMetersXYZ[0], bounds.maximumMetersXYZ[2]]
  ];
}
function pointInsideFootprint(point, bounds) {
  return point[0] >= bounds.minimumMetersXYZ[0] && point[0] <= bounds.maximumMetersXYZ[0] && point[1] >= bounds.minimumMetersXYZ[2] && point[1] <= bounds.maximumMetersXYZ[2];
}
function orientation(a, b, c) {
  return orientXZV1(a, b, c);
}
function segmentsIntersect(a, b, c, d) {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  const onSegment = (start, point, end) => point[0] >= Math.min(start[0], end[0]) - 1e-9 && point[0] <= Math.max(start[0], end[0]) + 1e-9 && point[1] >= Math.min(start[1], end[1]) - 1e-9 && point[1] <= Math.max(start[1], end[1]) + 1e-9;
  if (Math.abs(first) <= 1e-9 && onSegment(a, c, b)) return true;
  if (Math.abs(second) <= 1e-9 && onSegment(a, d, b)) return true;
  if (Math.abs(third) <= 1e-9 && onSegment(c, a, d)) return true;
  if (Math.abs(fourth) <= 1e-9 && onSegment(c, b, d)) return true;
  return first > 0 !== second > 0 && third > 0 !== fourth > 0;
}
function footprintIntersectsPolygon(bounds, polygon) {
  const corners = footprintCorners(bounds);
  if (corners.some((corner) => pointInPolygonXZ(corner, polygon))) return true;
  if (polygon.some((point) => pointInsideFootprint(point, bounds))) return true;
  for (let left = 0; left < corners.length; left += 1) {
    for (let right = 0; right < polygon.length; right += 1) {
      if (segmentsIntersect(
        corners[left],
        corners[(left + 1) % corners.length],
        polygon[right],
        polygon[(right + 1) % polygon.length]
      )) return true;
    }
  }
  return false;
}
function distancePointToAabbFootprint(point, bounds) {
  const dx = Math.max(
    0,
    bounds.minimumMetersXYZ[0] - point[0],
    point[0] - bounds.maximumMetersXYZ[0]
  );
  const dz = Math.max(
    0,
    bounds.minimumMetersXYZ[2] - point[1],
    point[1] - bounds.maximumMetersXYZ[2]
  );
  return Math.hypot(dx, dz);
}
function evaluateInside(context, constraint, assignments) {
  const assignment = assignments[constraint.entityId];
  const region = context.regionsById[constraint.regionId];
  if (assignment === void 0 || region === void 0) return missing(constraint, [constraint.entityId, constraint.regionId]);
  const corners = footprintCorners(assignment.bounds);
  const isInside = corners.every((corner) => pointInPolygonXZ(corner, region.pointsMetersXZ));
  const minimumClearanceMeters = Math.min(
    ...corners.map((corner) => pointToPolygonBoundaryDistanceMeters(corner, region.pointsMetersXZ))
  );
  const satisfied = isInside && minimumClearanceMeters + context.profile.tolerances.distanceMeters >= constraint.boundaryClearanceMeters;
  return result(
    constraint,
    satisfied,
    {
      isInside,
      minimumBoundaryClearanceMeters: quantizeFinite(minimumClearanceMeters, context.profile.quantization.positionStepMeters)
    },
    { distanceMeters: context.profile.tolerances.distanceMeters },
    [constraint.entityId, constraint.regionId],
    satisfied ? void 0 : "PLACEMENT_REGION_CONSTRAINT_UNSATISFIED"
  );
}
function evaluateOutside(context, constraint, assignments) {
  const assignment = assignments[constraint.entityId];
  const region = context.regionsById[constraint.regionId];
  if (assignment === void 0 || region === void 0) return missing(constraint, [constraint.entityId, constraint.regionId]);
  const intersects = footprintIntersectsPolygon(assignment.bounds, region.pointsMetersXZ);
  const clearanceMeters = intersects ? 0 : Math.min(
    ...footprintCorners(assignment.bounds).map(
      (corner) => pointToPolygonBoundaryDistanceMeters(corner, region.pointsMetersXZ)
    ),
    ...region.pointsMetersXZ.map((point) => distancePointToAabbFootprint(point, assignment.bounds))
  );
  const satisfied = !intersects && clearanceMeters + context.profile.tolerances.distanceMeters >= constraint.boundaryClearanceMeters;
  return result(
    constraint,
    satisfied,
    {
      intersectsRegion: intersects,
      minimumBoundaryClearanceMeters: quantizeFinite(clearanceMeters, context.profile.quantization.positionStepMeters)
    },
    { distanceMeters: context.profile.tolerances.distanceMeters },
    [constraint.entityId, constraint.regionId],
    satisfied ? void 0 : "PLACEMENT_REGION_CONSTRAINT_UNSATISFIED"
  );
}
function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
function evaluateDistance(context, constraint, assignments) {
  const entity = assignments[constraint.entityId];
  const reference = assignments[constraint.referenceEntityId];
  if (entity === void 0 || reference === void 0) return missing(constraint, [constraint.entityId, constraint.referenceEntityId]);
  const distanceMeters = distance(entity.transform.positionMetersXYZ, reference.transform.positionMetersXYZ);
  const tolerance = context.profile.tolerances.distanceMeters;
  const satisfied = distanceMeters + tolerance >= constraint.minimumDistanceMeters && distanceMeters - tolerance <= constraint.maximumDistanceMeters;
  return result(
    constraint,
    satisfied,
    { distanceMeters: quantizeFinite(distanceMeters, context.profile.quantization.positionStepMeters) },
    { distanceMeters: tolerance },
    [constraint.entityId, constraint.referenceEntityId],
    satisfied ? void 0 : "PLACEMENT_DISTANCE_RANGE_UNSATISFIED"
  );
}
function evaluateFacing(context, constraint, assignments) {
  const facing = assignments[constraint.facingEntityId];
  const target = assignments[constraint.targetEntityId];
  if (facing === void 0 || target === void 0) return missing(constraint, [constraint.facingEntityId, constraint.targetEntityId]);
  const yaw = facing.transform.rotationEulerRadiansXYZ[1];
  const forward = [-Math.sin(yaw), -Math.cos(yaw)];
  const dx = target.transform.positionMetersXYZ[0] - facing.transform.positionMetersXYZ[0];
  const dz = target.transform.positionMetersXYZ[2] - facing.transform.positionMetersXYZ[2];
  const targetLength = Math.hypot(dx, dz);
  if (targetLength === 0) return missing(constraint, [constraint.facingEntityId, constraint.targetEntityId]);
  const cosine = Math.max(-1, Math.min(1, (forward[0] * dx + forward[1] * dz) / targetLength));
  const angleDegrees = Math.acos(cosine) * 180 / Math.PI;
  const satisfied = angleDegrees <= constraint.maximumAngularDeviationDegrees + context.profile.tolerances.angleDegrees;
  return result(
    constraint,
    satisfied,
    { angularDeviationDegrees: quantizeFinite(angleDegrees, context.profile.quantization.ratioStep) },
    { angleDegrees: context.profile.tolerances.angleDegrees },
    [constraint.facingEntityId, constraint.targetEntityId],
    satisfied ? void 0 : "PLACEMENT_FACING_CONSTRAINT_UNSATISFIED"
  );
}
function supportSamples(bounds) {
  const corners = footprintCorners(bounds);
  return [
    [
      (bounds.minimumMetersXYZ[0] + bounds.maximumMetersXYZ[0]) / 2,
      (bounds.minimumMetersXYZ[2] + bounds.maximumMetersXYZ[2]) / 2
    ],
    ...corners
  ];
}
function evaluateSupport(context, constraint, assignments) {
  const supported = assignments[constraint.supportedEntityId];
  if (supported === void 0) return missing(constraint, [constraint.supportedEntityId]);
  const terrain = context.geometry.heightfieldsByTerrainEntityId[constraint.supportingEntityId];
  const collider = context.geometry.collidersByEntityId?.[constraint.supportingEntityId];
  if (terrain === void 0 && collider === void 0) {
    const supportingBounds = assignments[constraint.supportingEntityId]?.bounds ?? context.geometry.staticBoundsByEntityId[constraint.supportingEntityId];
    if (supportingBounds === void 0) {
      return missing(constraint, [constraint.supportingEntityId]);
    }
    throw new Error(
      `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED: Supporting entity "${constraint.supportingEntityId}" only exposes an AABB; object supported-by requires its locked collider.`
    );
  }
  const bottom = supported.bounds.minimumMetersXYZ[1];
  const gaps = [];
  if (terrain !== void 0) {
    for (const point of supportSamples(supported.bounds)) {
      const sample = sampleHeightfieldV1(terrain, point);
      if (sample !== void 0) gaps.push(Math.abs(bottom - sample.heightMeters));
    }
  } else {
    for (const point of supportSamples(supported.bounds)) {
      const heightMeters = queryLockedColliderSupportHeightMeters(collider, point);
      if (heightMeters !== void 0) gaps.push(Math.abs(bottom - heightMeters));
    }
  }
  const maximumGap = gaps.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...gaps);
  const supportRatio = gaps.filter(
    (gap) => gap <= constraint.maximumSupportGapMeters + context.profile.tolerances.supportGapMeters
  ).length / supportSamples(supported.bounds).length;
  if (!Number.isFinite(maximumGap)) return missing(constraint, [constraint.supportingEntityId]);
  const satisfied = maximumGap <= constraint.maximumSupportGapMeters + context.profile.tolerances.supportGapMeters && supportRatio + context.profile.quantization.ratioStep >= constraint.minimumSupportRatio;
  return result(
    constraint,
    satisfied,
    { maximumSupportGapMeters: quantizeFinite(maximumGap, context.profile.quantization.positionStepMeters), supportRatio: quantizeFinite(supportRatio, context.profile.quantization.ratioStep) },
    { supportGapMeters: context.profile.tolerances.supportGapMeters },
    [constraint.supportedEntityId, constraint.supportingEntityId],
    satisfied ? void 0 : "PLACEMENT_SUPPORT_CONSTRAINT_UNSATISFIED"
  );
}
function evaluateClearance(context, constraint, assignments) {
  const entity = assignments[constraint.entityId];
  if (entity === void 0) return missing(constraint, [constraint.entityId]);
  const targetIds = constraint.otherEntityIds ?? Object.values(context.entitiesById).filter(
    (row) => row.id !== constraint.entityId && constraint.semanticClassIds?.includes(row.semanticClassId ?? "") === true
  ).map((row) => row.id);
  const targets = [...targetIds].sort((left, right) => left.localeCompare(right));
  if (targets.length === 0 || targets.some((id2) => assignments[id2] === void 0 && context.geometry.staticBoundsByEntityId[id2] === void 0)) {
    return missing(constraint, targets);
  }
  let minimumClearance = Number.POSITIVE_INFINITY;
  let hasOverlap = false;
  for (const targetId of targets) {
    const bounds = assignments[targetId]?.bounds ?? context.geometry.staticBoundsByEntityId[targetId];
    hasOverlap ||= aabbOverlapDepthMetersXYZ(entity.bounds, bounds) !== void 0;
    minimumClearance = Math.min(minimumClearance, aabbSeparationMeters(entity.bounds, bounds));
  }
  const satisfied = !hasOverlap && minimumClearance + context.profile.tolerances.overlapMeters >= constraint.clearanceMeters;
  return result(
    constraint,
    satisfied,
    { hasOverlap, minimumClearanceMeters: quantizeFinite(minimumClearance, context.profile.quantization.positionStepMeters) },
    { overlapMeters: context.profile.tolerances.overlapMeters },
    [constraint.entityId, ...targets],
    satisfied ? void 0 : "PLACEMENT_CLEARANCE_CONFLICT"
  );
}
function routeWidthSamples(points, widthMeters, spacingMeters) {
  const centerline = sampleRoutePolylineV1(points, spacingMeters);
  const result2 = [];
  centerline.forEach((point, index) => {
    const previous = centerline[Math.max(0, index - 1)];
    const next2 = centerline[Math.min(centerline.length - 1, index + 1)];
    const dx = next2[0] - previous[0];
    const dz = next2[1] - previous[1];
    const length = Math.hypot(dx, dz);
    const perpendicular = length === 0 ? [0, 0] : [-dz / length, dx / length];
    for (const offset of [-widthMeters / 2, 0, widthMeters / 2]) {
      result2.push([point[0] + perpendicular[0] * offset, point[1] + perpendicular[1] * offset]);
    }
  });
  return result2;
}
function evaluateSlope(context, constraint, assignments) {
  const terrain = context.geometry.heightfieldsByTerrainEntityId[constraint.terrainEntityId];
  if (terrain === void 0) return missing(constraint, [constraint.terrainEntityId]);
  let points;
  let lateralCount = 1;
  const evidenceIds = [constraint.terrainEntityId];
  if (constraint.entityId !== void 0) {
    const entity = assignments[constraint.entityId];
    if (entity === void 0) return missing(constraint, [constraint.entityId]);
    points = supportSamples(entity.bounds);
    evidenceIds.push(constraint.entityId);
  } else {
    const route = context.routesById[constraint.routeId];
    if (route === void 0) return missing(constraint, [constraint.routeId]);
    points = routeWidthSamples(
      route.pointsMetersXZ,
      route.widthMeters,
      context.profile.candidateGeneration.routeSampleSpacingMeters
    );
    lateralCount = 3;
    evidenceIds.push(constraint.routeId);
  }
  const samples = points.map((point) => sampleHeightfieldV1(terrain, point));
  if (samples.some((sample) => sample === void 0)) return missing(constraint, evidenceIds);
  const maximumSlopeDegrees = Math.max(...samples.map((sample) => sample.slopeDegrees));
  const satisfied = maximumSlopeDegrees <= constraint.maximumSlopeDegrees + context.profile.tolerances.angleDegrees;
  return result(
    constraint,
    satisfied,
    { maximumSlopeDegrees: quantizeFinite(maximumSlopeDegrees, context.profile.quantization.ratioStep), sampledPointCount: points.length, sampledLateralOffsetCount: lateralCount },
    { angleDegrees: context.profile.tolerances.angleDegrees },
    evidenceIds,
    satisfied ? void 0 : "PLACEMENT_SLOPE_LIMIT_EXCEEDED"
  );
}
function segmentIntersectsAabb(start, end, bounds) {
  let minimum = 0;
  let maximum = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-9) {
      if (start[axis] < bounds.minimumMetersXYZ[axis] || start[axis] > bounds.maximumMetersXYZ[axis]) return false;
      continue;
    }
    const first = (bounds.minimumMetersXYZ[axis] - start[axis]) / delta;
    const second = (bounds.maximumMetersXYZ[axis] - start[axis]) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum > 1e-3 && minimum < 0.999;
}
function isOccluded(context, assignments, cameraPosition, targetPosition, ignoredEntityIds) {
  for (const [entityId, assignment] of Object.entries(assignments)) {
    if (!ignoredEntityIds.includes(entityId) && segmentIntersectsAabb(cameraPosition, targetPosition, assignment.bounds)) return true;
  }
  for (const [entityId, bounds] of Object.entries(context.geometry.staticBoundsByEntityId)) {
    if (!ignoredEntityIds.includes(entityId) && segmentIntersectsAabb(cameraPosition, targetPosition, bounds)) return true;
  }
  for (const heightfield of Object.values(context.geometry.heightfieldsByTerrainEntityId)) {
    for (let index = 1; index < 32; index += 1) {
      const ratio = index / 32;
      const point = [
        cameraPosition[0] + (targetPosition[0] - cameraPosition[0]) * ratio,
        cameraPosition[1] + (targetPosition[1] - cameraPosition[1]) * ratio,
        cameraPosition[2] + (targetPosition[2] - cameraPosition[2]) * ratio
      ];
      const sample = sampleHeightfieldV1(heightfield, [point[0], point[2]]);
      if (sample !== void 0 && sample.heightMeters > point[1] + context.profile.tolerances.supportGapMeters) return true;
    }
  }
  return false;
}
function evaluateVisibility(context, constraint, assignments) {
  const visible = assignments[constraint.visibleEntityId];
  const cameraQuery = context.geometry.camerasByEntityId[constraint.cameraEntityId];
  const screenRegion = context.screenRegionsById[constraint.screenRegionId];
  if (visible === void 0 || cameraQuery === void 0 || screenRegion === void 0) {
    return missing(constraint, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId]);
  }
  const resolvedCamera = resolveCamera(cameraQuery, assignments);
  if (resolvedCamera === void 0) {
    return missing(constraint, [
      constraint.visibleEntityId,
      constraint.cameraEntityId,
      constraint.screenRegionId,
      ...cameraQuery.kind === "third-person" ? [cameraQuery.targetAnchorEntityId] : []
    ]);
  }
  const camera = resolvedCamera.camera;
  const corners = [];
  for (const x of [visible.bounds.minimumMetersXYZ[0], visible.bounds.maximumMetersXYZ[0]]) {
    for (const y of [visible.bounds.minimumMetersXYZ[1], visible.bounds.maximumMetersXYZ[1]]) {
      for (const z of [visible.bounds.minimumMetersXYZ[2], visible.bounds.maximumMetersXYZ[2]]) {
        corners.push([x, y, z]);
      }
    }
  }
  const projected = corners.map((point) => projectToScreenUv(camera, point)).filter(
    (point) => point !== void 0
  );
  if (projected.length === 0) {
    return result(constraint, false, { projectedAreaRatio: 0, visibleRatio: 0, isOccluded: false }, { ratio: context.profile.quantization.ratioStep }, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId], "PLACEMENT_CAMERA_PROJECTED_AREA_TOO_SMALL");
  }
  const minimumU = Math.min(...projected.map((point) => point[0]));
  const maximumU = Math.max(...projected.map((point) => point[0]));
  const minimumV = Math.min(...projected.map((point) => point[1]));
  const maximumV = Math.max(...projected.map((point) => point[1]));
  const projectedArea = Math.max(0, maximumU - minimumU) * Math.max(0, maximumV - minimumV);
  const intersectionArea = Math.max(0, Math.min(maximumU, screenRegion.maximumUv[0]) - Math.max(minimumU, screenRegion.minimumUv[0])) * Math.max(0, Math.min(maximumV, screenRegion.maximumUv[1]) - Math.max(minimumV, screenRegion.minimumUv[1]));
  const occluded = isOccluded(
    context,
    assignments,
    camera.positionMetersXYZ,
    visible.transform.positionMetersXYZ,
    [
      constraint.visibleEntityId,
      constraint.cameraEntityId,
      ...resolvedCamera.targetAnchorEntityId === void 0 ? [] : [resolvedCamera.targetAnchorEntityId]
    ]
  );
  const visibleRatio = occluded || projectedArea === 0 ? 0 : intersectionArea / projectedArea;
  const measurements = {
    projectedAreaRatio: quantizeFinite(projectedArea, context.profile.quantization.ratioStep),
    visibleRatio: quantizeFinite(visibleRatio, context.profile.quantization.ratioStep),
    isOccluded: occluded,
    ...resolvedCamera.targetAnchorEntityId === void 0 ? {} : { cameraTargetAnchorEntityId: resolvedCamera.targetAnchorEntityId }
  };
  const tolerance = context.profile.quantization.ratioStep;
  if (projectedArea + tolerance < constraint.minimumProjectedAreaRatio) {
    return result(constraint, false, measurements, { ratio: tolerance }, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId], "PLACEMENT_CAMERA_PROJECTED_AREA_TOO_SMALL");
  }
  if (occluded) {
    return result(constraint, false, measurements, { ratio: tolerance }, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId], "PLACEMENT_CAMERA_REGION_OCCLUDED");
  }
  const satisfied = visibleRatio + tolerance >= constraint.minimumVisibleRatio;
  return result(
    constraint,
    satisfied,
    measurements,
    { ratio: tolerance },
    [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId],
    satisfied ? void 0 : "PLACEMENT_CAMERA_REGION_UNSATISFIED"
  );
}
function evaluatePlacementConstraintV1(context, constraint, assignments) {
  if (hasNonFinite(constraint)) return nonFinite(constraint);
  switch (constraint.kind) {
    case "inside-region":
      return evaluateInside(context, constraint, assignments);
    case "outside-region":
      return evaluateOutside(context, constraint, assignments);
    case "distance-range":
      return evaluateDistance(context, constraint, assignments);
    case "faces-entity":
      return evaluateFacing(context, constraint, assignments);
    case "supported-by":
      return evaluateSupport(context, constraint, assignments);
    case "minimum-clearance":
      return evaluateClearance(context, constraint, assignments);
    case "within-slope-limit":
      return evaluateSlope(context, constraint, assignments);
    case "visible-in-camera-region":
      return evaluateVisibility(context, constraint, assignments);
  }
}
function hashLayoutSolveReportV1(report) {
  if (Object.hasOwn(report, "layoutSolveReportHash")) {
    throw new Error("LAYOUT_REPORT_SELF_HASH_FORBIDDEN");
  }
  return sha256CanonicalJson(report);
}
function duplicate(values) {
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return void 0;
}
function validateInput(input, profile) {
  const diagnostics = [];
  const add = (instancePath, entityId) => {
    diagnostics.push({
      severity: "error",
      code: "PLACEMENT_INPUT_INVALID",
      instancePath,
      ...entityId === void 0 ? {} : { entityId }
    });
  };
  if (input.kind !== "worldkit-resolved-layout-input" || input.schemaVersion !== 1 || !Number.isInteger(input.seed) || input.seed < 0) add("");
  const hashPattern = /^sha256:[a-f0-9]{64}$/;
  if (!hashPattern.test(input.authoringSpecHash)) add("/authoringSpecHash");
  if (!hashPattern.test(input.layoutInputHash)) add("/layoutInputHash");
  if (!hashPattern.test(input.registryLockHash)) add("/registryLockHash");
  if (input.solverProfile.contentHash !== sha256CanonicalJson(profile) || !hashPattern.test(input.solverProfile.contentHash)) add("/solverProfile/contentHash");
  if (!/^worldkit:\/\/layout-solver-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    input.solverProfile.solverProfileRef
  )) add("/solverProfile/solverProfileRef");
  if (!/^[1-9][0-9]*$/.test(input.solverProfile.resolvedVersion)) {
    add("/solverProfile/resolvedVersion");
  }
  const worldBoundsValues = [
    ...input.worldBounds.minimumMetersXYZ,
    ...input.worldBounds.maximumMetersXYZ
  ];
  if (worldBoundsValues.some((value) => !Number.isFinite(value)) || [0, 1, 2].some(
    (axis) => input.worldBounds.minimumMetersXYZ[axis] > input.worldBounds.maximumMetersXYZ[axis]
  )) add("/worldBounds");
  if (input.constraints.length > profile.budgets.maximumConstraints) add("/constraints");
  const duplicateEntityId = duplicate(input.entities.map((entity) => entity.id));
  if (duplicateEntityId !== void 0) add("/entities", duplicateEntityId);
  if (duplicate(input.constraints.map((constraint) => constraint.id)) !== void 0) add("/constraints");
  if (duplicate(input.regions.map((region) => region.id)) !== void 0) add("/regions");
  if (duplicate(input.routes.map((route) => route.id)) !== void 0) add("/routes");
  if (duplicate(input.screenRegions.map((region) => region.id)) !== void 0) add("/screenRegions");
  if (!Number.isInteger(profile.budgets.maximumSearchNodes) || profile.budgets.maximumSearchNodes < 1 || !Number.isInteger(profile.budgets.maximumConflictChecks) || profile.budgets.maximumConflictChecks < 0 || !Number.isInteger(profile.budgets.maximumDiagnostics) || profile.budgets.maximumDiagnostics < 1) add("/solverProfile/budgets");
  return diagnostics.slice(0, Math.max(1, profile.budgets.maximumDiagnostics));
}
function constraintEntityIds$1(constraint, input) {
  const domainIds = new Set(input.entities.map((entity) => entity.id));
  const onlyDomains = (ids) => ids.filter((id2) => domainIds.has(id2));
  switch (constraint.kind) {
    case "inside-region":
    case "outside-region":
      return onlyDomains([constraint.entityId]);
    case "distance-range":
      return onlyDomains([constraint.entityId, constraint.referenceEntityId]);
    case "faces-entity":
      return onlyDomains([constraint.facingEntityId, constraint.targetEntityId]);
    case "supported-by":
      return onlyDomains([constraint.supportedEntityId, constraint.supportingEntityId]);
    case "minimum-clearance": {
      if (constraint.otherEntityIds !== void 0) {
        return onlyDomains([constraint.entityId, ...constraint.otherEntityIds]);
      }
      const semanticIds = input.entities.filter(
        (entity) => entity.id !== constraint.entityId && constraint.semanticClassIds.includes(entity.semanticClassId ?? "")
      ).map((entity) => entity.id);
      return onlyDomains([constraint.entityId, ...semanticIds]);
    }
    case "within-slope-limit":
      return onlyDomains(constraint.entityId === void 0 ? [] : [constraint.entityId]);
    case "visible-in-camera-region":
      return [...domainIds].sort((left, right) => left.localeCompare(right));
  }
}
function evaluationContext(input, profile) {
  return {
    profile,
    entitiesById: Object.fromEntries(
      input.entities.map((entity) => [entity.id, {
        id: entity.id,
        ...entity.semanticClassId === void 0 ? {} : { semanticClassId: entity.semanticClassId }
      }])
    ),
    regionsById: Object.fromEntries(input.regions.map((region) => [region.id, region])),
    routesById: Object.fromEntries(input.routes.map((route) => [route.id, route])),
    screenRegionsById: Object.fromEntries(
      input.screenRegions.map((region) => [region.id, region])
    ),
    geometry: input.geometry
  };
}
function candidateInsideWorld(candidate, input) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (candidate.bounds.minimumMetersXYZ[axis] < input.worldBounds.minimumMetersXYZ[axis] || candidate.bounds.maximumMetersXYZ[axis] > input.worldBounds.maximumMetersXYZ[axis]) return false;
  }
  return true;
}
function stableDomains(input, profile) {
  return new Map(
    input.entities.map((entity) => {
      const candidates = generateLayoutCandidatesV1(
        {
          entity,
          regions: input.regions,
          routes: input.routes,
          anchorsByEntityId: input.anchorsByEntityId,
          geometry: input.geometry
        },
        profile
      ).filter((candidate) => candidateInsideWorld(candidate, input));
      return [entity.id, [...candidates].sort(
        (left, right) => Number(right.isInitial) - Number(left.isInitial) || left.localCostRatio - right.localCostRatio || left.transform.positionMetersXYZ[0] - right.transform.positionMetersXYZ[0] || left.transform.positionMetersXYZ[1] - right.transform.positionMetersXYZ[1] || left.transform.positionMetersXYZ[2] - right.transform.positionMetersXYZ[2] || left.transform.rotationEulerRadiansXYZ[0] - right.transform.rotationEulerRadiansXYZ[0] || left.transform.rotationEulerRadiansXYZ[1] - right.transform.rotationEulerRadiansXYZ[1] || left.transform.rotationEulerRadiansXYZ[2] - right.transform.rotationEulerRadiansXYZ[2] || left.id.localeCompare(right.id)
      )];
    })
  );
}
function search(input, profile, constraints, domains, stopAtFirst) {
  const context = evaluationContext(input, profile);
  const variables = [...input.entities].sort(
    (left, right) => (domains.get(left.id)?.length ?? 0) - (domains.get(right.id)?.length ?? 0) || left.id.localeCompare(right.id)
  );
  let searchNodeCount = 0;
  let budgetExceeded = false;
  let bestAssignment;
  let bestEvaluations;
  let bestPreferenceCostRatio;
  let bestLocalCostRatio;
  let bestSignature;
  const compareAndStore = (assignment, evaluations) => {
    if (evaluations.some(
      (evaluation) => evaluation.requirement === "required" && !evaluation.satisfied
    )) return;
    const preferenceWeight = constraints.reduce(
      (sum2, constraint) => sum2 + (constraint.requirement === "preferred" ? constraint.preferenceWeightRatio : 0),
      0
    );
    const preferenceCost = quantizeFinite(
      evaluations.reduce((sum2, evaluation) => {
        const constraint = constraints.find((row) => row.id === evaluation.constraintId);
        return sum2 + (constraint.requirement === "preferred" ? constraint.preferenceWeightRatio * evaluation.preferenceCostRatio : 0);
      }, 0) / (preferenceWeight === 0 ? 1 : preferenceWeight),
      profile.quantization.scoreStep
    );
    const localCost = quantizeFinite(
      Object.values(assignment).reduce((sum2, candidate) => sum2 + candidate.localCostRatio, 0),
      profile.quantization.scoreStep
    );
    const signature = JSON.stringify(
      Object.fromEntries(Object.keys(assignment).sort().map((id2) => [id2, assignment[id2].id]))
    );
    if (bestAssignment === void 0 || preferenceCost < bestPreferenceCostRatio || preferenceCost === bestPreferenceCostRatio && localCost < bestLocalCostRatio || preferenceCost === bestPreferenceCostRatio && localCost === bestLocalCostRatio && signature.localeCompare(bestSignature) < 0) {
      bestAssignment = { ...assignment };
      bestEvaluations = evaluations;
      bestPreferenceCostRatio = preferenceCost;
      bestLocalCostRatio = localCost;
      bestSignature = signature;
    }
  };
  const visit2 = (index, assignment) => {
    if (budgetExceeded || stopAtFirst && bestAssignment !== void 0) return;
    if (index === variables.length) {
      const evaluations = constraints.map(
        (constraint) => evaluatePlacementConstraintV1(context, constraint, assignment)
      );
      compareAndStore(assignment, evaluations);
      return;
    }
    const variable = variables[index];
    for (const candidate of domains.get(variable.id) ?? []) {
      searchNodeCount += 1;
      if (searchNodeCount > profile.budgets.maximumSearchNodes) {
        budgetExceeded = true;
        return;
      }
      assignment[variable.id] = candidate;
      const readyRequired = constraints.filter(
        (constraint) => constraint.requirement === "required" && constraintEntityIds$1(constraint, input).every((id2) => assignment[id2] !== void 0)
      );
      const hasViolation = readyRequired.some(
        (constraint) => !evaluatePlacementConstraintV1(context, constraint, assignment).satisfied
      );
      if (!hasViolation) visit2(index + 1, assignment);
      delete assignment[variable.id];
      if (budgetExceeded || stopAtFirst && bestAssignment !== void 0) return;
    }
  };
  if ([...domains.values()].some((candidates) => candidates.length === 0)) {
    return { budgetExceeded: false, searchNodeCount: 0 };
  }
  visit2(0, {});
  return {
    ...bestAssignment === void 0 ? {} : { bestAssignment },
    ...bestEvaluations === void 0 ? {} : { bestEvaluations },
    ...bestPreferenceCostRatio === void 0 ? {} : { bestPreferenceCostRatio },
    budgetExceeded,
    searchNodeCount
  };
}
function orderedRecord(rows) {
  return Object.fromEntries(
    [...rows].sort(([left], [right]) => left.localeCompare(right))
  );
}
function reportBase(input, status) {
  return {
    kind: "worldkit-layout-solve-report",
    schemaVersion: 1,
    id: `${input.id}-layout`,
    authoringSpecHash: input.authoringSpecHash,
    layoutInputHash: input.layoutInputHash,
    registryLockHash: input.registryLockHash,
    solverProfileRef: input.solverProfile.solverProfileRef,
    resolvedVersion: input.solverProfile.resolvedVersion,
    solverProfileHash: input.solverProfile.contentHash,
    seed: input.seed,
    status
  };
}
function finish(report) {
  const output = {
    status: report.status,
    report,
    layoutSolveReportHash: hashLayoutSolveReportV1(report)
  };
  const deepFreeze2 = (value) => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze2);
    return Object.freeze(value);
  };
  return deepFreeze2(output);
}
function constraintTouchesEntity(constraint, entityId, input) {
  return constraintEntityIds$1(constraint, input).includes(entityId);
}
function solvedPlacements(input, assignment, evaluations, profile) {
  return orderedRecord(
    Object.keys(assignment).map((entityId) => {
      const candidate = assignment[entityId];
      const related = evaluations.filter((evaluation) => {
        const constraint = input.constraints.find((row) => row.id === evaluation.constraintId);
        return constraintTouchesEntity(constraint, entityId, input);
      });
      const weight = related.reduce((sum2, evaluation) => {
        const constraint = input.constraints.find((row) => row.id === evaluation.constraintId);
        return sum2 + (constraint.requirement === "preferred" ? constraint.preferenceWeightRatio : 0);
      }, 0);
      const cost = related.reduce((sum2, evaluation) => {
        const constraint = input.constraints.find((row) => row.id === evaluation.constraintId);
        return sum2 + (constraint.requirement === "preferred" ? constraint.preferenceWeightRatio * evaluation.preferenceCostRatio : 0);
      }, 0) / (weight === 0 ? 1 : weight);
      return [entityId, {
        entityId,
        candidateId: candidate.id,
        candidateSource: candidate.source,
        transform: candidate.transform,
        satisfiedConstraintIds: related.filter((row) => row.satisfied).map((row) => row.constraintId).sort(),
        preferenceCostRatio: quantizeFinite(cost, profile.quantization.scoreStep)
      }];
    })
  );
}
function solveLayoutV1(input, profile) {
  const inputDiagnostics = validateInput(input, profile);
  if (inputDiagnostics.length > 0) {
    return finish({
      ...reportBase(input, "invalid-input"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: inputDiagnostics,
      searchNodeCount: 0,
      conflictCheckCount: 0,
      conflictConstraintIds: []
    });
  }
  let domains;
  try {
    domains = stableDomains(input, profile);
  } catch {
    return finish({
      ...reportBase(input, "invalid-input"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: [{ severity: "error", code: "PLACEMENT_INPUT_INVALID", instancePath: "/entities" }],
      searchNodeCount: 0,
      conflictCheckCount: 0,
      conflictConstraintIds: []
    });
  }
  const emptyDomainEntity = [...domains.entries()].filter(([, candidates]) => candidates.length === 0).map(([entityId]) => entityId).sort((left, right) => left.localeCompare(right))[0];
  if (emptyDomainEntity !== void 0) {
    return finish({
      ...reportBase(input, "unsatisfied"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: [{
        severity: "error",
        code: "PLACEMENT_REGION_HAS_NO_CANDIDATE",
        instancePath: "/entities",
        entityId: emptyDomainEntity,
        repairOperations: ["increase-region-area", "add-explicit-anchor"]
      }],
      searchNodeCount: 0,
      conflictCheckCount: 0,
      conflictConstraintIds: []
    });
  }
  const main2 = search(input, profile, input.constraints, domains, false);
  if (main2.budgetExceeded) {
    return finish({
      ...reportBase(input, "budget-exceeded"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: [{ severity: "error", code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED", instancePath: "/solverProfile/budgets/maximumSearchNodes" }],
      searchNodeCount: main2.searchNodeCount,
      conflictCheckCount: 0,
      conflictConstraintIds: []
    });
  }
  if (main2.bestAssignment !== void 0 && main2.bestEvaluations !== void 0) {
    return finish({
      ...reportBase(input, "solved"),
      placementsByEntityId: solvedPlacements(
        input,
        main2.bestAssignment,
        main2.bestEvaluations,
        profile
      ),
      constraintResultsById: orderedRecord(
        main2.bestEvaluations.map((evaluation) => [evaluation.constraintId, evaluation])
      ),
      totalPreferenceCostRatio: main2.bestPreferenceCostRatio ?? 0,
      diagnostics: [],
      searchNodeCount: main2.searchNodeCount,
      conflictCheckCount: 0,
      conflictConstraintIds: []
    });
  }
  let core2 = input.constraints.filter((constraint) => constraint.requirement === "required").sort((left, right) => left.id.localeCompare(right.id));
  let conflictCheckCount = 0;
  for (const constraint of [...core2]) {
    conflictCheckCount += 1;
    if (conflictCheckCount > profile.budgets.maximumConflictChecks) {
      return finish({
        ...reportBase(input, "budget-exceeded"),
        placementsByEntityId: {},
        constraintResultsById: {},
        totalPreferenceCostRatio: 0,
        diagnostics: [{ severity: "error", code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED", instancePath: "/solverProfile/budgets/maximumConflictChecks" }],
        searchNodeCount: main2.searchNodeCount,
        conflictCheckCount,
        conflictConstraintIds: []
      });
    }
    const without = core2.filter((row) => row.id !== constraint.id);
    const check = search(input, profile, without, domains, true);
    if (check.budgetExceeded) {
      return finish({
        ...reportBase(input, "budget-exceeded"),
        placementsByEntityId: {},
        constraintResultsById: {},
        totalPreferenceCostRatio: 0,
        diagnostics: [{ severity: "error", code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED", instancePath: "/solverProfile/budgets/maximumSearchNodes" }],
        searchNodeCount: main2.searchNodeCount + check.searchNodeCount,
        conflictCheckCount,
        conflictConstraintIds: []
      });
    }
    if (check.bestAssignment === void 0) core2 = without;
  }
  const conflictConstraintIds = core2.map((constraint) => constraint.id);
  return finish({
    ...reportBase(input, "unsatisfied"),
    placementsByEntityId: {},
    constraintResultsById: {},
    totalPreferenceCostRatio: 0,
    diagnostics: [{
      severity: "error",
      code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
      instancePath: "/constraints",
      constraintIds: conflictConstraintIds,
      repairOperations: ["add-explicit-anchor", "split-required-constraints"]
    }],
    searchNodeCount: main2.searchNodeCount,
    conflictCheckCount,
    conflictConstraintIds
  });
}
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
const FIRST_SLICE_ALLOWED_OVERRIDE_PATHS = [
  "profiles.controlFeelProfileRef",
  "profiles.controlProfileRef",
  "profiles.motion.defaultMotionProfileRef"
];
const OVERRIDE_PATH_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/;
function assertAllowedOverridePath(path2) {
  if (!FIRST_SLICE_ALLOWED_OVERRIDE_PATHS.some(
    (allowedPath) => allowedPath === path2
  )) {
    throw new Error(`SUBJECT_OVERRIDE_FORBIDDEN: '${path2}'.`);
  }
}
function validateAllowedOverridePaths(resourceRef, paths) {
  if (!Array.isArray(paths)) {
    throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
  }
  const seen = /* @__PURE__ */ new Set();
  let previous;
  for (const path2 of paths) {
    if (typeof path2 !== "string" || !OVERRIDE_PATH_PATTERN.test(path2)) {
      throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
    }
    if (seen.has(path2)) {
      throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
    }
    seen.add(path2);
    if (!isNil(previous) && previous.localeCompare(path2) >= 0) {
      throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
    }
    previous = path2;
    assertAllowedOverridePath(path2);
  }
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
const AI_SCHEMA_PROJECTION_PROFILE_ALLOWED_KEYS = /* @__PURE__ */ new Set([
  "kind",
  "schemaVersion",
  "id",
  "version",
  "resourceRef",
  "authoringAvailability",
  "aiMetadata",
  "maximumPropertyCount",
  "maximumNestingDepth",
  "maximumEnumValueCount",
  "maximumSchemaBytes",
  "maximumRegistrySearchResultCount",
  "optionalFieldMode",
  "contentHash"
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
function deepFreeze$3(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze$3(child);
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
function sortedStrings$1(values) {
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
          animationClipNames: sortedStrings$1(input.inventory.animationClipNames)
        },
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings$1(input.aiMetadata.semanticTags)
        }
      };
    case "rig-profile":
      return {
        ...input,
        compatibleSubjectAssetRefs: sortedStrings$1(input.compatibleSubjectAssetRefs),
        requiredBoneIds: sortedStrings$1(input.requiredBoneIds),
        sourceNodeNameByBoneId: Object.fromEntries(
          Object.entries(input.sourceNodeNameByBoneId).sort(([left], [right]) => left.localeCompare(right))
        ),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings$1(input.aiMetadata.semanticTags)
        }
      };
    case "animation-set":
      return {
        ...input,
        requiredActionIds: sortedStrings$1(input.requiredActionIds),
        animationBindings: [...input.animationBindings].sort((left, right) => left.actionId.localeCompare(right.actionId)),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings$1(input.aiMetadata.semanticTags)
        }
      };
    case "collider-profile":
      return {
        ...input,
        supportedBodyTopologies: sortedStrings$1(input.supportedBodyTopologies),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings$1(input.aiMetadata.semanticTags)
        }
      };
    case "subject-definition":
      return {
        ...input,
        allowedOverridePaths: sortedStrings$1(input.allowedOverridePaths),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings$1(input.aiMetadata.semanticTags)
        }
      };
    default:
      return {
        ...input,
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings$1(input.aiMetadata.semanticTags)
        }
      };
  }
}
function lockResource(source) {
  const { contentHash: _ignoredContentHash, ...sourceWithoutContentHash } = source;
  const hashInput = canonicalizeNewResourceCollections(
    sourceWithoutContentHash
  );
  return deepFreeze$3({
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
function validateAiSchemaProjectionProfile(source) {
  const unknownField2 = Object.keys(source).find(
    (fieldName) => !AI_SCHEMA_PROJECTION_PROFILE_ALLOWED_KEYS.has(fieldName)
  );
  if (unknownField2 !== void 0) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_FIELD: '${unknownField2}' in '${source.resourceRef}'.`
    );
  }
  if (source.schemaVersion !== 1) {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`
    );
  }
  if (source.authoringAvailability !== "recommended" && source.authoringAvailability !== "advanced" && source.authoringAvailability !== "experimental") {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`
    );
  }
  const budgetFields = [
    source.maximumPropertyCount,
    source.maximumNestingDepth,
    source.maximumEnumValueCount,
    source.maximumSchemaBytes,
    source.maximumRegistrySearchResultCount
  ];
  if (budgetFields.some(
    (value) => !Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)
  )) {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`
    );
  }
  if (source.optionalFieldMode !== "native-optional" && source.optionalFieldMode !== "required-nullable-with-round-trip-map") {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`
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
  validateAllowedOverridePaths(source.resourceRef, source.allowedOverridePaths);
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
  const distance2 = parameters.distanceMeters;
  const minimumPitch = parameters.minimumPitchRadians;
  const maximumPitch = parameters.maximumPitchRadians;
  const pitch = parameters.pitchRadians;
  return containsInvalidNumber || minimumDistance !== void 0 && maximumDistance !== void 0 && minimumDistance > maximumDistance || distance2 !== void 0 && minimumDistance !== void 0 && distance2 < minimumDistance || distance2 !== void 0 && maximumDistance !== void 0 && distance2 > maximumDistance || minimumPitch !== void 0 && maximumPitch !== void 0 && minimumPitch > maximumPitch || pitch !== void 0 && minimumPitch !== void 0 && pitch < minimumPitch || pitch !== void 0 && maximumPitch !== void 0 && pitch > maximumPitch || parameters.horizontalDeadZoneRatio !== void 0 && parameters.horizontalDeadZoneRatio > 1 || parameters.verticalDeadZoneRatio !== void 0 && parameters.verticalDeadZoneRatio > 1 || parameters.baseFovDegrees !== void 0 && (parameters.baseFovDegrees <= 0 || parameters.baseFovDegrees >= 180) || parameters.baseFovDegrees !== void 0 && parameters.maximumSpeedFovDegrees !== void 0 && parameters.baseFovDegrees + parameters.maximumSpeedFovDegrees >= 180 || parameters.lookSensitivityXRatio !== void 0 && parameters.lookSensitivityXRatio <= 0 || parameters.lookSensitivityYRatio !== void 0 && parameters.lookSensitivityYRatio <= 0;
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
      const resourceRef = source.resourceRef;
      if (!("schemaVersion" in source) || source.schemaVersion !== 3) {
        throw new Error(
          `SUBJECT_REGISTRY_SUBJECT_DEFINITION_VERSION_NOT_SUPPORTED: '${resourceRef}'.`
        );
      }
      validateSubjectDefinitionV3(source);
    }
    if (source.kind === "ai-schema-projection-profile") {
      validateAiSchemaProjectionProfile(source);
    }
    if (source.kind === "motion-kernel") validateMotionKernel(source);
    validateCanonicalizedSemanticTags(source);
    resourcesByRef.set(source.resourceRef, lockResource(source));
  }
  validateReferences(resourcesByRef);
  const stableResources = deepFreeze$3(
    [...resourcesByRef.values()].sort(
      (left, right) => left.resourceRef.localeCompare(right.resourceRef)
    )
  );
  const resolveResource = (resourceRef) => resourcesByRef.get(resourceRef);
  function listDiscoverableResources(filter) {
    if (filter?.kind === void 0) return stableResources;
    return deepFreeze$3(stableResources.filter(
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
    },
    resolveAiSchemaProjectionProfile(resourceRef) {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "ai-schema-projection-profile" ? resource : void 0;
    }
  });
}
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
  allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
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
  allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
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
  allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
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
  allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
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
const profiles = /* @__PURE__ */ JSON.parse('[{"kind":"camera-rig-profile","id":"first-person.standard","version":1,"resourceRef":"worldkit://camera-profile/first-person.standard@1","authoringAvailability":"recommended","baseMode":"first-person","algorithmRef":"worldkit://camera-rig/socket-first-person@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"off","preferredSocketIds":["FirstPersonView"],"parameters":{"distanceMeters":0,"minimumDistanceMeters":0,"maximumDistanceMeters":0,"targetHeightMeters":1.64,"shoulderOffsetMeters":0,"pitchRadians":0,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":30,"horizontalPositionDampingPerSecond":30,"verticalPositionDampingPerSecond":30,"maximumPositionLagMeters":0.1,"rotationDampingPerSecond":24,"yawDampingPerSecond":24,"pitchDampingPerSecond":20,"collisionRadiusMeters":0.05,"collisionRetractionMetersPerSecond":40,"collisionRecoveryMetersPerSecond":12,"baseFovDegrees":70,"speedFovDegreesPerMeterPerSecond":0,"maximumSpeedFovDegrees":0,"lookAheadSeconds":0,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.25,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":24,"fovDampingPerSecond":12,"horizontalDeadZoneRatio":0,"verticalDeadZoneRatio":0,"recenterDelaySeconds":0,"recenterDurationSeconds":0,"recenterMinimumSpeedMetersPerSecond":0,"teleportSnapDistanceMeters":8,"lookSensitivityXRatio":0.8,"lookSensitivityYRatio":0.7},"authoringRanges":{"targetHeightMeters":{"minimum":0,"maximum":3,"step":0.02},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":5,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Standard First Person","description":"Stable socket first-person view for subjects that expose FirstPersonView.","semanticTags":["first-person","standard"]}},{"kind":"camera-rig-profile","id":"orbit.medium","version":1,"resourceRef":"worldkit://camera-profile/orbit.medium@1","authoringAvailability":"recommended","baseMode":"free-orbit","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"view","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"off","preferredSocketIds":["ThirdPersonTarget","CameraTarget3D"],"parameters":{"distanceMeters":5,"minimumDistanceMeters":0.5,"maximumDistanceMeters":20,"targetHeightMeters":1.25,"shoulderOffsetMeters":0,"pitchRadians":0.22,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":18,"horizontalPositionDampingPerSecond":18,"verticalPositionDampingPerSecond":20,"maximumPositionLagMeters":2.5,"rotationDampingPerSecond":20,"yawDampingPerSecond":16,"pitchDampingPerSecond":14,"collisionRadiusMeters":0.2,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":6,"baseFovDegrees":58,"speedFovDegreesPerMeterPerSecond":0.4,"maximumSpeedFovDegrees":4,"lookAheadSeconds":0,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.35,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":16,"fovDampingPerSecond":8,"horizontalDeadZoneRatio":0.08,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":1,"recenterDurationSeconds":1.2,"recenterMinimumSpeedMetersPerSecond":1.2,"teleportSnapDistanceMeters":12,"lookSensitivityXRatio":1,"lookSensitivityYRatio":0.8},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":20,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":20,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.01},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Medium Orbit","description":"General orbit view for medium controllable subjects.","semanticTags":["medium","orbit"]}},{"kind":"camera-rig-profile","id":"follow.medium","version":1,"resourceRef":"worldkit://camera-profile/follow.medium@1","authoringAvailability":"advanced","baseMode":"stable-follow","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"always","preferredSocketIds":["CameraTarget3D","ThirdPersonTarget"],"parameters":{"distanceMeters":6,"minimumDistanceMeters":0.5,"maximumDistanceMeters":20,"targetHeightMeters":1.1,"shoulderOffsetMeters":0,"pitchRadians":0.26,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":14,"horizontalPositionDampingPerSecond":14,"verticalPositionDampingPerSecond":16,"maximumPositionLagMeters":2,"rotationDampingPerSecond":16,"yawDampingPerSecond":9,"pitchDampingPerSecond":12,"collisionRadiusMeters":0.25,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":6,"baseFovDegrees":60,"speedFovDegreesPerMeterPerSecond":0.6,"maximumSpeedFovDegrees":5,"lookAheadSeconds":0.15,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.4,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":10,"fovDampingPerSecond":8,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.04,"recenterDelaySeconds":0.7,"recenterDurationSeconds":1,"recenterMinimumSpeedMetersPerSecond":0,"teleportSnapDistanceMeters":12,"lookSensitivityXRatio":0.9,"lookSensitivityYRatio":0.75},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":20,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":20,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Medium Follow","description":"Stable follow view for forward-steering subjects.","semanticTags":["follow","medium"]}},{"kind":"camera-rig-profile","id":"chase.surface-fast","version":1,"resourceRef":"worldkit://camera-profile/chase.surface-fast@1","authoringAvailability":"advanced","baseMode":"speed-chase","algorithmRef":"worldkit://camera-rig/velocity-chase@1","headingSource":"target-velocity","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"forward-motion","preferredSocketIds":["CameraTarget3D","LookAhead"],"parameters":{"distanceMeters":8,"minimumDistanceMeters":0.5,"maximumDistanceMeters":30,"targetHeightMeters":1.2,"shoulderOffsetMeters":0,"pitchRadians":0.18,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":11,"horizontalPositionDampingPerSecond":11,"verticalPositionDampingPerSecond":14,"maximumPositionLagMeters":3,"rotationDampingPerSecond":12,"yawDampingPerSecond":8,"pitchDampingPerSecond":10,"collisionRadiusMeters":0.3,"collisionRetractionMetersPerSecond":36,"collisionRecoveryMetersPerSecond":5,"baseFovDegrees":62,"speedFovDegreesPerMeterPerSecond":0.9,"maximumSpeedFovDegrees":12,"lookAheadSeconds":0.45,"accelerationLookAheadSecondsSquared":0.08,"transitionSeconds":0.45,"minimumHeadingSpeedMetersPerSecond":1,"velocityHeadingDampingPerSecond":8,"fovDampingPerSecond":6,"horizontalDeadZoneRatio":0.04,"verticalDeadZoneRatio":0.04,"recenterDelaySeconds":0.5,"recenterDurationSeconds":0.8,"recenterMinimumSpeedMetersPerSecond":2,"teleportSnapDistanceMeters":20,"lookSensitivityXRatio":0.85,"lookSensitivityYRatio":0.7},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":30,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":30,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Fast Surface Chase","description":"Velocity chase view for fast movement along a support surface.","semanticTags":["chase","fast","surface"]}},{"kind":"camera-rig-profile","id":"follow.water-surface","version":1,"resourceRef":"worldkit://camera-profile/follow.water-surface@1","authoringAvailability":"experimental","baseMode":"stable-follow","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"forward-motion","preferredSocketIds":["CameraTarget3D","LookAhead"],"parameters":{"distanceMeters":7,"minimumDistanceMeters":0.5,"maximumDistanceMeters":25,"targetHeightMeters":1.3,"shoulderOffsetMeters":0,"pitchRadians":0.3,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":10,"horizontalPositionDampingPerSecond":10,"verticalPositionDampingPerSecond":14,"maximumPositionLagMeters":2,"rotationDampingPerSecond":10,"yawDampingPerSecond":7,"pitchDampingPerSecond":10,"collisionRadiusMeters":0.3,"collisionRetractionMetersPerSecond":28,"collisionRecoveryMetersPerSecond":5,"baseFovDegrees":60,"speedFovDegreesPerMeterPerSecond":0.5,"maximumSpeedFovDegrees":5,"lookAheadSeconds":0.2,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.45,"minimumHeadingSpeedMetersPerSecond":0.3,"velocityHeadingDampingPerSecond":7,"fovDampingPerSecond":7,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.06,"recenterDelaySeconds":0.8,"recenterDurationSeconds":1.2,"recenterMinimumSpeedMetersPerSecond":0.5,"teleportSnapDistanceMeters":15,"lookSensitivityXRatio":0.8,"lookSensitivityYRatio":0.65},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":25,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":25,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Water Surface Follow","description":"Low-response follow view that preserves water horizon context.","semanticTags":["follow","surface","water"]}},{"kind":"camera-rig-profile","id":"flight.glide","version":1,"resourceRef":"worldkit://camera-profile/flight.glide@1","authoringAvailability":"experimental","baseMode":"flight-horizon","algorithmRef":"worldkit://camera-rig/flight-horizon@1","headingSource":"target-velocity","reverseHeadingPolicy":"follow-velocity","recenterMode":"forward-motion","preferredSocketIds":["CameraTarget3D","LookAhead"],"parameters":{"distanceMeters":9,"minimumDistanceMeters":1,"maximumDistanceMeters":30,"targetHeightMeters":1.4,"shoulderOffsetMeters":0,"pitchRadians":0.12,"minimumPitchRadians":-1,"maximumPitchRadians":1,"positionDampingPerSecond":8,"horizontalPositionDampingPerSecond":8,"verticalPositionDampingPerSecond":10,"maximumPositionLagMeters":5,"rotationDampingPerSecond":9,"yawDampingPerSecond":6,"pitchDampingPerSecond":8,"collisionRadiusMeters":0.25,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":4,"baseFovDegrees":64,"speedFovDegreesPerMeterPerSecond":0.8,"maximumSpeedFovDegrees":10,"lookAheadSeconds":0.6,"accelerationLookAheadSecondsSquared":0.1,"transitionSeconds":0.55,"minimumHeadingSpeedMetersPerSecond":2,"velocityHeadingDampingPerSecond":6,"fovDampingPerSecond":6,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":0.6,"recenterDurationSeconds":1,"recenterMinimumSpeedMetersPerSecond":2,"teleportSnapDistanceMeters":25,"lookSensitivityXRatio":0.75,"lookSensitivityYRatio":0.65},"authoringRanges":{"distanceMeters":{"minimum":1,"maximum":30,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":6,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1,"maximum":1,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":24,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Glide Flight","description":"Flight direction view with horizon and landing context.","semanticTags":["flight","glide","horizon"]}},{"kind":"camera-rig-profile","id":"follow.mounted","version":1,"resourceRef":"worldkit://camera-profile/follow.mounted@1","authoringAvailability":"experimental","baseMode":"stable-follow","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"target-forward","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"always","preferredSocketIds":["CameraTarget3D","ThirdPersonTarget"],"parameters":{"distanceMeters":7,"minimumDistanceMeters":0.5,"maximumDistanceMeters":25,"targetHeightMeters":1.5,"shoulderOffsetMeters":0,"pitchRadians":0.24,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":12,"horizontalPositionDampingPerSecond":12,"verticalPositionDampingPerSecond":14,"maximumPositionLagMeters":3,"rotationDampingPerSecond":12,"yawDampingPerSecond":8,"pitchDampingPerSecond":10,"collisionRadiusMeters":0.28,"collisionRetractionMetersPerSecond":30,"collisionRecoveryMetersPerSecond":5,"baseFovDegrees":61,"speedFovDegreesPerMeterPerSecond":0.6,"maximumSpeedFovDegrees":7,"lookAheadSeconds":0.25,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.5,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":8,"fovDampingPerSecond":7,"horizontalDeadZoneRatio":0.05,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":0.6,"recenterDurationSeconds":0.9,"recenterMinimumSpeedMetersPerSecond":0,"teleportSnapDistanceMeters":15,"lookSensitivityXRatio":0.82,"lookSensitivityYRatio":0.68},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":25,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":16,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"speedFovDegreesPerMeterPerSecond":{"minimum":0,"maximum":5,"step":0.05},"maximumSpeedFovDegrees":{"minimum":0,"maximum":30,"step":0.5},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.02},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Mounted Follow","description":"Follow view for committed seat or mount relationships.","semanticTags":["follow","mounted"]}},{"kind":"camera-rig-profile","id":"orbit.quadruped-official","version":1,"resourceRef":"worldkit://camera-profile/orbit.quadruped-official@1","authoringAvailability":"advanced","baseMode":"free-orbit","algorithmRef":"worldkit://camera-rig/orbit-follow@1","headingSource":"view","reverseHeadingPolicy":"preserve-target-forward","recenterMode":"forward-motion","preferredSocketIds":["ThirdPersonTarget","CameraTarget3D"],"parameters":{"distanceMeters":5,"minimumDistanceMeters":0.5,"maximumDistanceMeters":20,"targetHeightMeters":1.35,"shoulderOffsetMeters":0,"pitchRadians":0.22,"minimumPitchRadians":-1.2,"maximumPitchRadians":1.2,"positionDampingPerSecond":18,"horizontalPositionDampingPerSecond":18,"verticalPositionDampingPerSecond":20,"maximumPositionLagMeters":2.5,"rotationDampingPerSecond":20,"yawDampingPerSecond":16,"pitchDampingPerSecond":14,"collisionRadiusMeters":0.2,"collisionRetractionMetersPerSecond":4.5,"collisionRecoveryMetersPerSecond":3.25,"baseFovDegrees":58,"speedFovDegreesPerMeterPerSecond":0.4,"maximumSpeedFovDegrees":4,"lookAheadSeconds":0,"accelerationLookAheadSecondsSquared":0,"transitionSeconds":0.35,"minimumHeadingSpeedMetersPerSecond":0,"velocityHeadingDampingPerSecond":16,"fovDampingPerSecond":8,"horizontalDeadZoneRatio":0.08,"verticalDeadZoneRatio":0.05,"recenterDelaySeconds":1,"recenterDurationSeconds":1.2,"recenterMinimumSpeedMetersPerSecond":1.2,"teleportSnapDistanceMeters":12,"lookSensitivityXRatio":1,"lookSensitivityYRatio":0.8},"authoringRanges":{"distanceMeters":{"minimum":0.5,"maximum":20,"step":0.1},"targetHeightMeters":{"minimum":0,"maximum":5,"step":0.05},"shoulderOffsetMeters":{"minimum":-3,"maximum":3,"step":0.05},"pitchRadians":{"minimum":-1.2,"maximum":1.2,"step":0.01},"positionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"maximumPositionLagMeters":{"minimum":0,"maximum":20,"step":0.1},"rotationDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRadiusMeters":{"minimum":0,"maximum":2,"step":0.01},"baseFovDegrees":{"minimum":35,"maximum":100,"step":1},"lookAheadSeconds":{"minimum":0,"maximum":2,"step":0.01},"transitionSeconds":{"minimum":0,"maximum":3,"step":0.05},"horizontalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"verticalPositionDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"yawDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"pitchDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"collisionRetractionMetersPerSecond":{"minimum":0,"maximum":60,"step":0.5},"collisionRecoveryMetersPerSecond":{"minimum":0,"maximum":30,"step":0.25},"accelerationLookAheadSecondsSquared":{"minimum":0,"maximum":1,"step":0.01},"minimumHeadingSpeedMetersPerSecond":{"minimum":0,"maximum":20,"step":0.1},"velocityHeadingDampingPerSecond":{"minimum":0,"maximum":40,"step":0.25},"fovDampingPerSecond":{"minimum":0,"maximum":30,"step":0.25},"horizontalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"verticalDeadZoneRatio":{"minimum":0,"maximum":0.4,"step":0.01},"recenterDelaySeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterDurationSeconds":{"minimum":0,"maximum":5,"step":0.05},"recenterMinimumSpeedMetersPerSecond":{"minimum":0,"maximum":10,"step":0.1},"teleportSnapDistanceMeters":{"minimum":1,"maximum":100,"step":1},"lookSensitivityXRatio":{"minimum":0.1,"maximum":3,"step":0.05},"lookSensitivityYRatio":{"minimum":0.1,"maximum":3,"step":0.05}},"aiMetadata":{"displayName":"Quadruped Official Orbit","description":"Reviewed quadruped orbit default derived from the local tuning workspace.","semanticTags":["official","orbit","quadruped"]}}]');
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
const aiSchemaProjectionProfiles = [
  {
    kind: "ai-schema-projection-profile",
    schemaVersion: 1,
    id: "constrained-json",
    version: 1,
    resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
    authoringAvailability: "recommended",
    maximumPropertyCount: 512,
    maximumNestingDepth: 8,
    maximumEnumValueCount: 32,
    maximumSchemaBytes: 65536,
    maximumRegistrySearchResultCount: 32,
    optionalFieldMode: "native-optional",
    aiMetadata: {
      displayName: "Constrained JSON Schema Projection",
      description: "Provider-neutral JSON Schema 2020-12 projection with closed enum, optional-field, and byte budgets.",
      semanticTags: [
        "ai-schema",
        "constrained-json",
        "projection"
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
  ...poseAndRenderCatalog.renderBindings,
  ...aiSchemaProjectionProfiles
];
const BUILT_IN_CAPABILITY_MANIFESTS = CAPABILITY_MANIFESTS;
const subjectDefinitionsV3 = /* @__PURE__ */ JSON.parse('[{"kind":"subject-definition","schemaVersion":3,"id":"animal.quadruped.forward-steer","version":1,"resourceRef":"worldkit://subject-definition/animal.quadruped.forward-steer@1","authoringAvailability":"advanced","category":"animal","bodyTopology":"quadruped","semanticClassId":"subject.animal.quadruped","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"body","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.8,0.7,1.5]},"localTransform":{"positionMetersXYZ":[0,0.8,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["body"]},{"id":"head","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.55,0.55,0.6]},"localTransform":{"positionMetersXYZ":[0,0.95,-0.95],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["head"]},{"id":"legs","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.65,0.65,1.1]},"localTransform":{"positionMetersXYZ":[0,0.33,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["legs"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.9,-1.2],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]},{"id":"MountSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,1.25,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["mount","relationship"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1","worldkit://control-feel-profile/humanoid.heavy-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.mounted-on@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","allowedOverridePaths":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"],"aiMetadata":{"displayName":"Quadruped Forward Steer","description":"Whitebox quadruped using the reusable K02 forward-steer kernel.","semanticTags":["animal","forward-steer","quadruped","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"animal.quadruped.forward-steer","version":2,"resourceRef":"worldkit://subject-definition/animal.quadruped.forward-steer@2","authoringAvailability":"advanced","category":"animal","bodyTopology":"quadruped","semanticClassId":"subject.animal.quadruped","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"body","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.8,0.7,1.5]},"localTransform":{"positionMetersXYZ":[0,0.8,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["body"]},{"id":"head","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.55,0.55,0.6]},"localTransform":{"positionMetersXYZ":[0,0.95,-0.95],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["head"]},{"id":"legs","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.65,0.65,1.1]},"localTransform":{"positionMetersXYZ":[0,0.33,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["legs"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.9,-1.2],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]},{"id":"MountSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,1.25,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["mount","relationship"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.quadruped-official@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.mounted-on@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","allowedOverridePaths":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"],"aiMetadata":{"displayName":"Quadruped Forward Steer Official v2","description":"Reviewed quadruped public default with versioned P1.5 Control Feel and Camera Profiles.","semanticTags":["animal","forward-steer","official","quadruped","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"glider.paraglider.unpowered","version":1,"resourceRef":"worldkit://subject-definition/glider.paraglider.unpowered@1","authoringAvailability":"experimental","category":"composite","bodyTopology":"glider","semanticClassId":"subject.glider.paraglider","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"pilot","kind":"primitive","shape":{"kind":"capsule","radiusMeters":0.28,"heightMeters":1.45},"localTransform":{"positionMetersXYZ":[0,0.725,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["pilot"]},{"id":"canopy","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[5.5,0.18,1.7]},"localTransform":{"positionMetersXYZ":[0,4.2,0.3],"rotationEulerRadiansXYZ":[0.08,0,0]},"colliderContribution":"exclude","semanticTags":["canopy","wing"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"TetherSource","kind":"local","localTransform":{"positionMetersXYZ":[0,1.55,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["pilot","tether"]},{"id":"TetherTarget","kind":"local","localTransform":{"positionMetersXYZ":[0,3.9,0.2],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["canopy","tether"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1.4,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,1.5,-3],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.unpowered-glide@1","worldkit://capability/relationship.tether@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.tether@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","allowedOverridePaths":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"],"aiMetadata":{"displayName":"Unpowered Paraglider","description":"Whitebox pilot and canopy package using K08 unpowered glide and R03 tether facts.","semanticTags":["air","glide","paraglider","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"surface-craft.ice-skimmer","version":1,"resourceRef":"worldkit://subject-definition/surface-craft.ice-skimmer@1","authoringAvailability":"experimental","category":"vehicle","bodyTopology":"surface-craft","semanticClassId":"subject.surface-craft.skimmer","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"deck","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[1.4,0.25,2.8]},"localTransform":{"positionMetersXYZ":[0,0.125,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["deck","skimmer"]},{"id":"seat","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[0.7,0.7,0.8]},"localTransform":{"positionMetersXYZ":[0,0.7,0.3],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["seat"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"DriverSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,0.95,0.25],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["driver","seat"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,0.9,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.5,-2.5],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1","worldkit://capability/locomotion.surface-slide@1","worldkit://capability/relationship.seat@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.seat@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","allowedOverridePaths":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"],"aiMetadata":{"displayName":"Ice Skimmer","description":"Whitebox surface craft using K04 slope, friction and inertia motion.","semanticTags":["ice","skimmer","surface-slide","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"vehicle.four-wheel.arcade","version":1,"resourceRef":"worldkit://subject-definition/vehicle.four-wheel.arcade@1","authoringAvailability":"experimental","category":"vehicle","bodyTopology":"four-wheel","semanticClassId":"subject.vehicle.four-wheel","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"body","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[1.8,0.8,3.6]},"localTransform":{"positionMetersXYZ":[0,0.4,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["body","vehicle"]},{"id":"cabin","kind":"primitive","shape":{"kind":"box","sizeMetersXYZ":[1.45,0.75,1.7]},"localTransform":{"positionMetersXYZ":[0,1.3,0.15],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"include","semanticTags":["cabin"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"DriverSeat","kind":"local","localTransform":{"positionMetersXYZ":[-0.35,1.25,0.25],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["driver","seat"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1.1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.8,-3],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.forward-steer@1","worldkit://capability/locomotion.wheeled@1","worldkit://capability/relationship.seat@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.seat@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","allowedOverridePaths":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"],"aiMetadata":{"displayName":"Four-wheel Arcade","description":"Whitebox four-wheel package using simplified deterministic K03 motion.","semanticTags":["arcade","four-wheel","vehicle","whitebox"]}},{"kind":"subject-definition","schemaVersion":3,"id":"watercraft.kayak.surface","version":1,"resourceRef":"worldkit://subject-definition/watercraft.kayak.surface@1","authoringAvailability":"experimental","category":"composite","bodyTopology":"watercraft","semanticClassId":"subject.watercraft.kayak","coordinateConvention":{"forwardAxis":"-Z","upAxis":"+Y","metersPerUnit":1,"pivot":"support-center"},"visualParts":[{"id":"hull","kind":"primitive","shape":{"kind":"capsule","radiusMeters":0.42,"heightMeters":3.2},"localTransform":{"positionMetersXYZ":[0,0.42,0],"rotationEulerRadiansXYZ":[1.5707963267948966,0,0]},"colliderContribution":"include","semanticTags":["hull","kayak"]},{"id":"paddler","kind":"primitive","shape":{"kind":"capsule","radiusMeters":0.25,"heightMeters":1.15},"localTransform":{"positionMetersXYZ":[0,0.85,0],"rotationEulerRadiansXYZ":[0,0,0]},"colliderContribution":"exclude","semanticTags":["paddler"]}],"visualBinding":{"mode":"static"},"sockets":[{"id":"DriverSeat","kind":"local","localTransform":{"positionMetersXYZ":[0,0.55,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["driver","seat"]},{"id":"CameraTarget3D","kind":"local","localTransform":{"positionMetersXYZ":[0,1,0],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","target"]},{"id":"LookAhead","kind":"local","localTransform":{"positionMetersXYZ":[0,0.4,-2.3],"rotationEulerRadiansXYZ":[0,0,0]},"semanticTags":["camera","look-ahead"]}],"colliderPolicy":{"kind":"derive","colliderDerivationProfileRef":"worldkit://collider-derivation-profile/vertical-capability-capsule@1"},"capabilityRefs":["worldkit://capability/locomotion.water-surface@1","worldkit://capability/relationship.seat@1"],"profiles":{"physicsBodyProfileRef":"worldkit://physics-body-profile/character.capability-medium@1","locomotionProfileRef":"worldkit://locomotion-profile/ground.standard@1","motion":{"defaultMotionProfileRef":"worldkit://motion-profile/free-ground.humanoid-medium@1","optionalMotionProfileRefs":["worldkit://motion-profile/safe-ground@1"],"fallbackMotionProfileRef":"worldkit://motion-profile/safe-ground@1"},"controlProfileRef":"worldkit://control-profile/planar.camera-relative@1","cameraContextProfileRef":"worldkit://camera-context/capability-driven.default@1","mediumProfileRef":"worldkit://medium-profile/ground-air.standard@1","harnessProfileRef":"worldkit://harness-profile/subject.standard@1","controlFeelProfileRef":"worldkit://control-feel-profile/humanoid.medium-ground@1","allowedControlFeelProfileRefs":["worldkit://control-feel-profile/humanoid.medium-ground@1"]},"relationshipCapabilityRefs":["worldkit://capability/relationship.seat@1"],"actionOrPoseSetRef":"worldkit://pose-set/static.whitebox@1","renderBindingProfileRef":"worldkit://render-binding/subject.standard@1","allowedOverridePaths":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"],"aiMetadata":{"displayName":"Kayak Surface Package","description":"Whitebox kayak and paddler package using K06 water-surface motion.","semanticTags":["kayak","water-surface","watercraft","whitebox"]}}]');
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
      allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
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
const defaults$1 = [{ "subjectDefinitionId": "animal.quadruped.forward-steer", "subjectDefinitionRef": "worldkit://subject-definition/animal.quadruped.forward-steer@2", "subjectDefinitionContentHash": "sha256:927bf5808649646af09e4f9a724227e4ecbdf7b916697a0438059a8d3b13f53d" }, { "subjectDefinitionId": "glider.paraglider.unpowered", "subjectDefinitionRef": "worldkit://subject-definition/glider.paraglider.unpowered@1", "subjectDefinitionContentHash": "sha256:c1c734f9f60caebfaad76eb57ab407a3fc6579af351cb1e6b92d257e4d72a7c9" }, { "subjectDefinitionId": "humanoid.g-bot", "subjectDefinitionRef": "worldkit://subject-definition/humanoid.g-bot@2", "subjectDefinitionContentHash": "sha256:0428f0bf18495ff665715e4c4007e86192735bcfeb9d38d4c6d765f5501335fd" }, { "subjectDefinitionId": "surface-craft.ice-skimmer", "subjectDefinitionRef": "worldkit://subject-definition/surface-craft.ice-skimmer@1", "subjectDefinitionContentHash": "sha256:89ba730ac21d417bfbff8c64864bc279b70a5b89825ccad677bbb253c9235f2e" }, { "subjectDefinitionId": "vehicle.four-wheel.arcade", "subjectDefinitionRef": "worldkit://subject-definition/vehicle.four-wheel.arcade@1", "subjectDefinitionContentHash": "sha256:34ed61ef26371b76c1e6b490f0289251a949a6560db3c90cd0592b047a96b790" }, { "subjectDefinitionId": "watercraft.kayak.surface", "subjectDefinitionRef": "worldkit://subject-definition/watercraft.kayak.surface@1", "subjectDefinitionContentHash": "sha256:c22dfe537d31dc0611495a46c0ab847e57ebf2dc37ab44a33993879fd8f4ed71" }];
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
function pushConflict(diagnostics, instancePath, message, details) {
  diagnostics.push({
    severity: "error",
    code: "SUBJECT_RESOURCE_LOCK_CONFLICT",
    instancePath,
    message,
    details
  });
}
function normalizeSubjectAsset(resource) {
  return {
    subjectAssetRef: resource.resourceRef,
    subjectAssetManifestHash: resource.contentHash,
    artifactContentHash: resource.artifact.contentHash,
    byteLength: resource.artifact.byteLength,
    mediaType: resource.artifact.mediaType,
    format: resource.format,
    inventory: {
      meshCount: resource.inventory.meshCount,
      vertexCount: resource.inventory.vertexCount,
      triangleCount: resource.inventory.triangleCount,
      skeletonCount: resource.inventory.skeletonCount,
      boneCount: resource.inventory.boneCount,
      animationClipNames: [...resource.inventory.animationClipNames]
    }
  };
}
function normalizeRigProfile(resource) {
  return {
    rigProfileRef: resource.resourceRef,
    bodyTopology: resource.bodyTopology,
    skeletonRootBoneName: resource.skeletonRootBoneName,
    requiredBoneIds: [...resource.requiredBoneIds],
    sourceNodeNameByBoneId: {
      chest: resource.sourceNodeNameByBoneId.chest,
      "foot.left": resource.sourceNodeNameByBoneId["foot.left"],
      "foot.right": resource.sourceNodeNameByBoneId["foot.right"],
      "hand.left": resource.sourceNodeNameByBoneId["hand.left"],
      "hand.right": resource.sourceNodeNameByBoneId["hand.right"],
      head: resource.sourceNodeNameByBoneId.head,
      hips: resource.sourceNodeNameByBoneId.hips,
      "lower-arm.left": resource.sourceNodeNameByBoneId["lower-arm.left"],
      "lower-arm.right": resource.sourceNodeNameByBoneId["lower-arm.right"],
      "lower-leg.left": resource.sourceNodeNameByBoneId["lower-leg.left"],
      "lower-leg.right": resource.sourceNodeNameByBoneId["lower-leg.right"],
      neck: resource.sourceNodeNameByBoneId.neck,
      spine: resource.sourceNodeNameByBoneId.spine,
      "upper-arm.left": resource.sourceNodeNameByBoneId["upper-arm.left"],
      "upper-arm.right": resource.sourceNodeNameByBoneId["upper-arm.right"],
      "upper-leg.left": resource.sourceNodeNameByBoneId["upper-leg.left"],
      "upper-leg.right": resource.sourceNodeNameByBoneId["upper-leg.right"]
    }
  };
}
function normalizeAnimationSet(resource) {
  return {
    animationSetRef: resource.resourceRef,
    subjectAssetRef: resource.subjectAssetRef,
    rigProfileRef: resource.rigProfileRef,
    defaultActionId: resource.defaultActionId,
    requiredActionIds: [...resource.requiredActionIds],
    animationBindings: resource.animationBindings.map((binding) => ({
      actionId: binding.actionId,
      sourceClipName: binding.sourceClipName,
      loopMode: binding.loopMode,
      playbackSpeedRatio: binding.playbackSpeedRatio,
      blendDurationSeconds: binding.blendDurationSeconds,
      rootMotionMode: binding.rootMotionMode
    }))
  };
}
function normalizeColliderProfile(resource) {
  return {
    colliderProfileRef: resource.resourceRef,
    supportedBodyTopologies: [...resource.supportedBodyTopologies],
    collider: {
      kind: resource.collider.kind,
      radiusMeters: resource.collider.radiusMeters,
      heightMeters: resource.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[2]
      ]
    }
  };
}
class ResourceLockBuilderV1 {
  #entriesByRef = /* @__PURE__ */ new Map();
  #subjectAssetsByRef = /* @__PURE__ */ new Map();
  #rigProfilesByRef = /* @__PURE__ */ new Map();
  #animationSetsByRef = /* @__PURE__ */ new Map();
  #colliderProfilesByRef = /* @__PURE__ */ new Map();
  addRegistryResource(resource, instancePath, diagnostics) {
    const { contentHash: contentHash2, ...hashInput } = resource;
    const actualContentHash = sha256CanonicalJson(hashInput);
    if (actualContentHash !== contentHash2) {
      pushConflict(
        diagnostics,
        instancePath,
        `Registry resource '${resource.resourceRef}' does not match its immutable content hash.`,
        {
          resourceRef: resource.resourceRef,
          declaredContentHash: contentHash2,
          actualContentHash
        }
      );
      return;
    }
    this.#addEntry(
      {
        resourceRef: resource.resourceRef,
        resourceKind: resource.kind,
        resolvedVersion: String(resource.version),
        contentHash: contentHash2
      },
      instancePath,
      diagnostics
    );
    switch (resource.kind) {
      case "subject-asset":
        if (!this.#subjectAssetsByRef.has(resource.resourceRef)) {
          this.#subjectAssetsByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
      case "rig-profile":
        if (!this.#rigProfilesByRef.has(resource.resourceRef)) {
          this.#rigProfilesByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
      case "animation-set":
        if (!this.#animationSetsByRef.has(resource.resourceRef)) {
          this.#animationSetsByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
      case "collider-profile":
        if (!this.#colliderProfilesByRef.has(resource.resourceRef)) {
          this.#colliderProfilesByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
    }
  }
  addPackageSubjectDefinition(resourceRef, version, subjectDefinitionHash, instancePath, diagnostics) {
    this.#addEntry(
      {
        resourceRef,
        resourceKind: "subject-definition",
        resolvedVersion: String(version),
        contentHash: subjectDefinitionHash
      },
      instancePath,
      diagnostics
    );
  }
  addResolvedResource(entry, instancePath, diagnostics) {
    this.#addEntry(structuredClone(entry), instancePath, diagnostics);
  }
  finish() {
    const resourceLock = canonicalExecutionResourceLockEntriesV1(
      [...this.#entriesByRef.values()]
    );
    return {
      subjectAssets: this.#sortedResources(
        this.#subjectAssetsByRef,
        normalizeSubjectAsset
      ),
      rigProfiles: this.#sortedResources(
        this.#rigProfilesByRef,
        normalizeRigProfile
      ),
      animationSets: this.#sortedResources(
        this.#animationSetsByRef,
        normalizeAnimationSet
      ),
      colliderProfiles: this.#sortedResources(
        this.#colliderProfilesByRef,
        normalizeColliderProfile
      ),
      resourceLock,
      resourceLockHash: sha256CanonicalJson(resourceLock)
    };
  }
  #sortedResources(resourcesByRef, normalize2) {
    return [...resourcesByRef.values()].sort(
      (left, right) => left.resourceRef < right.resourceRef ? -1 : left.resourceRef > right.resourceRef ? 1 : 0
    ).map(normalize2);
  }
  #addEntry(entry, instancePath, diagnostics) {
    const existing = this.#entriesByRef.get(entry.resourceRef);
    if (existing === void 0) {
      this.#entriesByRef.set(entry.resourceRef, entry);
      return;
    }
    if (existing.resourceKind !== entry.resourceKind || existing.resolvedVersion !== entry.resolvedVersion || existing.contentHash !== entry.contentHash) {
      pushConflict(
        diagnostics,
        instancePath,
        `Resource '${entry.resourceRef}' resolved to conflicting immutable content.`,
        { resourceRef: entry.resourceRef, first: existing, conflicting: entry }
      );
    }
  }
}
const COST_BY_PRIMITIVE_KIND = {
  box: { vertices: 24, triangles: 12 },
  sphere: { vertices: 289, triangles: 512 },
  cylinder: { vertices: 70, triangles: 128 },
  capsule: { vertices: 34, triangles: 64 }
};
function calculatePrimitiveResourceCost(parts) {
  return parts.reduce(
    (total, part) => {
      const cost = COST_BY_PRIMITIVE_KIND[part.shape.kind];
      return {
        vertices: total.vertices + cost.vertices,
        triangles: total.triangles + cost.triangles,
        colliders: 1
      };
    },
    { vertices: 0, triangles: 0, colliders: 1 }
  );
}
const OUTPUT_PRECISION_DECIMALS = 12;
function isFiniteVec3(value) {
  return value.every(Number.isFinite);
}
function hasValidShapeDimensions(shape) {
  switch (shape.kind) {
    case "box":
      return shape.sizeMetersXYZ.every((value) => Number.isFinite(value) && value > 0);
    case "sphere":
      return Number.isFinite(shape.radiusMeters) && shape.radiusMeters > 0;
    case "cylinder":
      return Number.isFinite(shape.radiusMeters) && shape.radiusMeters > 0 && Number.isFinite(shape.heightMeters) && shape.heightMeters > 0;
    case "capsule":
      return Number.isFinite(shape.radiusMeters) && shape.radiusMeters > 0 && Number.isFinite(shape.heightMeters) && shape.heightMeters >= shape.radiusMeters * 2;
  }
}
function isValidColliderSourcePart(part) {
  return hasValidShapeDimensions(part.shape) && isFiniteVec3(part.localPositionMetersXYZ) && isFiniteVec3(part.localRotationEulerRadiansXYZ);
}
function normalizeNumber(value) {
  const rounded = Number(value.toFixed(OUTPUT_PRECISION_DECIMALS));
  return Object.is(rounded, -0) ? 0 : rounded;
}
function primitiveHalfExtents(shape) {
  switch (shape.kind) {
    case "box":
      return [
        shape.sizeMetersXYZ[0] / 2,
        shape.sizeMetersXYZ[1] / 2,
        shape.sizeMetersXYZ[2] / 2
      ];
    case "sphere":
      return [shape.radiusMeters, shape.radiusMeters, shape.radiusMeters];
    case "cylinder":
    case "capsule":
      return [shape.radiusMeters, shape.heightMeters / 2, shape.radiusMeters];
  }
}
function rotateXThenYThenZ(point, rotationRadiansXYZ) {
  const [rotationX, rotationY, rotationZ] = rotationRadiansXYZ;
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosZ = Math.cos(rotationZ);
  const sinZ = Math.sin(rotationZ);
  const afterX = [
    point[0],
    point[1] * cosX - point[2] * sinX,
    point[1] * sinX + point[2] * cosX
  ];
  const afterY = [
    afterX[0] * cosY + afterX[2] * sinY,
    afterX[1],
    -afterX[0] * sinY + afterX[2] * cosY
  ];
  return [
    afterY[0] * cosZ - afterY[1] * sinZ,
    afterY[0] * sinZ + afterY[1] * cosZ,
    afterY[2]
  ];
}
function derivePrimitiveBounds(part) {
  const halfExtents2 = primitiveHalfExtents(part.shape);
  const minimum = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  ];
  const maximum = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  ];
  for (const xSign of [-1, 1]) {
    for (const ySign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const rotated = rotateXThenYThenZ(
          [xSign * halfExtents2[0], ySign * halfExtents2[1], zSign * halfExtents2[2]],
          part.localRotationEulerRadiansXYZ
        );
        for (const axis of [0, 1, 2]) {
          const coordinate = rotated[axis] + part.localPositionMetersXYZ[axis];
          minimum[axis] = Math.min(minimum[axis], coordinate);
          maximum[axis] = Math.max(maximum[axis], coordinate);
        }
      }
    }
  }
  return {
    minimumMetersXYZ: [
      normalizeNumber(minimum[0]),
      normalizeNumber(minimum[1]),
      normalizeNumber(minimum[2])
    ],
    maximumMetersXYZ: [
      normalizeNumber(maximum[0]),
      normalizeNumber(maximum[1]),
      normalizeNumber(maximum[2])
    ]
  };
}
function deriveCompositionBounds(parts) {
  const primitiveBounds = parts.map(derivePrimitiveBounds);
  return {
    minimumMetersXYZ: [
      Math.min(...primitiveBounds.map((bounds) => bounds.minimumMetersXYZ[0])),
      Math.min(...primitiveBounds.map((bounds) => bounds.minimumMetersXYZ[1])),
      Math.min(...primitiveBounds.map((bounds) => bounds.minimumMetersXYZ[2]))
    ],
    maximumMetersXYZ: [
      Math.max(...primitiveBounds.map((bounds) => bounds.maximumMetersXYZ[0])),
      Math.max(...primitiveBounds.map((bounds) => bounds.maximumMetersXYZ[1])),
      Math.max(...primitiveBounds.map((bounds) => bounds.maximumMetersXYZ[2]))
    ]
  };
}
const SUPPORT_ORIGIN_TOLERANCE_METERS = 0.01;
function deriveVerticalCharacterCapsule(parts) {
  const part = parts[0];
  if (part === void 0) {
    return {
      ok: false,
      issues: [
        {
          code: "SUBJECT_COMPOSITION_EMPTY",
          message: "At least one primitive must contribute to collider derivation.",
          partIds: []
        }
      ]
    };
  }
  const invalidPartIds = parts.filter((candidate) => !isValidColliderSourcePart(candidate)).map(({ id: id2 }) => id2);
  if (invalidPartIds.length > 0) {
    return {
      ok: false,
      issues: [
        {
          code: "SUBJECT_PRIMITIVE_INVALID",
          message: "Primitive dimensions and transforms must be finite and geometrically valid.",
          partIds: invalidPartIds
        }
      ]
    };
  }
  const { minimumMetersXYZ, maximumMetersXYZ } = deriveCompositionBounds(parts);
  if (Math.abs(minimumMetersXYZ[1]) > SUPPORT_ORIGIN_TOLERANCE_METERS) {
    return {
      ok: false,
      issues: [
        {
          code: "SUBJECT_SUPPORT_ORIGIN_INVALID",
          message: "Included primitive bounds must meet the support-center origin plane.",
          partIds: parts.map(({ id: id2 }) => id2),
          details: {
            minimumYMeters: minimumMetersXYZ[1],
            toleranceMeters: SUPPORT_ORIGIN_TOLERANCE_METERS
          }
        }
      ]
    };
  }
  const radiusMeters = Math.max(
    maximumMetersXYZ[0] - minimumMetersXYZ[0],
    maximumMetersXYZ[2] - minimumMetersXYZ[2]
  ) / 2;
  const heightMeters = Math.max(maximumMetersXYZ[1], radiusMeters * 2);
  return {
    ok: true,
    bounds: { minimumMetersXYZ, maximumMetersXYZ },
    collider: {
      kind: "capsule",
      radiusMeters,
      heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        (minimumMetersXYZ[0] + maximumMetersXYZ[0]) / 2,
        heightMeters / 2,
        (minimumMetersXYZ[2] + maximumMetersXYZ[2]) / 2
      ]
    }
  };
}
const REQUIRED_GROUND_ACTION_IDS = ["idle", "jump", "run", "walk"];
function controlFeelProfileRefForDefinition(definition) {
  const controlFeelProfileRef = definition.profiles.controlFeelProfileRef;
  if (isNil(controlFeelProfileRef) || controlFeelProfileRef === "") {
    return void 0;
  }
  return controlFeelProfileRef;
}
function selectableControlFeelRefsForDefinition(definition) {
  return selectableControlFeelProfileRefsV1(definition.profiles);
}
function projectControlFeelProfile(profile) {
  return {
    resourceRef: profile.resourceRef,
    contentHash: profile.contentHash,
    walkSpeedMetersPerSecond: profile.walkSpeedMetersPerSecond,
    runSpeedMetersPerSecond: profile.runSpeedMetersPerSecond,
    jumpSpeedMetersPerSecond: profile.jumpSpeedMetersPerSecond,
    accelerationMetersPerSecondSquared: profile.accelerationMetersPerSecondSquared,
    decelerationMetersPerSecondSquared: profile.decelerationMetersPerSecondSquared,
    turnRateRadiansPerSecond: profile.turnRateRadiansPerSecond,
    moveResponseExponent: profile.moveResponseExponent,
    airControlRatio: profile.airControlRatio,
    coyoteTimeSeconds: profile.coyoteTimeSeconds,
    jumpBufferSeconds: profile.jumpBufferSeconds,
    variableJumpHoldSeconds: profile.variableJumpHoldSeconds,
    jumpHoldGravityRatio: profile.jumpHoldGravityRatio,
    jumpReleaseGravityRatio: profile.jumpReleaseGravityRatio
  };
}
function resolveControlFeelProfileV1(definition, request) {
  const registry = request.subjectResourceRegistry;
  const controlFeelProfileRef = controlFeelProfileRefForDefinition(definition);
  if (controlFeelProfileRef === void 0) {
    addError$1(
      request.diagnostics,
      "SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED",
      `${request.instancePath}/profiles/controlFeelProfileRef`,
      `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: '${request.subjectDefinitionRef}'.`,
      { subjectDefinitionRef: request.subjectDefinitionRef }
    );
    return void 0;
  }
  const controlFeelProfile = registry.resolveControlFeelProfile(controlFeelProfileRef);
  if (controlFeelProfile === void 0) {
    addError$1(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${request.instancePath}/profiles/controlFeelProfileRef`,
      `Control Feel Profile '${controlFeelProfileRef}' is not registered at the exact requested version.`,
      { expectedKind: "control-feel-profile", resourceRef: controlFeelProfileRef }
    );
    return void 0;
  }
  request.resourceLockBuilder.addRegistryResource(
    controlFeelProfile,
    `${request.instancePath}/profiles/controlFeelProfileRef`,
    request.diagnostics
  );
  return controlFeelProfile;
}
function resolveAvailableControlFeelsV1(request) {
  const registry = request.subjectResourceRegistry;
  return selectableControlFeelRefsForDefinition(request.definition).flatMap((resourceRef) => {
    const profile = registry.resolveControlFeelProfile(resourceRef);
    if (profile === void 0) return [];
    request.resourceLockBuilder.addRegistryResource(
      profile,
      `${request.instancePath}/profiles/allowedControlFeelProfileRefs`,
      request.diagnostics
    );
    return [projectControlFeelProfile(profile)];
  });
}
function addError$1(diagnostics, code2, instancePath, message, details) {
  diagnostics.push({
    severity: "error",
    code: code2,
    instancePath,
    message,
    ...details === void 0 ? {} : { details }
  });
}
function normalizeCapabilityAssemblyV1(definition, request) {
  const subject = definition;
  const registry = request.subjectResourceRegistry;
  if (typeof registry.resolveMotionProfile !== "function" || typeof registry.resolveMotionKernel !== "function" || typeof registry.resolveControlProfile !== "function" || typeof registry.resolveCameraContextProfile !== "function" || typeof registry.resolveCameraRigProfile !== "function" || typeof registry.resolveCameraRigAlgorithm !== "function" || typeof registry.resolveMediumProfile !== "function" || typeof registry.resolveRelationshipProfile !== "function" || typeof registry.resolveHarnessProfile !== "function" || typeof registry.resolvePoseSetProfile !== "function" || typeof registry.resolveRenderBindingProfile !== "function") {
    addError$1(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      "A current Subject Definition requires the complete capability-driven Subject Registry.",
      { subjectDefinitionRef: request.subjectDefinitionRef }
    );
    return void 0;
  }
  const missing2 = (resourceRef, expectedKind) => {
    addError$1(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `${expectedKind} '${resourceRef}' is not registered at the exact requested version.`,
      { expectedKind, resourceRef }
    );
  };
  const addLock = (resource) => request.resourceLockBuilder.addRegistryResource(
    resource,
    request.instancePath,
    request.diagnostics
  );
  const unavailableRelationshipCapabilityRef = subject.relationshipCapabilityRefs.find(
    (resourceRef) => resourceRef === "worldkit://capability/relationship.seat@1" || resourceRef === "worldkit://capability/relationship.tether@1"
  );
  if (unavailableRelationshipCapabilityRef !== void 0) {
    addError$1(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `Relationship capability '${unavailableRelationshipCapabilityRef}' is unavailable in the canonical runtime.`,
      { capabilityRef: unavailableRelationshipCapabilityRef, runtimeStatus: "reserved" }
    );
    return void 0;
  }
  const defaultMotionProfile = registry.resolveMotionProfile(
    subject.profiles.motion.defaultMotionProfileRef
  );
  const fallbackMotionProfile = registry.resolveMotionProfile(
    subject.profiles.motion.fallbackMotionProfileRef
  );
  const optionalMotionProfiles = subject.profiles.motion.optionalMotionProfileRefs.flatMap(
    (resourceRef) => {
      const resource = registry.resolveMotionProfile(resourceRef);
      if (resource === void 0) missing2(resourceRef, "Motion Profile");
      return resource === void 0 ? [] : [resource];
    }
  );
  if (defaultMotionProfile === void 0) {
    missing2(subject.profiles.motion.defaultMotionProfileRef, "Motion Profile");
  }
  if (fallbackMotionProfile === void 0) {
    missing2(subject.profiles.motion.fallbackMotionProfileRef, "Fallback Motion Profile");
  }
  const resolvedMotionProfiles = [
    ...defaultMotionProfile === void 0 ? [] : [defaultMotionProfile],
    ...optionalMotionProfiles,
    ...fallbackMotionProfile === void 0 ? [] : [fallbackMotionProfile]
  ];
  const motionKernels2 = [...new Set(
    resolvedMotionProfiles.map((profile) => profile.motionKernelRef)
  )].sort((left, right) => left.localeCompare(right)).flatMap((resourceRef) => {
    const resource = registry.resolveMotionKernel(resourceRef);
    if (resource === void 0) missing2(resourceRef, "Motion Kernel");
    return resource === void 0 ? [] : [resource];
  });
  const controlProfile = registry.resolveControlProfile(subject.profiles.controlProfileRef);
  if (controlProfile === void 0) missing2(subject.profiles.controlProfileRef, "Control Profile");
  const cameraContextProfile = registry.resolveCameraContextProfile(
    subject.profiles.cameraContextProfileRef
  );
  if (cameraContextProfile === void 0) {
    missing2(subject.profiles.cameraContextProfileRef, "Camera Context Profile");
  }
  const mediumProfile = registry.resolveMediumProfile(subject.profiles.mediumProfileRef);
  if (mediumProfile === void 0) missing2(subject.profiles.mediumProfileRef, "Medium Profile");
  const harnessProfile = registry.resolveHarnessProfile(subject.profiles.harnessProfileRef);
  if (harnessProfile === void 0) missing2(subject.profiles.harnessProfileRef, "Harness Profile");
  const renderBindingProfile = registry.resolveRenderBindingProfile(
    subject.renderBindingProfileRef
  );
  if (renderBindingProfile === void 0) {
    missing2(subject.renderBindingProfileRef, "Render Binding Profile");
  }
  const actionOrPoseSet = registry.resolvePoseSetProfile(subject.actionOrPoseSetRef) ?? request.subjectResourceRegistry.resolveAnimationSet(subject.actionOrPoseSetRef);
  if (actionOrPoseSet === void 0) {
    missing2(subject.actionOrPoseSetRef, "Action or Pose Set");
  }
  const cameraRigProfileRefs = /* @__PURE__ */ new Set();
  const cameraModifierProfileRefs = /* @__PURE__ */ new Set();
  if (cameraContextProfile !== void 0) {
    cameraRigProfileRefs.add(cameraContextProfile.defaultCameraRigProfileRef);
    if (cameraContextProfile.firstPersonCameraRigProfileRef !== void 0) {
      cameraRigProfileRefs.add(cameraContextProfile.firstPersonCameraRigProfileRef);
    }
    for (const rule of cameraContextProfile.rules) {
      if (rule.cameraRigProfileRef !== void 0) {
        cameraRigProfileRefs.add(rule.cameraRigProfileRef);
      }
      for (const modifierRef of rule.cameraModifierRefs ?? []) {
        cameraModifierProfileRefs.add(modifierRef);
      }
    }
  }
  const cameraRigProfiles = [...cameraRigProfileRefs].sort((left, right) => left.localeCompare(right)).flatMap((resourceRef) => {
    const resource = registry.resolveCameraRigProfile(resourceRef);
    if (resource === void 0) missing2(resourceRef, "Camera Rig Profile");
    return resource === void 0 ? [] : [resource];
  });
  const cameraRigAlgorithms = [...new Set(cameraRigProfiles.map((row) => row.algorithmRef))].sort((left, right) => left.localeCompare(right)).flatMap((resourceRef) => {
    const resource = registry.resolveCameraRigAlgorithm(resourceRef);
    if (resource === void 0) missing2(resourceRef, "Camera Rig Algorithm");
    return resource === void 0 ? [] : [resource];
  });
  const cameraModifierProfiles = [...cameraModifierProfileRefs].sort((left, right) => left.localeCompare(right)).flatMap((resourceRef) => {
    const resource = registry.resolveCameraModifierProfile(resourceRef);
    if (resource === void 0) missing2(resourceRef, "Camera Modifier Profile");
    return resource === void 0 ? [] : [resource];
  });
  const relationshipProfileRefs = subject.relationshipCapabilityRefs.flatMap((resourceRef) => {
    if (resourceRef === "worldkit://capability/relationship.mounted-on@1") {
      return ["worldkit://relationship-profile/mounted-on.stand-ground@1"];
    }
    if (resourceRef === "worldkit://capability/relationship.seat@1") {
      return ["worldkit://relationship-profile/seat.driver@1"];
    }
    if (resourceRef === "worldkit://capability/relationship.tether@1") {
      return ["worldkit://relationship-profile/tether.standard@1"];
    }
    return [];
  });
  const relationshipProfiles2 = relationshipProfileRefs.flatMap((resourceRef) => {
    const resource = registry.resolveRelationshipProfile(resourceRef);
    if (resource === void 0) missing2(resourceRef, "Relationship Profile");
    return resource === void 0 ? [] : [resource];
  });
  if (defaultMotionProfile === void 0 || fallbackMotionProfile === void 0 || motionKernels2.length !== new Set(
    resolvedMotionProfiles.map((profile) => profile.motionKernelRef)
  ).size || controlProfile === void 0 || cameraContextProfile === void 0 || mediumProfile === void 0 || harnessProfile === void 0 || renderBindingProfile === void 0 || actionOrPoseSet === void 0) {
    return void 0;
  }
  const incompatibleMotionKernel = motionKernels2.find(
    (motionKernel) => motionKernel.runtimeStatus !== "implemented"
  );
  if (incompatibleMotionKernel !== void 0) {
    addError$1(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `Motion Kernel '${incompatibleMotionKernel.resourceRef}' is not implemented by the canonical runtime.`,
      {
        kernelCommandKind: incompatibleMotionKernel.commandKind,
        controlCommandKind: controlProfile.commandKind,
        runtimeStatus: incompatibleMotionKernel.runtimeStatus
      }
    );
    return void 0;
  }
  const defaultMotionKernel = motionKernels2.find(
    (motionKernel) => motionKernel.resourceRef === defaultMotionProfile.motionKernelRef
  );
  if (defaultMotionKernel === void 0 || defaultMotionKernel.commandKind !== controlProfile.commandKind) {
    addError$1(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `Default Motion Kernel '${defaultMotionProfile.motionKernelRef}' and Control Profile '${controlProfile.resourceRef}' use different command kinds.`,
      {
        kernelCommandKind: defaultMotionKernel?.commandKind,
        controlCommandKind: controlProfile.commandKind
      }
    );
    return void 0;
  }
  [
    defaultMotionProfile,
    ...optionalMotionProfiles,
    fallbackMotionProfile,
    ...motionKernels2,
    controlProfile,
    cameraContextProfile,
    ...cameraRigProfiles,
    ...cameraRigAlgorithms,
    ...cameraModifierProfiles,
    mediumProfile,
    ...relationshipProfiles2,
    harnessProfile,
    renderBindingProfile,
    actionOrPoseSet
  ].forEach(addLock);
  return {
    authoringAvailability: subject.authoringAvailability,
    physicsBodyProfileRef: subject.profiles.physicsBodyProfileRef,
    locomotionProfileRef: subject.profiles.locomotionProfileRef,
    defaultMotionProfile,
    optionalMotionProfiles,
    fallbackMotionProfile,
    motionKernels: motionKernels2,
    controlProfile,
    cameraContextProfile,
    cameraRigProfiles,
    cameraRigAlgorithms,
    cameraModifierProfiles,
    mediumProfile,
    relationshipProfiles: relationshipProfiles2,
    harnessProfile,
    renderBindingProfile,
    actionOrPoseSetRef: subject.actionOrPoseSetRef
  };
}
function sortedStrings(values) {
  return [...values ?? []].sort((left, right) => left.localeCompare(right));
}
function cloneVec3(value) {
  return [value[0], value[1], value[2]];
}
function reportDuplicateIds(values, code2, instancePath, diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      addError$1(
        diagnostics,
        code2,
        `${instancePath}/${index}/id`,
        `Duplicate Subject component ID '${value.id}'.`,
        { id: value.id }
      );
    }
    seen.add(value.id);
  });
}
function normalizeVisualParts(definition, instancePath, diagnostics) {
  reportDuplicateIds(
    definition.visualParts,
    "SUBJECT_VISUAL_PART_DUPLICATE",
    `${instancePath}/visualParts`,
    diagnostics
  );
  return definition.visualParts.map((part, index) => {
    if (part.kind === "primitive") {
      return {
        id: part.id,
        kind: "primitive",
        shape: structuredClone(part.shape),
        localTransform: {
          positionMetersXYZ: cloneVec3(part.localTransform.positionMetersXYZ),
          rotationEulerRadiansXYZ: cloneVec3(
            part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]
          )
        },
        colliderContribution: part.colliderContribution,
        semanticTags: sortedStrings(part.semanticTags)
      };
    }
    const scaleXYZ = cloneVec3(part.localTransform.scaleXYZ);
    scaleXYZ.forEach((scale, componentIndex) => {
      if (!Number.isFinite(scale) || scale <= 0) {
        addError$1(
          diagnostics,
          "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
          `${instancePath}/visualParts/${index}/localTransform/scaleXYZ/${componentIndex}`,
          "Asset Part scale components must be positive finite numbers.",
          { subjectAssetRef: part.subjectAssetRef, scaleXYZ }
        );
      }
    });
    return {
      id: part.id,
      kind: "asset",
      subjectAssetRef: part.subjectAssetRef,
      localTransform: {
        positionMetersXYZ: cloneVec3(part.localTransform.positionMetersXYZ),
        rotationEulerRadiansXYZ: cloneVec3(
          part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]
        ),
        scaleXYZ
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: sortedStrings(part.semanticTags)
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}
function normalizeSockets(definition, instancePath, diagnostics) {
  reportDuplicateIds(
    definition.sockets,
    "SUBJECT_SOCKET_DUPLICATE",
    `${instancePath}/sockets`,
    diagnostics
  );
  return definition.sockets.map((socket) => socket.kind === "local" ? {
    id: socket.id,
    kind: "local",
    localTransform: {
      positionMetersXYZ: cloneVec3(socket.localTransform.positionMetersXYZ),
      rotationEulerRadiansXYZ: cloneVec3(
        socket.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]
      )
    },
    semanticTags: sortedStrings(socket.semanticTags)
  } : {
    id: socket.id,
    kind: "bone",
    boneId: socket.boneId,
    offsetTransform: {
      positionMetersXYZ: cloneVec3(socket.offsetTransform.positionMetersXYZ),
      rotationEulerRadiansXYZ: cloneVec3(
        socket.offsetTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]
      )
    },
    semanticTags: sortedStrings(socket.semanticTags)
  }).sort((left, right) => left.id.localeCompare(right.id));
}
function normalizeMountSlots(definition, sockets, instancePath, diagnostics) {
  const mountSlots = "mountSlots" in definition ? definition.mountSlots : [];
  reportDuplicateIds(
    mountSlots,
    "SUBJECT_MOUNT_SLOT_DUPLICATE",
    `${instancePath}/mountSlots`,
    diagnostics
  );
  const socketIds = new Set(sockets.map(({ id: id2 }) => id2));
  mountSlots.forEach((slot, index) => {
    if (!socketIds.has(slot.mountSocketId)) {
      addError$1(
        diagnostics,
        "SUBJECT_MOUNT_SLOT_SOCKET_NOT_FOUND",
        `${instancePath}/mountSlots/${index}/mountSocketId`,
        `Mount slot '${slot.id}' references missing Socket '${slot.mountSocketId}'.`,
        { mountSlotId: slot.id, mountSocketId: slot.mountSocketId }
      );
    }
  });
  return mountSlots.map((slot) => ({
    id: slot.id,
    kind: "mount-slot",
    mode: "stand",
    mountSocketId: slot.mountSocketId,
    riderSubjectOriginOffsetMetersXYZ: cloneVec3(
      slot.riderSubjectOriginOffsetMetersXYZ
    ),
    dismountCandidateOffsetsMetersXYZ: slot.dismountCandidateOffsetsMetersXYZ.map(cloneVec3)
  })).sort((left, right) => left.id.localeCompare(right.id));
}
function resourcesOfKind(registry, kind) {
  return registry.listDiscoverableResources({ kind }).map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
}
function resolveVisualResources(definition, request) {
  const { diagnostics, instancePath, resourceLockBuilder, subjectResourceRegistry } = request;
  const assetParts = definition.visualParts.filter((part) => part.kind === "asset");
  if (definition.visualBinding.mode === "static" && assetParts.length > 1) {
    addError$1(
      diagnostics,
      "STATIC_SUBJECT_MULTIPLE_ASSET_PARTS_UNSUPPORTED",
      `${instancePath}/visualParts`,
      "A static Subject Definition supports at most one Asset Part.",
      { assetPartCount: assetParts.length }
    );
    return void 0;
  }
  if (definition.visualBinding.mode === "rigged" && assetParts.length !== 1) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualParts`,
      "A rigged Subject Definition requires exactly one Asset Part.",
      { requiredAssetPartCount: 1, assetPartCount: assetParts.length }
    );
  }
  const assetPart = assetParts[0];
  if (assetPart === void 0) {
    return definition.visualBinding.mode === "static" ? {} : void 0;
  }
  const assetPartIndex = definition.visualParts.indexOf(assetPart);
  const subjectAsset = subjectResourceRegistry.resolveSubjectAsset(assetPart.subjectAssetRef);
  if (subjectAsset === void 0) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_NOT_FOUND",
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      `Subject Asset '${assetPart.subjectAssetRef}' is not registered at the exact requested version.`,
      {
        resourceRef: assetPart.subjectAssetRef,
        subjectAssetRef: assetPart.subjectAssetRef,
        availableSubjectAssetRefs: resourcesOfKind(subjectResourceRegistry, "subject-asset")
      }
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      subjectAsset,
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      diagnostics
    );
  }
  if (definition.visualBinding.mode === "static") {
    return subjectAsset === void 0 ? void 0 : { subjectAssetResource: structuredClone(subjectAsset) };
  }
  const { rigProfileRef, animationSetRef } = definition.visualBinding;
  const rigProfile = subjectResourceRegistry.resolveRigProfile(rigProfileRef);
  if (rigProfile === void 0) {
    const compatibleRigProfileRefs = subjectResourceRegistry.listDiscoverableResources({ kind: "rig-profile" }).filter((resource) => resource.compatibleSubjectAssetRefs.includes(assetPart.subjectAssetRef)).map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
    addError$1(
      diagnostics,
      "SUBJECT_RIG_PROFILE_NOT_FOUND",
      `${instancePath}/visualBinding/rigProfileRef`,
      `Rig Profile '${rigProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: rigProfileRef, rigProfileRef, compatibleRigProfileRefs }
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      rigProfile,
      `${instancePath}/visualBinding/rigProfileRef`,
      diagnostics
    );
  }
  const animationSet = subjectResourceRegistry.resolveAnimationSet(animationSetRef);
  if (animationSet === void 0) {
    const compatibleAnimationSetRefs = subjectResourceRegistry.listDiscoverableResources({ kind: "animation-set" }).filter((resource) => resource.subjectAssetRef === assetPart.subjectAssetRef && resource.rigProfileRef === rigProfileRef).map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
    addError$1(
      diagnostics,
      "SUBJECT_ANIMATION_SET_NOT_FOUND",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSetRef}' is not registered at the exact requested version.`,
      { resourceRef: animationSetRef, animationSetRef, compatibleAnimationSetRefs }
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      animationSet,
      `${instancePath}/visualBinding/animationSetRef`,
      diagnostics
    );
  }
  if (subjectAsset === void 0 || rigProfile === void 0 || animationSet === void 0) {
    return void 0;
  }
  if (!rigProfile.compatibleSubjectAssetRefs.includes(subjectAsset.resourceRef)) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      `Rig Profile '${rigProfile.resourceRef}' is not compatible with Subject Asset '${subjectAsset.resourceRef}'.`,
      {
        subjectAssetRef: subjectAsset.resourceRef,
        rigProfileRef: rigProfile.resourceRef,
        compatibleSubjectAssetRefs: sortedStrings(rigProfile.compatibleSubjectAssetRefs)
      }
    );
  }
  if (animationSet.subjectAssetRef !== subjectAsset.resourceRef) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' targets a different Subject Asset.`,
      {
        animationSetRef: animationSet.resourceRef,
        subjectAssetRef: subjectAsset.resourceRef,
        compatibleSubjectAssetRefs: [animationSet.subjectAssetRef]
      }
    );
  }
  if (animationSet.rigProfileRef !== rigProfile.resourceRef) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' targets a different Rig Profile.`,
      {
        animationSetRef: animationSet.resourceRef,
        rigProfileRef: rigProfile.resourceRef,
        compatibleRigProfileRefs: [animationSet.rigProfileRef]
      }
    );
  }
  if (rigProfile.bodyTopology !== definition.bodyTopology) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/rigProfileRef`,
      `Rig Profile '${rigProfile.resourceRef}' does not support Definition topology '${definition.bodyTopology}'.`,
      {
        rigProfileRef: rigProfile.resourceRef,
        bodyTopology: definition.bodyTopology,
        rigBodyTopology: rigProfile.bodyTopology
      }
    );
  }
  const boundActionIds = new Set(animationSet.animationBindings.map((binding) => binding.actionId));
  const declaredActionIds = new Set(animationSet.requiredActionIds);
  const missingActionIds = REQUIRED_GROUND_ACTION_IDS.filter((actionId) => !declaredActionIds.has(actionId) || !boundActionIds.has(actionId));
  if (missingActionIds.length > 0) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' does not provide every required ground Action.`,
      { animationSetRef: animationSet.resourceRef, missingActionIds }
    );
  }
  const availableClipNames = new Set(subjectAsset.inventory.animationClipNames);
  const missingSourceClipNames = sortedStrings(animationSet.animationBindings.filter((binding) => !availableClipNames.has(binding.sourceClipName)).map((binding) => binding.sourceClipName));
  if (missingSourceClipNames.length > 0) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' maps Clips absent from Subject Asset '${subjectAsset.resourceRef}'.`,
      {
        animationSetRef: animationSet.resourceRef,
        subjectAssetRef: subjectAsset.resourceRef,
        missingSourceClipNames,
        availableSourceClipNames: sortedStrings(subjectAsset.inventory.animationClipNames)
      }
    );
  }
  const missingBoneIds = rigProfile.requiredBoneIds.filter((boneId) => !Object.prototype.hasOwnProperty.call(rigProfile.sourceNodeNameByBoneId, boneId) || rigProfile.sourceNodeNameByBoneId[boneId].length === 0);
  if (missingBoneIds.length > 0) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/rigProfileRef`,
      `Rig Profile '${rigProfile.resourceRef}' omits required Bone mappings.`,
      { rigProfileRef: rigProfile.resourceRef, missingBoneIds: sortedStrings(missingBoneIds) }
    );
  }
  if (subjectAsset.inventory.skeletonCount !== 1 || subjectAsset.inventory.boneCount < rigProfile.requiredBoneIds.length) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      `Subject Asset '${subjectAsset.resourceRef}' inventory cannot satisfy Rig Profile '${rigProfile.resourceRef}'.`,
      {
        subjectAssetRef: subjectAsset.resourceRef,
        rigProfileRef: rigProfile.resourceRef,
        skeletonCount: subjectAsset.inventory.skeletonCount,
        boneCount: subjectAsset.inventory.boneCount,
        requiredBoneCount: rigProfile.requiredBoneIds.length
      }
    );
  }
  const availableBoneIds = new Set(rigProfile.requiredBoneIds);
  definition.sockets.forEach((socket, index) => {
    if (socket.kind === "bone" && !availableBoneIds.has(socket.boneId)) {
      addError$1(
        diagnostics,
        "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        `${instancePath}/sockets/${index}/boneId`,
        `Bone Socket '${socket.id}' targets Bone '${socket.boneId}' not declared by Rig Profile '${rigProfile.resourceRef}'.`,
        {
          boneId: socket.boneId,
          rigProfileRef: rigProfile.resourceRef,
          availableBoneIds: sortedStrings(rigProfile.requiredBoneIds)
        }
      );
    }
  });
  return {
    subjectAssetResource: structuredClone(subjectAsset),
    rigProfileResource: structuredClone(rigProfile),
    animationSetResource: structuredClone(animationSet)
  };
}
function resolveColliderPolicy(definition, request) {
  const { diagnostics, instancePath, resourceLockBuilder, subjectResourceRegistry } = request;
  if (definition.colliderPolicy.kind === "profile") {
    const { colliderProfileRef } = definition.colliderPolicy;
    const colliderProfile = subjectResourceRegistry.resolveColliderProfile(colliderProfileRef);
    if (colliderProfile === void 0) {
      const compatibleColliderProfileRefs = subjectResourceRegistry.listDiscoverableResources({ kind: "collider-profile" }).filter((resource) => resource.supportedBodyTopologies.includes(definition.bodyTopology)).map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
      addError$1(
        diagnostics,
        "SUBJECT_COLLIDER_PROFILE_NOT_FOUND",
        `${instancePath}/colliderPolicy/colliderProfileRef`,
        `Collider Profile '${colliderProfileRef}' is not registered at the exact requested version.`,
        { resourceRef: colliderProfileRef, colliderProfileRef, compatibleColliderProfileRefs }
      );
      return void 0;
    }
    resourceLockBuilder.addRegistryResource(
      colliderProfile,
      `${instancePath}/colliderPolicy/colliderProfileRef`,
      diagnostics
    );
    const [centerX, centerY, centerZ] = colliderProfile.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const isSupportCentered = Number.isFinite(colliderProfile.collider.radiusMeters) && colliderProfile.collider.radiusMeters > 0 && Number.isFinite(colliderProfile.collider.heightMeters) && colliderProfile.collider.heightMeters > 0 && centerX === 0 && centerZ === 0 && centerY === colliderProfile.collider.heightMeters / 2;
    if (!colliderProfile.supportedBodyTopologies.includes(definition.bodyTopology) || !isSupportCentered) {
      addError$1(
        diagnostics,
        "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        `${instancePath}/colliderPolicy/colliderProfileRef`,
        `Collider Profile '${colliderProfileRef}' is not a support-centered capsule compatible with '${definition.bodyTopology}'.`,
        {
          colliderProfileRef,
          bodyTopology: definition.bodyTopology,
          supportedBodyTopologies: sortedStrings(colliderProfile.supportedBodyTopologies),
          collider: structuredClone(colliderProfile.collider)
        }
      );
    }
    return {
      kind: colliderProfile.collider.kind,
      radiusMeters: colliderProfile.collider.radiusMeters,
      heightMeters: colliderProfile.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [centerX, centerY, centerZ]
    };
  }
  if (definition.visualParts.some((part) => part.kind === "asset")) {
    addError$1(
      diagnostics,
      "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/colliderPolicy/kind`,
      "A Subject Definition containing an Asset Part requires an explicit Collider Profile.",
      { colliderPolicyKind: definition.colliderPolicy.kind }
    );
  }
  const colliderDerivationProfile = subjectResourceRegistry.resolveColliderDerivationProfile(
    definition.colliderPolicy.colliderDerivationProfileRef
  );
  if (colliderDerivationProfile === void 0) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      `Collider Derivation Profile '${definition.colliderPolicy.colliderDerivationProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.colliderPolicy.colliderDerivationProfileRef }
    );
    return void 0;
  }
  resourceLockBuilder.addRegistryResource(
    colliderDerivationProfile,
    `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
    diagnostics
  );
  if (!colliderDerivationProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      `Collider Derivation Profile '${colliderDerivationProfile.resourceRef}' does not support '${definition.bodyTopology}'.`,
      { bodyTopology: definition.bodyTopology }
    );
  }
  const colliderSourceParts = definition.visualParts.flatMap(
    (part) => part.kind === "primitive" && part.colliderContribution === "include" ? [{
      id: part.id,
      shape: part.shape,
      localPositionMetersXYZ: part.localTransform.positionMetersXYZ,
      localRotationEulerRadiansXYZ: part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]
    }] : []
  );
  const colliderResult = deriveVerticalCharacterCapsule(colliderSourceParts);
  if (!colliderResult.ok) {
    for (const issue of colliderResult.issues) {
      const isSupportOriginIssue = issue.code === "SUBJECT_SUPPORT_ORIGIN_INVALID";
      addError$1(
        diagnostics,
        isSupportOriginIssue ? "SUBJECT_SUPPORT_ORIGIN_INVALID" : "SUBJECT_COLLIDER_DERIVATION_FAILED",
        isSupportOriginIssue ? `${instancePath}/visualParts` : `${instancePath}/colliderPolicy`,
        issue.message,
        { partIds: issue.partIds, ...issue.details ?? {} }
      );
    }
    return void 0;
  }
  if (colliderResult.collider.radiusMeters > colliderDerivationProfile.colliderDerivation.maximumRadiusMeters || colliderResult.collider.heightMeters > colliderDerivationProfile.colliderDerivation.maximumHeightMeters) {
    addError$1(
      diagnostics,
      "SUBJECT_COLLIDER_DERIVATION_FAILED",
      `${instancePath}/colliderPolicy`,
      "Derived Collider exceeds the selected derivation Profile limits.",
      {
        derivedCollider: colliderResult.collider,
        maximumRadiusMeters: colliderDerivationProfile.colliderDerivation.maximumRadiusMeters,
        maximumHeightMeters: colliderDerivationProfile.colliderDerivation.maximumHeightMeters
      }
    );
  }
  return colliderResult.collider;
}
function normalizeSubjectDefinitionV2(request) {
  const {
    definition,
    diagnostics,
    instancePath,
    resourceBudget,
    resourceLockBuilder,
    source,
    subjectDefinitionRef,
    subjectResourceRegistry
  } = request;
  const initialErrorCount = diagnostics.filter((item) => item.severity === "error").length;
  if (source === "registry") {
    resourceLockBuilder.addRegistryResource(
      definition,
      instancePath,
      diagnostics
    );
  }
  const visualParts = normalizeVisualParts(definition, instancePath, diagnostics);
  const sockets = normalizeSockets(definition, instancePath, diagnostics);
  const mountSlots = normalizeMountSlots(
    definition,
    sockets,
    instancePath,
    diagnostics
  );
  const capabilityRefs = sortedStrings(definition.capabilityRefs);
  const selectedCapabilityRefs = new Set(capabilityRefs);
  const capabilities = capabilityRefs.flatMap((resourceRef) => {
    const resource = subjectResourceRegistry.resolveCapability(resourceRef);
    if (resource === void 0) {
      addError$1(
        diagnostics,
        "SUBJECT_CAPABILITY_UNSATISFIED",
        `${instancePath}/capabilityRefs/${definition.capabilityRefs.indexOf(resourceRef)}`,
        `Capability '${resourceRef}' is not registered at the exact requested version.`,
        { resourceRef }
      );
      return [];
    }
    resourceLockBuilder.addRegistryResource(resource, `${instancePath}/capabilityRefs`, diagnostics);
    return [resource];
  });
  const locomotionCapabilities = capabilities.filter(
    (capability) => capability.resourceRef.startsWith("worldkit://capability/locomotion.")
  );
  const primaryLocomotionCapabilities = locomotionCapabilities.filter(
    (capability) => !locomotionCapabilities.some(
      (candidate) => candidate.resourceRef !== capability.resourceRef && candidate.requiredCapabilityRefs.includes(capability.resourceRef)
    )
  );
  if (primaryLocomotionCapabilities.length !== 1) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/capabilityRefs`,
      "Subject Definition requires exactly one primary locomotion Capability after dependency resolution.",
      {
        primaryLocomotionCapabilityRefs: primaryLocomotionCapabilities.map(
          (capability) => capability.resourceRef
        )
      }
    );
  }
  const locomotionCapability = primaryLocomotionCapabilities[0];
  const physicsBodyProfile = subjectResourceRegistry.resolvePhysicsBodyProfile(
    definition.profiles.physicsBodyProfileRef
  );
  if (physicsBodyProfile === void 0) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/physicsBodyProfileRef`,
      `Physics Body Profile '${definition.profiles.physicsBodyProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.profiles.physicsBodyProfileRef }
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      physicsBodyProfile,
      `${instancePath}/profiles/physicsBodyProfileRef`,
      diagnostics
    );
  }
  const locomotionProfile = subjectResourceRegistry.resolveLocomotionProfile(
    definition.profiles.locomotionProfileRef
  );
  if (locomotionProfile === void 0) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/locomotionProfileRef`,
      `Locomotion Profile '${definition.profiles.locomotionProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.profiles.locomotionProfileRef }
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      locomotionProfile,
      `${instancePath}/profiles/locomotionProfileRef`,
      diagnostics
    );
  }
  const controlFeelProfile = resolveControlFeelProfileV1(definition, request);
  for (const capability of capabilities) {
    for (const requiredRef of capability.requiredCapabilityRefs) {
      if (!selectedCapabilityRefs.has(requiredRef)) {
        addError$1(
          diagnostics,
          "SUBJECT_CAPABILITY_UNSATISFIED",
          `${instancePath}/capabilityRefs`,
          `Capability '${capability.resourceRef}' requires '${requiredRef}'.`,
          { capabilityRef: capability.resourceRef, requiredCapabilityRef: requiredRef }
        );
      }
    }
    for (const conflictingRef of capability.conflictingCapabilityRefs) {
      if (selectedCapabilityRefs.has(conflictingRef)) {
        addError$1(
          diagnostics,
          "SUBJECT_CAPABILITY_UNSATISFIED",
          `${instancePath}/capabilityRefs`,
          `Capability '${capability.resourceRef}' conflicts with '${conflictingRef}'.`,
          { capabilityRef: capability.resourceRef, conflictingCapabilityRef: conflictingRef }
        );
      }
    }
  }
  if (locomotionProfile !== void 0 && locomotionProfile.requiredCapabilityRefs.some(
    (resourceRef) => !selectedCapabilityRefs.has(resourceRef)
  )) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/locomotionProfileRef`,
      `Locomotion Profile '${locomotionProfile.resourceRef}' requires a missing Capability.`,
      { requiredCapabilityRefs: locomotionProfile.requiredCapabilityRefs }
    );
  }
  if (physicsBodyProfile !== void 0 && !physicsBodyProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
    addError$1(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/physicsBodyProfileRef`,
      `Physics Body Profile '${physicsBodyProfile.resourceRef}' does not support '${definition.bodyTopology}'.`,
      { bodyTopology: definition.bodyTopology }
    );
  }
  const visualResources = resolveVisualResources(definition, request);
  if (definition.visualBinding.mode === "static") {
    definition.sockets.forEach((socket, index) => {
      if (socket.kind === "bone") {
        addError$1(
          diagnostics,
          "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
          `${instancePath}/sockets/${index}/kind`,
          "A Bone Socket requires a rigged Visual Binding.",
          { socketId: socket.id }
        );
      }
    });
  }
  const normalizedCollider = resolveColliderPolicy(definition, request);
  const capabilityAssembly = normalizeCapabilityAssemblyV1(definition, request);
  const primitiveCost = calculatePrimitiveResourceCost(
    visualParts.filter((part) => part.kind === "primitive")
  );
  const subjectAsset = visualResources?.subjectAssetResource;
  const resourceCost = {
    vertices: primitiveCost.vertices + (subjectAsset?.inventory.vertexCount ?? 0),
    triangles: primitiveCost.triangles + (subjectAsset?.inventory.triangleCount ?? 0),
    colliders: 1
  };
  if (resourceBudget !== void 0 && subjectAsset !== void 0) {
    if (resourceCost.vertices > resourceBudget.maxVertices) {
      addError$1(
        diagnostics,
        "SUBJECT_ASSET_BUDGET_EXCEEDED",
        "/world/resourceBudget/maxVertices",
        `Subject Asset '${subjectAsset.resourceRef}' exceeds the world vertex budget.`,
        {
          subjectAssetRef: subjectAsset.resourceRef,
          requiredVertices: resourceCost.vertices,
          maxVertices: resourceBudget.maxVertices
        }
      );
    }
    if (resourceCost.triangles > resourceBudget.maxTriangles) {
      addError$1(
        diagnostics,
        "SUBJECT_ASSET_BUDGET_EXCEEDED",
        "/world/resourceBudget/maxTriangles",
        `Subject Asset '${subjectAsset.resourceRef}' exceeds the world triangle budget.`,
        {
          subjectAssetRef: subjectAsset.resourceRef,
          requiredTriangles: resourceCost.triangles,
          maxTriangles: resourceBudget.maxTriangles
        }
      );
    }
  }
  const finalErrorCount = diagnostics.filter((item) => item.severity === "error").length;
  if (finalErrorCount > initialErrorCount || physicsBodyProfile === void 0 || locomotionProfile === void 0 || controlFeelProfile === void 0 || locomotionCapability === void 0 || capabilityAssembly === void 0 || normalizedCollider === void 0 || definition.visualBinding.mode === "rigged" && (visualResources?.subjectAssetResource === void 0 || visualResources.rigProfileResource === void 0 || visualResources.animationSetResource === void 0)) {
    return void 0;
  }
  const normalizedDefinitionHashInput = {
    subjectDefinitionRef,
    id: definition.id,
    version: definition.version,
    kind: "subject-definition",
    category: definition.category,
    bodyTopology: definition.bodyTopology,
    semanticClassId: definition.semanticClassId,
    coordinateConvention: structuredClone(definition.coordinateConvention),
    visualParts,
    visualBinding: definition.visualBinding.mode === "static" ? { mode: "static" } : {
      mode: "rigged",
      rigProfileRef: definition.visualBinding.rigProfileRef,
      animationSetRef: definition.visualBinding.animationSetRef
    },
    sockets,
    mountSlots,
    colliderPolicy: structuredClone(definition.colliderPolicy),
    capabilityRefs,
    locomotionCapabilityRef: locomotionCapability.resourceRef,
    locomotionCapabilityHash: locomotionCapability.contentHash,
    allowedOverridePaths: sortedStrings(definition.allowedOverridePaths),
    profiles: structuredClone(definition.profiles),
    locomotion: {
      allowWalk: locomotionProfile.allowWalk,
      allowRun: locomotionProfile.allowRun,
      allowJump: locomotionProfile.allowJump
    },
    controlFeel: projectControlFeelProfile(controlFeelProfile),
    capabilityAssembly,
    aiMetadata: {
      ...structuredClone(definition.aiMetadata),
      semanticTags: sortedStrings(definition.aiMetadata.semanticTags)
    }
  };
  const subjectDefinitionHash = sha256CanonicalJson(normalizedDefinitionHashInput);
  if (source === "package") {
    resourceLockBuilder.addPackageSubjectDefinition(
      subjectDefinitionRef,
      definition.version,
      subjectDefinitionHash,
      instancePath,
      diagnostics
    );
  }
  return {
    ...normalizedDefinitionHashInput,
    subjectDefinitionHash,
    source,
    availableControlFeels: resolveAvailableControlFeelsV1(request),
    collider: {
      ...normalizedCollider,
      massKilograms: physicsBodyProfile.physicsBody.massKilograms,
      maxSlopeDegrees: physicsBodyProfile.physicsBody.maxSlopeDegrees,
      maxStepHeightMeters: physicsBodyProfile.physicsBody.maxStepHeightMeters
    },
    resourceCost
  };
}
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
        addError2(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports2.reportError = reportError;
    function reportExtraError(cxt, error = exports2.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError2(gen, errObj);
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
    function addError2(gen, errObj) {
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
  function checkMissingProp({ gen, data, it: { opts } }, properties2, missing2) {
    return (0, codegen_1.or)(...properties2.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing2} = ${prop}`)));
  }
  code.checkMissingProp = checkMissingProp;
  function reportMissingProp(cxt, missing2) {
    cxt.setParams({ missingProperty: missing2 }, true);
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
    const u2 = opts.unicodeRegExp ? "u" : "";
    const { regExp } = opts.code;
    const rx = regExp(pattern2, u2);
    return gen.scopeValue("pattern", {
      key: rx.toString(),
      ref: rx,
      code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern2}, ${u2})`
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
  function useKeyword(gen, keyword2, result2) {
    if (result2 === void 0)
      throw new Error(`keyword "${keyword2}" failed to compile`);
    return gen.scopeValue("keyword", typeof result2 == "function" ? { ref: result2 } : { ref: result2, code: (0, codegen_1.stringify)(result2) });
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
  function getFullPath(resolver, id2 = "", normalize2) {
    if (normalize2 !== false)
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
  function normalize2(uri2, options) {
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
    normalize: normalize2,
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
      const invalid2 = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
      cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid2}))`);
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
      const u2 = it.opts.unicodeRegExp ? "u" : "";
      if ($data) {
        const { regExp } = it.opts.code;
        const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
        const valid = gen.let("valid");
        gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u2}).test(${data})`), () => gen.assign(valid, false));
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
        const missing2 = gen.let("missing");
        if (useLoop || $data) {
          const valid = gen.let("valid", true);
          cxt.block$data(valid, () => loopUntilMissing(missing2, valid));
          cxt.ok(valid);
        } else {
          gen.if((0, code_1.checkMissingProp)(cxt, schema, missing2));
          (0, code_1.reportMissingProp)(cxt, missing2);
          gen.else();
        }
      }
      function loopAllRequired() {
        gen.forOf("prop", schemaCode, (prop) => {
          cxt.setParams({ missingProperty: prop });
          gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
        });
      }
      function loopUntilMissing(missing2, valid) {
        cxt.setParams({ missingProperty: missing2 });
        gen.forOf(missing2, schemaCode, () => {
          gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing2, opts.ownProperties));
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
    message: ({ params: { min: min2, max: max2 } }) => max2 === void 0 ? (0, codegen_1.str)`must contain at least ${min2} valid item(s)` : (0, codegen_1.str)`must contain at least ${min2} and no more than ${max2} valid item(s)`,
    params: ({ params: { min: min2, max: max2 } }) => max2 === void 0 ? (0, codegen_1._)`{minContains: ${min2}}` : (0, codegen_1._)`{minContains: ${min2}, maxContains: ${max2}}`
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
      let min2;
      let max2;
      const { minContains, maxContains } = parentSchema;
      if (it.opts.next) {
        min2 = minContains === void 0 ? 1 : minContains;
        max2 = maxContains;
      } else {
        min2 = 1;
      }
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      cxt.setParams({ min: min2, max: max2 });
      if (max2 === void 0 && min2 === 0) {
        (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
        return;
      }
      if (max2 !== void 0 && min2 > max2) {
        (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
        cxt.fail();
        return;
      }
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        let cond = (0, codegen_1._)`${len} >= ${min2}`;
        if (max2 !== void 0)
          cond = (0, codegen_1._)`${cond} && ${len} <= ${max2}`;
        cxt.pass(cond);
        return;
      }
      it.items = true;
      const valid = gen.name("valid");
      if (max2 === void 0 && min2 === 1) {
        validateItems(valid, () => gen.if(valid, () => gen.break()));
      } else if (min2 === 0) {
        gen.let(valid, true);
        if (max2 !== void 0)
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
        if (max2 === void 0) {
          gen.if((0, codegen_1._)`${count} >= ${min2}`, () => gen.assign(valid, true).break());
        } else {
          gen.if((0, codegen_1._)`${count} > ${max2}`, () => gen.assign(valid, false).break());
          if (min2 === 1)
            gen.assign(valid, true);
          else
            gen.if((0, codegen_1._)`${count} >= ${min2}`, () => gen.assign(valid, true));
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
      const missing2 = gen.let("missing");
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
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing2)})`);
          (0, code_1.reportMissingProp)(cxt, missing2);
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
        const min2 = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min2 <= 59 && sec < 60)
          return true;
        const utcMin = min2 - tzM * tzSign;
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
const $defs$1 = /* @__PURE__ */ JSON.parse('{"uv":{"type":"array","prefixItems":[{"type":"number","minimum":0,"maximum":1},{"type":"number","minimum":0,"maximum":1}],"items":false,"minItems":2,"maxItems":2},"spatialRegion":{"type":"object","additionalProperties":false,"required":["id","kind","pointsMetersXZ","semanticClassId"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"polygon-xz"},"pointsMetersXZ":{"type":"array","minItems":3,"maxItems":4096,"items":{"$ref":"#/$defs/vec2"}},"minimumHeightMeters":{"type":"number"},"maximumHeightMeters":{"type":"number"},"semanticClassId":{"type":"string","minLength":1,"maxLength":128}}},"route":{"type":"object","additionalProperties":false,"required":["id","kind","pointsMetersXZ","widthMeters","locomotionProfileRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"polyline-xz"},"pointsMetersXZ":{"type":"array","minItems":2,"maxItems":4096,"items":{"$ref":"#/$defs/vec2"}},"widthMeters":{"type":"number","exclusiveMinimum":0},"locomotionProfileRef":{"type":"string","format":"locomotion-profile-ref"}}},"traversalArea":{"type":"object","additionalProperties":false,"required":["id","kind","pointsMetersXZ","surfaceEntityId","mode"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"polygon-xz"},"pointsMetersXZ":{"type":"array","minItems":3,"maxItems":128,"items":{"$ref":"#/$defs/vec2"}},"surfaceEntityId":{"$ref":"#/$defs/id"},"mode":{"const":"blocked"}}},"screenRegion":{"type":"object","additionalProperties":false,"required":["id","kind","minimumUv","maximumUv"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"rectangle-uv"},"minimumUv":{"$ref":"#/$defs/uv"},"maximumUv":{"$ref":"#/$defs/uv"}}},"placement":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","transform"],"properties":{"kind":{"const":"fixed"},"transform":{"$ref":"#/$defs/transform"}}},{"type":"object","additionalProperties":false,"required":["kind","placementConstraintIds"],"properties":{"kind":{"const":"solved"},"initialTransform":{"$ref":"#/$defs/transform"},"placementConstraintIds":{"type":"array","minItems":1,"maxItems":128,"uniqueItems":true,"items":{"$ref":"#/$defs/id"}}}}]},"objectNode":{"type":"object","additionalProperties":false,"required":["id","kind","prototypeRef","placement"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"object"},"prototypeRef":{"type":"string","format":"package-prototype-ref"},"placement":{"$ref":"#/$defs/placement"}}},"anchorNode":{"type":"object","additionalProperties":false,"required":["id","kind","placement","semantic"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"anchor"},"placement":{"$ref":"#/$defs/placement"},"semantic":{"$ref":"#/$defs/semantic"}}},"cameraNode":{"type":"object","additionalProperties":false,"required":["id","kind","components"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"camera"},"components":{"type":"object","additionalProperties":false,"required":["cameraRig"],"properties":{"cameraRig":{"type":"object","additionalProperties":false,"required":["defaultRigRef","allowedRigRefs","target","thirdPerson","manualSwitchAllowed"],"properties":{"defaultRigRef":{"$ref":"#/$defs/resourceRef"},"allowedRigRefs":{"type":"array","minItems":1,"maxItems":16,"uniqueItems":true,"items":{"$ref":"#/$defs/resourceRef"}},"target":{"type":"object","additionalProperties":false,"required":["targetEntityId"],"properties":{"targetEntityId":{"$ref":"#/$defs/id"},"targetHeightMeters":{"type":"number"}}},"thirdPerson":{"type":"object","additionalProperties":false,"required":["pitchRadians","distanceMeters","targetHeightMeters","fovDegrees","aspectRatio"],"properties":{"pitchRadians":{"type":"number","minimum":-0.95,"maximum":0.65},"distanceMeters":{"type":"number","minimum":1.8,"maximum":8},"targetHeightMeters":{"type":"number","minimum":0.5,"maximum":4.5},"fovDegrees":{"type":"number","minimum":35,"maximum":90},"aspectRatio":{"type":"number","minimum":0.25,"maximum":4}}},"manualSwitchAllowed":{"type":"boolean"}}}}}}},"insideRegionConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","regionId","boundaryClearanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"inside-region"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"regionId":{"$ref":"#/$defs/id"},"boundaryClearanceMeters":{"type":"number","minimum":0}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"outsideRegionConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","regionId","boundaryClearanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"outside-region"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"regionId":{"$ref":"#/$defs/id"},"boundaryClearanceMeters":{"type":"number","minimum":0}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"distanceRangeConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","referenceEntityId","minimumDistanceMeters","maximumDistanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"distance-range"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"referenceEntityId":{"$ref":"#/$defs/id"},"minimumDistanceMeters":{"type":"number","minimum":0},"maximumDistanceMeters":{"type":"number","minimum":0}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"facesEntityConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","facingEntityId","targetEntityId","maximumAngularDeviationDegrees"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"faces-entity"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"facingEntityId":{"$ref":"#/$defs/id"},"targetEntityId":{"$ref":"#/$defs/id"},"maximumAngularDeviationDegrees":{"type":"number","minimum":0,"maximum":180}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"supportedByConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","supportedEntityId","supportingEntityId","maximumSupportGapMeters","minimumSupportRatio"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"supported-by"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"supportedEntityId":{"$ref":"#/$defs/id"},"supportingEntityId":{"$ref":"#/$defs/id"},"maximumSupportGapMeters":{"type":"number","minimum":0},"minimumSupportRatio":{"type":"number","minimum":0,"maximum":1}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"minimumClearanceConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","entityId","clearanceMeters"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"minimum-clearance"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"clearanceMeters":{"type":"number","minimum":0},"otherEntityIds":{"type":"array","minItems":1,"maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/id"}},"semanticClassIds":{"type":"array","minItems":1,"maxItems":256,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":128}}},"oneOf":[{"type":"object","properties":{"otherEntityIds":true},"required":["otherEntityIds"],"not":{"type":"object","properties":{"semanticClassIds":true},"required":["semanticClassIds"]}},{"type":"object","properties":{"semanticClassIds":true},"required":["semanticClassIds"],"not":{"type":"object","properties":{"otherEntityIds":true},"required":["otherEntityIds"]}}],"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"withinSlopeLimitConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","terrainEntityId","maximumSlopeDegrees"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"within-slope-limit"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"entityId":{"$ref":"#/$defs/id"},"routeId":{"$ref":"#/$defs/id"},"terrainEntityId":{"$ref":"#/$defs/id"},"maximumSlopeDegrees":{"type":"number","minimum":0,"maximum":90}},"oneOf":[{"type":"object","properties":{"entityId":true},"required":["entityId"],"not":{"type":"object","properties":{"routeId":true},"required":["routeId"]}},{"type":"object","properties":{"routeId":true},"required":["routeId"],"not":{"type":"object","properties":{"entityId":true},"required":["entityId"]}}],"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"visibleInCameraRegionConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","visibleEntityId","cameraEntityId","screenRegionId","minimumVisibleRatio","minimumProjectedAreaRatio"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"visible-in-camera-region"},"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1},"visibleEntityId":{"$ref":"#/$defs/id"},"cameraEntityId":{"$ref":"#/$defs/id"},"screenRegionId":{"$ref":"#/$defs/id"},"minimumVisibleRatio":{"type":"number","minimum":0,"maximum":1},"minimumProjectedAreaRatio":{"type":"number","minimum":0,"maximum":1}},"allOf":[{"$ref":"#/$defs/requirementWeight"}]},"requirementWeight":{"type":"object","properties":{"requirement":{"enum":["required","preferred"]},"preferenceWeightRatio":{"type":"number","exclusiveMinimum":0,"maximum":1}},"if":{"type":"object","properties":{"requirement":{"const":"preferred"}},"required":["requirement"]},"then":{"type":"object","properties":{"preferenceWeightRatio":true},"required":["preferenceWeightRatio"]},"else":{"type":"object","not":{"type":"object","properties":{"preferenceWeightRatio":true},"required":["preferenceWeightRatio"]}}},"connectedByRouteConstraint":{"type":"object","additionalProperties":false,"required":["id","kind","requirement","traversingEntityId","startAnchorEntityId","destinationAnchorEntityId","routeId"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"connected-by-route"},"requirement":{"const":"required"},"traversingEntityId":{"$ref":"#/$defs/id"},"startAnchorEntityId":{"$ref":"#/$defs/id"},"destinationAnchorEntityId":{"$ref":"#/$defs/id"},"routeId":{"$ref":"#/$defs/id"}}},"connectivityConstraint":{"oneOf":[{"$ref":"#/$defs/connectedByRouteConstraint"}]},"placementConstraint":{"oneOf":[{"$ref":"#/$defs/insideRegionConstraint"},{"$ref":"#/$defs/outsideRegionConstraint"},{"$ref":"#/$defs/distanceRangeConstraint"},{"$ref":"#/$defs/facesEntityConstraint"},{"$ref":"#/$defs/supportedByConstraint"},{"$ref":"#/$defs/minimumClearanceConstraint"},{"$ref":"#/$defs/withinSlopeLimitConstraint"},{"$ref":"#/$defs/visibleInCameraRegionConstraint"}]},"id":{"type":"string","pattern":"^[a-z0-9][a-z0-9.-]{0,63}$"},"resourceRef":{"type":"string","format":"worldkit-resource-ref"},"positiveNumber":{"type":"number","exclusiveMinimum":0},"vec2":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"}],"items":false,"minItems":2,"maxItems":2},"positiveVec2":{"type":"array","prefixItems":[{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"}],"items":false,"minItems":2,"maxItems":2},"vec3":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"},{"type":"number"}],"items":false,"minItems":3,"maxItems":3},"positiveVec3":{"type":"array","prefixItems":[{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"}],"items":false,"minItems":3,"maxItems":3},"semantic":{"type":"object","additionalProperties":false,"required":["classId"],"properties":{"classId":{"type":"string","minLength":1,"maxLength":128}}},"transform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"},"scaleXYZ":{"$ref":"#/$defs/positiveVec3"}}},"provenance":{"type":"object","additionalProperties":false,"properties":{"userPrompt":{"type":"string","maxLength":20000},"referenceImages":{"type":"array","maxItems":64,"items":{"type":"object","additionalProperties":false,"required":["assetRef","evidenceClass"],"properties":{"assetRef":{"$ref":"#/$defs/resourceRef"},"evidenceClass":{"enum":["user-explicit","reference-visible","planner-inferred"]}}}}}},"world":{"type":"object","additionalProperties":false,"required":["coordinateSystem","bounds","gravityMetersPerSecondSquaredXYZ","environment","resourceBudget"],"properties":{"coordinateSystem":{"const":"right-handed-y-up-minus-z-forward"},"bounds":{"type":"object","additionalProperties":false,"required":["centerMetersXZ","sizeMetersXZ","heightRangeMeters"],"properties":{"centerMetersXZ":{"$ref":"#/$defs/vec2"},"sizeMetersXZ":{"$ref":"#/$defs/positiveVec2"},"heightRangeMeters":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"}],"items":false,"minItems":2,"maxItems":2}}},"gravityMetersPerSecondSquaredXYZ":{"$ref":"#/$defs/vec3"},"environment":{"type":"object","additionalProperties":false,"required":["preset"],"properties":{"preset":{"enum":["clear-day","golden-hour","overcast","night"]}}},"resourceBudget":{"type":"object","additionalProperties":false,"required":["maxVertices","maxTriangles","maxColliders"],"properties":{"maxVertices":{"type":"integer","minimum":1},"maxTriangles":{"type":"integer","minimum":1},"maxColliders":{"type":"integer","minimum":1}}}}},"traversalSurfaceBinding":{"type":"object","additionalProperties":false,"required":["id","kind","logicalSubshapeId","traversalSurfaceProfileRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"collider-subshape"},"logicalSubshapeId":{"$ref":"#/$defs/id"},"traversalSurfaceProfileRef":{"type":"string","format":"traversal-surface-profile-ref"}}},"prototype":{"oneOf":[{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","sizeMetersXYZ","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"box"},"sizeMetersXYZ":{"$ref":"#/$defs/positiveVec3"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}},{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","radiusMeters","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"sphere"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}},{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","radiusMeters","heightMeters","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"cylinder"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}},{"type":"object","additionalProperties":false,"required":["id","version","kind","primitive","radiusMeters","heightMeters","collisionEnabled"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"primitive"},"primitive":{"const":"cone"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"},"collisionEnabled":{"type":"boolean"},"traversalSurfaceBindings":{"type":"array","items":{"$ref":"#/$defs/traversalSurfaceBinding"}},"semantic":{"$ref":"#/$defs/semantic"}}}]},"proceduralSource":{"type":"object","additionalProperties":false,"required":["kind","relief"],"properties":{"kind":{"const":"procedural"},"relief":{"enum":["flat","plain","hills","mountains"]},"baseHeightMeters":{"type":"number"},"amplitudeMeters":{"type":"number","minimum":0},"frequencyPerMeter":{"$ref":"#/$defs/positiveNumber"},"octaves":{"type":"integer","minimum":1,"maximum":8},"lacunarityRatio":{"$ref":"#/$defs/positiveNumber"},"persistenceRatio":{"type":"number","exclusiveMinimum":0,"maximum":1}}},"terrainNode":{"type":"object","additionalProperties":false,"required":["id","kind","components"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"terrain"},"components":{"type":"object","additionalProperties":false,"required":["terrain"],"properties":{"terrain":{"type":"object","additionalProperties":false,"required":["source","grid"],"properties":{"source":{"$ref":"#/$defs/proceduralSource"},"grid":{"type":"object","additionalProperties":false,"required":["centerMetersXZ","sizeMetersXZ","resolutionCellsXZ"],"properties":{"centerMetersXZ":{"$ref":"#/$defs/vec2"},"sizeMetersXZ":{"$ref":"#/$defs/positiveVec2"},"resolutionCellsXZ":{"type":"array","prefixItems":[{"type":"integer","minimum":2,"maximum":1025},{"type":"integer","minimum":2,"maximum":1025}],"items":false,"minItems":2,"maxItems":2},"heightSamplesMeters":{"type":"array","minItems":4,"maxItems":1048576,"items":{"type":"number"}}}},"semantic":{"$ref":"#/$defs/semantic"}}}}}}},"waterBoundary":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","centerMetersXZ","radiusMeters"],"properties":{"kind":{"const":"circle"},"centerMetersXZ":{"$ref":"#/$defs/vec2"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"}}},{"type":"object","additionalProperties":false,"required":["kind","centerMetersXZ","radiusMetersXZ"],"properties":{"kind":{"const":"ellipse"},"centerMetersXZ":{"$ref":"#/$defs/vec2"},"radiusMetersXZ":{"$ref":"#/$defs/positiveVec2"}}},{"type":"object","additionalProperties":false,"required":["kind","pointsMetersXZ"],"properties":{"kind":{"const":"polygon"},"pointsMetersXZ":{"type":"array","minItems":3,"maxItems":4096,"items":{"$ref":"#/$defs/vec2"}}}}]},"waterNode":{"type":"object","additionalProperties":false,"required":["id","kind","components"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"water"},"components":{"type":"object","additionalProperties":false,"required":["water"],"properties":{"water":{"type":"object","additionalProperties":false,"required":["terrainEntityId","boundary","depthMeters"],"properties":{"terrainEntityId":{"$ref":"#/$defs/id"},"boundary":{"$ref":"#/$defs/waterBoundary"},"depthMeters":{"$ref":"#/$defs/positiveNumber"},"shoreWidthMeters":{"type":"number","minimum":0},"waterLevelMeters":{"type":"number"},"traversalMode":{"enum":["blocked","swimmable","walkable"]},"semantic":{"$ref":"#/$defs/semantic"}}}}}}},"subjectNode":{"type":"object","additionalProperties":false,"required":["id","kind","subjectDefinitionRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"subject"},"subjectDefinitionRef":{"type":"string","format":"subject-definition-ref"},"spawnAnchorEntityId":{"$ref":"#/$defs/id"},"overrides":{"type":"array","maxItems":16,"uniqueItems":true,"items":{"$ref":"#/$defs/definitionResourceRefOverride"}}}},"definitionResourceRefOverride":{"type":"object","additionalProperties":false,"required":["id","kind","path","resourceRef"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"resource-ref"},"path":{"enum":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"]},"resourceRef":{"type":"string","format":"worldkit-resource-ref"}}},"relationship":{"type":"object","additionalProperties":false,"required":["id","type","schemaVersion","riderEntityId","mountEntityId","mountSlotId"],"properties":{"id":{"$ref":"#/$defs/id"},"type":{"const":"mountedOn"},"schemaVersion":{"const":1},"riderEntityId":{"$ref":"#/$defs/id"},"mountEntityId":{"$ref":"#/$defs/id"},"mountSlotId":{"$ref":"#/$defs/id"}}},"rule":{"type":"object","additionalProperties":false,"required":["id","kind"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"type":"string","minLength":1}}},"startup":{"type":"object","additionalProperties":false,"required":["spawnAnchorEntityId","controlledEntityId","cameraEntityId"],"properties":{"spawnAnchorEntityId":{"$ref":"#/$defs/id"},"controlledEntityId":{"$ref":"#/$defs/id"},"cameraEntityId":{"$ref":"#/$defs/id"}}}}');
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
const required = ["id", "version", "kind", "authoringAvailability", "category", "bodyTopology", "semanticClassId", "coordinateConvention", "visualParts", "visualBinding", "sockets", "mountSlots", "colliderPolicy", "capabilityRefs", "profiles", "relationshipCapabilityRefs", "actionOrPoseSetRef", "renderBindingProfileRef", "allowedOverridePaths", "aiMetadata"];
const properties = { "id": { "$ref": "#/$defs/id" }, "version": { "const": 1 }, "kind": { "const": "subject-definition" }, "authoringAvailability": { "enum": ["recommended", "advanced", "experimental"] }, "category": { "enum": ["human", "animal", "custom"] }, "bodyTopology": { "enum": ["biped", "quadruped", "custom"] }, "semanticClassId": { "$ref": "#/$defs/nonEmptyString" }, "coordinateConvention": { "type": "object", "additionalProperties": false, "required": ["forwardAxis", "upAxis", "metersPerUnit", "pivot"], "properties": { "forwardAxis": { "const": "-Z" }, "upAxis": { "const": "+Y" }, "metersPerUnit": { "const": 1 }, "pivot": { "const": "support-center" } } }, "visualParts": { "type": "array", "minItems": 1, "maxItems": 128, "items": { "$ref": "#/$defs/visualPart" } }, "visualBinding": { "$ref": "#/$defs/visualBinding" }, "sockets": { "type": "array", "maxItems": 64, "items": { "$ref": "#/$defs/socket" } }, "mountSlots": { "type": "array", "maxItems": 16, "items": { "$ref": "#/$defs/mountSlot" } }, "colliderPolicy": { "$ref": "#/$defs/colliderPolicy" }, "capabilityRefs": { "type": "array", "minItems": 1, "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "format": "capability-ref" } }, "profiles": { "type": "object", "additionalProperties": false, "required": ["physicsBodyProfileRef", "locomotionProfileRef", "controlFeelProfileRef", "allowedControlFeelProfileRefs", "motion", "controlProfileRef", "cameraContextProfileRef", "mediumProfileRef", "harnessProfileRef"], "properties": { "physicsBodyProfileRef": { "type": "string", "format": "physics-body-profile-ref" }, "locomotionProfileRef": { "type": "string", "format": "locomotion-profile-ref" }, "controlFeelProfileRef": { "type": "string", "pattern": "^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "allowedControlFeelProfileRefs": { "type": "array", "minItems": 1, "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "pattern": "^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } }, "motion": { "type": "object", "additionalProperties": false, "required": ["defaultMotionProfileRef", "optionalMotionProfileRefs", "fallbackMotionProfileRef"], "properties": { "defaultMotionProfileRef": { "type": "string", "pattern": "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "optionalMotionProfileRefs": { "type": "array", "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "pattern": "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } }, "fallbackMotionProfileRef": { "type": "string", "pattern": "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } } }, "controlProfileRef": { "type": "string", "pattern": "^worldkit://control-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "cameraContextProfileRef": { "type": "string", "pattern": "^worldkit://camera-context/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "mediumProfileRef": { "type": "string", "pattern": "^worldkit://medium-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "harnessProfileRef": { "type": "string", "pattern": "^worldkit://harness-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" } } }, "relationshipCapabilityRefs": { "type": "array", "maxItems": 16, "uniqueItems": true, "items": { "type": "string", "format": "capability-ref" } }, "actionOrPoseSetRef": { "type": "string", "pattern": "^worldkit://(?:animation-set|pose-set)/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "renderBindingProfileRef": { "type": "string", "pattern": "^worldkit://render-binding/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$" }, "allowedOverridePaths": { "type": "array", "maxItems": 3, "uniqueItems": true, "items": { "enum": ["profiles.controlFeelProfileRef", "profiles.controlProfileRef", "profiles.motion.defaultMotionProfileRef"] } }, "aiMetadata": { "type": "object", "additionalProperties": false, "required": ["displayName", "description", "semanticTags"], "properties": { "displayName": { "type": "string", "minLength": 1, "maxLength": 120 }, "description": { "type": "string", "minLength": 1, "maxLength": 1e3 }, "semanticTags": { "$ref": "#/$defs/semanticTags" } } } };
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
const validateCanonicalAuthoringSpecV4 = ajv$1.compile(
  authoringSpecV4Schema
);
function canonicalJsonAdmissionResult(value) {
  try {
    assertCanonicalJsonValue(value);
    return void 0;
  } catch (error) {
    if (error instanceof CanonicalJsonAdmissionError) {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "AUTHORING_JSON_NEGATIVE_ZERO",
          instancePath: error.instancePath,
          message: "Negative zero is not allowed in Canonical JSON."
        }]
      };
    }
    throw error;
  }
}
function pointerSegment$1(value) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
function diagnosticFor(error) {
  const missingOrAdditionalProperty = error.keyword === "required" ? error.params.missingProperty : error.keyword === "additionalProperties" ? error.params.additionalProperty : void 0;
  return {
    severity: "error",
    code: error.keyword === "maxItems" && (error.instancePath === "/spatial/traversalAreas" || /^\/spatial\/traversalAreas\/[0-9]+\/pointsMetersXZ$/.test(
      error.instancePath
    )) ? "AUTHORING_SPATIAL_BUDGET_EXCEEDED" : "AUTHORING_SCHEMA_INVALID",
    instancePath: missingOrAdditionalProperty === void 0 ? error.instancePath : `${error.instancePath}/${pointerSegment$1(missingOrAdditionalProperty)}`,
    message: error.message ?? "AuthoringSpec does not match the canonical schema.",
    details: {
      keyword: error.keyword,
      schemaPath: error.schemaPath,
      params: error.params
    }
  };
}
function duplicateIdDiagnostics(spec) {
  const diagnostics = [];
  const collections = [
    ["/nodes", spec.nodes],
    ["/spatial/regions", spec.spatial.regions],
    ["/spatial/routes", spec.spatial.routes],
    ["/spatial/traversalAreas", spec.spatial.traversalAreas],
    ["/spatial/screenRegions", spec.spatial.screenRegions],
    ["/constraints/placements", spec.constraints.placements],
    ["/constraints/connectivity", spec.constraints.connectivity]
  ];
  for (const [instancePath, rows] of collections) {
    if (isEmpty(rows)) continue;
    const seen = /* @__PURE__ */ new Set();
    rows.forEach((row, index) => {
      if (seen.has(row.id)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_DUPLICATE_ID",
          instancePath: `${instancePath}/${index}/id`,
          message: `Duplicate id '${row.id}' is not allowed in this collection.`,
          details: { id: row.id }
        });
      }
      seen.add(row.id);
    });
  }
  spec.nodes.forEach((node, nodeIndex) => {
    const overrides = node.kind === "subject" ? node.overrides : void 0;
    if (isNil(overrides) || isEmpty(overrides)) return;
    const seenIds = /* @__PURE__ */ new Set();
    const seenPaths = /* @__PURE__ */ new Set();
    overrides.forEach((override, overrideIndex) => {
      const instancePath = `/nodes/${nodeIndex}/overrides/${overrideIndex}`;
      if (seenIds.has(override.id)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_DUPLICATE_ID",
          instancePath: `${instancePath}/id`,
          message: `Duplicate id '${override.id}' is not allowed in this collection.`,
          details: { id: override.id }
        });
      }
      seenIds.add(override.id);
      if (seenPaths.has(override.path)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_DUPLICATE_BINDING",
          instancePath: `${instancePath}/path`,
          message: `Duplicate override path '${override.path}' is not allowed on one Subject.`,
          details: { id: override.path }
        });
      }
      seenPaths.add(override.path);
    });
  });
  spec.resources.prototypes.forEach((prototype, prototypeIndex) => {
    const seen = /* @__PURE__ */ new Set();
    prototype.traversalSurfaceBindings?.forEach((binding, bindingIndex) => {
      if (seen.has(binding.id)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_DUPLICATE_ID",
          instancePath: `/resources/prototypes/${prototypeIndex}/traversalSurfaceBindings/${bindingIndex}/id`,
          message: `Duplicate id '${binding.id}' is not allowed in this collection.`,
          details: { id: binding.id }
        });
      }
      seen.add(binding.id);
    });
  });
  return diagnostics;
}
function traversalSurfaceBindingDiagnostics(spec) {
  const diagnostics = [];
  spec.resources.prototypes.forEach((prototype, prototypeIndex) => {
    const bindings = prototype.traversalSurfaceBindings ?? [];
    const boundLogicalSubshapeIds = /* @__PURE__ */ new Set();
    if (!prototype.collisionEnabled && bindings.length > 0) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_FEATURE_NOT_SUPPORTED",
        instancePath: `/resources/prototypes/${prototypeIndex}/traversalSurfaceBindings`,
        message: "Traversal Surface bindings require collisionEnabled to be true."
      });
    }
    bindings.forEach((binding, bindingIndex) => {
      if (boundLogicalSubshapeIds.has(binding.logicalSubshapeId)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_DUPLICATE_BINDING",
          instancePath: `/resources/prototypes/${prototypeIndex}/traversalSurfaceBindings/${bindingIndex}/logicalSubshapeId`,
          message: `Collider Subshape '${binding.logicalSubshapeId}' may have only one Traversal Surface binding.`,
          details: {
            prototypeId: prototype.id,
            logicalSubshapeId: binding.logicalSubshapeId
          }
        });
      }
      boundLogicalSubshapeIds.add(binding.logicalSubshapeId);
      if (binding.logicalSubshapeId !== "primary") {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: `/resources/prototypes/${prototypeIndex}/traversalSurfaceBindings/${bindingIndex}/logicalSubshapeId`,
          message: `Collider Subshape '${binding.logicalSubshapeId}' does not exist on Primitive Prototype '${prototype.id}'.`,
          details: {
            prototypeId: prototype.id,
            logicalSubshapeId: binding.logicalSubshapeId
          }
        });
      }
    });
  });
  return diagnostics;
}
function orderedRangeDiagnostics(spec) {
  const diagnostics = [];
  spec.spatial.regions.forEach((region, index) => {
    if (region.minimumHeightMeters !== void 0 && region.maximumHeightMeters !== void 0 && region.minimumHeightMeters > region.maximumHeightMeters) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `/spatial/regions/${index}/maximumHeightMeters`,
        message: "maximumHeightMeters must be greater than or equal to minimumHeightMeters."
      });
    }
  });
  spec.spatial.screenRegions.forEach((region, index) => {
    if (region.minimumUv[0] >= region.maximumUv[0] || region.minimumUv[1] >= region.maximumUv[1]) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `/spatial/screenRegions/${index}/maximumUv`,
        message: "maximumUv must be greater than minimumUv on both axes."
      });
    }
  });
  spec.constraints.placements.forEach((constraint, index) => {
    if (constraint.kind === "distance-range" && constraint.minimumDistanceMeters > constraint.maximumDistanceMeters) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `/constraints/placements/${index}/maximumDistanceMeters`,
        message: "maximumDistanceMeters must be greater than or equal to minimumDistanceMeters."
      });
    }
  });
  return diagnostics;
}
function requireNodeKind$1(nodes, id2, kind, instancePath, diagnostics) {
  const node = nodes.get(id2);
  if (isNil(node)) {
    diagnostics.push({
      severity: "error",
      code: "AUTHORING_REFERENCE_NOT_FOUND",
      instancePath,
      message: `Node '${id2}' does not exist.`,
      details: { id: id2 }
    });
    return;
  }
  if (node.kind !== kind) {
    diagnostics.push({
      severity: "error",
      code: "AUTHORING_REFERENCE_KIND_MISMATCH",
      instancePath,
      message: `Node '${id2}' is '${node.kind}', expected '${kind}'.`,
      details: { id: id2, actualKind: node.kind, expectedKind: kind }
    });
  }
}
function connectivityReferenceDiagnostics(spec) {
  const diagnostics = [];
  const connectivity = spec.constraints.connectivity;
  if (isEmpty(connectivity)) return diagnostics;
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  const routeIds = new Set(spec.spatial.routes.map((route) => route.id));
  connectivity.forEach((constraint, index) => {
    const base = `/constraints/connectivity/${index}`;
    requireNodeKind$1(nodeById, constraint.traversingEntityId, "subject", `${base}/traversingEntityId`, diagnostics);
    requireNodeKind$1(nodeById, constraint.startAnchorEntityId, "anchor", `${base}/startAnchorEntityId`, diagnostics);
    requireNodeKind$1(
      nodeById,
      constraint.destinationAnchorEntityId,
      "anchor",
      `${base}/destinationAnchorEntityId`,
      diagnostics
    );
    if (!routeIds.has(constraint.routeId)) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath: `${base}/routeId`,
        message: `Route '${constraint.routeId}' does not exist.`,
        details: { routeId: constraint.routeId }
      });
    }
  });
  return diagnostics;
}
function traversalAreaDiagnostics(spec) {
  const diagnostics = [];
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  const complexity = validateTraversalAreaComplexityV1({
    pointCountsByArea: spec.spatial.traversalAreas.map(
      (area) => area.pointsMetersXZ.length
    )
  });
  if (!complexity.ok) {
    diagnostics.push({
      severity: "error",
      code: "AUTHORING_SPATIAL_BUDGET_EXCEEDED",
      instancePath: isNil(complexity.areaIndex) ? "/spatial/traversalAreas" : `/spatial/traversalAreas/${complexity.areaIndex}/pointsMetersXZ`,
      message: `Traversal Area complexity exceeds the frozen budget (${complexity.issueCode}: ${complexity.actualCount} > ${complexity.maximumCount}).`
    });
  }
  spec.spatial.traversalAreas.forEach((area, index) => {
    const base = `/spatial/traversalAreas/${index}`;
    requireNodeKind$1(
      nodeById,
      area.surfaceEntityId,
      "terrain",
      `${base}/surfaceEntityId`,
      diagnostics
    );
    const polygonValidation = validateSimplePolygonXZV1(area.pointsMetersXZ);
    if (!polygonValidation.ok) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `${base}/pointsMetersXZ`,
        message: `Traversal Area polygon must be simple (${polygonValidation.issueCode}).`
      });
    }
  });
  return diagnostics;
}
function validateAuthoringSpecV4(value) {
  const admission = canonicalJsonAdmissionResult(value);
  if (!isNil(admission)) return admission;
  if (!validateCanonicalAuthoringSpecV4(value)) {
    const errors2 = validateCanonicalAuthoringSpecV4.errors;
    return {
      ok: false,
      diagnostics: (isNil(errors2) ? [] : errors2).map(diagnosticFor)
    };
  }
  const diagnostics = [
    ...duplicateIdDiagnostics(value),
    ...traversalSurfaceBindingDiagnostics(value),
    ...orderedRangeDiagnostics(value),
    ...traversalAreaDiagnostics(value),
    ...connectivityReferenceDiagnostics(value)
  ];
  return isEmpty(diagnostics) ? { ok: true, value, diagnostics: [] } : { ok: false, diagnostics };
}
const SUPPORTED_CAMERA_RIG = "worldkit://camera/third-person.standard@1";
const RELIEF_DEFAULTS_V2 = {
  flat: {
    baseHeightMeters: 0,
    amplitudeMeters: 0,
    frequencyPerMeter: 2e-3,
    octaves: 1,
    lacunarityRatio: 2,
    persistenceRatio: 0.3
  },
  plain: {
    baseHeightMeters: 0,
    amplitudeMeters: 2.5,
    frequencyPerMeter: 6e-3,
    octaves: 3,
    lacunarityRatio: 2,
    persistenceRatio: 0.35
  },
  hills: {
    baseHeightMeters: 0,
    amplitudeMeters: 8,
    frequencyPerMeter: 65e-4,
    octaves: 4,
    lacunarityRatio: 2,
    persistenceRatio: 0.42
  },
  mountains: {
    baseHeightMeters: 0,
    amplitudeMeters: 24,
    frequencyPerMeter: 35e-4,
    octaves: 4,
    lacunarityRatio: 2,
    persistenceRatio: 0.45
  }
};
function addError(diagnostics, code2, instancePath, message, details) {
  diagnostics.push({
    severity: "error",
    code: code2,
    instancePath,
    message,
    ...details === void 0 ? {} : { details }
  });
}
function buildUniqueIndex(values, basePath, diagnostics) {
  const result2 = /* @__PURE__ */ new Map();
  values.forEach((value, index) => {
    if (result2.has(value.id)) {
      addError(
        diagnostics,
        "AUTHORING_ID_DUPLICATE",
        `${basePath}/${index}/id`,
        `Duplicate ID '${value.id}'.`,
        { id: value.id }
      );
    } else {
      result2.set(value.id, value);
    }
  });
  return result2;
}
function requireNodeKind(nodes, id2, kind, instancePath, diagnostics) {
  const node = nodes.get(id2);
  if (node === void 0) {
    addError(
      diagnostics,
      "AUTHORING_REFERENCE_NOT_FOUND",
      instancePath,
      `Node '${id2}' does not exist.`,
      { id: id2 }
    );
  } else if (node.kind !== kind) {
    addError(
      diagnostics,
      "AUTHORING_REFERENCE_KIND_MISMATCH",
      instancePath,
      `Node '${id2}' is '${node.kind}', expected '${kind}'.`,
      { id: id2, actualKind: node.kind, expectedKind: kind }
    );
  }
}
const IMPLEMENTED_MOUNTED_ON_PROFILE_REF = "worldkit://relationship-profile/mounted-on.stand-ground@1";
function normalizeMountedOnRelationships(relationships, nodes, subjectDefinitions, controlledEntityId, diagnostics) {
  const definitionsByRef = new Map(
    subjectDefinitions.map((definition) => [definition.subjectDefinitionRef, definition])
  );
  const occupiedRiderIds = /* @__PURE__ */ new Set();
  const occupiedMountSlotKeys = /* @__PURE__ */ new Set();
  relationships.forEach((relationship, index) => {
    const relationshipPath = `/relationships/${index}`;
    const rider = nodes.get(relationship.riderEntityId);
    const mount = nodes.get(relationship.mountEntityId);
    requireNodeKind(
      nodes,
      relationship.riderEntityId,
      "subject",
      `${relationshipPath}/riderEntityId`,
      diagnostics
    );
    requireNodeKind(
      nodes,
      relationship.mountEntityId,
      "subject",
      `${relationshipPath}/mountEntityId`,
      diagnostics
    );
    if (relationship.riderEntityId === relationship.mountEntityId) {
      addError(
        diagnostics,
        "AUTHORING_RELATIONSHIP_ENDPOINTS_INVALID",
        relationshipPath,
        "A mountedOn Rider and Mount must be different Subject Entities.",
        { entityId: relationship.riderEntityId }
      );
    }
    const riderDefinition = rider?.kind === "subject" ? definitionsByRef.get(rider.subjectDefinitionRef) : void 0;
    const mountDefinition = mount?.kind === "subject" ? definitionsByRef.get(mount.subjectDefinitionRef) : void 0;
    const mountSlot = mountDefinition?.mountSlots.find(
      ({ id: id2 }) => id2 === relationship.mountSlotId
    );
    if (mountDefinition !== void 0 && mountSlot === void 0) {
      addError(
        diagnostics,
        "AUTHORING_MOUNT_SLOT_NOT_FOUND",
        `${relationshipPath}/mountSlotId`,
        `Mount Subject '${relationship.mountEntityId}' does not declare Mount slot '${relationship.mountSlotId}'.`,
        {
          mountEntityId: relationship.mountEntityId,
          mountSlotId: relationship.mountSlotId
        }
      );
    }
    const relationshipProfile = mountDefinition?.capabilityAssembly.relationshipProfiles.find(
      (profile) => profile.resourceRef === IMPLEMENTED_MOUNTED_ON_PROFILE_REF && profile.relationshipType === "mountedOn" && profile.runtimeStatus === "implemented"
    );
    if (mountDefinition !== void 0 && relationshipProfile === void 0) {
      addError(
        diagnostics,
        "AUTHORING_RELATIONSHIP_PROFILE_UNAVAILABLE",
        relationshipPath,
        `Mount Subject '${relationship.mountEntityId}' does not resolve the exact implemented mountedOn Relationship Profile.`,
        {
          mountEntityId: relationship.mountEntityId,
          requiredRelationshipProfileRef: IMPLEMENTED_MOUNTED_ON_PROFILE_REF
        }
      );
    }
    if (relationshipProfile !== void 0) {
      const riderSocketIds = new Set(riderDefinition?.sockets.map(({ id: id2 }) => id2) ?? []);
      const mountSocketIds = new Set(mountDefinition?.sockets.map(({ id: id2 }) => id2) ?? []);
      const missingRiderSocketId = relationshipProfile.requiredRiderSocketIds.find(
        (socketId) => !riderSocketIds.has(socketId)
      );
      const missingMountSocketId = relationshipProfile.requiredMountSocketIds.find(
        (socketId) => !mountSocketIds.has(socketId)
      );
      if (missingRiderSocketId !== void 0 || missingMountSocketId !== void 0) {
        addError(
          diagnostics,
          "AUTHORING_RELATIONSHIP_PROFILE_UNSATISFIED",
          relationshipPath,
          "The Rider or Mount is missing a Socket required by the mountedOn Relationship Profile.",
          {
            ...missingRiderSocketId === void 0 ? {} : { missingRiderSocketId },
            ...missingMountSocketId === void 0 ? {} : { missingMountSocketId }
          }
        );
      }
      if (mountSlot !== void 0 && !relationshipProfile.requiredMountSocketIds.includes(mountSlot.mountSocketId)) {
        addError(
          diagnostics,
          "AUTHORING_RELATIONSHIP_PROFILE_UNSATISFIED",
          `${relationshipPath}/mountSlotId`,
          `Mount slot '${mountSlot.id}' targets Socket '${mountSlot.mountSocketId}', which is not allowed by the mountedOn Relationship Profile.`,
          {
            mountSlotId: mountSlot.id,
            mountSocketId: mountSlot.mountSocketId,
            relationshipProfileRef: relationshipProfile.resourceRef
          }
        );
      }
    }
    if (occupiedRiderIds.has(relationship.riderEntityId)) {
      addError(
        diagnostics,
        "AUTHORING_MOUNTED_ON_RIDER_OCCUPIED",
        `${relationshipPath}/riderEntityId`,
        `Rider '${relationship.riderEntityId}' is already a Rider in another mountedOn Relationship.`,
        { riderEntityId: relationship.riderEntityId }
      );
    }
    occupiedRiderIds.add(relationship.riderEntityId);
    const mountSlotKey = `${relationship.mountEntityId}\0${relationship.mountSlotId}`;
    if (occupiedMountSlotKeys.has(mountSlotKey)) {
      addError(
        diagnostics,
        "AUTHORING_MOUNT_SLOT_OCCUPIED",
        relationshipPath,
        `Mount slot '${relationship.mountSlotId}' on '${relationship.mountEntityId}' is already occupied.`,
        {
          mountEntityId: relationship.mountEntityId,
          mountSlotId: relationship.mountSlotId
        }
      );
    }
    occupiedMountSlotKeys.add(mountSlotKey);
    if (controlledEntityId !== relationship.mountEntityId) {
      addError(
        diagnostics,
        "AUTHORING_MOUNTED_ON_POSSESSION_MISMATCH",
        "/startup/controlledEntityId",
        "An initial mountedOn Relationship requires matching initial possession of its Mount.",
        {
          controlledEntityId,
          riderEntityId: relationship.riderEntityId,
          requiredControlledEntityId: relationship.mountEntityId
        }
      );
    }
  });
  return [...relationships].sort((left, right) => left.id.localeCompare(right.id)).map((relationship) => structuredClone(relationship));
}
function normalizeTransformV2(transform) {
  return {
    positionMetersXYZ: [...transform.positionMetersXYZ],
    rotationEulerRadiansXYZ: [...transform.rotationEulerRadiansXYZ ?? [0, 0, 0]],
    scaleXYZ: [...transform.scaleXYZ ?? [1, 1, 1]]
  };
}
function normalizeTerrainSourceV2(source) {
  const defaults2 = RELIEF_DEFAULTS_V2[source.relief];
  return {
    kind: "procedural",
    relief: source.relief,
    baseHeightMeters: source.baseHeightMeters ?? defaults2.baseHeightMeters,
    amplitudeMeters: source.amplitudeMeters ?? defaults2.amplitudeMeters,
    frequencyPerMeter: source.frequencyPerMeter ?? defaults2.frequencyPerMeter,
    octaves: source.octaves ?? defaults2.octaves,
    lacunarityRatio: source.lacunarityRatio ?? defaults2.lacunarityRatio,
    persistenceRatio: source.persistenceRatio ?? defaults2.persistenceRatio
  };
}
function normalizeNodeV2(node, startup, finalTransformsByEntityId, fallbackPositionMetersXYZ) {
  switch (node.kind) {
    case "terrain":
      return {
        ...structuredClone(node),
        components: {
          terrain: {
            ...structuredClone(node.components.terrain),
            source: normalizeTerrainSourceV2(node.components.terrain.source)
          }
        }
      };
    case "water":
      return {
        ...structuredClone(node),
        components: {
          water: {
            ...structuredClone(node.components.water),
            shoreWidthMeters: node.components.water.shoreWidthMeters ?? 0,
            traversalMode: node.components.water.traversalMode ?? "blocked"
          }
        }
      };
    case "object":
    case "anchor": {
      const finalTransform = finalTransformsByEntityId[node.id];
      const transform = finalTransform ?? (node.placement.kind === "fixed" ? normalizeTransformV2(node.placement.transform) : node.placement.initialTransform === void 0 ? normalizeTransformV2({ positionMetersXYZ: fallbackPositionMetersXYZ }) : normalizeTransformV2(node.placement.initialTransform));
      const { placement: _placement, ...nodeWithoutPlacement } = node;
      return { ...structuredClone(nodeWithoutPlacement), transform };
    }
    case "subject": {
      const spawnAnchorEntityId = node.spawnAnchorEntityId ?? (node.id === startup.controlledEntityId ? startup.spawnAnchorEntityId : void 0);
      if (spawnAnchorEntityId === void 0) {
        throw new Error(
          `Normalized World IR invariant violated: Subject '${node.id}' has no spawn anchor.`
        );
      }
      return { ...structuredClone(node), spawnAnchorEntityId };
    }
    case "camera":
      return {
        ...structuredClone(node),
        components: {
          cameraRig: {
            ...structuredClone(node.components.cameraRig),
            thirdPerson: {
              pitchRadians: node.components.cameraRig.thirdPerson.pitchRadians,
              distanceMeters: node.components.cameraRig.thirdPerson.distanceMeters,
              targetHeightMeters: node.components.cameraRig.thirdPerson.targetHeightMeters,
              fovDegrees: node.components.cameraRig.thirdPerson.fovDegrees
            }
          }
        }
      };
  }
}
function packageDefinitionRef(definition) {
  return `package://subject-definition/${definition.id}@${definition.version}`;
}
function normalizeAuthoringBaseV4(value, options = {}) {
  const schemaResult = validateAuthoringSpecV4(value);
  if (!schemaResult.ok || schemaResult.value === void 0) {
    return { ok: false, diagnostics: schemaResult.diagnostics };
  }
  return normalizeValidatedAuthoringBase(schemaResult.value, options);
}
function normalizeValidatedAuthoringBase(spec, options) {
  const diagnostics = [];
  const subjectResourceRegistry = options.subjectResourceRegistry ?? builtInSubjectResourceRegistry;
  const packageDefinitionsByRef = /* @__PURE__ */ new Map();
  const definitionsToNormalizeByRef = /* @__PURE__ */ new Map();
  spec.resources.subjectDefinitions.forEach((definition, index) => {
    const resourceRef = packageDefinitionRef(definition);
    if (packageDefinitionsByRef.has(resourceRef)) {
      addError(
        diagnostics,
        "SUBJECT_DEFINITION_DUPLICATE",
        `/resources/subjectDefinitions/${index}`,
        `Duplicate Package Subject Definition '${resourceRef}'.`,
        { subjectDefinitionRef: resourceRef }
      );
      return;
    }
    packageDefinitionsByRef.set(resourceRef, definition);
    definitionsToNormalizeByRef.set(resourceRef, {
      definition,
      subjectDefinitionRef: resourceRef,
      source: "package",
      instancePath: `/resources/subjectDefinitions/${index}`
    });
  });
  const prototypes = buildUniqueIndex(
    spec.resources.prototypes,
    "/resources/prototypes",
    diagnostics
  );
  const nodes = buildUniqueIndex(spec.nodes, "/nodes", diagnostics);
  spec.rules.forEach((rule, index) => {
    addError(
      diagnostics,
      "AUTHORING_FEATURE_NOT_SUPPORTED",
      `/rules/${index}`,
      `Rule '${rule.kind}' is not supported by AuthoringSpec V${spec.schemaVersion}.`,
      { feature: "rules", kind: rule.kind }
    );
  });
  const terrains = spec.nodes.filter((node) => node.kind === "terrain");
  if (terrains.length !== 1) {
    addError(
      diagnostics,
      "AUTHORING_CARDINALITY_INVALID",
      "/nodes",
      `AuthoringSpec V${spec.schemaVersion} requires exactly one Terrain node; received ${terrains.length}.`,
      { kind: "terrain", expected: 1, actual: terrains.length }
    );
  }
  spec.nodes.forEach((node, index) => {
    if (node.kind === "object") {
      const match = /^package:\/\/prototype\/([a-z0-9][a-z0-9.-]{0,63})@([1-9][0-9]*)$/.exec(
        node.prototypeRef
      );
      const prototype = match === null ? void 0 : prototypes.get(match[1]);
      if (match === null || prototype === void 0 || prototype.version !== Number(match[2])) {
        addError(
          diagnostics,
          "AUTHORING_REFERENCE_NOT_FOUND",
          `/nodes/${index}/prototypeRef`,
          `Prototype reference '${node.prototypeRef}' does not resolve to an exact Package Prototype version.`,
          { resourceRef: node.prototypeRef }
        );
      }
    } else if (node.kind === "water") {
      requireNodeKind(
        nodes,
        node.components.water.terrainEntityId,
        "terrain",
        `/nodes/${index}/components/water/terrainEntityId`,
        diagnostics
      );
    } else if (node.kind === "subject") {
      const definitionPath = `/nodes/${index}/subjectDefinitionRef`;
      if (node.subjectDefinitionRef.startsWith("package://")) {
        const definition = packageDefinitionsByRef.get(node.subjectDefinitionRef);
        if (definition === void 0) {
          addError(
            diagnostics,
            "SUBJECT_DEFINITION_NOT_FOUND",
            definitionPath,
            `Package Subject Definition '${node.subjectDefinitionRef}' does not exist.`,
            {
              subjectDefinitionRef: node.subjectDefinitionRef,
              availableSubjectDefinitionRefs: [...packageDefinitionsByRef.keys()].sort()
            }
          );
        }
      } else {
        const definition = subjectResourceRegistry.resolveSubjectDefinition(
          node.subjectDefinitionRef
        );
        if (definition === void 0) {
          addError(
            diagnostics,
            "SUBJECT_DEFINITION_NOT_FOUND",
            definitionPath,
            `Registry Subject Definition '${node.subjectDefinitionRef}' does not exist.`,
            {
              subjectDefinitionRef: node.subjectDefinitionRef,
              availableSubjectDefinitionRefs: subjectResourceRegistry.listDiscoverableResources({ kind: "subject-definition" }).map((candidate) => candidate.resourceRef)
            }
          );
        } else if (!definitionsToNormalizeByRef.has(node.subjectDefinitionRef)) {
          definitionsToNormalizeByRef.set(node.subjectDefinitionRef, {
            definition,
            subjectDefinitionRef: node.subjectDefinitionRef,
            source: "registry",
            instancePath: definitionPath
          });
        }
      }
      if (node.spawnAnchorEntityId !== void 0) {
        requireNodeKind(
          nodes,
          node.spawnAnchorEntityId,
          "anchor",
          `/nodes/${index}/spawnAnchorEntityId`,
          diagnostics
        );
      } else if (node.id !== spec.startup.controlledEntityId) {
        addError(
          diagnostics,
          "AUTHORING_SUBJECT_SPAWN_REQUIRED",
          `/nodes/${index}/spawnAnchorEntityId`,
          "Every Subject except the startup controlled Subject must declare spawnAnchorEntityId.",
          { subjectEntityId: node.id }
        );
      }
    } else if (node.kind === "camera") {
      const rig = node.components.cameraRig;
      if (rig.defaultRigRef !== SUPPORTED_CAMERA_RIG || rig.allowedRigRefs.some((resourceRef) => resourceRef !== SUPPORTED_CAMERA_RIG)) {
        addError(
          diagnostics,
          "AUTHORING_RESOURCE_NOT_SUPPORTED",
          `/nodes/${index}/components/cameraRig`,
          `AuthoringSpec V${spec.schemaVersion} supports only the standard third-person Camera Rig.`,
          { supportedResourceRefs: [SUPPORTED_CAMERA_RIG] }
        );
      }
      if (!rig.allowedRigRefs.includes(rig.defaultRigRef)) {
        addError(
          diagnostics,
          "AUTHORING_DEFAULT_NOT_ALLOWED",
          `/nodes/${index}/components/cameraRig/defaultRigRef`,
          "The default Camera Rig must also appear in allowedRigRefs."
        );
      }
      requireNodeKind(
        nodes,
        rig.target.targetEntityId,
        "subject",
        `/nodes/${index}/components/cameraRig/target/targetEntityId`,
        diagnostics
      );
    }
  });
  requireNodeKind(
    nodes,
    spec.startup.spawnAnchorEntityId,
    "anchor",
    "/startup/spawnAnchorEntityId",
    diagnostics
  );
  requireNodeKind(
    nodes,
    spec.startup.controlledEntityId,
    "subject",
    "/startup/controlledEntityId",
    diagnostics
  );
  requireNodeKind(
    nodes,
    spec.startup.cameraEntityId,
    "camera",
    "/startup/cameraEntityId",
    diagnostics
  );
  const controlled = nodes.get(spec.startup.controlledEntityId);
  const camera = nodes.get(spec.startup.cameraEntityId);
  if (controlled?.kind === "subject" && camera?.kind === "camera" && camera.components.cameraRig.target.targetEntityId !== controlled.id) {
    addError(
      diagnostics,
      "AUTHORING_STARTUP_TARGET_MISMATCH",
      "/startup/controlledEntityId",
      "The startup Camera target must be the startup controlled Subject.",
      { cameraTargetEntityId: camera.components.cameraRig.target.targetEntityId }
    );
  }
  const spawn = nodes.get(spec.startup.spawnAnchorEntityId);
  const terrain = terrains[0];
  if (spawn?.kind === "anchor" && terrain?.kind === "terrain") {
    const fallbackPositionMetersXYZ = [
      spec.world.bounds.centerMetersXZ[0],
      0,
      spec.world.bounds.centerMetersXZ[1]
    ];
    const spawnTransform = options.finalTransformsByEntityId?.[spawn.id] ?? (spawn.placement.kind === "fixed" ? normalizeTransformV2(spawn.placement.transform) : spawn.placement.initialTransform === void 0 ? normalizeTransformV2({ positionMetersXYZ: fallbackPositionMetersXYZ }) : normalizeTransformV2(spawn.placement.initialTransform));
    const [x, , z] = spawnTransform.positionMetersXYZ;
    const [centerX, centerZ] = terrain.components.terrain.grid.centerMetersXZ;
    const [sizeX, sizeZ] = terrain.components.terrain.grid.sizeMetersXZ;
    if (x < centerX - sizeX / 2 || x > centerX + sizeX / 2 || z < centerZ - sizeZ / 2 || z > centerZ + sizeZ / 2) {
      const index = spec.nodes.indexOf(spawn);
      addError(
        diagnostics,
        "AUTHORING_SPAWN_OUT_OF_BOUNDS",
        `/nodes/${index}/placement/transform/positionMetersXYZ`,
        "The startup Spawn Anchor must lie inside the Terrain grid."
      );
    }
  }
  const [minimumHeightMeters, maximumHeightMeters] = spec.world.bounds.heightRangeMeters;
  if (minimumHeightMeters >= maximumHeightMeters) {
    addError(
      diagnostics,
      "AUTHORING_RANGE_INVALID",
      "/world/bounds/heightRangeMeters",
      "heightRangeMeters minimum must be less than maximum."
    );
  }
  const resourceLockBuilder = new ResourceLockBuilderV1();
  const subjectDefinitions = [...definitionsToNormalizeByRef.values()].sort(
    (left, right) => left.subjectDefinitionRef.localeCompare(right.subjectDefinitionRef)
  ).flatMap((input) => {
    const normalized2 = normalizeSubjectDefinitionV2({
      ...input,
      subjectResourceRegistry,
      resourceLockBuilder,
      diagnostics,
      resourceBudget: spec.world.resourceBudget
    });
    return normalized2 === void 0 ? [] : [normalized2];
  });
  const {
    subjectAssets,
    rigProfiles,
    animationSets,
    colliderProfiles,
    resourceLock,
    resourceLockHash
  } = resourceLockBuilder.finish();
  const relationships = normalizeMountedOnRelationships(
    spec.relationships,
    nodes,
    subjectDefinitions,
    spec.startup.controlledEntityId,
    diagnostics
  );
  if (diagnostics.some((diagnostic2) => diagnostic2.severity === "error")) {
    return { ok: false, diagnostics };
  }
  const normalized = {
    id: spec.id,
    seed: spec.seed,
    ...spec.provenance === void 0 ? {} : { provenance: structuredClone(spec.provenance) },
    world: structuredClone(spec.world),
    resources: {
      prototypes: [...spec.resources.prototypes].sort((left, right) => left.id.localeCompare(right.id)).map((prototype) => structuredClone(prototype)),
      subjectDefinitions,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      resourceLock,
      resourceLockHash
    },
    nodes: [...spec.nodes].sort((left, right) => left.id.localeCompare(right.id)).map((node) => normalizeNodeV2(
      node,
      spec.startup,
      options.finalTransformsByEntityId ?? {},
      [spec.world.bounds.centerMetersXZ[0], 0, spec.world.bounds.centerMetersXZ[1]]
    )),
    relationships,
    startup: structuredClone(spec.startup)
  };
  return {
    ok: true,
    value: normalized,
    diagnostics: [],
    normalizedWorldIrHash: sha256CanonicalJson(normalized)
  };
}
function diagnostic(code2, instancePath, message, details) {
  return {
    severity: "error",
    code: code2,
    instancePath,
    message,
    ...details === void 0 ? {} : { details }
  };
}
function normalizeTransform(transform) {
  return {
    positionMetersXYZ: [...transform.positionMetersXYZ],
    rotationEulerRadiansXYZ: [...transform.rotationEulerRadiansXYZ ?? [0, 0, 0]],
    scaleXYZ: [...transform.scaleXYZ ?? [1, 1, 1]]
  };
}
function lattice$1(seed, x, z) {
  let value = seed ^ Math.imul(x, 521288629) ^ Math.imul(z, 1597334677);
  value = Math.imul(value ^ value >>> 16, 73244475);
  value = Math.imul(value ^ value >>> 16, 73244475);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}
function smootherStep$1(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}
function lerp$1(from, to, amount) {
  return from + (to - from) * amount;
}
function valueNoise(seed, x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smootherStep$1(x - x0);
  const tz = smootherStep$1(z - z0);
  const top = lerp$1(lattice$1(seed, x0, z0), lattice$1(seed, x1, z0), tx);
  const bottom = lerp$1(lattice$1(seed, x0, z1), lattice$1(seed, x1, z1), tx);
  return lerp$1(top, bottom, tz) * 2 - 1;
}
function fractalNoise(seed, x, z, source) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < source.octaves; octave += 1) {
    total += valueNoise(seed, x * frequency, z * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= source.persistenceRatio;
    frequency *= source.lacunarityRatio;
  }
  return normalization === 0 ? 0 : total / normalization;
}
function terrainHeightfield(normalized) {
  const terrain = normalized.nodes.find((node) => node.kind === "terrain");
  if (terrain === void 0) throw new Error("AUTHORING_TERRAIN_REQUIRED");
  const { grid, source } = terrain.components.terrain;
  const [columns, rows] = grid.resolutionCellsXZ;
  const [centerX, centerZ] = grid.centerMetersXZ;
  const [sizeX, sizeZ] = grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const sampledHeights = grid.heightSamplesMeters;
  const heightSamplesMeters = [];
  if (!isNil(sampledHeights)) {
    if (sampledHeights.length !== columns * rows) {
      throw new Error("AUTHORING_TERRAIN_HEIGHT_SAMPLES_LENGTH_INVALID");
    }
    for (const heightMeters of sampledHeights) {
      heightSamplesMeters.push(heightMeters);
    }
  } else {
    for (let zIndex = 0; zIndex < rows; zIndex += 1) {
      const z = minimumZ + zIndex / (rows - 1) * sizeZ;
      for (let xIndex = 0; xIndex < columns; xIndex += 1) {
        const x = minimumX + xIndex / (columns - 1) * sizeX;
        const noise = source.amplitudeMeters === 0 ? 0 : fractalNoise(
          normalized.seed,
          x * source.frequencyPerMeter,
          z * source.frequencyPerMeter,
          source
        );
        heightSamplesMeters.push(source.baseHeightMeters + noise * source.amplitudeMeters);
      }
    }
  }
  return {
    terrainEntityId: terrain.id,
    centerMetersXZ: [...grid.centerMetersXZ],
    sizeMetersXZ: [...grid.sizeMetersXZ],
    resolutionVerticesXZ: [...grid.resolutionCellsXZ],
    heightSamplesMeters
  };
}
function halfExtents(prototype) {
  switch (prototype.primitive) {
    case "box":
      return prototype.sizeMetersXYZ.map((value) => value / 2);
    case "sphere":
      return [prototype.radiusMeters, prototype.radiusMeters, prototype.radiusMeters];
    case "cylinder":
    case "cone":
      return [prototype.radiusMeters, prototype.heightMeters / 2, prototype.radiusMeters];
  }
}
function constraintEntityIds(constraint) {
  switch (constraint.kind) {
    case "inside-region":
    case "outside-region":
      return [constraint.entityId];
    case "distance-range":
      return [constraint.entityId, constraint.referenceEntityId];
    case "faces-entity":
      return [constraint.facingEntityId, constraint.targetEntityId];
    case "supported-by":
      return [constraint.supportedEntityId, constraint.supportingEntityId];
    case "minimum-clearance":
      return [constraint.entityId, ...constraint.otherEntityIds ?? []];
    case "within-slope-limit":
      return constraint.entityId === void 0 ? [] : [constraint.entityId];
    case "visible-in-camera-region":
      return [constraint.visibleEntityId];
  }
}
function semanticReferenceDiagnostics(spec) {
  const diagnostics = [];
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  const regionIds = new Set(spec.spatial.regions.map((region) => region.id));
  const routeIds = new Set(spec.spatial.routes.map((route) => route.id));
  const screenRegionIds = new Set(spec.spatial.screenRegions.map((region) => region.id));
  const constraintById = new Map(spec.constraints.placements.map((constraint) => [constraint.id, constraint]));
  const requireNode = (id2, path2, kinds) => {
    const node = nodeById.get(id2);
    if (node === void 0 || kinds !== void 0 && !kinds.includes(node.kind)) {
      diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", path2, `Referenced Entity '${id2}' is unavailable.`, { entityId: id2 }));
    }
  };
  spec.nodes.forEach((node, nodeIndex) => {
    if ((node.kind === "object" || node.kind === "anchor") && node.placement.kind === "solved") {
      node.placement.placementConstraintIds.forEach((constraintId, constraintIndex) => {
        const constraint = constraintById.get(constraintId);
        const path2 = `/nodes/${nodeIndex}/placement/placementConstraintIds/${constraintIndex}`;
        if (constraint === void 0) {
          diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", path2, `Placement Constraint '${constraintId}' does not exist.`, { constraintId }));
        } else if (!constraintEntityIds(constraint).includes(node.id)) {
          diagnostics.push(diagnostic("AUTHORING_PLACEMENT_CONSTRAINT_ENTITY_MISMATCH", path2, `Placement Constraint '${constraintId}' does not constrain '${node.id}'.`, { constraintId, entityId: node.id }));
        }
      });
    }
    if (node.kind === "camera") {
      requireNode(node.components.cameraRig.target.targetEntityId, `/nodes/${nodeIndex}/components/cameraRig/target/targetEntityId`, ["subject"]);
    }
  });
  spec.constraints.placements.forEach((constraint, index) => {
    const base = `/constraints/placements/${index}`;
    switch (constraint.kind) {
      case "inside-region":
      case "outside-region":
        requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        if (!regionIds.has(constraint.regionId)) diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", `${base}/regionId`, `Region '${constraint.regionId}' does not exist.`, { regionId: constraint.regionId }));
        break;
      case "distance-range":
        requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        requireNode(constraint.referenceEntityId, `${base}/referenceEntityId`, ["object", "anchor"]);
        break;
      case "faces-entity":
        requireNode(constraint.facingEntityId, `${base}/facingEntityId`, ["object", "anchor"]);
        requireNode(constraint.targetEntityId, `${base}/targetEntityId`, ["object", "anchor"]);
        break;
      case "supported-by":
        requireNode(constraint.supportedEntityId, `${base}/supportedEntityId`, ["object", "anchor"]);
        requireNode(constraint.supportingEntityId, `${base}/supportingEntityId`, ["terrain", "object"]);
        break;
      case "minimum-clearance":
        requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        constraint.otherEntityIds?.forEach((id2, otherIndex) => requireNode(id2, `${base}/otherEntityIds/${otherIndex}`, ["object", "anchor"]));
        break;
      case "within-slope-limit":
        requireNode(constraint.terrainEntityId, `${base}/terrainEntityId`, ["terrain"]);
        if (constraint.entityId !== void 0) requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        if (constraint.routeId !== void 0 && !routeIds.has(constraint.routeId)) diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", `${base}/routeId`, `Route '${constraint.routeId}' does not exist.`, { routeId: constraint.routeId }));
        break;
      case "visible-in-camera-region":
        requireNode(constraint.visibleEntityId, `${base}/visibleEntityId`, ["object", "anchor"]);
        requireNode(constraint.cameraEntityId, `${base}/cameraEntityId`, ["camera"]);
        if (!screenRegionIds.has(constraint.screenRegionId)) diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", `${base}/screenRegionId`, `Screen Region '${constraint.screenRegionId}' does not exist.`, { screenRegionId: constraint.screenRegionId }));
        break;
    }
  });
  return diagnostics;
}
function resolveAuthoringLayoutV4(value, options = {}) {
  const schema = validateAuthoringSpecV4(value);
  if (!schema.ok || schema.value === void 0) {
    return { ok: false, diagnostics: schema.diagnostics };
  }
  const spec = schema.value;
  let resolvedSolverProfile;
  try {
    resolvedSolverProfile = resolveLayoutSolverProfileV1(
      spec.layout.solverProfileRef
    );
  } catch {
    return {
      ok: false,
      diagnostics: [diagnostic(
        "AUTHORING_LAYOUT_PROFILE_NOT_FOUND",
        "/layout/solverProfileRef",
        `Layout Solver Profile '${spec.layout.solverProfileRef}' is unavailable.`,
        { solverProfileRef: spec.layout.solverProfileRef }
      )]
    };
  }
  const referenceDiagnostics = semanticReferenceDiagnostics(spec);
  if (referenceDiagnostics.length > 0) {
    return { ok: false, diagnostics: referenceDiagnostics, resolvedSolverProfile };
  }
  const normalizedBase = normalizeAuthoringBaseV4(spec, options);
  if (!normalizedBase.ok || normalizedBase.value === void 0) {
    return {
      ok: false,
      diagnostics: normalizedBase.diagnostics,
      resolvedSolverProfile
    };
  }
  return resolveValidatedAuthoringLayout(
    spec,
    normalizedBase.value,
    resolvedSolverProfile,
    hashAuthoringDocumentV4(spec),
    hashAuthoringLayoutInputV4(spec, normalizedBase.value)
  );
}
function resolveValidatedAuthoringLayout(spec, normalized, resolvedSolverProfile, authoringSpecHash, layoutInputHash) {
  const prototypeByRef = new Map(normalized.resources.prototypes.map((prototype) => [
    `package://prototype/${prototype.id}@${prototype.version}`,
    prototype
  ]));
  const entities = spec.nodes.filter((node) => node.kind === "object" || node.kind === "anchor").map((node) => {
    const insideRegionIds = spec.constraints.placements.flatMap(
      (constraint) => constraint.kind === "inside-region" && constraint.entityId === node.id ? [constraint.regionId] : []
    ).sort();
    const supportingTerrainEntityId = spec.constraints.placements.find(
      (constraint) => constraint.kind === "supported-by" && constraint.supportedEntityId === node.id && normalized.nodes.some((candidate) => candidate.kind === "terrain" && candidate.id === constraint.supportingEntityId)
    );
    const prototype = node.kind === "object" ? prototypeByRef.get(node.prototypeRef) : void 0;
    if (node.kind === "object" && prototype === void 0) throw new Error("AUTHORING_PROTOTYPE_INVARIANT");
    const semanticClassId = node.kind === "object" ? prototype.semantic?.classId : node.semantic.classId;
    return {
      id: node.id,
      ...semanticClassId === void 0 ? {} : { semanticClassId },
      halfExtentsMetersXYZ: node.kind === "object" ? halfExtents(prototype) : [0, 0, 0],
      placement: node.placement.kind === "fixed" ? { kind: "fixed", transform: normalizeTransform(node.placement.transform) } : {
        kind: "solved",
        ...node.placement.initialTransform === void 0 ? {} : { initialTransform: normalizeTransform(node.placement.initialTransform) },
        placementConstraintIds: [...node.placement.placementConstraintIds]
      },
      candidateRegionIds: insideRegionIds,
      candidateRouteIds: [],
      explicitAnchorEntityIds: [],
      ...supportingTerrainEntityId?.kind !== "supported-by" ? {} : { supportingTerrainEntityId: supportingTerrainEntityId.supportingEntityId }
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const terrain = terrainHeightfield(normalized);
  const subjectById = new Map(spec.nodes.filter((node) => node.kind === "subject").map((node) => [node.id, node]));
  const camerasByEntityId = Object.fromEntries(spec.nodes.filter((node) => node.kind === "camera").sort((left, right) => left.id.localeCompare(right.id)).map((node) => {
    const rig = node.components.cameraRig;
    const targetSubject = subjectById.get(rig.target.targetEntityId);
    const targetAnchorEntityId = targetSubject.spawnAnchorEntityId ?? spec.startup.spawnAnchorEntityId;
    return [node.id, {
      kind: "third-person",
      cameraEntityId: node.id,
      targetAnchorEntityId,
      targetHeightMeters: rig.target.targetHeightMeters ?? rig.thirdPerson.targetHeightMeters,
      pitchRadians: rig.thirdPerson.pitchRadians,
      distanceMeters: rig.thirdPerson.distanceMeters,
      verticalFovDegrees: rig.thirdPerson.fovDegrees,
      aspectRatio: rig.thirdPerson.aspectRatio,
      nearClipMeters: 0.1,
      farClipMeters: 1e3
    }];
  }));
  const [centerX, centerZ] = spec.world.bounds.centerMetersXZ;
  const [sizeX, sizeZ] = spec.world.bounds.sizeMetersXZ;
  const [minimumY, maximumY] = spec.world.bounds.heightRangeMeters;
  const valueResult = {
    kind: "worldkit-resolved-layout-input",
    schemaVersion: 1,
    id: spec.id,
    authoringSpecHash,
    layoutInputHash,
    registryLockHash: normalized.resources.resourceLockHash,
    solverProfile: {
      solverProfileRef: resolvedSolverProfile.resourceRef,
      resolvedVersion: resolvedSolverProfile.resolvedVersion,
      contentHash: resolvedSolverProfile.contentHash
    },
    seed: spec.seed,
    worldBounds: {
      minimumMetersXYZ: [centerX - sizeX / 2, minimumY, centerZ - sizeZ / 2],
      maximumMetersXYZ: [centerX + sizeX / 2, maximumY, centerZ + sizeZ / 2]
    },
    entities,
    regions: structuredClone(spec.spatial.regions),
    routes: structuredClone(spec.spatial.routes),
    screenRegions: structuredClone(spec.spatial.screenRegions),
    constraints: structuredClone(spec.constraints.placements),
    anchorsByEntityId: {},
    geometry: {
      heightfieldsByTerrainEntityId: { [terrain.terrainEntityId]: terrain },
      staticBoundsByEntityId: {},
      camerasByEntityId
    }
  };
  return { ok: true, value: valueResult, diagnostics: [], resolvedSolverProfile };
}
function solverDiagnostic(row) {
  return {
    severity: "error",
    code: row.code,
    instancePath: row.instancePath,
    message: `Layout solve failed with '${row.code}'.`,
    details: {
      ...row.entityId === void 0 ? {} : { entityId: row.entityId },
      ...row.constraintIds === void 0 ? {} : { constraintIds: row.constraintIds },
      ...row.repairOperations === void 0 ? {} : { repairOperations: row.repairOperations }
    }
  };
}
function assertionFor(constraint, report) {
  const evaluation = report.constraintResultsById[constraint.id];
  if (evaluation === void 0 || !evaluation.satisfied) {
    throw new Error(`NORMALIZED_LAYOUT_ASSERTION_MISSING: '${constraint.id}'.`);
  }
  const {
    id: constraintId,
    requirement: _requirement,
    preferenceWeightRatio: _preferenceWeightRatio,
    ...expectation
  } = constraint;
  return {
    ...expectation,
    constraintId,
    evidenceEntityIds: [...evaluation.evidenceIds],
    measurements: structuredClone(evaluation.measurements),
    tolerances: structuredClone(evaluation.tolerances)
  };
}
function normalizedNodesV4(spec, nodes, report, layoutSolveReportHash) {
  const sourceById = new Map(spec.nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const source = sourceById.get(node.id);
    if (source === void 0) {
      throw new Error(`NORMALIZED_WORLD_NODE_SOURCE_MISSING: '${node.id}'.`);
    }
    if (node.kind === "camera") {
      if (source.kind !== "camera") {
        throw new Error("NORMALIZED_WORLD_CAMERA_KIND_MISMATCH");
      }
      return structuredClone(source);
    }
    if (node.kind !== "object" && node.kind !== "anchor") {
      return structuredClone(node);
    }
    if (source.kind !== node.kind) {
      throw new Error("NORMALIZED_WORLD_PLACEMENT_KIND_MISMATCH");
    }
    const placement = report.placementsByEntityId[node.id];
    if (placement === void 0) {
      throw new Error(`NORMALIZED_WORLD_PLACEMENT_MISSING: '${node.id}'.`);
    }
    return {
      ...structuredClone(node),
      placementProvenance: {
        kind: source.placement.kind,
        candidateId: placement.candidateId,
        placementConstraintIds: source.placement.kind === "solved" ? [...placement.satisfiedConstraintIds] : [],
        solverProfileRef: report.solverProfileRef,
        layoutSolveReportHash
      }
    };
  });
}
function deepFreeze$2(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze$2(child);
  return Object.freeze(value);
}
function restoreCanonicalV4Prototypes(spec, prototypes) {
  const sourceById = new Map(
    spec.resources.prototypes.map((prototype) => [prototype.id, prototype])
  );
  return prototypes.map((prototype) => {
    const source = sourceById.get(prototype.id);
    if (source?.traversalSurfaceBindings === void 0) {
      return structuredClone(prototype);
    }
    const traversalSurfaceBindings = deepFreeze$2(
      [...source.traversalSurfaceBindings].sort((left, right) => left.id.localeCompare(right.id)).map((binding) => structuredClone(binding))
    );
    return {
      ...structuredClone(prototype),
      traversalSurfaceBindings
    };
  });
}
function augmentResourceLockWithTraversalSurfaceProfiles(spec, baseResourceLock) {
  const diagnostics = [];
  const builder = new ResourceLockBuilderV1();
  baseResourceLock.forEach((entry, index) => {
    builder.addResolvedResource(
      entry,
      `/resources/resourceLock/${index}`,
      diagnostics
    );
  });
  const seenProfileRefs = /* @__PURE__ */ new Set();
  spec.resources.prototypes.forEach((prototype, prototypeIndex) => {
    prototype.traversalSurfaceBindings?.forEach((binding, bindingIndex) => {
      if (seenProfileRefs.has(binding.traversalSurfaceProfileRef)) return;
      seenProfileRefs.add(binding.traversalSurfaceProfileRef);
      const instancePath = `/resources/prototypes/${prototypeIndex}/traversalSurfaceBindings/${bindingIndex}/traversalSurfaceProfileRef`;
      try {
        const resolved = resolveTraversalSurfaceProfileV1(
          binding.traversalSurfaceProfileRef
        );
        builder.addResolvedResource(
          {
            resourceRef: resolved.resourceRef,
            resourceKind: "traversal-surface-profile",
            resolvedVersion: resolved.resolvedVersion,
            contentHash: resolved.contentHash
          },
          instancePath,
          diagnostics
        );
      } catch {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath,
          message: `Traversal Surface Profile '${binding.traversalSurfaceProfileRef}' could not be resolved.`,
          details: { resourceRef: binding.traversalSurfaceProfileRef }
        });
      }
    });
  });
  const { resourceLock, resourceLockHash } = builder.finish();
  return { diagnostics, resourceLock, resourceLockHash };
}
function normalizeConnectivityRequirement(requirement) {
  return {
    constraintId: requirement.id,
    kind: requirement.kind,
    traversingEntityId: requirement.traversingEntityId,
    startAnchorEntityId: requirement.startAnchorEntityId,
    destinationAnchorEntityId: requirement.destinationAnchorEntityId,
    routeId: requirement.routeId
  };
}
function normalizeAuthoringSpecV4(value, options = {}) {
  const resolved = resolveAuthoringLayoutV4(value, options);
  if (!resolved.ok || resolved.value === void 0 || resolved.resolvedSolverProfile === void 0) {
    return { ok: false, diagnostics: resolved.diagnostics };
  }
  const solveResult = solveLayoutV1(
    resolved.value,
    resolved.resolvedSolverProfile.profile
  );
  if (solveResult.status !== "solved") {
    return {
      ok: false,
      diagnostics: solveResult.report.diagnostics.map(solverDiagnostic),
      layoutSolveReport: solveResult.report,
      layoutSolveReportHash: solveResult.layoutSolveReportHash
    };
  }
  const spec = value;
  const finalTransformsByEntityId = Object.fromEntries(
    Object.entries(solveResult.report.placementsByEntityId).map(
      ([entityId, placement]) => [entityId, placement.transform]
    )
  );
  const normalizedBaseResult = normalizeAuthoringBaseV4(spec, {
    ...options,
    finalTransformsByEntityId
  });
  if (!normalizedBaseResult.ok || normalizedBaseResult.value === void 0) {
    return {
      ok: false,
      diagnostics: normalizedBaseResult.diagnostics,
      layoutSolveReport: solveResult.report,
      layoutSolveReportHash: solveResult.layoutSolveReportHash
    };
  }
  const normalizedBase = normalizedBaseResult.value;
  const lock = augmentResourceLockWithTraversalSurfaceProfiles(
    spec,
    normalizedBase.resources.resourceLock
  );
  if (lock.diagnostics.some((diagnostic2) => diagnostic2.severity === "error")) {
    return {
      ok: false,
      diagnostics: lock.diagnostics,
      layoutSolveReport: solveResult.report,
      layoutSolveReportHash: solveResult.layoutSolveReportHash
    };
  }
  const assertions = spec.constraints.placements.filter((constraint) => constraint.requirement === "required").sort((left, right) => left.id.localeCompare(right.id)).map((constraint) => assertionFor(
    constraint,
    solveResult.report
  ));
  const resources = {
    ...structuredClone(normalizedBase.resources),
    prototypes: restoreCanonicalV4Prototypes(
      spec,
      normalizedBase.resources.prototypes
    ),
    resourceLock: lock.resourceLock,
    resourceLockHash: lock.resourceLockHash
  };
  const canonicalBase = { ...structuredClone(normalizedBase), resources };
  const normalized = {
    ...canonicalBase,
    kind: "worldkit-normalized-world",
    schemaVersion: 4,
    authoringSpecHash: hashAuthoringDocumentV4(spec),
    nodes: normalizedNodesV4(
      spec,
      normalizedBase.nodes,
      solveResult.report,
      solveResult.layoutSolveReportHash
    ),
    layout: {
      solverProfileRef: solveResult.report.solverProfileRef,
      resolvedVersion: solveResult.report.resolvedVersion,
      solverProfileHash: solveResult.report.solverProfileHash,
      layoutSolveReportHash: solveResult.layoutSolveReportHash,
      regions: structuredClone(spec.spatial.regions),
      routes: structuredClone(spec.spatial.routes),
      screenRegions: structuredClone(spec.spatial.screenRegions),
      heightfields: Object.values(
        resolved.value.geometry.heightfieldsByTerrainEntityId
      ).sort(
        (left, right) => left.terrainEntityId.localeCompare(right.terrainEntityId)
      ).map((heightfield) => structuredClone(heightfield)),
      assertions,
      traversalAreas: [...spec.spatial.traversalAreas].sort((left, right) => left.id.localeCompare(right.id)).map((area) => structuredClone(area)),
      connectivityRequirements: spec.constraints.connectivity.map(normalizeConnectivityRequirement).sort((left, right) => left.constraintId.localeCompare(right.constraintId))
    }
  };
  return {
    ok: true,
    value: normalized,
    diagnostics: [],
    normalizedWorldIrHash: sha256CanonicalJson(normalized),
    layoutSolveReport: solveResult.report,
    layoutSolveReportHash: solveResult.layoutSolveReportHash
  };
}
function createScanner(text, ignoreTrivia = false) {
  const len = text.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || false) {
      let ch = text.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value2 = value2 * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value2 = value2 * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value2 = value2 * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value2 = -1;
    }
    return value2;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text.length && text.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text.length && (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text.length && text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text.substring(start, end);
  }
  function scanString() {
    let result2 = "", start = pos;
    while (true) {
      if (pos >= len) {
        result2 += text.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 34) {
        result2 += text.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result2 += text.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text.charCodeAt(pos++);
        switch (ch2) {
          case 34:
            result2 += '"';
            break;
          case 92:
            result2 += "\\";
            break;
          case 47:
            result2 += "/";
            break;
          case 98:
            result2 += "\b";
            break;
          case 102:
            result2 += "\f";
            break;
          case 110:
            result2 += "\n";
            break;
          case 114:
            result2 += "\r";
            break;
          case 116:
            result2 += "	";
            break;
          case 117:
            const ch3 = scanHexDigits(4);
            if (ch3 >= 0) {
              result2 += String.fromCharCode(ch3);
            } else {
              scanError = 4;
            }
            break;
          default:
            scanError = 5;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result2 += text.substring(start, pos);
          scanError = 2;
          break;
        } else {
          scanError = 6;
        }
      }
      pos++;
    }
    return result2;
  }
  function scanNext() {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code2 = text.charCodeAt(pos);
    if (isWhiteSpace(code2)) {
      do {
        pos++;
        value += String.fromCharCode(code2);
        code2 = text.charCodeAt(pos);
      } while (isWhiteSpace(code2));
      return token = 15;
    }
    if (isLineBreak(code2)) {
      pos++;
      value += String.fromCharCode(code2);
      if (code2 === 13 && text.charCodeAt(pos) === 10) {
        pos++;
        value += "\n";
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code2) {
      // tokens: []{}:,
      case 123:
        pos++;
        return token = 1;
      case 125:
        pos++;
        return token = 2;
      case 91:
        pos++;
        return token = 3;
      case 93:
        pos++;
        return token = 4;
      case 58:
        pos++;
        return token = 6;
      case 44:
        pos++;
        return token = 5;
      // strings
      case 34:
        pos++;
        value = scanString();
        return token = 10;
      // comments
      case 47:
        const start = pos - 1;
        if (text.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text.substring(start, pos);
          return token = 12;
        }
        if (text.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text.charCodeAt(pos);
            if (ch === 42 && text.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text.charCodeAt(pos) === 10) {
                pos++;
              }
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!commentClosed) {
            pos++;
            scanError = 1;
          }
          value = text.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code2);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code2);
        pos++;
        if (pos === len || !isDigit(text.charCodeAt(pos))) {
          return token = 16;
        }
      // found a minus, followed by a number so
      // we fall through to proceed with scanning
      // numbers
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value += scanNumber();
        return token = 11;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code2)) {
          pos++;
          code2 = text.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value += String.fromCharCode(code2);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code2) {
    if (isWhiteSpace(code2) || isLineBreak(code2)) {
      return false;
    }
    switch (code2) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result2;
    do {
      result2 = scanNext();
    } while (result2 >= 12 && result2 <= 15);
    return result2;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError
  };
}
function isWhiteSpace(ch) {
  return ch === 32 || ch === 9;
}
function isLineBreak(ch) {
  return ch === 10 || ch === 13;
}
function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}
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
function parseTree$1(text, errors2 = [], options = ParseOptions.DEFAULT) {
  let currentParent = { type: "array", offset: -1, length: -1, children: [], parent: void 0 };
  function ensurePropertyComplete(endOffset) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent;
    }
  }
  function onValue(valueNode) {
    currentParent.children.push(valueNode);
    return valueNode;
  }
  const visitor = {
    onObjectBegin: (offset) => {
      currentParent = onValue({ type: "object", offset, length: -1, parent: currentParent, children: [] });
    },
    onObjectProperty: (name, offset, length) => {
      currentParent = onValue({ type: "property", offset, length: -1, parent: currentParent, children: [] });
      currentParent.children.push({ type: "string", value: name, offset, length, parent: currentParent });
    },
    onObjectEnd: (offset, length) => {
      ensurePropertyComplete(offset + length);
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onArrayBegin: (offset, length) => {
      currentParent = onValue({ type: "array", offset, length: -1, parent: currentParent, children: [] });
    },
    onArrayEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onLiteralValue: (value, offset, length) => {
      onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
      ensurePropertyComplete(offset + length);
    },
    onSeparator: (sep, offset, length) => {
      if (currentParent.type === "property") {
        if (sep === ":") {
          currentParent.colonOffset = offset;
        } else if (sep === ",") {
          ensurePropertyComplete(offset);
        }
      }
    },
    onError: (error, offset, length) => {
      errors2.push({ error, offset, length });
    }
  };
  visit(text, visitor, options);
  const result2 = currentParent.children[0];
  if (result2) {
    delete result2.parent;
  }
  return result2;
}
function getNodeValue$1(node) {
  switch (node.type) {
    case "array":
      return node.children.map(getNodeValue$1);
    case "object":
      const obj = /* @__PURE__ */ Object.create(null);
      for (let prop of node.children) {
        const valueNode = prop.children[1];
        if (valueNode) {
          obj[prop.children[0].value] = getNodeValue$1(valueNode);
        }
      }
      return obj;
    case "null":
    case "string":
    case "number":
    case "boolean":
      return node.value;
    default:
      return void 0;
  }
}
function visit(text, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text, false);
  const _jsonPath = [];
  let suppressedCallbacks = 0;
  function toNoArgVisit(visitFunction) {
    return visitFunction ? () => suppressedCallbacks === 0 && visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisit(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisitWithPath(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice()) : () => true;
  }
  function toBeginVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks++;
      } else {
        let cbReturn = visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice());
        if (cbReturn === false) {
          suppressedCallbacks = 1;
        }
      }
    } : () => true;
  }
  function toEndVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks--;
      }
      if (suppressedCallbacks === 0) {
        visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter());
      }
    } : () => true;
  }
  const onObjectBegin = toBeginVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisitWithPath(visitor.onObjectProperty), onObjectEnd = toEndVisit(visitor.onObjectEnd), onArrayBegin = toBeginVisit(visitor.onArrayBegin), onArrayEnd = toEndVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;
  function scanNext() {
    while (true) {
      const token = _scanner.scan();
      switch (_scanner.getTokenError()) {
        case 4:
          handleError(
            14
            /* ParseErrorCode.InvalidUnicode */
          );
          break;
        case 5:
          handleError(
            15
            /* ParseErrorCode.InvalidEscapeCharacter */
          );
          break;
        case 3:
          handleError(
            13
            /* ParseErrorCode.UnexpectedEndOfNumber */
          );
          break;
        case 1:
          if (!disallowComments) {
            handleError(
              11
              /* ParseErrorCode.UnexpectedEndOfComment */
            );
          }
          break;
        case 2:
          handleError(
            12
            /* ParseErrorCode.UnexpectedEndOfString */
          );
          break;
        case 6:
          handleError(
            16
            /* ParseErrorCode.InvalidCharacter */
          );
          break;
      }
      switch (token) {
        case 12:
        case 13:
          if (disallowComments) {
            handleError(
              10
              /* ParseErrorCode.InvalidCommentToken */
            );
          } else {
            onComment();
          }
          break;
        case 16:
          handleError(
            1
            /* ParseErrorCode.InvalidSymbol */
          );
          break;
        case 15:
        case 14:
          break;
        default:
          return token;
      }
    }
  }
  function handleError(error, skipUntilAfter = [], skipUntil = []) {
    onError(error);
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = _scanner.getToken();
      while (token !== 17) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil.indexOf(token) !== -1) {
          break;
        }
        token = scanNext();
      }
    }
  }
  function parseString(isValue) {
    const value = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value);
    } else {
      onObjectProperty(value);
      _jsonPath.push(value);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11:
        const tokenValue = _scanner.getTokenValue();
        let value = Number(tokenValue);
        if (isNaN(value)) {
          handleError(
            2
            /* ParseErrorCode.InvalidNumberFormat */
          );
          value = 0;
        }
        onLiteralValue(value);
        break;
      case 7:
        onLiteralValue(null);
        break;
      case 8:
        onLiteralValue(true);
        break;
      case 9:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }
  function parseProperty() {
    if (_scanner.getToken() !== 10) {
      handleError(3, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
      return false;
    }
    parseString(false);
    if (_scanner.getToken() === 6) {
      onSeparator(":");
      scanNext();
      if (!parseValue()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
    } else {
      handleError(5, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
    }
    _jsonPath.pop();
    return true;
  }
  function parseObject() {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 2 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 2 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (!parseProperty()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onObjectEnd();
    if (_scanner.getToken() !== 2) {
      handleError(7, [
        2
        /* SyntaxKind.CloseBraceToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseArray() {
    onArrayBegin();
    scanNext();
    let isFirstElement = true;
    let needsComma = false;
    while (_scanner.getToken() !== 4 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 4 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (isFirstElement) {
        _jsonPath.push(0);
        isFirstElement = false;
      } else {
        _jsonPath[_jsonPath.length - 1]++;
      }
      if (!parseValue()) {
        handleError(4, [], [
          4,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onArrayEnd();
    if (!isFirstElement) {
      _jsonPath.pop();
    }
    if (_scanner.getToken() !== 4) {
      handleError(8, [
        4
        /* SyntaxKind.CloseBracketToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseValue() {
    switch (_scanner.getToken()) {
      case 3:
        return parseArray();
      case 1:
        return parseObject();
      case 10:
        return parseString(true);
      default:
        return parseLiteral();
    }
  }
  scanNext();
  if (_scanner.getToken() === 17) {
    if (options.allowEmptyContent) {
      return true;
    }
    handleError(4, [], []);
    return false;
  }
  if (!parseValue()) {
    handleError(4, [], []);
    return false;
  }
  if (_scanner.getToken() !== 17) {
    handleError(9, [], []);
  }
  return true;
}
function getNodeType(value) {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value) {
        return "null";
      } else if (Array.isArray(value)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}
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
const parseTree = parseTree$1;
const getNodeValue = getNodeValue$1;
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
function printParseErrorCode(code2) {
  switch (code2) {
    case 1:
      return "InvalidSymbol";
    case 2:
      return "InvalidNumberFormat";
    case 3:
      return "PropertyNameExpected";
    case 4:
      return "ValueExpected";
    case 5:
      return "ColonExpected";
    case 6:
      return "CommaExpected";
    case 7:
      return "CloseBraceExpected";
    case 8:
      return "CloseBracketExpected";
    case 9:
      return "EndOfFileExpected";
    case 10:
      return "InvalidCommentToken";
    case 11:
      return "UnexpectedEndOfComment";
    case 12:
      return "UnexpectedEndOfString";
    case 13:
      return "UnexpectedEndOfNumber";
    case 14:
      return "InvalidUnicode";
    case 15:
      return "InvalidEscapeCharacter";
    case 16:
      return "InvalidCharacter";
  }
  return "<unknown ParseErrorCode>";
}
const MAX_AUTHORING_JSON_BYTES = 8 * 1024 * 1024;
function pointerSegment(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function findDuplicateKeys(node, instancePath, diagnostics) {
  if (node.type === "object") {
    const seen = /* @__PURE__ */ new Set();
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
      if (keyNode === void 0 || valueNode === void 0) continue;
      const key = String(getNodeValue(keyNode));
      const path2 = `${instancePath}/${pointerSegment(key)}`;
      if (seen.has(key)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_JSON_DUPLICATE_KEY",
          instancePath: path2,
          message: `Duplicate JSON object key "${key}" is not allowed.`
        });
      } else {
        seen.add(key);
      }
      findDuplicateKeys(valueNode, path2, diagnostics);
    }
    return;
  }
  if (node.type === "array") {
    for (const [index, child] of (node.children ?? []).entries()) {
      findDuplicateKeys(child, `${instancePath}/${index}`, diagnostics);
    }
  }
}
function parseCanonicalJson(sourceText) {
  if (new TextEncoder().encode(sourceText).byteLength > MAX_AUTHORING_JSON_BYTES) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "AUTHORING_JSON_TOO_LARGE",
        instancePath: "",
        message: `Authoring JSON exceeds the ${MAX_AUTHORING_JSON_BYTES} byte limit.`
      }]
    };
  }
  const errors2 = [];
  const root2 = parseTree(sourceText, errors2, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true
  });
  if (root2 === void 0 || errors2.length > 0) {
    return {
      ok: false,
      diagnostics: errors2.length === 0 ? [{
        severity: "error",
        code: "AUTHORING_JSON_SYNTAX_INVALID",
        instancePath: "",
        message: "Authoring input must contain one JSON value."
      }] : errors2.map((error) => ({
        severity: "error",
        code: "AUTHORING_JSON_SYNTAX_INVALID",
        instancePath: "",
        message: `${printParseErrorCode(error.error)} at byte offset ${error.offset}.`,
        details: { offset: error.offset, length: error.length }
      }))
    };
  }
  const duplicateDiagnostics = [];
  findDuplicateKeys(root2, "", duplicateDiagnostics);
  if (duplicateDiagnostics.length > 0) {
    return { ok: false, diagnostics: duplicateDiagnostics };
  }
  const value = JSON.parse(sourceText);
  try {
    assertCanonicalJsonValue(value);
  } catch (error) {
    if (error instanceof CanonicalJsonAdmissionError) {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "AUTHORING_JSON_NEGATIVE_ZERO",
          instancePath: error.instancePath,
          message: "Negative zero is not allowed in Canonical JSON."
        }]
      };
    }
    throw error;
  }
  return { ok: true, value, diagnostics: [] };
}
function parseAuthoringSpecV4(sourceText) {
  const parsed = parseCanonicalJson(sourceText);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };
  const value = parsed.value;
  if (!isNil(value) && typeof value === "object" && value.kind === "worldkit-authoring-spec" && Object.hasOwn(value, "schemaVersion") && value.schemaVersion !== 4) {
    const version = value.schemaVersion;
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          message: `Authoring schema version '${String(version)}' is not supported.`,
          details: { supportedSchemaVersions: [4] }
        }
      ]
    };
  }
  return validateAuthoringSpecV4(value);
}
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
function lattice(seed, x, z) {
  let value = seed ^ Math.imul(x, 521288629) ^ Math.imul(z, 1597334677);
  value = Math.imul(value ^ value >>> 16, 73244475);
  value = Math.imul(value ^ value >>> 16, 73244475);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}
function smootherStep(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}
function lerp(from, to, amount) {
  return from + (to - from) * amount;
}
function sampleValueNoise(seed, x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smootherStep(x - x0);
  const tz = smootherStep(z - z0);
  const top = lerp(lattice(seed, x0, z0), lattice(seed, x1, z0), tx);
  const bottom = lerp(lattice(seed, x0, z1), lattice(seed, x1, z1), tx);
  return lerp(top, bottom, tz) * 2 - 1;
}
function sampleFractalNoise(seed, x, z, octaves, lacunarity, persistence) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += sampleValueNoise(seed, x * frequency, z * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return normalization === 0 ? 0 : total / normalization;
}
function assertPublishedMovementMediumSupported(movementMedium) {
  {
    throw new Error("SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED:");
  }
}
function rejectPublishedWaterMediumProfile(mediumProfile) {
  const forged = mediumProfile;
  if (forged.water !== void 0 || forged.supportedMediums?.includes("water")) {
    assertPublishedMovementMediumSupported();
  }
}
class CompilerInputAccessorErrorV1 extends Error {
}
function assertCompilerInputAccessorFreeV1(value, visited = /* @__PURE__ */ new WeakSet()) {
  if (isNil(value) || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CompilerInputAccessorErrorV1();
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value)
  )) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      throw new CompilerInputAccessorErrorV1();
    }
    if (Object.hasOwn(descriptor, "value")) {
      assertCompilerInputAccessorFreeV1(descriptor.value, visited);
    }
  }
}
function snapshotCompileWorldInputV5(input) {
  assertCompilerInputAccessorFreeV1(input);
  return structuredClone(input);
}
function sampleTerrainHeight(terrain, pointMetersXZ) {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const minimumX = terrain.centerMetersXZ[0] - terrain.sizeMetersXZ[0] / 2;
  const minimumZ = terrain.centerMetersXZ[1] - terrain.sizeMetersXZ[1] / 2;
  const maximumX = minimumX + terrain.sizeMetersXZ[0];
  const maximumZ = minimumZ + terrain.sizeMetersXZ[1];
  return sampleTriangleHeightfieldSurface(
    {
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionVerticesXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters
    },
    [
      Math.max(minimumX, Math.min(maximumX, pointMetersXZ[0])),
      Math.max(minimumZ, Math.min(maximumZ, pointMetersXZ[1]))
    ]
  ).heightMeters;
}
function findOnlyNodeV4(nodes, kind) {
  const node = nodes.find(
    (candidate) => candidate.kind === kind
  );
  if (node === void 0) {
    throw new Error(`NormalizedWorldIR invariant violated: missing '${kind}' node.`);
  }
  return node;
}
function compileTerrainV3(world) {
  const node = findOnlyNodeV4(world.nodes, "terrain");
  const terrain = node.components.terrain;
  const source = terrain.source;
  const [columns, rows] = terrain.grid.resolutionCellsXZ;
  const [centerX, centerZ] = terrain.grid.centerMetersXZ;
  const [sizeX, sizeZ] = terrain.grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const sampledHeights = terrain.grid.heightSamplesMeters;
  const heights = [];
  if (!isNil(sampledHeights)) {
    if (sampledHeights.length !== columns * rows) {
      throw new Error(
        "NormalizedWorldIR invariant violated: terrain grid heightSamplesMeters length must equal resolutionCellsXZ product."
      );
    }
    for (const height of sampledHeights) {
      heights.push(height);
    }
  } else {
    for (let zIndex = 0; zIndex < rows; zIndex += 1) {
      const z = minimumZ + zIndex / (rows - 1) * sizeZ;
      for (let xIndex = 0; xIndex < columns; xIndex += 1) {
        const x = minimumX + xIndex / (columns - 1) * sizeX;
        const noise = source.amplitudeMeters === 0 ? 0 : sampleFractalNoise(
          world.seed,
          x * source.frequencyPerMeter,
          z * source.frequencyPerMeter,
          source.octaves,
          source.lacunarityRatio,
          source.persistenceRatio
        );
        heights.push(source.baseHeightMeters + noise * source.amplitudeMeters);
      }
    }
  }
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;
  for (const height of heights) {
    minimumHeightMeters = Math.min(minimumHeightMeters, height);
    maximumHeightMeters = Math.max(maximumHeightMeters, height);
  }
  return {
    entityId: node.id,
    centerMetersXZ: [...terrain.grid.centerMetersXZ],
    sizeMetersXZ: [...terrain.grid.sizeMetersXZ],
    resolutionCellsXZ: [...terrain.grid.resolutionCellsXZ],
    heightSamplesMeters: heights,
    heightSamplesHash: sha256CanonicalJson(heights),
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: terrain.semantic?.classId ?? "terrain.ground"
  };
}
function boundaryCenterV3(boundary) {
  if (boundary.kind !== "polygon") return boundary.centerMetersXZ;
  const total = boundary.pointsMetersXZ.reduce(
    (sum2, point) => [sum2[0] + point[0], sum2[1] + point[1]],
    [0, 0]
  );
  return [
    total[0] / boundary.pointsMetersXZ.length,
    total[1] / boundary.pointsMetersXZ.length
  ];
}
function compileWatersV3(world, terrain) {
  return world.nodes.filter(
    (node) => node.kind === "water"
  ).map((node) => {
    const water = node.components.water;
    const boundary = structuredClone(water.boundary);
    return {
      entityId: node.id,
      terrainEntityId: water.terrainEntityId,
      boundary,
      depthMeters: water.depthMeters,
      shoreWidthMeters: water.shoreWidthMeters,
      waterLevelMeters: water.waterLevelMeters ?? sampleTerrainHeight(terrain, boundaryCenterV3(boundary)),
      traversalMode: water.traversalMode,
      semanticClassId: water.semantic?.classId ?? "water.surface"
    };
  }).sort((left, right) => left.entityId.localeCompare(right.entityId));
}
function resolvePrimitiveV3(prototype) {
  switch (prototype.primitive) {
    case "box":
      return { kind: "box", sizeMetersXYZ: [...prototype.sizeMetersXYZ] };
    case "sphere":
      return { kind: "sphere", radiusMeters: prototype.radiusMeters };
    case "cylinder":
    case "cone":
      return {
        kind: prototype.primitive,
        radiusMeters: prototype.radiusMeters,
        heightMeters: prototype.heightMeters
      };
  }
}
function compileObjectsV3(world) {
  const prototypes = new Map(
    world.resources.prototypes.map((prototype) => [
      `${prototype.id}@${prototype.version}`,
      prototype
    ])
  );
  return world.nodes.filter(
    (node) => node.kind === "object"
  ).map((node) => {
    const prototypeIdentity = node.prototypeRef.slice(
      "package://prototype/".length
    );
    const prototype = prototypes.get(prototypeIdentity);
    if (prototype === void 0) {
      throw new Error(
        `NormalizedWorldIR invariant violated: missing Prototype '${prototypeIdentity}'.`
      );
    }
    return {
      entityId: node.id,
      prototypeId: prototype.id,
      primitive: resolvePrimitiveV3(prototype),
      transform: structuredClone(node.transform),
      collisionEnabled: prototype.collisionEnabled,
      semanticClassId: prototype.semantic?.classId ?? `object.${prototype.primitive}`
    };
  }).sort((left, right) => left.entityId.localeCompare(right.entityId));
}
function staticObjectFootprintV3(object) {
  const [rotationX, rotationY, rotationZ] = object.transform.rotationEulerRadiansXYZ;
  if (Math.abs(rotationX) > 1e-8 || Math.abs(rotationZ) > 1e-8) return void 0;
  const [scaleX, scaleY, scaleZ] = object.transform.scaleXYZ.map(Math.abs);
  const [centerX, centerY, centerZ] = object.transform.positionMetersXYZ;
  let footprint;
  let halfHeightMeters;
  if (object.primitive.kind === "box") {
    const halfX = object.primitive.sizeMetersXYZ[0] * scaleX / 2;
    const halfZ = object.primitive.sizeMetersXYZ[2] * scaleZ / 2;
    const cosine = Math.cos(rotationY);
    const sine = Math.sin(rotationY);
    footprint = {
      kind: "polygon",
      pointsMetersXZ: [
        [-halfX, -halfZ],
        [halfX, -halfZ],
        [halfX, halfZ],
        [-halfX, halfZ]
      ].map(([x, z]) => [
        centerX + x * cosine - z * sine,
        centerZ + x * sine + z * cosine
      ])
    };
    halfHeightMeters = object.primitive.sizeMetersXYZ[1] * scaleY / 2;
  } else {
    const radiusMeters = object.primitive.radiusMeters * Math.max(scaleX, scaleZ);
    footprint = {
      kind: "circle",
      centerMetersXZ: [centerX, centerZ],
      radiusMeters
    };
    halfHeightMeters = object.primitive.kind === "sphere" ? object.primitive.radiusMeters * scaleY : object.primitive.heightMeters * scaleY / 2;
  }
  return {
    entityId: object.entityId,
    footprint,
    heightRangeMeters: [centerY - halfHeightMeters, centerY + halfHeightMeters]
  };
}
function validateCompiledSpawnFootprintsV3(subjects, waters, objects) {
  const diagnostics = [];
  const blockers = objects.filter((object) => object.collisionEnabled).flatMap((object) => {
    const blocker = staticObjectFootprintV3(object);
    return blocker === void 0 ? [] : [blocker];
  });
  for (const subject of subjects) {
    const spawnCapsuleFeetPositionMetersXYZ = [
      subject.spawnSubjectOriginPositionMetersXYZ[0] + subject.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
      subject.spawnSubjectOriginPositionMetersXYZ[1] + subject.collider.centerOffsetFromSubjectOriginMetersXYZ[1] - subject.collider.heightMeters / 2,
      subject.spawnSubjectOriginPositionMetersXYZ[2] + subject.collider.centerOffsetFromSubjectOriginMetersXYZ[2]
    ];
    for (const water of waters) {
      const result2 = validateSpawnSafety({
        entityId: subject.entityId,
        position: spawnCapsuleFeetPositionMetersXYZ,
        capsule: {
          radius: subject.collider.radiusMeters,
          height: subject.collider.heightMeters
        },
        waterSurfaces: [{
          entityId: water.entityId,
          boundary: water.boundary,
          waterLevelMeters: water.waterLevelMeters,
          depthMeters: water.depthMeters,
          traversalMode: water.traversalMode
        }]
      });
      if (result2.some((diagnostic2) => diagnostic2.code === "SPAWN_IN_BLOCKED_WATER")) {
        diagnostics.push({
          severity: "error",
          code: "COMPILER_SPAWN_IN_BLOCKED_WATER",
          instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
          message: `Subject '${subject.entityId}' spawn is inside blocked water '${water.entityId}'.`,
          details: {
            subjectEntityId: subject.entityId,
            waterEntityId: water.entityId
          }
        });
      }
    }
    for (const blocker of blockers) {
      const result2 = validateSpawnSafety({
        entityId: subject.entityId,
        position: spawnCapsuleFeetPositionMetersXYZ,
        capsule: {
          radius: subject.collider.radiusMeters,
          height: subject.collider.heightMeters
        },
        staticBlockingObjects: [blocker]
      });
      if (result2.some((diagnostic2) => diagnostic2.code === "SPAWN_INSIDE_STATIC_BLOCKER")) {
        diagnostics.push({
          severity: "error",
          code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER",
          instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
          message: `Subject '${subject.entityId}' spawn is inside static blocking object '${blocker.entityId}'.`,
          details: {
            subjectEntityId: subject.entityId,
            objectEntityId: blocker.entityId
          }
        });
      }
    }
  }
  return diagnostics;
}
function indexNormalizedResourceRowsV3(rows, resourceRef, label) {
  const rowsByRef = /* @__PURE__ */ new Map();
  for (const row of [...rows].sort((left, right) => resourceRef(left).localeCompare(resourceRef(right)))) {
    const ref2 = resourceRef(row);
    if (rowsByRef.has(ref2)) {
      throw new Error(
        `NormalizedWorldIR invariant violated: duplicate ${label} '${ref2}'.`
      );
    }
    rowsByRef.set(ref2, row);
  }
  return rowsByRef;
}
function requireNormalizedResourceRowV3(rowsByRef, resourceRef, label) {
  const row = rowsByRef.get(resourceRef);
  if (row === void 0) {
    throw new Error(
      `NormalizedWorldIR invariant violated: missing ${label} '${resourceRef}'.`
    );
  }
  return row;
}
function compileSubjectAssetV1(resource) {
  return {
    subjectAssetRef: resource.subjectAssetRef,
    artifactContentHash: resource.artifactContentHash,
    byteLength: resource.byteLength,
    mediaType: resource.mediaType,
    format: resource.format,
    inventory: {
      meshCount: resource.inventory.meshCount,
      vertexCount: resource.inventory.vertexCount,
      triangleCount: resource.inventory.triangleCount,
      skeletonCount: resource.inventory.skeletonCount,
      boneCount: resource.inventory.boneCount,
      animationClipNames: [...resource.inventory.animationClipNames]
    }
  };
}
function compileRigProfileV1(resource) {
  for (const boneId of BIPED_BONE_IDS_V1) {
    const hasMapping = Object.prototype.hasOwnProperty.call(
      resource.sourceNodeNameByBoneId,
      boneId
    );
    const sourceNodeName = resource.sourceNodeNameByBoneId[boneId];
    if (!hasMapping || typeof sourceNodeName !== "string") {
      throw new Error(
        `NormalizedWorldIR invariant violated: Rig Profile '${resource.rigProfileRef}' is missing source-node mapping for Bone '${boneId}'.`
      );
    }
    if (sourceNodeName.trim().length === 0) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Rig Profile '${resource.rigProfileRef}' has an empty source-node mapping for Bone '${boneId}'.`
      );
    }
  }
  return {
    rigProfileRef: resource.rigProfileRef,
    bodyTopology: resource.bodyTopology,
    skeletonRootBoneName: resource.skeletonRootBoneName,
    requiredBoneIds: [...resource.requiredBoneIds],
    sourceNodeNameByBoneId: {
      chest: resource.sourceNodeNameByBoneId.chest,
      "foot.left": resource.sourceNodeNameByBoneId["foot.left"],
      "foot.right": resource.sourceNodeNameByBoneId["foot.right"],
      "hand.left": resource.sourceNodeNameByBoneId["hand.left"],
      "hand.right": resource.sourceNodeNameByBoneId["hand.right"],
      head: resource.sourceNodeNameByBoneId.head,
      hips: resource.sourceNodeNameByBoneId.hips,
      "lower-arm.left": resource.sourceNodeNameByBoneId["lower-arm.left"],
      "lower-arm.right": resource.sourceNodeNameByBoneId["lower-arm.right"],
      "lower-leg.left": resource.sourceNodeNameByBoneId["lower-leg.left"],
      "lower-leg.right": resource.sourceNodeNameByBoneId["lower-leg.right"],
      neck: resource.sourceNodeNameByBoneId.neck,
      spine: resource.sourceNodeNameByBoneId.spine,
      "upper-arm.left": resource.sourceNodeNameByBoneId["upper-arm.left"],
      "upper-arm.right": resource.sourceNodeNameByBoneId["upper-arm.right"],
      "upper-leg.left": resource.sourceNodeNameByBoneId["upper-leg.left"],
      "upper-leg.right": resource.sourceNodeNameByBoneId["upper-leg.right"]
    }
  };
}
function compileAnimationSetV1(resource) {
  return {
    animationSetRef: resource.animationSetRef,
    subjectAssetRef: resource.subjectAssetRef,
    rigProfileRef: resource.rigProfileRef,
    defaultActionId: resource.defaultActionId,
    requiredActionIds: [...resource.requiredActionIds],
    animationBindings: resource.animationBindings.map((binding) => ({
      actionId: binding.actionId,
      sourceClipName: binding.sourceClipName,
      loopMode: binding.loopMode,
      playbackSpeedRatio: binding.playbackSpeedRatio,
      blendDurationSeconds: binding.blendDurationSeconds,
      rootMotionMode: binding.rootMotionMode
    }))
  };
}
function compileColliderProfileV1(resource) {
  return {
    colliderProfileRef: resource.colliderProfileRef,
    supportedBodyTopologies: [...resource.supportedBodyTopologies],
    collider: {
      kind: resource.collider.kind,
      radiusMeters: resource.collider.radiusMeters,
      heightMeters: resource.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[2]
      ]
    }
  };
}
function compileSubjectVisualPartV3(part) {
  if (part.kind === "asset") {
    return {
      id: part.id,
      kind: "asset",
      subjectAssetRef: part.subjectAssetRef,
      localTransform: {
        positionMetersXYZ: [
          part.localTransform.positionMetersXYZ[0],
          part.localTransform.positionMetersXYZ[1],
          part.localTransform.positionMetersXYZ[2]
        ],
        rotationEulerRadiansXYZ: [
          part.localTransform.rotationEulerRadiansXYZ[0],
          part.localTransform.rotationEulerRadiansXYZ[1],
          part.localTransform.rotationEulerRadiansXYZ[2]
        ],
        scaleXYZ: [
          part.localTransform.scaleXYZ[0],
          part.localTransform.scaleXYZ[1],
          part.localTransform.scaleXYZ[2]
        ]
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: [...part.semanticTags]
    };
  }
  return {
    id: part.id,
    kind: "primitive",
    shape: structuredClone(part.shape),
    localTransform: structuredClone(part.localTransform),
    semanticTags: [...part.semanticTags]
  };
}
function compileSubjectSocketV3(socket) {
  if (socket.kind === "bone") {
    return {
      id: socket.id,
      kind: "bone",
      boneId: socket.boneId,
      offsetTransform: {
        positionMetersXYZ: [
          socket.offsetTransform.positionMetersXYZ[0],
          socket.offsetTransform.positionMetersXYZ[1],
          socket.offsetTransform.positionMetersXYZ[2]
        ],
        rotationEulerRadiansXYZ: [
          socket.offsetTransform.rotationEulerRadiansXYZ[0],
          socket.offsetTransform.rotationEulerRadiansXYZ[1],
          socket.offsetTransform.rotationEulerRadiansXYZ[2]
        ]
      },
      semanticTags: [...socket.semanticTags]
    };
  }
  return {
    id: socket.id,
    kind: "local",
    localTransform: {
      positionMetersXYZ: [
        socket.localTransform.positionMetersXYZ[0],
        socket.localTransform.positionMetersXYZ[1],
        socket.localTransform.positionMetersXYZ[2]
      ],
      rotationEulerRadiansXYZ: [
        socket.localTransform.rotationEulerRadiansXYZ[0],
        socket.localTransform.rotationEulerRadiansXYZ[1],
        socket.localTransform.rotationEulerRadiansXYZ[2]
      ]
    },
    semanticTags: [...socket.semanticTags]
  };
}
function compileCapabilityAssemblyV1(assembly) {
  const compileMotionProfile = (profile) => ({
    resourceRef: profile.resourceRef,
    contentHash: profile.contentHash,
    motionKernelRef: profile.motionKernelRef,
    motionTags: [...profile.motionTags]
  });
  const compileMotionKernel = (motionKernel) => {
    const implementationId = motionKernel.implementationId;
    if (implementationId !== "free-ground" && implementationId !== "forward-steer" && implementationId !== "wheeled-arcade" && implementationId !== "surface-slide" && implementationId !== "water-surface" && implementationId !== "unpowered-glide") {
      throw new Error(
        `NormalizedWorldIR invariant violated: reserved Motion Kernel '${motionKernel.resourceRef}' cannot enter an Execution Plan.`
      );
    }
    return {
      resourceRef: motionKernel.resourceRef,
      implementationId,
      commandKind: motionKernel.commandKind,
      supportedMediums: [...motionKernel.supportedMediums],
      fallbackMotionProfileRef: motionKernel.fallbackMotionProfileRef,
      deterministic: true
    };
  };
  const relationshipProfiles2 = assembly.relationshipProfiles.map((profile) => {
    if (profile.runtimeStatus !== "implemented" || profile.relationshipType !== "mountedOn") {
      throw new Error(
        `NormalizedWorldIR invariant violated: reserved Relationship Profile '${profile.resourceRef}' cannot enter an Execution Plan.`
      );
    }
    return {
      resourceRef: profile.resourceRef,
      relationshipType: "mountedOn",
      requiredRiderSocketIds: [...profile.requiredRiderSocketIds],
      requiredMountSocketIds: [...profile.requiredMountSocketIds],
      controlTransferMode: profile.controlTransferMode,
      cameraTargetRole: profile.cameraTargetRole,
      ...profile.maximumMountDistanceMeters === void 0 ? {} : { maximumMountDistanceMeters: profile.maximumMountDistanceMeters }
    };
  });
  rejectPublishedWaterMediumProfile(assembly.mediumProfile);
  return {
    authoringAvailability: assembly.authoringAvailability,
    physicsBodyProfileRef: assembly.physicsBodyProfileRef,
    locomotionProfileRef: assembly.locomotionProfileRef,
    defaultMotionProfile: compileMotionProfile(assembly.defaultMotionProfile),
    optionalMotionProfiles: assembly.optionalMotionProfiles.map(compileMotionProfile),
    fallbackMotionProfile: compileMotionProfile(assembly.fallbackMotionProfile),
    motionKernels: assembly.motionKernels.map(compileMotionKernel),
    controlProfile: {
      resourceRef: assembly.controlProfile.resourceRef,
      contentHash: assembly.controlProfile.contentHash,
      commandKind: assembly.controlProfile.commandKind,
      inputSpace: assembly.controlProfile.inputSpace,
      facingPolicy: assembly.controlProfile.facingPolicy,
      lateralMovementPolicy: assembly.controlProfile.lateralMovementPolicy,
      moveDeadzoneRatio: assembly.controlProfile.moveDeadzoneRatio
    },
    cameraContext: {
      resourceRef: assembly.cameraContextProfile.resourceRef,
      defaultCameraRigProfileRef: assembly.cameraContextProfile.defaultCameraRigProfileRef,
      ...assembly.cameraContextProfile.firstPersonCameraRigProfileRef === void 0 ? {} : {
        firstPersonCameraRigProfileRef: assembly.cameraContextProfile.firstPersonCameraRigProfileRef
      },
      rules: structuredClone(assembly.cameraContextProfile.rules),
      cameraRigProfiles: assembly.cameraRigProfiles.map((profile) => ({
        resourceRef: profile.resourceRef,
        contentHash: profile.contentHash,
        baseMode: profile.baseMode,
        algorithmRef: profile.algorithmRef,
        headingSource: profile.headingSource,
        reverseHeadingPolicy: profile.reverseHeadingPolicy,
        recenterMode: profile.recenterMode,
        preferredSocketIds: [...profile.preferredSocketIds],
        parameters: structuredClone(profile.parameters),
        authoringRanges: structuredClone(profile.authoringRanges ?? {})
      })),
      cameraModifierProfiles: assembly.cameraModifierProfiles.map((modifier) => ({
        resourceRef: modifier.resourceRef,
        parameterOverrides: structuredClone(modifier.parameterOverrides),
        ...modifier.headingSourceOverride === void 0 ? {} : { headingSourceOverride: modifier.headingSourceOverride },
        ...modifier.reverseHeadingPolicyOverride === void 0 ? {} : { reverseHeadingPolicyOverride: modifier.reverseHeadingPolicyOverride },
        ...modifier.recenterModeOverride === void 0 ? {} : { recenterModeOverride: modifier.recenterModeOverride }
      }))
    },
    mediumProfile: {
      resourceRef: assembly.mediumProfile.resourceRef,
      air: {
        gravityRatio: assembly.mediumProfile.air.gravityRatio,
        linearDragPerSecond: assembly.mediumProfile.air.linearDragPerSecond
      }
    },
    relationshipProfiles: relationshipProfiles2,
    harnessProfileRef: assembly.harnessProfile.resourceRef,
    requiredHarnessCheckIds: [...assembly.harnessProfile.requiredCheckIds],
    actionOrPoseSetRef: assembly.actionOrPoseSetRef,
    renderBindingProfileRef: assembly.renderBindingProfile.resourceRef
  };
}
function colliderProfileMatchesDefinitionV3(profile, definitionCollider) {
  const profileCollider = profile.collider;
  return profileCollider.kind === definitionCollider.kind && profileCollider.radiusMeters === definitionCollider.radiusMeters && profileCollider.heightMeters === definitionCollider.heightMeters && profileCollider.centerOffsetFromSubjectOriginMetersXYZ.every(
    (component, index) => component === definitionCollider.centerOffsetFromSubjectOriginMetersXYZ[index]
  );
}
function compileSubjectsV3(world) {
  const definitionsByRef = new Map(
    world.resources.subjectDefinitions.map((definition) => [
      definition.subjectDefinitionRef,
      definition
    ])
  );
  const subjectAssetsByRef = indexNormalizedResourceRowsV3(
    world.resources.subjectAssets,
    (resource) => resource.subjectAssetRef,
    "Subject Asset"
  );
  const rigProfilesByRef = indexNormalizedResourceRowsV3(
    world.resources.rigProfiles,
    (resource) => resource.rigProfileRef,
    "Rig Profile"
  );
  const animationSetsByRef = indexNormalizedResourceRowsV3(
    world.resources.animationSets,
    (resource) => resource.animationSetRef,
    "Animation Set"
  );
  const colliderProfilesByRef = indexNormalizedResourceRowsV3(
    world.resources.colliderProfiles,
    (resource) => resource.colliderProfileRef,
    "Collider Profile"
  );
  const anchorsByEntityId = new Map(
    world.nodes.filter(
      (node) => node.kind === "anchor"
    ).map((anchor) => [anchor.id, anchor])
  );
  const reachableSubjectAssetsByRef = /* @__PURE__ */ new Map();
  const reachableRigProfilesByRef = /* @__PURE__ */ new Map();
  const reachableAnimationSetsByRef = /* @__PURE__ */ new Map();
  const reachableColliderProfilesByRef = /* @__PURE__ */ new Map();
  const resourceCost = { vertices: 0, triangles: 0, colliders: 0 };
  const subjects = world.nodes.filter(
    (node) => node.kind === "subject"
  ).sort((left, right) => left.id.localeCompare(right.id)).map((node) => {
    const definition = definitionsByRef.get(node.subjectDefinitionRef);
    if (definition === void 0) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Subject '${node.id}' references missing Definition '${node.subjectDefinitionRef}'.`
      );
    }
    const spawnAnchor = anchorsByEntityId.get(node.spawnAnchorEntityId);
    if (spawnAnchor === void 0) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Subject '${node.id}' references missing Spawn Anchor '${node.spawnAnchorEntityId}'.`
      );
    }
    if (!definition.capabilityRefs.includes(definition.locomotionCapabilityRef)) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Subject '${node.id}' does not select its locomotion Capability.`
      );
    }
    const locomotionCapabilityLockRows = world.resources.resourceLock.filter(
      (row) => row.resourceRef === definition.locomotionCapabilityRef
    );
    if (locomotionCapabilityLockRows.length !== 1 || locomotionCapabilityLockRows[0]?.resourceKind !== "capability" || locomotionCapabilityLockRows[0]?.contentHash !== definition.locomotionCapabilityHash) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Subject '${node.id}' requires one matching locked locomotion Capability.`
      );
    }
    const locomotionCapabilityLock = locomotionCapabilityLockRows[0];
    if (isNil(locomotionCapabilityLock)) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Subject '${node.id}' is missing its locked locomotion Capability.`
      );
    }
    resourceCost.vertices += definition.resourceCost.vertices;
    resourceCost.triangles += definition.resourceCost.triangles;
    resourceCost.colliders += definition.resourceCost.colliders;
    const assetParts = definition.visualParts.filter(
      (part) => part.kind === "asset"
    );
    for (const assetPart of assetParts) {
      const subjectAsset = requireNormalizedResourceRowV3(
        subjectAssetsByRef,
        assetPart.subjectAssetRef,
        "Subject Asset"
      );
      const subjectAssetLockRows = world.resources.resourceLock.filter(
        (row) => row.resourceRef === subjectAsset.subjectAssetRef
      );
      if (subjectAssetLockRows.length !== 1 || subjectAssetLockRows[0]?.resourceKind !== "subject-asset") {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject Asset '${subjectAsset.subjectAssetRef}' requires one matching locked Subject Asset.`
        );
      }
      if (subjectAssetLockRows[0].contentHash !== subjectAsset.subjectAssetManifestHash) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject Asset '${subjectAsset.subjectAssetRef}' does not match its locked Registry manifest hash.`
        );
      }
      reachableSubjectAssetsByRef.set(subjectAsset.subjectAssetRef, subjectAsset);
    }
    if (definition.visualBinding.mode === "rigged") {
      if (assetParts.length !== 1) {
        throw new Error(
          `NormalizedWorldIR invariant violated: rigged Subject '${node.id}' must select exactly one Subject Asset.`
        );
      }
      const subjectAssetRef = assetParts[0].subjectAssetRef;
      const rigProfile = requireNormalizedResourceRowV3(
        rigProfilesByRef,
        definition.visualBinding.rigProfileRef,
        "Rig Profile"
      );
      const animationSet = requireNormalizedResourceRowV3(
        animationSetsByRef,
        definition.visualBinding.animationSetRef,
        "Animation Set"
      );
      if (rigProfile.bodyTopology !== definition.bodyTopology) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Rig Profile '${rigProfile.rigProfileRef}' has topology '${rigProfile.bodyTopology}', but Subject '${node.id}' has '${definition.bodyTopology}'.`
        );
      }
      if (animationSet.subjectAssetRef !== subjectAssetRef) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Animation Set '${animationSet.animationSetRef}' targets Subject Asset '${animationSet.subjectAssetRef}', but Subject '${node.id}' selects '${subjectAssetRef}'.`
        );
      }
      if (animationSet.rigProfileRef !== rigProfile.rigProfileRef) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Animation Set '${animationSet.animationSetRef}' targets Rig Profile '${animationSet.rigProfileRef}', but Subject '${node.id}' selects '${rigProfile.rigProfileRef}'.`
        );
      }
      const requiredBoneIds = new Set(rigProfile.requiredBoneIds);
      const missingSocketBone = definition.sockets.find(
        (socket) => socket.kind === "bone" && !requiredBoneIds.has(socket.boneId)
      );
      if (missingSocketBone?.kind === "bone") {
        throw new Error(
          `NormalizedWorldIR invariant violated: Bone Socket '${missingSocketBone.id}' targets undeclared Bone '${missingSocketBone.boneId}'.`
        );
      }
      reachableRigProfilesByRef.set(rigProfile.rigProfileRef, rigProfile);
      reachableAnimationSetsByRef.set(animationSet.animationSetRef, animationSet);
    } else {
      if (assetParts.length > 1) {
        throw new Error(
          `NormalizedWorldIR invariant violated: static Subject '${node.id}' supports at most one Subject Asset.`
        );
      }
      const staticBinding = definition.visualBinding;
      if (definition.sockets.some((socket) => socket.kind === "bone") || Object.prototype.hasOwnProperty.call(staticBinding, "rigProfileRef") || Object.prototype.hasOwnProperty.call(staticBinding, "animationSetRef")) {
        throw new Error(
          `NormalizedWorldIR invariant violated: static Subject '${node.id}' contains rigged visual data.`
        );
      }
    }
    if (definition.colliderPolicy.kind === "profile") {
      const colliderProfile = requireNormalizedResourceRowV3(
        colliderProfilesByRef,
        definition.colliderPolicy.colliderProfileRef,
        "Collider Profile"
      );
      if (!colliderProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Collider Profile '${colliderProfile.colliderProfileRef}' does not support Subject '${node.id}' topology '${definition.bodyTopology}'.`
        );
      }
      if (!colliderProfileMatchesDefinitionV3(colliderProfile, definition.collider)) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Collider Profile '${colliderProfile.colliderProfileRef}' does not match Subject '${node.id}' collider.`
        );
      }
      reachableColliderProfilesByRef.set(
        colliderProfile.colliderProfileRef,
        colliderProfile
      );
    }
    return {
      entityId: node.id,
      subjectDefinitionRef: definition.subjectDefinitionRef,
      subjectDefinitionHash: definition.subjectDefinitionHash,
      bodyTopology: definition.bodyTopology,
      semanticClassId: definition.semanticClassId,
      spawnAnchorEntityId: spawnAnchor.id,
      spawnSubjectOriginPositionMetersXYZ: [
        ...spawnAnchor.transform.positionMetersXYZ
      ],
      spawnSubjectFacingRadians: spawnAnchor.transform.rotationEulerRadiansXYZ[1],
      forwardDirection: "-z",
      visualParts: definition.visualParts.map(compileSubjectVisualPartV3),
      visualBinding: definition.visualBinding.mode === "static" ? { mode: "static" } : {
        mode: "rigged",
        rigProfileRef: definition.visualBinding.rigProfileRef,
        animationSetRef: definition.visualBinding.animationSetRef
      },
      sockets: definition.sockets.map(compileSubjectSocketV3),
      mountSlots: definition.mountSlots.map((slot) => ({
        id: slot.id,
        kind: slot.kind,
        mode: slot.mode,
        mountSocketId: slot.mountSocketId,
        riderSubjectOriginOffsetMetersXYZ: [
          ...slot.riderSubjectOriginOffsetMetersXYZ
        ],
        dismountCandidateOffsetsMetersXYZ: slot.dismountCandidateOffsetsMetersXYZ.map((offset) => [...offset])
      })),
      collider: {
        kind: definition.collider.kind,
        radiusMeters: definition.collider.radiusMeters,
        heightMeters: definition.collider.heightMeters,
        centerOffsetFromSubjectOriginMetersXYZ: [
          definition.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
          definition.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
          definition.collider.centerOffsetFromSubjectOriginMetersXYZ[2]
        ],
        massKilograms: definition.collider.massKilograms,
        maxSlopeDegrees: definition.collider.maxSlopeDegrees,
        maxStepHeightMeters: definition.collider.maxStepHeightMeters
      },
      locomotion: {
        allowWalk: definition.locomotion.allowWalk,
        allowRun: definition.locomotion.allowRun,
        allowJump: definition.locomotion.allowJump
      },
      locomotionCapabilityRef: locomotionCapabilityLock.resourceRef,
      locomotionCapabilityHash: locomotionCapabilityLock.contentHash,
      physicsBodyProfileRef: definition.profiles.physicsBodyProfileRef,
      locomotionProfileRef: definition.profiles.locomotionProfileRef,
      controlFeel: {
        resourceRef: definition.controlFeel.resourceRef,
        contentHash: definition.controlFeel.contentHash,
        walkSpeedMetersPerSecond: definition.controlFeel.walkSpeedMetersPerSecond,
        runSpeedMetersPerSecond: definition.controlFeel.runSpeedMetersPerSecond,
        jumpSpeedMetersPerSecond: definition.controlFeel.jumpSpeedMetersPerSecond,
        accelerationMetersPerSecondSquared: definition.controlFeel.accelerationMetersPerSecondSquared,
        decelerationMetersPerSecondSquared: definition.controlFeel.decelerationMetersPerSecondSquared,
        turnRateRadiansPerSecond: definition.controlFeel.turnRateRadiansPerSecond,
        moveResponseExponent: definition.controlFeel.moveResponseExponent,
        airControlRatio: definition.controlFeel.airControlRatio,
        coyoteTimeSeconds: definition.controlFeel.coyoteTimeSeconds,
        jumpBufferSeconds: definition.controlFeel.jumpBufferSeconds,
        variableJumpHoldSeconds: definition.controlFeel.variableJumpHoldSeconds,
        jumpHoldGravityRatio: definition.controlFeel.jumpHoldGravityRatio,
        jumpReleaseGravityRatio: definition.controlFeel.jumpReleaseGravityRatio
      },
      availableControlFeels: definition.availableControlFeels.map((feel) => ({
        resourceRef: feel.resourceRef,
        contentHash: feel.contentHash,
        walkSpeedMetersPerSecond: feel.walkSpeedMetersPerSecond,
        runSpeedMetersPerSecond: feel.runSpeedMetersPerSecond,
        jumpSpeedMetersPerSecond: feel.jumpSpeedMetersPerSecond,
        accelerationMetersPerSecondSquared: feel.accelerationMetersPerSecondSquared,
        decelerationMetersPerSecondSquared: feel.decelerationMetersPerSecondSquared,
        turnRateRadiansPerSecond: feel.turnRateRadiansPerSecond,
        moveResponseExponent: feel.moveResponseExponent,
        airControlRatio: feel.airControlRatio,
        coyoteTimeSeconds: feel.coyoteTimeSeconds,
        jumpBufferSeconds: feel.jumpBufferSeconds,
        variableJumpHoldSeconds: feel.variableJumpHoldSeconds,
        jumpHoldGravityRatio: feel.jumpHoldGravityRatio,
        jumpReleaseGravityRatio: feel.jumpReleaseGravityRatio
      })),
      capabilityAssembly: compileCapabilityAssemblyV1(
        definition.capabilityAssembly
      )
    };
  }).sort((left, right) => left.entityId.localeCompare(right.entityId));
  if (subjects.length === 0) {
    throw new Error(
      "NormalizedWorldIR invariant violated: no Subject nodes were materialized."
    );
  }
  return {
    subjects,
    subjectAssets: [...reachableSubjectAssetsByRef.values()].sort((left, right) => left.subjectAssetRef.localeCompare(right.subjectAssetRef)).map(compileSubjectAssetV1),
    rigProfiles: [...reachableRigProfilesByRef.values()].sort((left, right) => left.rigProfileRef.localeCompare(right.rigProfileRef)).map(compileRigProfileV1),
    animationSets: [...reachableAnimationSetsByRef.values()].sort((left, right) => left.animationSetRef.localeCompare(right.animationSetRef)).map(compileAnimationSetV1),
    colliderProfiles: [...reachableColliderProfilesByRef.values()].sort((left, right) => left.colliderProfileRef.localeCompare(right.colliderProfileRef)).map(compileColliderProfileV1),
    resourceCost
  };
}
function primitiveResourceCostV3(primitive) {
  switch (primitive.kind) {
    case "box":
      return { vertices: 24, triangles: 12 };
    case "sphere":
      return { vertices: 289, triangles: 512 };
    case "cylinder":
      return { vertices: 70, triangles: 128 };
    case "cone":
      return { vertices: 36, triangles: 64 };
  }
}
function waterResourceCostV3(boundary) {
  const vertices = boundary.kind === "polygon" ? boundary.pointsMetersXZ.length : 64;
  return { vertices: vertices + 1, triangles: vertices };
}
function pushBudgetDiagnosticV3(diagnostics, field, actual, maximum) {
  if (actual <= maximum) return;
  diagnostics.push({
    severity: "error",
    code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
    instancePath: `/world/resourceBudget/${field}`,
    message: `${field} budget is ${maximum}, but the compiled world requires ${actual}.`,
    details: { actual, maximum }
  });
}
function compileWorldCore(input) {
  const world = input.normalizedWorldIr;
  try {
    const terrain = compileTerrainV3(world);
    const waters = compileWatersV3(world, terrain);
    const objects = compileObjectsV3(world);
    const {
      subjects,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      resourceCost: subjectResourceCost
    } = compileSubjectsV3(world);
    const spawnDiagnostics = validateCompiledSpawnFootprintsV3(
      subjects,
      waters,
      objects
    );
    if (spawnDiagnostics.length > 0) {
      return { ok: false, diagnostics: spawnDiagnostics };
    }
    const cameraNode = findOnlyNodeV4(world.nodes, "camera");
    const terrainVertices = terrain.resolutionCellsXZ[0] * terrain.resolutionCellsXZ[1];
    const terrainTriangles = (terrain.resolutionCellsXZ[0] - 1) * (terrain.resolutionCellsXZ[1] - 1) * 2;
    const objectCosts = objects.map(
      (object) => primitiveResourceCostV3(object.primitive)
    );
    const waterCosts = waters.map((water) => waterResourceCostV3(water.boundary));
    const usage = {
      vertices: terrainVertices + subjectResourceCost.vertices + [...objectCosts, ...waterCosts].reduce(
        (sum2, cost) => sum2 + cost.vertices,
        0
      ),
      triangles: terrainTriangles + subjectResourceCost.triangles + [...objectCosts, ...waterCosts].reduce(
        (sum2, cost) => sum2 + cost.triangles,
        0
      ),
      colliders: 1 + subjectResourceCost.colliders + objects.filter((object) => object.collisionEnabled).length
    };
    const diagnostics = [];
    const budget = world.world.resourceBudget;
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxVertices",
      usage.vertices,
      budget.maxVertices
    );
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxTriangles",
      usage.triangles,
      budget.maxTriangles
    );
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxColliders",
      usage.colliders,
      budget.maxColliders
    );
    if (diagnostics.length > 0) return { ok: false, diagnostics };
    const rig = cameraNode.components.cameraRig;
    const components = {
      id: world.id,
      seed: world.seed,
      runtimeBackend: "babylon-havok",
      coordinateSystem: world.world.coordinateSystem,
      gravityMetersPerSecondSquaredXYZ: [
        ...world.world.gravityMetersPerSecondSquaredXYZ
      ],
      atmospherePreset: world.world.environment.preset,
      terrain,
      waters,
      objects,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      controlledEntityId: world.startup.controlledEntityId,
      subjects,
      camera: {
        cameraEntityId: cameraNode.id,
        rigRef: "worldkit://camera/third-person.standard@1",
        targetEntityId: rig.target.targetEntityId,
        pitchRadians: rig.thirdPerson.pitchRadians,
        distanceMeters: rig.thirdPerson.distanceMeters,
        targetHeightMeters: rig.target.targetHeightMeters ?? rig.thirdPerson.targetHeightMeters,
        fovDegrees: rig.thirdPerson.fovDegrees,
        aspectRatio: rig.thirdPerson.aspectRatio,
        manualSwitchAllowed: rig.manualSwitchAllowed
      },
      resourceUsage: usage
    };
    return {
      ok: true,
      components,
      diagnostics: []
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_IR_INVALID",
          instancePath: "/normalizedWorldIr",
          message: cause instanceof Error ? cause.message : "NormalizedWorldIR could not be compiled."
        }
      ]
    };
  }
}
function projectPrimitiveRecord(value, allowedKeys) {
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const candidate = value[key];
      return typeof candidate === "number" || typeof candidate === "boolean" || typeof candidate === "string" ? [[key, candidate]] : [];
    })
  );
}
function projectNumericRecord(value, allowedKeys) {
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const candidate = value[key];
      return typeof candidate === "number" && Number.isFinite(candidate) ? [[key, candidate]] : [];
    })
  );
}
function assertionMeasurementKeys(kind) {
  switch (kind) {
    case "inside-region":
      return ["isInside", "minimumBoundaryClearanceMeters"];
    case "outside-region":
      return ["intersectsRegion", "minimumBoundaryClearanceMeters"];
    case "distance-range":
      return ["distanceMeters"];
    case "faces-entity":
      return ["angularDeviationDegrees"];
    case "supported-by":
      return ["maximumSupportGapMeters", "supportRatio"];
    case "minimum-clearance":
      return ["hasOverlap", "minimumClearanceMeters"];
    case "within-slope-limit":
      return ["maximumSlopeDegrees", "sampledPointCount", "sampledLateralOffsetCount"];
    case "visible-in-camera-region":
      return ["projectedAreaRatio", "visibleRatio", "isOccluded", "cameraTargetAnchorEntityId"];
  }
}
function assertionToleranceKeys(kind) {
  switch (kind) {
    case "inside-region":
    case "outside-region":
    case "distance-range":
      return ["distanceMeters"];
    case "faces-entity":
    case "within-slope-limit":
      return ["angleDegrees"];
    case "supported-by":
      return ["supportGapMeters"];
    case "minimum-clearance":
      return ["overlapMeters"];
    case "visible-in-camera-region":
      return ["ratio"];
  }
}
function assertionBase(assertion) {
  return {
    constraintId: assertion.constraintId,
    evidenceEntityIds: [...assertion.evidenceEntityIds],
    measurements: projectPrimitiveRecord(
      assertion.measurements,
      assertionMeasurementKeys(assertion.kind)
    ),
    tolerances: projectNumericRecord(
      assertion.tolerances,
      assertionToleranceKeys(assertion.kind)
    )
  };
}
function projectLayoutAssertionV1(assertion) {
  const base = assertionBase(assertion);
  switch (assertion.kind) {
    case "inside-region":
    case "outside-region":
      return { ...base, kind: assertion.kind, entityId: assertion.entityId, regionId: assertion.regionId, boundaryClearanceMeters: assertion.boundaryClearanceMeters };
    case "distance-range":
      return { ...base, kind: assertion.kind, entityId: assertion.entityId, referenceEntityId: assertion.referenceEntityId, minimumDistanceMeters: assertion.minimumDistanceMeters, maximumDistanceMeters: assertion.maximumDistanceMeters };
    case "faces-entity":
      return { ...base, kind: assertion.kind, facingEntityId: assertion.facingEntityId, targetEntityId: assertion.targetEntityId, maximumAngularDeviationDegrees: assertion.maximumAngularDeviationDegrees };
    case "supported-by":
      return { ...base, kind: assertion.kind, supportedEntityId: assertion.supportedEntityId, supportingEntityId: assertion.supportingEntityId, maximumSupportGapMeters: assertion.maximumSupportGapMeters, minimumSupportRatio: assertion.minimumSupportRatio };
    case "minimum-clearance":
      return assertion.otherEntityIds === void 0 ? { ...base, kind: assertion.kind, entityId: assertion.entityId, semanticClassIds: [...assertion.semanticClassIds], clearanceMeters: assertion.clearanceMeters } : { ...base, kind: assertion.kind, entityId: assertion.entityId, otherEntityIds: [...assertion.otherEntityIds], clearanceMeters: assertion.clearanceMeters };
    case "within-slope-limit":
      return assertion.entityId === void 0 ? { ...base, kind: assertion.kind, terrainEntityId: assertion.terrainEntityId, routeId: assertion.routeId, maximumSlopeDegrees: assertion.maximumSlopeDegrees } : { ...base, kind: assertion.kind, terrainEntityId: assertion.terrainEntityId, entityId: assertion.entityId, maximumSlopeDegrees: assertion.maximumSlopeDegrees };
    case "visible-in-camera-region":
      return { ...base, kind: assertion.kind, visibleEntityId: assertion.visibleEntityId, cameraEntityId: assertion.cameraEntityId, screenRegionId: assertion.screenRegionId, minimumVisibleRatio: assertion.minimumVisibleRatio, minimumProjectedAreaRatio: assertion.minimumProjectedAreaRatio };
  }
}
function projectPlacementV1(node) {
  return {
    entityId: node.id,
    transform: {
      positionMetersXYZ: [...node.transform.positionMetersXYZ],
      rotationEulerRadiansXYZ: [...node.transform.rotationEulerRadiansXYZ],
      scaleXYZ: [...node.transform.scaleXYZ]
    },
    placementProvenance: {
      kind: node.placementProvenance.kind,
      candidateId: node.placementProvenance.candidateId,
      placementConstraintIds: [...node.placementProvenance.placementConstraintIds],
      solverProfileRef: node.placementProvenance.solverProfileRef,
      layoutSolveReportHash: node.placementProvenance.layoutSolveReportHash
    }
  };
}
function compileLockedTerrainV4(world, baseline) {
  const heightfield = world.layout.heightfields.find((row) => row.terrainEntityId === baseline.entityId);
  if (heightfield === void 0) throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_MISSING");
  const expectedLength = heightfield.resolutionVerticesXZ[0] * heightfield.resolutionVerticesXZ[1];
  if (heightfield.heightSamplesMeters.length !== expectedLength || heightfield.heightSamplesMeters.some((value) => !Number.isFinite(value))) throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_INVALID");
  const heightSamplesMeters = [...heightfield.heightSamplesMeters];
  const heightSamplesHash = sha256CanonicalJson(heightSamplesMeters);
  if (heightSamplesHash !== baseline.heightSamplesHash) {
    throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_MISMATCH");
  }
  const minimumHeightMeters = min(heightSamplesMeters);
  const maximumHeightMeters = max(heightSamplesMeters);
  if (isNil(minimumHeightMeters) || isNil(maximumHeightMeters)) {
    throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_INVALID");
  }
  return {
    entityId: baseline.entityId,
    centerMetersXZ: [...heightfield.centerMetersXZ],
    sizeMetersXZ: [...heightfield.sizeMetersXZ],
    resolutionCellsXZ: [...heightfield.resolutionVerticesXZ],
    heightSamplesMeters,
    heightSamplesHash,
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: baseline.semanticClassId
  };
}
function compileExecutionLayoutV1(world) {
  const placements = world.nodes.filter((node) => node.kind === "object" || node.kind === "anchor").sort((left, right) => left.id.localeCompare(right.id));
  for (const node of placements) {
    if (node.placementProvenance.layoutSolveReportHash !== world.layout.layoutSolveReportHash || node.placementProvenance.solverProfileRef !== world.layout.solverProfileRef) {
      throw new Error("COMPILER_LAYOUT_PROVENANCE_MISMATCH");
    }
  }
  return {
    solverProfileRef: world.layout.solverProfileRef,
    resolvedVersion: world.layout.resolvedVersion,
    solverProfileHash: world.layout.solverProfileHash,
    layoutSolveReportHash: world.layout.layoutSolveReportHash,
    regions: [...world.layout.regions].sort((left, right) => left.id.localeCompare(right.id)).map((region) => ({
      id: region.id,
      kind: region.kind,
      pointsMetersXZ: region.pointsMetersXZ.map((point) => [...point]),
      ...region.minimumHeightMeters === void 0 ? {} : { minimumHeightMeters: region.minimumHeightMeters },
      ...region.maximumHeightMeters === void 0 ? {} : { maximumHeightMeters: region.maximumHeightMeters },
      semanticClassId: region.semanticClassId
    })),
    routes: [...world.layout.routes].sort((left, right) => left.id.localeCompare(right.id)).map((route) => ({
      id: route.id,
      kind: route.kind,
      pointsMetersXZ: route.pointsMetersXZ.map((point) => [...point]),
      widthMeters: route.widthMeters,
      locomotionProfileRef: route.locomotionProfileRef
    })),
    screenRegions: [...world.layout.screenRegions].sort((left, right) => left.id.localeCompare(right.id)).map((region) => ({
      id: region.id,
      kind: region.kind,
      minimumUv: [...region.minimumUv],
      maximumUv: [...region.maximumUv]
    })),
    placementsByEntityId: Object.fromEntries(placements.map((node) => [
      node.id,
      projectPlacementV1(node)
    ])),
    layoutAssertions: [...world.layout.assertions].sort((left, right) => left.constraintId.localeCompare(right.constraintId)).map(projectLayoutAssertionV1)
  };
}
function compileTraversalAreaV1(area) {
  return {
    id: area.id,
    kind: area.kind,
    pointsMetersXZ: area.pointsMetersXZ.map((point) => [...point]),
    surfaceEntityId: area.surfaceEntityId,
    mode: area.mode
  };
}
function compileHeightfieldTraversalSurfaceV1(terrain) {
  const surfaceEntityId = terrain.entityId;
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    surfaceEntityId,
    "heightfield"
  );
  return {
    kind: "heightfield",
    traversalSurfaceId: `traversal-surface:${sha256CanonicalJson({
      surfaceEntityId,
      logicalSubshapeId: "heightfield"
    })}`,
    surfaceEntityId,
    colliderSubshapeId,
    resourceRef: `package://traversal-surface/${surfaceEntityId}.heightfield@1`,
    resolvedVersion: "1",
    resourceHash: sha256CanonicalJson({
      surfaceEntityId,
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionCellsXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters
    })
  };
}
function staticColliderShapeV1(primitive) {
  switch (primitive.kind) {
    case "box":
      return { kind: "box", sizeMetersXYZ: [...primitive.sizeMetersXYZ] };
    case "sphere":
      return { kind: "sphere", radiusMeters: primitive.radiusMeters };
    case "cylinder":
    case "cone":
      return {
        kind: "cylinder",
        radiusMeters: primitive.radiusMeters,
        heightMeters: primitive.heightMeters
      };
  }
}
function compileStaticColliderV1(object) {
  const logicalSubshapeId = "primary";
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    object.entityId,
    logicalSubshapeId
  );
  const hashInput = {
    entityId: object.entityId,
    logicalSubshapeId,
    colliderSubshapeId,
    transform: structuredClone(object.transform),
    shape: staticColliderShapeV1(object.primitive)
  };
  return {
    ...hashInput,
    colliderHash: sha256CanonicalJson(hashInput)
  };
}
const PROTOTYPE_TRAVERSAL_SURFACE_BINDING_FIELDS_V1 = [
  "id",
  "kind",
  "logicalSubshapeId",
  "traversalSurfaceProfileRef"
];
const PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1 = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const TRAVERSAL_SURFACE_PROFILE_REF_PATTERN_V1 = /^worldkit:\/\/traversal-surface-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;
function canonicalPrototypeTraversalSurfaceBindingV1(value, prototypeId) {
  if (isNil(value) || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Traversal Surface binding '${prototypeId}.<unknown>' is invalid.`
    );
  }
  const record2 = value;
  const fields = Object.keys(record2).sort();
  const expectedFields = [
    ...PROTOTYPE_TRAVERSAL_SURFACE_BINDING_FIELDS_V1
  ].sort();
  const bindingId = typeof record2.id === "string" ? record2.id : "<unknown>";
  if (fields.length !== expectedFields.length || fields.some((field, index) => field !== expectedFields[index]) || typeof record2.id !== "string" || !PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1.test(record2.id) || record2.kind !== "collider-subshape" || typeof record2.logicalSubshapeId !== "string" || !PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1.test(
    record2.logicalSubshapeId
  ) || typeof record2.traversalSurfaceProfileRef !== "string" || !TRAVERSAL_SURFACE_PROFILE_REF_PATTERN_V1.test(
    record2.traversalSurfaceProfileRef
  )) {
    throw new Error(
      `Traversal Surface binding '${prototypeId}.${bindingId}' is invalid.`
    );
  }
  return Object.freeze({
    id: record2.id,
    kind: record2.kind,
    logicalSubshapeId: record2.logicalSubshapeId,
    traversalSurfaceProfileRef: record2.traversalSurfaceProfileRef
  });
}
function compileStaticColliderTraversalSurfaceV1(input) {
  const matchingColliders = input.staticColliders.filter(
    (collider2) => collider2.entityId === input.entityId && collider2.logicalSubshapeId === input.binding.logicalSubshapeId
  );
  if (matchingColliders.length !== 1) {
    throw new Error(
      `Traversal Surface Collider join for '${input.entityId}.${input.binding.id}' requires exactly one Collider; received ${matchingColliders.length}.`
    );
  }
  const collider = matchingColliders[0];
  if (collider.colliderSubshapeId !== deriveColliderSubshapeIdV1(
    input.entityId,
    input.binding.logicalSubshapeId
  )) {
    throw new Error(
      `Traversal Surface Collider join for '${input.entityId}.${input.binding.id}' has a non-canonical colliderSubshapeId.`
    );
  }
  const resolvedProfile = resolveTraversalSurfaceProfileV1(
    input.binding.traversalSurfaceProfileRef
  );
  const matchingProfileRows = input.resourceLock.filter(
    (row) => row.resourceRef === resolvedProfile.resourceRef
  );
  if (matchingProfileRows.length !== 1) {
    throw new Error(
      `Traversal Surface Profile lock join for '${resolvedProfile.resourceRef}' requires exactly one row; received ${matchingProfileRows.length}.`
    );
  }
  const profileRow = matchingProfileRows[0];
  if (profileRow.resourceRef !== resolvedProfile.resourceRef || profileRow.resourceKind !== "traversal-surface-profile" || profileRow.resolvedVersion !== resolvedProfile.resolvedVersion || profileRow.contentHash !== resolvedProfile.contentHash) {
    throw new Error(
      `Traversal Surface Profile lock join for '${resolvedProfile.resourceRef}' does not match the resolved receipt.`
    );
  }
  const traversalSurfaceProfileRef = profileRow.resourceRef;
  const traversalSurfaceProfileResolvedVersion = profileRow.resolvedVersion;
  const traversalSurfaceProfileHash = profileRow.contentHash;
  const bindingIdentity = {
    id: input.binding.id,
    kind: input.binding.kind,
    logicalSubshapeId: input.binding.logicalSubshapeId,
    traversalSurfaceProfileRef: input.binding.traversalSurfaceProfileRef
  };
  const traversalSurfaceId = `traversal-surface:${sha256CanonicalJson({
    kind: "static-collider",
    surfaceEntityId: input.entityId,
    logicalSurfaceId: input.binding.id
  })}`;
  const resourceHash = sha256CanonicalJson({
    prototypeId: input.prototypeId,
    prototypeVersion: input.prototypeVersion,
    binding: bindingIdentity,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash,
    colliderHash: collider.colliderHash
  });
  return {
    kind: "static-collider",
    traversalSurfaceId,
    surfaceEntityId: collider.entityId,
    colliderSubshapeId: collider.colliderSubshapeId,
    resourceRef: `package://traversal-surface/${input.entityId}.${input.binding.id}@${input.prototypeVersion}`,
    resolvedVersion: String(input.prototypeVersion),
    resourceHash,
    logicalSurfaceId: input.binding.id,
    logicalSubshapeId: collider.logicalSubshapeId,
    colliderHash: collider.colliderHash,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash
  };
}
function compileStaticColliderTraversalSurfacesV1(world, staticColliders, resourceLock) {
  const objectNodes = world.nodes.filter((node) => node.kind === "object");
  const surfaces = [];
  for (const prototype of world.resources.prototypes) {
    const bindings = (prototype.traversalSurfaceBindings ?? []).map((binding) => canonicalPrototypeTraversalSurfaceBindingV1(binding, prototype.id));
    const seenBindingIds = /* @__PURE__ */ new Set();
    const seenLogicalSubshapeIds = /* @__PURE__ */ new Set();
    for (const binding of bindings) {
      if (seenBindingIds.has(binding.id) || seenLogicalSubshapeIds.has(binding.logicalSubshapeId)) {
        throw new Error(
          `Traversal Surface binding '${prototype.id}.${binding.id}' is duplicated.`
        );
      }
      seenBindingIds.add(binding.id);
      seenLogicalSubshapeIds.add(binding.logicalSubshapeId);
    }
    const prototypeRef = `package://prototype/${prototype.id}@${prototype.version}`;
    for (const node of objectNodes) {
      if (node.prototypeRef !== prototypeRef) continue;
      for (const binding of bindings) {
        surfaces.push(compileStaticColliderTraversalSurfaceV1({
          prototypeId: prototype.id,
          prototypeVersion: prototype.version,
          binding,
          entityId: node.id,
          staticColliders,
          resourceLock
        }));
      }
    }
  }
  return surfaces;
}
function requireUniquePrototypeIdentitiesV1(prototypes) {
  const seenPrototypeIdentities = /* @__PURE__ */ new Set();
  for (const prototype of prototypes) {
    const prototypeIdentity = `${prototype.id}@${prototype.version}`;
    if (seenPrototypeIdentities.has(prototypeIdentity)) {
      throw new Error(`Prototype identity '${prototypeIdentity}' is duplicated.`);
    }
    seenPrototypeIdentities.add(prototypeIdentity);
  }
}
function requireUniqueNodeEntityIdsV1(nodes) {
  const seenEntityIds = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    if (seenEntityIds.has(node.id)) {
      throw new Error(`Node entity id '${node.id}' is duplicated.`);
    }
    seenEntityIds.add(node.id);
  }
}
function compileConnectivityRequirementV1(requirement) {
  return structuredClone(requirement);
}
function compileWorldV5(input) {
  let snapshot;
  try {
    snapshot = snapshotCompileWorldInputV5(input);
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: cause instanceof CompilerInputAccessorErrorV1 ? "COMPILER_INPUT_ACCESSOR_FORBIDDEN" : "COMPILER_INPUT_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof CompilerInputAccessorErrorV1 ? "Compiler input must be an accessor-free data graph." : "Compiler input must be a cloneable data graph."
      }]
    };
  }
  const actualNormalizedWorldIrHash = sha256CanonicalJson(
    snapshot.normalizedWorldIr
  );
  if (snapshot.normalizedWorldIrHash !== actualNormalizedWorldIrHash) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_HASH_MISMATCH",
        instancePath: "/normalizedWorldIrHash",
        message: "The supplied normalizedWorldIrHash does not match NormalizedWorldIRV4.",
        details: {
          expected: actualNormalizedWorldIrHash,
          actual: snapshot.normalizedWorldIrHash
        }
      }]
    };
  }
  try {
    const normalizedResourceLockEntries = canonicalExecutionResourceLockEntriesV1(
      snapshot.normalizedWorldIr.resources.resourceLock
    );
    const normalizedResourceLockHash = sha256CanonicalJson(
      normalizedResourceLockEntries
    );
    if (snapshot.normalizedWorldIr.resources.resourceLockHash !== normalizedResourceLockHash) {
      throw new Error("Resource Lock hash does not match canonical entries.");
    }
    let gameplayBootstrapResourceLock2;
    try {
      const [canonicalBootstrap] = canonicalExecutionResourceLockEntriesV1([
        snapshot.gameplayBootstrapResourceLock
      ]);
      if (isNil(canonicalBootstrap) || canonicalBootstrap.resourceKind !== "gameplay-bootstrap" || normalizedResourceLockEntries.some(
        (entry) => entry.resourceRef === canonicalBootstrap.resourceRef
      )) {
        throw new TypeError("Invalid Gameplay Bootstrap Resource Lock.");
      }
      gameplayBootstrapResourceLock2 = canonicalBootstrap;
    } catch {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "COMPILER_GAMEPLAY_BOOTSTRAP_LOCK_INVALID",
          instancePath: "/gameplayBootstrapResourceLock",
          message: "The Gameplay Bootstrap Resource Lock must be one unique gameplay-bootstrap row."
        }]
      };
    }
    const resourceLockEntries = canonicalExecutionResourceLockEntriesV1([
      ...normalizedResourceLockEntries,
      gameplayBootstrapResourceLock2
    ]);
    const resourceLockHash = sha256CanonicalJson(resourceLockEntries);
    requireUniquePrototypeIdentitiesV1(
      snapshot.normalizedWorldIr.resources.prototypes
    );
    requireUniqueNodeEntityIdsV1(snapshot.normalizedWorldIr.nodes);
    const compiledCurrent = compileWorldCore({
      normalizedWorldIr: snapshot.normalizedWorldIr
    });
    if (!compiledCurrent.ok || compiledCurrent.components === void 0) {
      return { ok: false, diagnostics: compiledCurrent.diagnostics };
    }
    const terrain = compileLockedTerrainV4(
      snapshot.normalizedWorldIr,
      compiledCurrent.components.terrain
    );
    const staticColliders = compiledCurrent.components.objects.filter((object) => object.collisionEnabled).map(compileStaticColliderV1).sort((left, right) => left.colliderSubshapeId.localeCompare(right.colliderSubshapeId));
    const sortedTraversalSurfaces = [
      compileHeightfieldTraversalSurfaceV1(terrain),
      ...compileStaticColliderTraversalSurfacesV1(
        snapshot.normalizedWorldIr,
        staticColliders,
        normalizedResourceLockEntries
      )
    ].sort((left, right) => left.traversalSurfaceId.localeCompare(right.traversalSurfaceId));
    for (let index = 1; index < sortedTraversalSurfaces.length; index += 1) {
      const previous = sortedTraversalSurfaces[index - 1];
      const current = sortedTraversalSurfaces[index];
      if (current.traversalSurfaceId === previous.traversalSurfaceId) {
        throw new Error(
          `Traversal Surface id '${current.traversalSurfaceId}' is duplicated.`
        );
      }
    }
    const traversalSurfaces = Object.freeze(
      sortedTraversalSurfaces.map((surface) => Object.freeze(surface))
    );
    const {
      controlledEntityId: initialControlledEntityId,
      ...componentsWithoutControlledEntity
    } = compiledCurrent.components;
    const plan = parseExecutionPlanV5({
      kind: "worldkit-execution-plan",
      ...componentsWithoutControlledEntity,
      schemaVersion: 5,
      initialControlledEntityId,
      initialRelationships: snapshot.normalizedWorldIr.relationships.map((relationship) => ({
        ...structuredClone(relationship),
        establishedSimulationTick: 0
      })).sort((left, right) => left.id.localeCompare(right.id)),
      authoringSpecHash: snapshot.normalizedWorldIr.authoringSpecHash,
      normalizedWorldIrHash: snapshot.normalizedWorldIrHash,
      resourceLockHash,
      resourceLockEntries,
      terrain,
      layout: compileExecutionLayoutV1(snapshot.normalizedWorldIr),
      traversal: {
        surfaces: traversalSurfaces,
        traversalAreas: snapshot.normalizedWorldIr.layout.traversalAreas.map(compileTraversalAreaV1).sort((left, right) => left.id.localeCompare(right.id)),
        connectivityRequirements: snapshot.normalizedWorldIr.layout.connectivityRequirements.map(compileConnectivityRequirementV1).sort((left, right) => left.constraintId.localeCompare(right.constraintId)),
        anchorEntityIds: snapshot.normalizedWorldIr.nodes.filter((node) => node.kind === "anchor").map((node) => node.id).sort((left, right) => left.localeCompare(right))
      },
      staticColliders
    });
    return {
      ok: true,
      executionPlan: plan,
      executionPlanHash: hashExecutionPlanV5(plan),
      diagnostics: []
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof Error ? cause.message : "NormalizedWorldIRV4 could not be compiled."
      }]
    };
  }
}
function invalid$1(schemaName) {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}
function snapshotDataRecord$1(value) {
  if (typeof value !== "object" || isNil(value)) return void 0;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && !isNil(prototype)) return void 0;
    const snapshot = /* @__PURE__ */ Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) return void 0;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return void 0;
  }
}
function hasExactKeys$1(value, keys) {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key));
}
function isSafeNonNegativeInteger$1(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
function deepFreeze$1(value) {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor) && "value" in descriptor) {
      deepFreeze$1(descriptor.value);
    }
  }
  return Object.freeze(value);
}
const GAMEPLAY_CAPACITY_BUDGET_KEYS = [
  "maximumParticipantCount",
  "maximumControllerEntityCount",
  "maximumRelationshipStateCount",
  "maximumActiveActionStateCount",
  "maximumGameplayFeatureCount",
  "maximumSemanticActionDefinitionCount",
  "maximumSemanticFactCount",
  "maximumSemanticFactTransitionCountPerTick",
  "maximumIdempotencyRecordCount",
  "maximumUsedActionExecutionIdCount",
  "maximumRetainedReceiptCount",
  "maximumRetainedEventCount",
  "maximumRetainedWorldStateSnapshotCount"
];
function parseGameplayCapacityBudgetV1(input) {
  const schemaName = "GameplayCapacityBudgetV1";
  const record2 = snapshotDataRecord$1(input) ?? invalid$1(schemaName);
  if (!hasExactKeys$1(record2, GAMEPLAY_CAPACITY_BUDGET_KEYS) || !GAMEPLAY_CAPACITY_BUDGET_KEYS.every(
    (key) => isSafeNonNegativeInteger$1(record2[key])
  )) invalid$1(schemaName);
  return deepFreeze$1(Object.fromEntries(
    GAMEPLAY_CAPACITY_BUDGET_KEYS.map((key) => [key, record2[key]])
  ));
}
parseGameplayCapacityBudgetV1({
  maximumParticipantCount: 1,
  maximumControllerEntityCount: 1,
  maximumRelationshipStateCount: 1,
  maximumActiveActionStateCount: 256,
  maximumGameplayFeatureCount: 16,
  maximumSemanticActionDefinitionCount: 256,
  maximumSemanticFactCount: 4096,
  maximumSemanticFactTransitionCountPerTick: 1024,
  maximumIdempotencyRecordCount: 4096,
  maximumUsedActionExecutionIdCount: 4096,
  maximumRetainedReceiptCount: 4096,
  maximumRetainedEventCount: 8192,
  maximumRetainedWorldStateSnapshotCount: 4096
});
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const GAMEPLAY_COMMAND_TYPES = /* @__PURE__ */ new Set([
  "control.bind",
  "control.release",
  "action.activate",
  "action.cancel"
]);
function invalid(schemaName) {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}
function snapshotDataRecord(value) {
  if (typeof value !== "object" || isNil(value)) return void 0;
  try {
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return void 0;
    const snapshot = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) return void 0;
      Object.defineProperty(snapshot, key, {
        configurable: true,
        enumerable: true,
        value: descriptor.value,
        writable: true
      });
    }
    return snapshot;
  } catch {
    return void 0;
  }
}
function snapshotDataArray(value) {
  if (!Array.isArray(value)) return void 0;
  try {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) return void 0;
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      return void 0;
    }
    if (Object.getOwnPropertyNames(value).length !== value.length + 1) {
      return void 0;
    }
    const snapshot = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) return void 0;
      snapshot.push(descriptor.value);
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (isNil(lengthDescriptor) || lengthDescriptor.enumerable !== false) {
      return void 0;
    }
    return snapshot;
  } catch {
    return void 0;
  }
}
function hasExactKeys(record2, keys) {
  const ownKeys = Reflect.ownKeys(record2);
  return ownKeys.length === keys.length && ownKeys.every(
    (key) => typeof key === "string" && keys.includes(key)
  );
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function isSha256(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}
function isSafeNonNegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
function isSafePositiveInteger(value) {
  return isSafeNonNegativeInteger(value) && value > 0;
}
function compareCanonicalStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sameOrder(actual, expected) {
  return actual.length === expected.length && actual.every(
    (value, index) => value === expected[index]
  );
}
function canonicalStringSet(input, schemaName, mode) {
  const values = snapshotDataArray(input);
  if (isNil(values)) invalid(schemaName);
  if (!values.every(isNonEmptyString)) invalid(schemaName);
  const typedValues = values;
  if (new Set(typedValues).size !== typedValues.length) invalid(schemaName);
  const canonical = [...typedValues].sort(compareCanonicalStrings);
  if (mode === "strict" && !sameOrder(typedValues, canonical)) invalid(schemaName);
  return Object.freeze(canonical);
}
function deepFreeze(value) {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor) && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(value);
}
function parseGameplayEntityDescriptor(input, mode, schemaName) {
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, ["id", "entityDefinitionRef", "capabilityRefs"]) || !isNonEmptyString(record2.id) || !isNonEmptyString(record2.entityDefinitionRef)) invalid(schemaName);
  return deepFreeze({
    id: record2.id,
    entityDefinitionRef: record2.entityDefinitionRef,
    capabilityRefs: canonicalStringSet(record2.capabilityRefs, schemaName, mode)
  });
}
function createGameplayEntityDescriptorV1(input) {
  return parseGameplayEntityDescriptor(
    input,
    "canonicalize",
    "GameplayEntityDescriptorV1"
  );
}
function parseGameplayEntityDescriptorV1(input) {
  return parseGameplayEntityDescriptor(input, "strict", "GameplayEntityDescriptorV1");
}
function parseGameplayFeatureManifestBody(input, mode) {
  const schemaName = "GameplayFeatureManifestBodyV1";
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "dependencyFeatureRefs",
    "requiredCapabilityRefs",
    "commandTypes",
    "resourceBudget"
  ]) || record2.kind !== "gameplay-feature" || !isNonEmptyString(record2.id) || !isSafePositiveInteger(record2.version) || !isNonEmptyString(record2.resourceRef)) invalid(schemaName);
  const commandTypes = canonicalStringSet(record2.commandTypes, schemaName, mode);
  if (!commandTypes.every(
    (type2) => GAMEPLAY_COMMAND_TYPES.has(type2)
  )) invalid(schemaName);
  const resourceBudget = snapshotDataRecord(record2.resourceBudget);
  if (isNil(resourceBudget)) invalid(schemaName);
  if (!hasExactKeys(resourceBudget, ["stateSliceCount", "commandHandlerCount"]) || resourceBudget.stateSliceCount !== 1 || !isSafeNonNegativeInteger(resourceBudget.commandHandlerCount) || resourceBudget.commandHandlerCount !== commandTypes.length) invalid(schemaName);
  return deepFreeze({
    kind: "gameplay-feature",
    id: record2.id,
    version: record2.version,
    resourceRef: record2.resourceRef,
    dependencyFeatureRefs: canonicalStringSet(
      record2.dependencyFeatureRefs,
      schemaName,
      mode
    ),
    requiredCapabilityRefs: canonicalStringSet(
      record2.requiredCapabilityRefs,
      schemaName,
      mode
    ),
    commandTypes,
    resourceBudget: {
      stateSliceCount: 1,
      commandHandlerCount: resourceBudget.commandHandlerCount
    }
  });
}
function createGameplayFeatureManifestV1(input) {
  const body = parseGameplayFeatureManifestBody(input, "canonicalize");
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body)
  });
}
function parseGameplayFeatureResourceLockV1(input) {
  const schemaName = "GameplayFeatureResourceLockV1";
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, ["resourceRef", "contentHash"]) || !isNonEmptyString(record2.resourceRef) || !isSha256(record2.contentHash)) invalid(schemaName);
  return deepFreeze({
    resourceRef: record2.resourceRef,
    contentHash: record2.contentHash
  });
}
function parseGameplayActionDefinitionBody(input, mode) {
  const schemaName = "GameplayActionDefinitionBodyV1";
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "executionMode",
    "completion",
    "effect",
    "isMovementInputBlocked",
    "allowedActorEntityDefinitionRefs",
    "requiredActorCapabilityRefs",
    "request"
  ]) || record2.kind !== "semantic-action" || !isNonEmptyString(record2.id) || !isSafePositiveInteger(record2.version) || !isNonEmptyString(record2.resourceRef) || record2.executionMode !== "exclusive-per-subject" || typeof record2.isMovementInputBlocked !== "boolean") invalid(schemaName);
  const completionRecord = snapshotDataRecord(record2.completion);
  if (isNil(completionRecord)) invalid(schemaName);
  let completion;
  if (completionRecord.mode === "immediate" && hasExactKeys(completionRecord, ["mode"])) {
    completion = { mode: "immediate" };
  } else if (completionRecord.mode === "explicit-cancel" && hasExactKeys(completionRecord, ["mode"])) {
    completion = { mode: "explicit-cancel" };
  } else if (completionRecord.mode === "fixed-duration" && hasExactKeys(completionRecord, ["mode", "durationTicks"]) && isSafePositiveInteger(completionRecord.durationTicks)) {
    completion = {
      mode: "fixed-duration",
      durationTicks: completionRecord.durationTicks
    };
  } else {
    return invalid(schemaName);
  }
  const effectRecord = snapshotDataRecord(record2.effect);
  if (isNil(effectRecord)) invalid(schemaName);
  let effect;
  if (effectRecord.mode === "state-only" && hasExactKeys(effectRecord, ["mode"])) {
    effect = { mode: "state-only" };
  } else if (effectRecord.mode === "trusted" && hasExactKeys(effectRecord, [
    "mode",
    "gameplayActionEffectRef",
    "gameplayActionEffectHash"
  ]) && isNonEmptyString(effectRecord.gameplayActionEffectRef) && isSha256(effectRecord.gameplayActionEffectHash)) {
    effect = {
      mode: "trusted",
      gameplayActionEffectRef: effectRecord.gameplayActionEffectRef,
      gameplayActionEffectHash: effectRecord.gameplayActionEffectHash
    };
  } else {
    return invalid(schemaName);
  }
  const requestRecord = snapshotDataRecord(record2.request);
  if (isNil(requestRecord)) invalid(schemaName);
  let request;
  if (requestRecord.mode === "none" && hasExactKeys(requestRecord, ["mode"])) {
    request = { mode: "none" };
  } else if (requestRecord.mode === "required" && hasExactKeys(requestRecord, [
    "mode",
    "actionRequestSchemaRef",
    "actionRequestSchemaHash"
  ]) && isNonEmptyString(requestRecord.actionRequestSchemaRef) && isSha256(requestRecord.actionRequestSchemaHash)) {
    request = {
      mode: "required",
      actionRequestSchemaRef: requestRecord.actionRequestSchemaRef,
      actionRequestSchemaHash: requestRecord.actionRequestSchemaHash
    };
  } else {
    return invalid(schemaName);
  }
  return deepFreeze({
    kind: "semantic-action",
    id: record2.id,
    version: record2.version,
    resourceRef: record2.resourceRef,
    executionMode: "exclusive-per-subject",
    completion,
    effect,
    isMovementInputBlocked: record2.isMovementInputBlocked,
    allowedActorEntityDefinitionRefs: canonicalStringSet(
      record2.allowedActorEntityDefinitionRefs,
      schemaName,
      mode
    ),
    requiredActorCapabilityRefs: canonicalStringSet(
      record2.requiredActorCapabilityRefs,
      schemaName,
      mode
    ),
    request
  });
}
function parseGameplayActionDefinitionV1(input) {
  const schemaName = "GameplayActionDefinitionV1";
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "contentHash",
    "executionMode",
    "completion",
    "effect",
    "isMovementInputBlocked",
    "allowedActorEntityDefinitionRefs",
    "requiredActorCapabilityRefs",
    "request"
  ]) || !isSha256(record2.contentHash)) invalid(schemaName);
  const { contentHash: contentHash2, ...bodyInput } = record2;
  let body;
  try {
    body = parseGameplayActionDefinitionBody(bodyInput, "strict");
  } catch {
    return invalid(schemaName);
  }
  const expectedHash = sha256CanonicalJson(body);
  if (contentHash2 !== expectedHash) invalid(schemaName);
  return deepFreeze({ ...body, contentHash: expectedHash });
}
function canonicalObjectCollection(input, schemaName, mode, parse, identity2) {
  const source = snapshotDataArray(input);
  if (isNil(source)) invalid(schemaName);
  let parsed;
  try {
    parsed = source.map(parse);
  } catch {
    return invalid(schemaName);
  }
  const identities = parsed.map(identity2);
  if (identities.some((value) => value.length === 0)) invalid(schemaName);
  if (new Set(identities).size !== identities.length) invalid(schemaName);
  const canonical = [...parsed].sort(
    (left, right) => compareCanonicalStrings(identity2(left), identity2(right))
  );
  if (mode === "strict" && !sameOrder(identities, canonical.map(identity2))) invalid(schemaName);
  return Object.freeze(canonical);
}
function parseGameplayBootstrapBody(input, mode) {
  const schemaName = "GameplayBootstrapBodyV1";
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "entityDescriptors",
    "featureResourceLocks",
    "semanticActionDefinitions",
    "availableCapabilityRefs"
  ]) || record2.kind !== "gameplay-bootstrap" || !isNonEmptyString(record2.id) || !isSafePositiveInteger(record2.version) || !isNonEmptyString(record2.resourceRef)) invalid(schemaName);
  const parseEntity = mode === "strict" ? parseGameplayEntityDescriptorV1 : (value) => createGameplayEntityDescriptorV1(
    value
  );
  return deepFreeze({
    kind: "gameplay-bootstrap",
    id: record2.id,
    version: record2.version,
    resourceRef: record2.resourceRef,
    entityDescriptors: canonicalObjectCollection(
      record2.entityDescriptors,
      schemaName,
      mode,
      parseEntity,
      (value) => value.id
    ),
    featureResourceLocks: canonicalObjectCollection(
      record2.featureResourceLocks,
      schemaName,
      mode,
      parseGameplayFeatureResourceLockV1,
      (value) => value.resourceRef
    ),
    semanticActionDefinitions: canonicalObjectCollection(
      record2.semanticActionDefinitions,
      schemaName,
      mode,
      parseGameplayActionDefinitionV1,
      (value) => value.resourceRef
    ),
    availableCapabilityRefs: canonicalStringSet(
      record2.availableCapabilityRefs,
      schemaName,
      mode
    )
  });
}
function createGameplayBootstrapV1(input) {
  const body = parseGameplayBootstrapBody(input, "canonicalize");
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body)
  });
}
function parseGameplayBootstrapV1(input) {
  const schemaName = "GameplayBootstrapV1";
  const record2 = snapshotDataRecord(input);
  if (isNil(record2)) invalid(schemaName);
  if (!hasExactKeys(record2, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "contentHash",
    "entityDescriptors",
    "featureResourceLocks",
    "semanticActionDefinitions",
    "availableCapabilityRefs"
  ]) || !isSha256(record2.contentHash)) invalid(schemaName);
  const { contentHash: contentHash2, ...bodyInput } = record2;
  let body;
  try {
    body = parseGameplayBootstrapBody(bodyInput, "strict");
  } catch {
    return invalid(schemaName);
  }
  const expectedHash = sha256CanonicalJson(body);
  if (contentHash2 !== expectedHash) invalid(schemaName);
  return deepFreeze({ ...body, contentHash: expectedHash });
}
function createGameplayBootstrapResourceLockEntryV1(input) {
  const bootstrap = parseGameplayBootstrapV1(input);
  return deepFreeze({
    resourceRef: bootstrap.resourceRef,
    resourceKind: "gameplay-bootstrap",
    resolvedVersion: String(bootstrap.version),
    contentHash: bootstrap.contentHash
  });
}
const CORE_CONTROL_FEATURE_REF = "worldkit://gameplay-feature/core-control@1";
const CONTROL_TRANSITION_CAPABILITY_REF = "worldkit://runtime-capability/control-transition@1";
const manifest = createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "core-control",
  version: 1,
  resourceRef: CORE_CONTROL_FEATURE_REF,
  dependencyFeatureRefs: [],
  requiredCapabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
  commandTypes: ["control.bind", "control.release"],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 2 }
});
function handlers() {
  return [
    {
      type: "control.bind",
      plan: ({ command, state, simulationTick }) => state.planControl(command, simulationTick)
    },
    {
      type: "control.release",
      plan: ({ command, state, simulationTick }) => state.planControl(command, simulationTick)
    }
  ];
}
function createCoreControlFeatureFactoryV1() {
  return Object.freeze({
    manifest,
    create: () => ({
      resourceRef: CORE_CONTROL_FEATURE_REF,
      commandHandlers: handlers(),
      createStateSlice: () => Object.freeze({ kind: "core-control-state", schemaVersion: 1 }),
      prepare: () => void 0,
      activate: () => void 0,
      deactivate: () => void 0,
      dispose: () => void 0
    })
  });
}
function createCoreGameplayBootstrapV1(input) {
  const coreControlManifest = createCoreControlFeatureFactoryV1().manifest;
  return createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${input.worldId}.gameplay`,
    version: 1,
    resourceRef: `worldkit://gameplay-bootstrap/${input.worldId}.${input.worldSeed}@1`,
    entityDescriptors: input.entityDescriptors,
    featureResourceLocks: [{
      resourceRef: coreControlManifest.resourceRef,
      contentHash: coreControlManifest.contentHash
    }],
    semanticActionDefinitions: [],
    availableCapabilityRefs: uniq([
      ...input.entityDescriptors.flatMap(
        (descriptor) => descriptor.capabilityRefs
      ),
      CONTROL_TRANSITION_CAPABILITY_REF
    ])
  });
}
const CORE_SEMANTIC_ACTION_FEATURE_REF = "worldkit://gameplay-feature/core-semantic-action@1";
const ACTION_PROJECTION_CAPABILITY_REF = "worldkit://runtime-capability/semantic-action-projection@1";
createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "core-semantic-action",
  version: 1,
  resourceRef: CORE_SEMANTIC_ACTION_FEATURE_REF,
  dependencyFeatureRefs: [CORE_CONTROL_FEATURE_REF],
  requiredCapabilityRefs: [ACTION_PROJECTION_CAPABILITY_REF],
  commandTypes: ["action.activate", "action.cancel"],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 2 }
});
const MOUNTED_RELATIONSHIP_FEATURE_REF = "worldkit://gameplay-feature/mounted-relationship@1";
const MOUNTED_RELATIONSHIP_EFFECT_REF = "worldkit://gameplay-action-effect/mounted-relationship@1";
const MOUNT_ACTION_REQUEST_SCHEMA_REF = "worldkit://schema/mount-action-request@1";
const DISMOUNT_ACTION_REQUEST_SCHEMA_REF = "worldkit://schema/dismount-action-request@1";
const MOUNT_ACTION_REQUEST_SCHEMA_BODY = {
  kind: "action-request-schema",
  schemaVersion: 1,
  requestKind: "mount-action-request",
  fields: [
    "id",
    "kind",
    "mountEntityId",
    "mountSlotId",
    "riderEntityId",
    "schemaVersion"
  ]
};
const DISMOUNT_ACTION_REQUEST_SCHEMA_BODY = {
  kind: "action-request-schema",
  schemaVersion: 1,
  requestKind: "dismount-action-request",
  fields: [
    "id",
    "kind",
    "mountedOnRelationshipId",
    "riderEntityId",
    "schemaVersion"
  ]
};
sha256CanonicalJson(
  MOUNT_ACTION_REQUEST_SCHEMA_BODY
);
sha256CanonicalJson(
  DISMOUNT_ACTION_REQUEST_SCHEMA_BODY
);
sha256CanonicalJson({
  kind: "gameplay-action-effect",
  schemaVersion: 1,
  resourceRef: MOUNTED_RELATIONSHIP_EFFECT_REF,
  supportedRequestSchemaRefs: [
    DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
    MOUNT_ACTION_REQUEST_SCHEMA_REF
  ]
});
createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "mounted-relationship",
  version: 1,
  resourceRef: MOUNTED_RELATIONSHIP_FEATURE_REF,
  dependencyFeatureRefs: [
    CORE_CONTROL_FEATURE_REF,
    CORE_SEMANTIC_ACTION_FEATURE_REF
  ],
  requiredCapabilityRefs: [],
  commandTypes: [],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 0 }
});
const BUILDER_SELF_CHECK_VERSION = "worldkit-builder-self-check-v5";
const SPAWN_GROUND_TOLERANCE_METERS = 0.15;
function option(arguments_, name) {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? void 0 : arguments_[index + 1];
  if (value === void 0 || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}
function contentHash(source) {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}
function gameplayBootstrapResourceLock(normalizedWorldIr) {
  const entityDescriptors = normalizedWorldIr.nodes.filter((node) => node.kind === "subject").map((node) => {
    const definition = normalizedWorldIr.resources.subjectDefinitions.find(
      (candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef
    );
    if (isNil(definition)) {
      throw new Error(
        `BUILDER_SELF_CHECK_GAMEPLAY_SUBJECT_DEFINITION_MISSING: ${node.subjectDefinitionRef}`
      );
    }
    return {
      id: node.id,
      entityDefinitionRef: node.subjectDefinitionRef,
      capabilityRefs: definition.capabilityRefs
    };
  });
  return createGameplayBootstrapResourceLockEntryV1(
    createCoreGameplayBootstrapV1({
      worldId: normalizedWorldIr.id,
      worldSeed: normalizedWorldIr.seed,
      entityDescriptors
    })
  );
}
function whiteboxLightingDiagnostics(authoring) {
  const preset = authoring.world?.environment?.preset;
  if (preset === "clear-day") return [];
  return [{
    code: "WHITEBOX_LIGHTING_PRESET_INVALID",
    message: "Generated whitebox worlds must use the uniform clear-day inspection-light preset regardless of reference-image lighting.",
    instancePath: "/world/environment/preset",
    details: { actualPreset: preset, requiredPreset: "clear-day" }
  }];
}
function subjectUsesGroundSupport(subject) {
  const assembly = subject.capabilityAssembly;
  if (assembly !== void 0) {
    const kernel = assembly.motionKernels.find(
      ({ resourceRef }) => resourceRef === assembly.defaultMotionProfile.motionKernelRef
    );
    return kernel?.supportedMediums.includes("ground") === true;
  }
  return subject.locomotion.allowWalk || subject.locomotion.allowRun;
}
function spawnGroundingDiagnostics(executionPlan) {
  const diagnostics = [];
  for (const subject of executionPlan.subjects) {
    if (!subjectUsesGroundSupport(subject)) continue;
    const hasVerifiedConstructedSupport = executionPlan.layout.layoutAssertions.some(
      (assertion) => assertion.kind === "supported-by" && assertion.supportedEntityId === subject.spawnAnchorEntityId && assertion.supportingEntityId !== executionPlan.terrain.entityId
    );
    if (hasVerifiedConstructedSupport) continue;
    const origin = subject.spawnSubjectOriginPositionMetersXYZ;
    const centerOffset = subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const feetPosition = [
      origin[0] + centerOffset[0],
      origin[1] + centerOffset[1] - subject.collider.heightMeters / 2,
      origin[2] + centerOffset[2]
    ];
    const terrainHeight = sampleTerrainHeight(executionPlan.terrain, [
      feetPosition[0],
      feetPosition[2]
    ]);
    if (!Number.isFinite(terrainHeight)) {
      diagnostics.push({
        code: "SPAWN_HAS_NO_GROUND",
        message: `Ground-controlled Subject '${subject.entityId}' has no finite terrain support beneath its spawn.`,
        instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
        details: { subjectEntityId: subject.entityId, feetPositionMetersXYZ: feetPosition }
      });
      continue;
    }
    const supportGapMeters = feetPosition[1] - terrainHeight;
    if (Math.abs(supportGapMeters) <= SPAWN_GROUND_TOLERANCE_METERS) continue;
    diagnostics.push({
      code: supportGapMeters < 0 ? "SPAWN_BELOW_GROUND" : "SPAWN_ABOVE_GROUND",
      message: supportGapMeters < 0 ? `Ground-controlled Subject '${subject.entityId}' starts ${Math.abs(supportGapMeters).toFixed(3)}m below terrain support.` : `Ground-controlled Subject '${subject.entityId}' starts ${supportGapMeters.toFixed(3)}m above terrain support and would fall on load.`,
      instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
      details: {
        subjectEntityId: subject.entityId,
        spawnAnchorEntityId: subject.spawnAnchorEntityId,
        feetPositionMetersXYZ: feetPosition,
        terrainHeightMeters: terrainHeight,
        supportGapMeters,
        toleranceMeters: SPAWN_GROUND_TOLERANCE_METERS,
        requiredSubjectOriginYMeters: terrainHeight - centerOffset[1] + subject.collider.heightMeters / 2
      }
    });
  }
  return diagnostics;
}
function implementationMapDiagnostics(options) {
  let draft;
  try {
    draft = JSON.parse(options.draftSource);
  } catch (error) {
    return [{ code: "IMPLEMENTATION_MAP_JSON_INVALID", message: error instanceof Error ? error.message : String(error) }];
  }
  const contractDiagnostics = validateSceneBriefImplementationMapDraftV1(draft);
  if (contractDiagnostics.length > 0) return [...contractDiagnostics];
  const implementationMap = draft;
  const diagnostics = [];
  if (implementationMap.sceneId !== options.sceneId) {
    diagnostics.push({
      code: "IMPLEMENTATION_MAP_SCENE_ID_MISMATCH",
      message: "Implementation map sceneId does not match the requested scene.",
      instancePath: "/sceneId"
    });
  }
  if (implementationMap.authoringSpecId !== options.authoringId) {
    diagnostics.push({
      code: "IMPLEMENTATION_MAP_AUTHORING_SPEC_ID_MISMATCH",
      message: "Implementation map authoringSpecId does not match AuthoringSpec.",
      instancePath: "/authoringSpecId"
    });
  }
  const expected = new Set(options.visualTargetIds);
  const seenTargets = /* @__PURE__ */ new Set();
  const seenEntities = /* @__PURE__ */ new Set();
  for (const mapping of implementationMap.visualTargetMappings) {
    if (!expected.has(mapping?.visualTargetId) || seenTargets.has(mapping.visualTargetId) || !Array.isArray(mapping?.runtimeEntityIds) || mapping.runtimeEntityIds.length === 0) {
      diagnostics.push({ code: "IMPLEMENTATION_MAP_TARGET_INVALID", message: `Invalid mapping for '${String(mapping?.visualTargetId)}'.` });
      continue;
    }
    seenTargets.add(mapping.visualTargetId);
    for (const entityId of mapping.runtimeEntityIds) {
      if (!options.runtimeEntityIds.has(entityId)) {
        diagnostics.push({ code: "IMPLEMENTATION_MAP_ENTITY_UNKNOWN", message: `Unknown runtime entity '${String(entityId)}'.` });
      }
      if (seenEntities.has(entityId)) {
        diagnostics.push({ code: "IMPLEMENTATION_MAP_ENTITY_DUPLICATE", message: `Runtime entity '${String(entityId)}' is mapped more than once.` });
      }
      seenEntities.add(entityId);
    }
  }
  for (const targetId of expected) {
    if (!seenTargets.has(targetId)) diagnostics.push({ code: "IMPLEMENTATION_MAP_TARGET_MISSING", message: `Visual target '${targetId}' is unmapped.` });
  }
  const primary = implementationMap.visualTargetMappings.find(
    (mapping) => mapping.visualTargetId === options.visualTargetIds[0]
  );
  if (!primary?.runtimeEntityIds?.includes(options.controlledEntityId)) {
    diagnostics.push({ code: "IMPLEMENTATION_MAP_PRIMARY_SUBJECT_INVALID", message: "Primary visual target must map the startup-controlled Subject." });
  }
  return diagnostics;
}
async function writeAtomic(filePath, value) {
  await writeFile(filePath, `${stringifyCanonicalJson(value)}
`, "utf8");
}
async function runBuilderSelfCheck(options) {
  const [briefSource, worldSource, mapDraftSource] = await Promise.all([
    readFile(options.briefPath, "utf8"),
    readFile(options.worldPath, "utf8"),
    readFile(options.mapDraftPath, "utf8")
  ]);
  const diagnostics = [];
  const brief = parseSceneBriefV1(briefSource);
  if (!brief.ok) {
    diagnostics.push(...brief.diagnostics.map((message) => ({
      code: message.split(":", 1)[0] || "SCENE_BRIEF_INVALID",
      message
    })));
  }
  const parsed = parseAuthoringSpecV4(worldSource);
  let compiledExecutionPlan;
  if (!parsed.ok || parsed.value === void 0) {
    diagnostics.push(...parsed.diagnostics.map((diagnostic2) => ({
      code: diagnostic2.code,
      message: diagnostic2.message,
      instancePath: diagnostic2.instancePath,
      details: diagnostic2.details
    })));
  } else {
    diagnostics.push(...whiteboxLightingDiagnostics(parsed.value));
    const normalized = normalizeAuthoringSpecV4(parsed.value);
    if (!normalized.ok || normalized.value === void 0 || normalized.normalizedWorldIrHash === void 0) {
      diagnostics.push(...normalized.diagnostics.map((diagnostic2) => ({
        code: diagnostic2.code,
        message: diagnostic2.message,
        instancePath: diagnostic2.instancePath,
        details: diagnostic2.details
      })));
    } else {
      const compiled = compileWorldV5({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
        gameplayBootstrapResourceLock: gameplayBootstrapResourceLock(normalized.value)
      });
      if (!compiled.ok) {
        diagnostics.push(...compiled.diagnostics.map((diagnostic2) => ({
          code: diagnostic2.code,
          message: diagnostic2.message,
          instancePath: diagnostic2.instancePath,
          details: diagnostic2.details
        })));
      } else if (compiled.executionPlan === void 0) {
        diagnostics.push({
          code: "COMPILER_EXECUTION_PLAN_MISSING",
          message: "Compiler reported success without an ExecutionPlan."
        });
      } else {
        compiledExecutionPlan = compiled.executionPlan;
        diagnostics.push(...spawnGroundingDiagnostics(compiled.executionPlan));
      }
    }
  }
  if (diagnostics.length === 0 && brief.ok && parsed.ok && parsed.value !== void 0 && compiledExecutionPlan !== void 0) {
    diagnostics.push(...implementationMapDiagnostics({
      sceneId: options.sceneId,
      draftSource: mapDraftSource,
      authoringId: parsed.value.id,
      visualTargetIds: brief.value.visualTargets.map(({ id: id2 }) => id2),
      controlledEntityId: compiledExecutionPlan.initialControlledEntityId,
      runtimeEntityIds: /* @__PURE__ */ new Set([
        ...compiledExecutionPlan.subjects.map(({ entityId }) => entityId),
        ...compiledExecutionPlan.objects.map(({ entityId }) => entityId)
      ])
    }));
  }
  const report = {
    kind: "worldkit-builder-self-check",
    schemaVersion: 1,
    validatorVersion: BUILDER_SELF_CHECK_VERSION,
    sceneId: options.sceneId,
    status: diagnostics.length === 0 ? "passed" : "failed",
    requiresTrustedRouteValidation: parsed.ok && parsed.value !== void 0 && parsed.value.constraints.connectivity.length > 0,
    inputs: {
      sceneBriefHash: contentHash(briefSource),
      authoringSpecHash: contentHash(worldSource),
      implementationMapDraftHash: contentHash(mapDraftSource)
    },
    diagnostics
  };
  await writeAtomic(options.reportPath, report);
  return { status: report.status, diagnostics };
}
async function main(arguments_ = process.argv.slice(2)) {
  const result2 = await runBuilderSelfCheck({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldPath: path.resolve(option(arguments_, "--world")),
    mapDraftPath: path.resolve(option(arguments_, "--map-draft")),
    reportPath: path.resolve(option(arguments_, "--report"))
  });
  process.stdout.write(`${JSON.stringify(result2)}
`);
  if (result2.status !== "passed") process.exitCode = 2;
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
  BUILDER_SELF_CHECK_VERSION,
  main,
  runBuilderSelfCheck
};
