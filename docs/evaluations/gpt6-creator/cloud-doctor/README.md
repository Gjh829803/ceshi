# Real cloud Creator tool preflight

Passed on 2026-09-05 using the frozen runtime lock in this directory. This is a
no-model infrastructure check; the small ground-and-cylinder scene is a fixture,
not one of the five generated evaluation cases.

The same sanitized MCP bridge used by the model was started on the real Linux
x86 worker with Node 20.20.2. It exposed 11 tools, returned the actual authoring
schema, compiled a scene outside the SDK directory, loaded G Bot with Babylon
and Havok, and returned an actual 1280×720 image through MCP. The image bytes
matched the Runtime PNG, and the browser error list was empty.

The original Codex CLI 0.144.2 was incompatible with GPT-6. The separate model
probe established GPT-6 xhigh access through the pinned 0.153.3 Linux binary;
this preflight establishes the project tool/browser path. The five-case run
is the combined model-and-tool verification.

- [Tool report](mcp-doctor.json)
- [Frozen runtime lock](runtime-lock.json)
- [Actual cloud image](mcp-returned-opening.png)
