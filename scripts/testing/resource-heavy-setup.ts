import { setImmediate } from "node:timers/promises";
import { afterEach } from "vitest";

// Capture the real scheduler before a test can enable fake timers. Consecutive
// synchronous physics cases can otherwise starve the worker's IPC acknowledgements
// for longer than Vitest's RPC deadline, even when every assertion passes.
const yieldToEventLoop = setImmediate;
afterEach(() => yieldToEventLoop());
