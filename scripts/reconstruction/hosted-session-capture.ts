export interface CaptureOnlyHostedTransportV1<Payload> {
  executeFormalCapture(request: unknown): Promise<Payload>;
  /** Resolves only after session, Browser, server, and temporary resources close. */
  dispose(): Promise<void>;
}

export type StartCaptureOnlyHostedTransportV1<Payload> = (
  request: unknown,
) => Promise<CaptureOnlyHostedTransportV1<Payload>>;

export interface RunCaptureOnlyHostedSessionInputV1<Payload> {
  readonly request: unknown;
  /** A rejected start must clean every partially-created owned resource first. */
  readonly startTransport: StartCaptureOnlyHostedTransportV1<Payload>;
}

export async function runCaptureOnlyHostedSessionV1<Payload>(
  input: RunCaptureOnlyHostedSessionInputV1<Payload>,
): Promise<Payload> {
  const transport = await input.startTransport(input.request);
  let payload: Payload | undefined;
  let captureFailure: unknown;
  try {
    payload = await transport.executeFormalCapture(input.request);
  } catch (error) {
    captureFailure = error;
  }

  try {
    await transport.dispose();
  } catch (cleanupFailure) {
    if (captureFailure === undefined) throw cleanupFailure;
  }

  if (captureFailure !== undefined) throw captureFailure;
  return payload as Payload;
}
