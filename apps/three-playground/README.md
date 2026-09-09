# React Playground

The maintainer editor uses React and shadcn/ui form components. It reuses the
Three SDK and the scene/configuration modules in `examples/three-creator/sdk-capabilities`.
The shared directory contains scene modules and configuration only; the former
DOM editor has been removed. Creator uses the standalone training-independent example.

```sh
pnpm dev                       # http://127.0.0.1:5178 (repository root)
pnpm dev:editor                # same React editor
pnpm build:editor              # .codex-tmp/react-playground-dist
pnpm test:editor:browser        # real browser flow against running editor
pnpm --filter @worldkit/three-playground typecheck
```

Stop an existing preview on port 5178 first. The development server supports HMR;
changes to the scene entry reload the world. A production build includes the
verified asset catalog closure and can be served as static files. No CDN runtime
imports or external model fetches are needed.

- `src/main.ts` binds the scene and SDK actions to the editor. One SDK owns simulation,
  character animation and the active camera. This entry is editor-specific; shared
  environment/vehicle/profile data stays in the example modules.
- `src/shell.tsx` renders the layout, HUD, quick slots, shortcuts and common overlays.
  HUD uses a React portal into the SDK Presentation UI container. React never moves
  or replaces the active canvas. HUD notifications coalesce at 100 ms.
- `src/inspector.tsx` renders live form controls. Interaction applies immediately;
  routine telemetry updates coalesce at 100 ms. Draft numeric edits survive updates.
- `src/library.tsx`, `workbench.tsx`, `humanoid-panel.tsx`, `equipment-panel.tsx`
  own panel state and preserve the existing action and persistence contracts.
- `src/equipment-preview.ts` renders a static cloned model on demand; it never ticks
  or writes the live character.
- `src/components/ui` contains local shadcn/ui new-york-v4 components (MIT), adapted
  for relative imports, existing styling, and accessible slider labels. Source:
  https://ui.shadcn.com/r/styles/new-york-v4/ . `styles.css` uses Tailwind utilities
  without global preflight. Active layout styles live in `src/styles`; obsolete native
  slider, switch, select and previous layout rules have been removed.
- All editor icons use official `lucide-react` components.
  `node apps/three-playground/scripts/sync-lucide-icons.mjs` refreshes the semantic
  mapping from the locked package. No icon font or hand-authored icon paths are used.

Form focus releases driving input. Modal panels pause through the SDK callback;
closing restores focus and the previous paused state. Configurations still need
explicit export to `profiles.json` for delivery; local storage is a debug override.

All editor popups use shadcn/Radix Dialog, Popover and Tooltip; transient
notifications use the shadcn Sonner Toaster. No native dialogs or HTML title
tooltips remain in the editor. Modal state calls the existing pause callback;
Radix owns focus trapping, outside dismissal and Escape. Equipment preview
resources are created on modal mount and released on close.
