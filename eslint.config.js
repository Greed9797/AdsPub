import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Constituição I: endpoints de escrita da Meta só podem ser importados pelo worker. */
const writeGuard = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['@adpub/meta-client/write', '**/meta-client/src/write', '**/meta-client/src/write/*'],
          message:
            'Constituição I: escrita na Graph API só pelo pipeline (apps/worker). Enfileire um job.',
        },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'specs/**',
      'infra/**',
      '**/*.d.ts',
      'tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'off',
      'eqeqeq': ['error', 'smart'],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'apps/web/**/*.ts', 'apps/web/**/*.tsx', 'packages/**/*.ts'],
    rules: { 'no-restricted-imports': writeGuard['no-restricted-imports'] },
  },
  {
    files: ['packages/meta-client/**/*.ts', 'apps/worker/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
