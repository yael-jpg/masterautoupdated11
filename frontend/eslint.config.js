import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // This repo has a lot of UI code with optional handlers/state that are
      // toggled on/off during development. Keep these as warnings so CI/dev
      // lint runs stay useful without blocking.
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      // Prefer explicit handling, but don't fail lint for intentional empty catches.
      'no-empty': 'warn',

      // React Hooks plugin: keep guidance visible, but don't hard-fail.
      'react-hooks/set-state-in-effect': 'warn',

      // Some files export lightweight helpers/constants alongside components.
      // Keep Fast Refresh guidance visible, but don't fail lint.
      'react-refresh/only-export-components': 'warn',

      // Common stylistic footgun; keep as a warning unless we want to enforce strictly.
      'no-prototype-builtins': 'warn',
    },
  },
])
