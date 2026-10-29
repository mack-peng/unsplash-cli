#!/usr/bin/env node
const { main } = require('../dist/index');

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
