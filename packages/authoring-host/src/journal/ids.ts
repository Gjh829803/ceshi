export function journalArtifactIdV1(prefix: string, requestId: string): string {
  const suffix = requestId.startsWith("request.")
    ? requestId.slice("request.".length)
    : requestId;
  return `${prefix}.${suffix}`;
}
