import parser from '@typescript-eslint/parser';
export default [{ ignores: ['dist/**','node_modules/**','storage/**'] }, {
  files: ['src/**/*.ts'],
  languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
  rules: { 'constructor-super':'error','no-async-promise-executor':'error','no-cond-assign':'error','no-constant-condition':'error','no-dupe-args':'error','no-dupe-keys':'error','no-duplicate-case':'error','no-ex-assign':'error','no-loss-of-precision':'error','no-sparse-arrays':'error','no-unreachable':'error','no-unsafe-finally':'error','use-isnan':'error','valid-typeof':'error' }
}];
