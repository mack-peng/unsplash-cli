import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommand } from '../src/cli/command';
import { commands } from '../src/cli/commands';

test('search parses query, filters and defaults', () => {
  const parsed = parseCommand(commands.search as any, {
    _: ['search', 'minimal desk'],
    'per-page': '12',
    orientation: 'portrait',
    color: 'white',
    'order-by': 'latest',
    size: 'regular',
  });

  assert.equal(parsed.query, 'minimal desk');
  assert.equal(parsed['per-page'], 12);
  assert.equal(parsed.page, 1);
  assert.equal(parsed.download, 0);
  assert.equal(parsed.orientation, 'portrait');
  assert.equal(parsed.color, 'white');
  assert.equal(parsed['order-by'], 'latest');
  assert.equal(parsed.size, 'regular');
});

test('search rejects out-of-range numbers', () => {
  assert.throws(
    () => parseCommand(commands.search as any, { _: ['search', 'x'], 'per-page': '0' }),
    /per-page.*>=1/,
  );
  assert.throws(
    () => parseCommand(commands.search as any, { _: ['search', 'x'], page: '0' }),
    /page.*>=1/,
  );
});

test('search rejects unknown options and invalid enums', () => {
  assert.throws(
    () => parseCommand(commands.search as any, { _: ['search', 'x'], foo: 'bar' }),
    /unknown '--foo' option/,
  );
  assert.throws(
    () => parseCommand(commands.search as any, { _: ['search', 'x'], orientation: 'diagonal' }),
    /orientation/,
  );
});

test('download parses ref and size', () => {
  const parsed = parseCommand(commands.download as any, {
    _: ['download', 'https://unsplash.com/photos/a-slug-abc123XYZ'],
    size: 'thumb',
  });
  assert.equal(parsed.ref, 'https://unsplash.com/photos/a-slug-abc123XYZ');
  assert.equal(parsed.size, 'thumb');
});

test('auth set rejects a positional key without echoing it', () => {
  assert.throws(
    () =>
      parseCommand(commands['auth set'] as any, {
        _: ['auth set', 'SHOULD_NOT_ECHO'],
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /too many arguments/);
      assert.doesNotMatch(error.message, /SHOULD_NOT_ECHO/);
      return true;
    },
  );
});

test('auth status takes no positional arguments', () => {
  assert.throws(
    () => parseCommand(commands['auth status'] as any, { _: ['auth status', 'extra'] }),
    /too many arguments/,
  );
});
