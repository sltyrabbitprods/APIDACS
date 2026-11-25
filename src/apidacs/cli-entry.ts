#!/usr/bin/env node
import { runCli } from './cli.js';

runCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('[APIDACS FATAL]', err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  });
