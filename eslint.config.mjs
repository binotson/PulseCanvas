import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'scripts/**/*.cjs', '*.config.*'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['scripts/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  }
)
