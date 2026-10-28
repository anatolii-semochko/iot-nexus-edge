import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import prettierOptions from './.prettierrc.js'

// The core UI (src/) and - through `packagesConfig`, used by
// devices/eslint.config.mjs (ESLint lints nothing outside its config's folder)
// - the CORE Library packages' UI (devices/*/<kind>/ui/, built into this app
// through the package registry; AGENTS_TO_DO.md 2026-10-22). The rules: the
// React hooks' and an undefined JSX component (a missing import - the build
// doesn't catch it); the style - this app's Prettier options.
const react = {
  ...eslintPluginReact.configs.flat.recommended,
  ...eslintPluginReact.configs.flat['jsx-runtime'],
  plugins: {
    eslintPluginReact,
    react: eslintPluginReact,
    'react-hooks': eslintPluginReactHooks,
  },
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.node,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    ...eslintPluginReactHooks.configs.recommended.rules,
    'react/jsx-no-undef': 'error',
  },
}

const PACKAGE_UI = ['**/ui/**/*.{js,jsx}']
export const packagesConfig = [
  { ...react, files: PACKAGE_UI },
  {
    ...eslintPluginPrettierRecommended,
    files: PACKAGE_UI,
    rules: {
      ...eslintPluginPrettierRecommended.rules,
      'prettier/prettier': ['error', prettierOptions],
    },
  },
]

export default [
  { ignores: ['eslint.config.mjs'] },
  { ...react, files: ['src/**/*.{js,jsx}'] },
  eslintPluginPrettierRecommended,
]
