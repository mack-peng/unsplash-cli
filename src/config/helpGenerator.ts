import * as z from 'zod';
import { commands } from '../cli/commands';
import type { AnyCommandSchema, Category } from '../cli/command';

type CommandArg = { name: string; description: string; optional: boolean };

function commandArgs(command: AnyCommandSchema): CommandArg[] {
  const args: CommandArg[] = [];
  const shape = command.args ? (command.args as z.ZodObject<any>).shape : {};
  for (const [name, schema] of Object.entries(shape)) {
    const zodSchema = schema as z.ZodType<any>;
    args.push({
      name,
      description: descriptionOf(zodSchema),
      optional: zodSchema.safeParse(undefined).success,
    });
  }
  return args;
}

function commandArgsText(args: CommandArg[]): string {
  return args.map((arg) => (arg.optional ? `[${arg.name}]` : `<${arg.name}>`)).join(' ');
}

function generateCommandHelp(command: AnyCommandSchema): string {
  const args = commandArgs(command);
  const lines: string[] = [
    `unsplash ${command.name} ${commandArgsText(args)}`.trim(),
    '',
    command.description,
    '',
  ];

  if (args.length) {
    lines.push('Arguments:');
    lines.push(
      ...args.map((arg) =>
        formatWithGap(`  ${arg.optional ? `[${arg.name}]` : `<${arg.name}>`}`, arg.description.toLowerCase()),
      ),
    );
  }

  if (command.options) {
    if (args.length) lines.push('');
    lines.push('Options:');
    const optionsShape = (command.options as z.ZodObject<any>).shape;
    for (const [name, schema] of Object.entries(optionsShape)) {
      const zodSchema = schema as z.ZodType<any>;
      const description = descriptionOf(zodSchema).toLowerCase();
      lines.push(formatWithGap(`  --${name}`, description));
    }
  }

  lines.push('');
  lines.push('Global options:');
  lines.push(formatWithGap('  --json', 'output as JSON'));
  lines.push(formatWithGap('  --help, -h', 'print help'));
  lines.push(formatWithGap('  --version, -v', 'print version'));

  return lines.join('\n');
}

const categories: { name: Category; title: string }[] = [
  { name: 'auth', title: 'Authentication' },
  { name: 'photos', title: 'Photos' },
];

export function generateHelp(): string {
  const lines: string[] = [];
  lines.push('Usage: unsplash <command> [args] [options]');
  lines.push('');
  lines.push('Search and download Unsplash photos.');

  const commandsByCategory = new Map<string, AnyCommandSchema[]>();
  for (const category of categories) commandsByCategory.set(category.name, []);
  for (const command of Object.values(commands)) {
    if (command.hidden) continue;
    commandsByCategory.get(command.category)!.push(command);
  }

  for (const category of categories) {
    const categoryCommands = commandsByCategory.get(category.name)!;
    if (!categoryCommands.length) continue;
    lines.push(`\n${category.title}:`);
    for (const command of categoryCommands) lines.push(generateHelpEntry(command));
  }

  lines.push('\nGlobal options:');
  lines.push(formatWithGap('  --json', 'output as JSON'));
  lines.push(formatWithGap('  --help, -h', 'print help'));
  lines.push(formatWithGap('  --version, -v', 'print version'));

  lines.push('');
  lines.push('Security:');
  lines.push('  The Access Key is stored in macOS Keychain (service "unsplash-cli").');
  lines.push('  Never pass it as an argument; use `unsplash auth set` or --stdin.');

  return lines.join('\n');
}

function generateHelpEntry(command: AnyCommandSchema): string {
  const args = commandArgs(command);
  const prefix = `  ${command.name} ${commandArgsText(args)}`.trimEnd();
  return formatWithGap(prefix, command.description.toLowerCase());
}

export function generateHelpJSON() {
  const booleanOptions = new Set<string>();

  const commandEntries: Record<string, { help: string; flags: Record<string, 'boolean' | 'string'>; args: string[] }> = {};
  for (const [name, command] of Object.entries(commands)) {
    const flags: Record<string, 'boolean' | 'string'> = {};
    if (command.options) {
      const optionsShape = (command.options as z.ZodObject<any>).shape;
      for (const [flagName, schema] of Object.entries(optionsShape)) {
        const isBoolean = isBooleanSchema(schema as z.ZodType<any>);
        flags[flagName] = isBoolean ? 'boolean' : 'string';
        if (isBoolean) booleanOptions.add(flagName);
      }
    }
    const args = command.args ? Object.keys((command.args as z.ZodObject<any>).shape) : [];
    commandEntries[name] = { help: generateCommandHelp(command), flags, args };
  }

  return {
    global: generateHelp(),
    commands: commandEntries,
    booleanOptions: [...booleanOptions],
  };
}

function descriptionOf(schema: z.ZodType<any>): string {
  let current = schema as any;
  for (let i = 0; i < 5; i += 1) {
    if (current.description) return current.description;
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
    ) {
      current = current.unwrap();
    } else {
      break;
    }
  }
  return '';
}

function isBooleanSchema(schema: z.ZodType<any>): boolean {
  return unwrapZodType(schema) instanceof z.ZodBoolean;
}

function unwrapZodType(schema: z.ZodType<any>): z.ZodType<any> {
  let current = schema as any;
  for (let i = 0; i < 5; i += 1) {
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
    ) {
      current = current.unwrap();
    } else {
      break;
    }
  }
  return current as z.ZodType<any>;
}

function formatWithGap(prefix: string, text: string, threshold = 30): string {
  const indent = Math.max(1, threshold - prefix.length);
  return prefix + ' '.repeat(indent) + text;
}
