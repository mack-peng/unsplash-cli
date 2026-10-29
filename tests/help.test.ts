import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateHelpJSON } from '../src/config/helpGenerator';

test('help JSON includes commands, flags and boolean options', () => {
  const help = generateHelpJSON();

  assert.match(help.global, /Usage: unsplash <command>/);
  assert.ok(help.commands['auth set']);
  assert.ok(help.commands['auth status']);
  assert.ok(help.commands.search);
  assert.ok(help.commands.download);

  assert.deepEqual(help.commands.search.args, ['query']);
  assert.equal(help.commands.search.flags['per-page'], 'string');
  assert.equal(help.commands.search.flags.download, 'string');
  assert.equal(help.commands.search.flags.size, 'string');

  assert.equal(help.commands['auth set'].flags.stdin, 'boolean');
  assert.equal(help.commands['auth set'].flags['skip-verify'], 'boolean');
  assert.ok(help.booleanOptions.includes('stdin'));
  assert.ok(help.booleanOptions.includes('skip-verify'));
  assert.ok(!help.booleanOptions.includes('per-page'));
});

test('command help renders zod descriptions', () => {
  const help = generateHelpJSON();
  assert.match(help.commands.search.help, /unsplash search <query>/);
  assert.match(help.commands.search.help, /--per-page/);
  assert.match(help.commands.search.help, /--orientation/);
  assert.match(help.commands['auth set'].help, /unsplash auth set/);
});
