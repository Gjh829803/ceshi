# Historical World SDK Blueprint Site

This Site renders the earlier architecture from `app/page.tsx`. It is not a
publication of the current Three SDK design. Its page, build and tests remain
unchanged pending a separate migration or removal decision.

The current sources are [Three SDK architecture](../../docs/three-sdk-architecture.md)
and the [production guide](../../docs/three-sdk-data-production.md). Historical
numbered-document names displayed in the existing page refer to the repository
before the documentation cleanup, not current authority.

## Existing build

The Site owns a separate npm lockfile and Vinext toolchain. Its existing test
builds and renders the old architecture page; a pass cannot establish Three
runtime or production readiness.

```sh
npm ci
npm test
```
