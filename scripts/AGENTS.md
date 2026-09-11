# Repository development tools

Scripts coordinate workspace boundaries, test census, asset integration and
cross-package regression. Production services live in workspace packages/apps.
Keep integration scripts on public package exports. Do not relax checks or change
production defaults to make a refactor pass; keep remote transport mocked.
