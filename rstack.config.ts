// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  lib: [{ syntax: 'es2023', dts: true }],
});

define.test({
  // Tests exercise the built output in `dist`, and `src` reads `NODE_ENV`
  // at module scope to silence error logging.
  env: {
    NODE_ENV: 'test',
  },
  // Preserves the `--bail` behaviour of the previous Mocha command.
  bail: 1,
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
