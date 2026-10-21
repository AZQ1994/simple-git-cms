// Lint rules. The point here is catching mistakes, not enforcing a style — formatting is left
// alone. Run with `npm run lint`.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // The editor runs in the browser. github.js is also usable from Node, where it reaches for
    // Buffer when one is available.
    files: ['src/**/*.js', 'integrations/**/*.js', 'integrations/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, Buffer: 'readonly' } },
  },
  {
    // Build scripts and tests run in Node, and printing to stdout is what the scripts are for
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'www/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    // The auth relay targets edge runtimes, and reads process/Deno only when they exist. It is
    // derived from an upstream project, so it is kept close to the original — including the
    // redundant initializers and lint directives — to keep future merges readable.
    files: ['auth/**/*.js'],
    languageOptions: { globals: { ...globals.worker, ...globals.node, Deno: 'readonly' } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'no-console': 'off', 'no-useless-assignment': 'off' },
  },
];
