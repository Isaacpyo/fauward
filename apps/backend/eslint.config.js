import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const SHARED_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  fetch: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  AbortSignal: 'readonly',
  URLSearchParams: 'readonly',
  RequestInit: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  NodeJS: 'readonly'
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  // Type-aware linting for application source. These rules need full type
  // information (parserOptions.project), so they only run over files that are
  // part of tsconfig's "include": ["src"]. This is where the iron-clad promise
  // rules live — a floating/unhandled promise here is what crashed the server.
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json'],
        tsconfigRootDir
      },
      globals: SHARED_GLOBALS
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // IRON-CLAD GUARD against the bug that crashed the server: a fire-and-forget
      // `void somePromise()` whose rejection is never handled becomes an
      // unhandledRejection and can take the whole process down. This bans `void`
      // on any call EXCEPT one ending in `.catch(...)`. To intentionally fire and
      // forget, use `fireAndForget(promise, log, msg)` or `.catch(...)` directly.
      //
      // Why no-restricted-syntax instead of @typescript-eslint/no-floating-promises:
      // Fastify replies are thenables, so that rule flags every un-returned
      // `reply.send()` (~500 false positives in this codebase) and v7 has no
      // `checkThenables`/`allowForKnownSafePromises` to exclude them. Revisit a
      // blanket no-floating-promises rule after upgrading typescript-eslint to v8.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ExpressionStatement > UnaryExpression[operator="void"] > CallExpression[callee.type="MemberExpression"][callee.property.name!="catch"]',
          message:
            'Unhandled fire-and-forget promise. A floating rejection can crash the process — use fireAndForget(promise, log, msg) or append .catch(...).'
        },
        {
          selector:
            'ExpressionStatement > UnaryExpression[operator="void"] > CallExpression[callee.type="Identifier"]',
          message:
            'Unhandled fire-and-forget promise. A floating rejection can crash the process — use fireAndForget(promise, log, msg) or append .catch(...).'
        }
      ],
      // An async function passed where a void-returning callback is expected
      // (event handlers, array callbacks) leaks an unhandled rejection too.
      '@typescript-eslint/no-misused-promises': 'warn'
    }
  },
  // Everything else (config files, build scripts outside src/, plain JS). No
  // type information available, so the type-aware rules are not applied here.
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    ignores: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: SHARED_GLOBALS
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
];
