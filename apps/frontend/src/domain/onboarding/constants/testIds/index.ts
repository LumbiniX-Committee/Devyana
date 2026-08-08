// constants/testIds/ — central registry of data-testid values used by the
// end-to-end testing agent (qabot) to locate and interact with UI elements
// during automated tests. UI without testids cannot be automatically verified.
//
// Structure: each feature lives in its own file (auth.ts, home.ts, ...) and
// is re-exported from here, so consumers can do a single import like
// `import { LOGIN, HOME } from '@/constants/testIds'` (or relative).
//
// Adding a new feature:
//   1. Create constants/testIds/<feature>.ts
//   2. Export named objects (e.g. `export const PROFILE = { ... }`)
//   3. Re-export here: `export * from './<feature>';`

export * from "./auth";
export * from "./home";
