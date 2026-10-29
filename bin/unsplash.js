#!/usr/bin/env node
const { program } = require('../dist/index');

program().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
