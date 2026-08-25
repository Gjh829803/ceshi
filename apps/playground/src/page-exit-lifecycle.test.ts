import { describe, expect, it } from "vitest";

import { installPageExitDisposal } from "./page-exit-lifecycle.js";

function pageHideEvent(persisted: boolean): Event {
  const event = new Event("pagehide");
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

describe("installPageExitDisposal", () => {
  it("ignores cancellable and BFCache transitions, then disposes once on committed exit", async () => {
    const target = new EventTarget();
    const events: string[] = [];
    const installation = installPageExitDisposal({
      target,
      dispose: async () => {
        events.push("dispose");
      },
    });

    target.dispatchEvent(new Event("beforeunload"));
    target.dispatchEvent(pageHideEvent(true));
    expect(events).toEqual([]);

    target.dispatchEvent(pageHideEvent(false));
    target.dispatchEvent(pageHideEvent(false));
    await installation.dispose();
    expect(events).toEqual(["dispose"]);
  });

  it("uninstalls idempotently without disposing before a committed exit", async () => {
    const target = new EventTarget();
    const events: string[] = [];
    const installation = installPageExitDisposal({
      target,
      dispose: async () => {
        events.push("dispose");
      },
    });

    installation.uninstall();
    installation.uninstall();
    target.dispatchEvent(pageHideEvent(false));
    expect(events).toEqual([]);

    await Promise.all([installation.dispose(), installation.dispose()]);
    expect(events).toEqual(["dispose"]);
  });

  it("reports an asynchronous exit cleanup failure once without an unhandled rejection", async () => {
    const target = new EventTarget();
    const reported: unknown[] = [];
    const failure = new Error("dispose failed");
    const installation = installPageExitDisposal({
      target,
      dispose: async () => {
        throw failure;
      },
      reportDisposeError: (error) => {
        reported.push(error);
      },
    });

    target.dispatchEvent(pageHideEvent(false));
    target.dispatchEvent(pageHideEvent(false));
    await expect(installation.dispose()).rejects.toBe(failure);
    expect(reported).toEqual([failure]);
  });
});
