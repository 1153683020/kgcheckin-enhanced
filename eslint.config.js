/**
 * ESLint flat config
 * 目的：静态检查能在 push 前抓到 no-undef（未定义变量，如作用域拼错）、
 * no-unused-vars（残留变量）等 node --check 查不出来的错误。
 * 检查范围：根目录的 ESM 脚本与 tests/；api/（上游 CJS 代码）与 tools/ 不在检查范围。
 */
export default [
  {
    ignores: ['api/**', 'tools/**', 'node_modules/**', 'qr/**', 'qr_decrypted/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Node 全局（本项目用到的）
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        Buffer: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Intl: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Date: 'readonly',
        Promise: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        Error: 'readonly',
        TypeError: 'readonly',
        RangeError: 'readonly',
        RegExp: 'readonly',
        Symbol: 'readonly',
      },
    },
    rules: {
      // 核心护栏：未定义变量（作用域拼错/typo）直接报错
      'no-undef': 'error',
      // 残留变量警告（不算失败，但提示清理）
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // 不可达代码
      'no-unreachable': 'error',
      // 重复声明
      'no-redeclare': 'error',
    },
  },
]
