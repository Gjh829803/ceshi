try {
  const response = await fetch("https://example.com/", {
    signal: AbortSignal.timeout(2_000),
  });
  if (response.ok) process.stdout.write("UNEXPECTED_NETWORK_ACCESS\n");
} catch {
  // Expected: the runtime container has no network namespace access.
}
