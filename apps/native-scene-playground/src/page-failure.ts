export function presentPageFailureV1(
  pageDocument: Document,
  error: unknown,
): void {
  const panel = pageDocument.querySelector<HTMLElement>("[data-error]");
  if (panel === null) {
    throw new Error("Missing page element '[data-error]'.");
  }
  panel.hidden = false;
  panel.textContent = error instanceof Error
    ? `${error.name}\n${error.message}`
    : String(error);

  const stateElement = pageDocument.querySelector<HTMLElement>("[data-state]");
  if (stateElement !== null) stateElement.textContent = "FAILED";
}
