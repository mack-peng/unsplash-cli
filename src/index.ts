export { program } from './cli/program';
import { program } from './cli/program';

if (require.main === module) {
  program().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
