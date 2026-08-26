## What this changes

<!-- What problem does this solve? Link the issue if there is one. -->

## Checklist

- [ ] `pnpm exec tsc --noEmit`, `pnpm test`, and `pnpm lint` all pass
- [ ] I ran the app and used the screen I changed — type checking alone does not catch server/client boundary mistakes
- [ ] New behavior has a test, if it's a rule that could regress
- [ ] New user-facing strings are in `src/lib/i18n/dictionary.ts` in **both** locales
