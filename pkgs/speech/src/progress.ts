interface SpeechProgress {
  done: number;
  total: number;
  label: string;
}

export const showSpeech = (p: SpeechProgress): void => {
  const text = `speech ${p.done}/${p.total}  ${p.label.replace(/\s+/g, " ").slice(0, 40)}`;
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K${text}${p.done === p.total ? "\n" : ""}`);
  else console.log(text);
};
