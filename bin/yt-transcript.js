#!/usr/bin/env node
/**
 * The single entry point, and the only module in this package that runs
 * anything on import. Every other module is import-safe: importing it writes no
 * file and spawns no process.
 */
import { main } from '../src/cli.js';

process.exitCode = await main(process.argv.slice(2));
