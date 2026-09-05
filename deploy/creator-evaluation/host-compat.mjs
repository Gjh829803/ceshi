/* Host-only HTTP compatibility. This is a synchronous classic browser script. */
(() => {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return;
  if (typeof crypto?.getRandomValues !== "function") {
    throw new Error("WORLDKIT_HOST_CSPRNG_UNAVAILABLE");
  }
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    writable: true,
    value: function randomUUID() {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
})();
