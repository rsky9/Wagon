const { defineConfig } = require('eslint/config')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier')

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended, prettier],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['dist', 'node_modules', '.expo', '.next', 'coverage'] },
])
