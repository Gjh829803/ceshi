const retained = [];
for (;;) {
  retained.push(new Uint8Array(16 * 1024 * 1024));
  retained.at(-1).fill(1);
}
