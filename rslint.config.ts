import { defineConfig, js, ts } from '@rslint/core';

export default defineConfig([
  js.configs.recommended,
  ts.configs.recommended,
  {
    files: ['test/**/*'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
      'no-undef': 'off',
    },
  },
]);
