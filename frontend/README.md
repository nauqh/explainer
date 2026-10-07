# frontend

Next.js renderer for generated lessons.

- `pnpm gen` regenerates `src/lib/lesson.ts` from `../backend/schema/lesson.schema.json` and copies the dev fixture from `../backend/tests/fixtures/synthetic.json`. `pnpm build` runs it first.
- `pnpm dev`, then open `/` (question page) and `/lesson/fixture` (sample lesson).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Widgets live in `src/widgets/`. `describe.ts` holds each widget's `describe(props, state)`: pure, React-free, also used as the widget's text alternative.
