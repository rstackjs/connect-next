// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: 'es2023',
  dts: true,
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommended,
  {
    files: ['test/**/*'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
]);

define.fmt({
  singleQuote: true,
  sortPackageJson: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint', 'rs fmt'],
  '*.{json,md,mdx,css,scss,less,html,yml,yaml}': 'rs fmt',
});
