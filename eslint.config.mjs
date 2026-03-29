import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      'data/**',
      '**/*.d.ts',
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules (type-aware rules intentionally excluded for speed)
  ...tseslint.configs.recommended,

  // Prettier — disables ESLint rules that conflict with Prettier
  prettier,

  // Global rule overrides — keep it practical, not pedantic
  {
    rules: {
      // Allow unused vars prefixed with _ (common pattern for intentionally unused params)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Allow explicit `any` — too noisy to enforce on a first pass
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow require imports (used in some config files)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // React hooks rules — only for the web package
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
