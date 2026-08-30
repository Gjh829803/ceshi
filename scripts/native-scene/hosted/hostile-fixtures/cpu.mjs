let accumulator = 0;
for (;;) {
  accumulator = (accumulator + 1) % Number.MAX_SAFE_INTEGER;
}
