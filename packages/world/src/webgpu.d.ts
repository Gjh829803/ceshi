// Three's type surface references this WebGPU host type even when the WebGL
// renderer is used. Keeping the fallback opaque avoids coupling this package
// to browser-specific WebGPU declarations.
interface GPUTexture {}
