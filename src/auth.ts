import { createInterface } from 'node:readline';

export async function readSecret(label: string, forceStdin = false): Promise<string> {
  if (forceStdin || !process.stdin.isTTY) {
    if (forceStdin && process.stdin.isTTY) {
      throw new Error('--stdin requires piped input. Pipe the key or omit --stdin.');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').trim();
  }

  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as unknown as { _writeToOutput: () => void })._writeToOutput = () => {};
    rl.question('', (value) => {
      rl.close();
      process.stdout.write('\n');
      resolve(value.trim());
    });
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      reject(new Error('Cancelled.'));
    });
  });
}
