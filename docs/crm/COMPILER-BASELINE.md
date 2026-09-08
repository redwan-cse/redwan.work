# Compiler baseline

The repository previously retained an ES5 TypeScript target from its early site scaffold. Current Next.js 16 supports Chrome/Edge/Firefox 111+ and Safari 16.4+, not ES5-era browsers. The target is now ES2017, matching Next's generated TypeScript configuration. Strictness, noEmit, module resolution and all quality gates remain enabled. No type errors are ignored.

Evidence: https://nextjs.org/docs/app/guides/upgrading/version-16 and https://nextjs.org/docs/architecture/supported-browsers ; generated-default example: https://github.com/vercel/next.js/pull/75805 . The concrete branch failure was TS2802 on Map iteration under target ES5. This changes the compiler's language baseline, not application authorization or production configuration.

The native Node test runner preserves value imports while stripping TypeScript annotations. Its isolated Next adapter must therefore export NextRequest as well as NextResponse, even where the application uses NextRequest only as a type. This test-harness failure was reproduced locally with stripTypeScriptTypes before correction.
