import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minimist } from '../src/cli/minimist';

test('minimist parses booleans, strings and positionals', () => {
  const args = minimist(['search', 'minimal desk', '--per-page', '12', '--json', '--portrait'], {
    boolean: ['json', 'portrait'],
  });
  assert.deepEqual(args._, ['search', 'minimal desk']);
  assert.equal(args['per-page'], '12');
  assert.equal(args.json, true);
  assert.equal(args.portrait, true);
});

test('minimist supports --key=value and --no-key', () => {
  const args = minimist(['--size=full', '--no-stdin'], { boolean: ['stdin'] });
  assert.equal(args.size, 'full');
  assert.equal(args.stdin, false);
});

test('minimist supports short flags and --', () => {
  const args = minimist(['-h', 'search', '--', '--literal'], { boolean: ['h'] });
  assert.equal(args.h, true);
  assert.deepEqual(args._, ['search', '--literal']);
});

test('minimist rejects =value for boolean flags', () => {
  assert.throws(
    () => minimist(['--json=true'], { boolean: ['json'] }),
    /boolean option '--json' should not be passed with '=value'/,
  );
});
