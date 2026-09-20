import js from '@eslint/js';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const browserFiles = ['apps/creator-evaluation-site/**/*.{js,mjs}', 'packages/episode-pipeline/src/review/web/human-review-ui.js', 'packages/episode-pipeline/src/reporting/presentation-runtime.js', 'asset-library/viewer/**/*.mjs', 'asset-library/client/asset-library.mjs', 'packages/asset-client/src/registry-client.mjs'];

export default defineConfig([
  {
    ignores: [
      '**/.next/**', '**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.three-creator/**',
      '**/.worktrees/**', '**/.codex-tmp/**', '**/.playwright-cli/**',
      '.superpowers/**',
      '**/agent-home/**', '**/agent-tmp/**', '**/.agent-home/**', '**/.agent-tmp/**',
      // Unmodified vendored distributions retain upstream bytes and licenses.
      'asset-library/tools/vendor/**', 'asset-library/viewer/vendor/**',
      'asset-library/client/registry-client.mjs', 'asset-library/client/materialize.mjs', 'asset-library/client/cli.mjs',
      'outputs/**', 'output/**', 'artifacts/episodes/**', 'artifacts/scenes/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'],
    extends: [js.configs.recommended],
    rules: {
      // Begin with correctness checks; unused arguments/imports are a separate cleanup.
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      // Error aggregation and domain-error translation have separate contracts.
      'preserve-caught-error': 'off',
      // Validators match control characters and YAML indentation intentionally.
      'no-control-regex': 'off',
      'no-regex-spaces': 'off',
      // Cleanup and optional diagnostics deliberately tolerate failed best-effort work.
      'no-empty': ['error', {allowEmptyCatch: true}],
    },
  },
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', 'deploy/**/*.{js,mjs,cjs}', 'apps/*/scripts/**/*.{js,mjs,cjs}', 'apps/creator-cloud/**/*.{js,mjs,cjs}', 'packages/{creator-host,episode-pipeline,browser-capture,cloud-generation-client,asset-contracts,asset-client,preset-content}/**/*.{js,mjs,cjs}', 'asset-library/tools/**/*.mjs', 'asset-library/tests/**/*.mjs', 'asset-library/client/**/*.mjs'],
    ignores: browserFiles,
    languageOptions: {globals: globals.node},
  },
  {
    files: browserFiles,
    languageOptions: {globals: globals.browser},
  },
  {
    // Playwright evaluate callbacks run in the browser; the harness runs in Node.
    files: ['asset-library/tests/*check.mjs'],
    languageOptions: {globals: {...globals.node, ...globals.browser}},
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.base, tseslint.configs.eslintRecommended],
    rules: {
      // Keep the compatibility preset from imposing style preferences.
      'prefer-const': 'off',
      'no-var': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
    },
  },
]);
