type Reviver = Parameters<typeof JSON.parse>[1];

type ParseOptions = {
  safe?: boolean;
  protoAction?: "error" | "remove" | "ignore";
  constructorAction?: "error" | "remove" | "ignore";
};

export default function parse(text: string, reviver?: Reviver, _options?: ParseOptions) {
  return JSON.parse(text, reviver);
}

export { parse };
export const safeParse = parse;
export const scan = (_text: string) => undefined;
