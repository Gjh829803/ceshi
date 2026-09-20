# Worldkit Atlas maintenance

This is the independently deployable asset platform. The user selected Next.js
full-stack with React, shadcn/ui and Lucide; use Next's own build pipeline, not Vite.
React owns application state and controls. Keep imperative Three rendering inside
the preview lifecycle, including async cancellation and resource disposal.

Use the public asset-client and asset-library exports. Preserve published Registry
routes, identities, range/ETag behavior and request limits. Load deployment data via
ASSET_PUBLICATION_ROOT on the server; never expose authoring directories or credentials.

Verify the production build, relocated standalone package and affected browser flows.
Keep tests independent of OSS and other real cloud services.
