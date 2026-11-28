import cds from '@sap/cds/eslint.config.mjs'
export default [
  { ignores: ['node_modules/**', 'gen/**', 'playwright-report/**', 'test-results/**', 'coverage/**'] },
  ...cds.recommended,
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }], 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] } },
  { files: ['app/**/*.js', 'e2e/**/*.js', 'srv/lib/validation.js'], languageOptions: { globals: Object.fromEntries(['UI', 'self', 'document', 'window', 'sessionStorage', 'localStorage', 'matchMedia', 'innerWidth', 'innerHeight', 'requestAnimationFrame', 'FileReader'].map(k => [k, 'readonly'])) } },
  { files: ['test/fixtures/*.cjs'], rules: { 'no-console': 'off' } },
]
