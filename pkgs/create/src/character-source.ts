import { CHARACTERS, ENGINES, type Character } from "./character.js";

const attribute = (value: string | number): string =>
  typeof value === "string" && !/["&<>\\\r\n]/.test(value) ? JSON.stringify(value) : `{${JSON.stringify(value)}}`;

export const characterImport = (id: Character): string => {
  const { component } = CHARACTERS[id];
  return `import { ${component}, ${component}Portrait } from "./character/${id}";`;
};

export const characterSource = (id: Character): string => {
  const character = CHARACTERS[id];
  const { component, voice, stroke, x } = character;
  const engine = ENGINES[character.engine];
  const props = Object.entries(voice)
    .map(([key, value]) => `${key}=${attribute(value)}`)
    .join(" ");
  const url = "url" in engine ? ` url={process.env.${engine.url.env} || ${JSON.stringify(engine.url.default)}}` : "";
  return `import { ${engine.component} } from "${engine.pkg}";
import { Portrait, READING, Subtitle, type Line, type PortraitProps } from "../parts";

export const ${component} = ({ children, ...time }: Line) => (
  <stack {...time}>
    <${engine.component} name="${id}" ${props}${url} gap={8} reading={READING}>
      {children}
    </${engine.component}>
    <Subtitle stroke="${stroke}">{children}</Subtitle>
  </stack>
);

export const ${component}Portrait = (props: PortraitProps) => <Portrait src="assets/character/${id}.png" x="${x}" {...props} />;
`;
};
