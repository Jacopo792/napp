import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .claude/.github hold installed agent tooling, not app source.
  { ignores: ["**/dist", ".output", ".vinxi", ".claude/**", ".github/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  /* The core does not know which shell it is in, and this is what keeps that
     true after everybody has forgotten it was a decision. A shell-specific
     import here is not a mistake to be found in review — it is the first
     branch of a fork, and it fails the build.

     What replaces it is a member on `Platform` (packages/core/src/platform.ts)
     that both shells implement. */
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "electron",
                "electron/*",
                "**/apps/*",
                "@notes-app/web",
                "@notes-app/desktop",
              ],
              message:
                "The core may not import a shell. Add a member to Platform in @/platform and let apps/web and apps/desktop each answer it.",
            },
          ],
        },
      ],
    },
  },
  /* The main process and the preload. Node, not a browser, and CommonJS
     because Electron's main process has no type stripping and no ESM loader
     for a preload — see the comment at the top of electron/main.js. */
  {
    files: ["apps/desktop/electron/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, Response: "readonly", Headers: "readonly" },
    },
  },
  eslintPluginPrettier,
);
