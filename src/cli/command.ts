import * as z from 'zod';

export type Category = 'auth' | 'photos';

export interface HelpEntry {
  help: string;
  flags: Record<string, 'boolean' | 'string'>;
  args: string[];
}

export interface HelpData {
  global: string;
  commands: Record<string, HelpEntry>;
  booleanOptions: string[];
}

export type CommandArgs<Args extends z.ZodType<any>, Options extends z.ZodType<any>> =
  z.infer<Args> & z.infer<Options>;

export type CommandSchema<Args extends z.ZodType<any>, Options extends z.ZodType<any>> = {
  name: string;
  category: Category;
  description: string;
  hidden?: boolean;
  args?: Args;
  options?: Options;
};

export type AnyCommandSchema = CommandSchema<any, any>;

export function declareCommand<Args extends z.ZodType<any>, Options extends z.ZodType<any>>(
  command: CommandSchema<Args, Options>,
): CommandSchema<Args, Options> {
  return command;
}

const kEmptyOptions = z.object({});
const kEmptyArgs = z.object({});

export function parseCommand(
  command: AnyCommandSchema,
  args: Record<string, string | boolean | string[] | undefined> & { _: string[] },
): Record<string, any> {
  const optionsObject = { ...args } as Record<string, unknown>;
  delete optionsObject['_'];
  const optionsSchema = (command.options ?? kEmptyOptions).strict();
  const options: Record<string, any> = zodParse(optionsSchema, optionsObject, 'option');

  const argsSchema = (command.args ?? kEmptyArgs).strict();
  const argNames = [...Object.keys(argsSchema.shape)];
  const argv = args['_'].slice(1);
  if (argv.length > argNames.length) {
    throw new Error(`error: too many arguments: expected ${argNames.length}, received ${argv.length}`);
  }
  const argsObject: Record<string, string> = {};
  argNames.forEach((name, index) => (argsObject[name] = argv[index]));
  const parsedArgs: Record<string, any> = zodParse(argsSchema, argsObject, 'argument');

  return { ...parsedArgs, ...options };
}

function zodParse(schema: z.ZodType<any>, data: unknown, type: 'option' | 'argument'): any {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  throw new Error(
    result.error.issues
      .map((issue) => {
        const keys: string[] = issue.code === 'unrecognized_keys' ? issue.keys : [''];
        const props = keys.map((key) => [...issue.path, key].filter(Boolean).join('.'));
        return props.map((prop) => {
          const label = type === 'option' ? `'--${prop}' option` : `'${prop}' argument`;
          switch (issue.code) {
            case 'invalid_type':
              return 'error: ' + label + ': ' + issue.message.replace(/Invalid input:/, '').trim();
            case 'unrecognized_keys':
              return 'error: unknown ' + label;
            default:
              return 'error: ' + label + ': ' + issue.message;
          }
        });
      })
      .flat()
      .join('\n'),
  );
}
