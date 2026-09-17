#!/usr/bin/env node
/**
 * The single entry point. Guarded, like every module in this package: the
 * standalone cleaner this tool replaces ran its CLI block at module scope, so
 * merely importing it wrote a file.
 *
 * `import.meta.main` is the guard, not a comparison of `import.meta.url`
 * against `process.argv[1]`. The documented invocation is `npx .`, which runs
 * this file through a path in npm's transient `_npx` cache: the two paths are
 * genuinely different, so a path comparison reports "imported" for the very
 * invocation the tool exists to serve. Measured, not assumed.
 *
 * `import.meta.main` arrived in Node 24.2, above this package's Node 22 floor,
 * so on an older runtime it is `undefined` and the command runs unguarded —
 * which is the correct behaviour for an entry point, just unprotected against
 * being imported.
 */
import { main } from '../src/cli.js';

if (import.meta.main !== false) {
  process.exitCode = await main(process.argv.slice(2));
}
