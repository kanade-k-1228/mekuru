/** The same 500-caption/local-edit input for worker and end-to-end measurements. */
export const previewXml = (count: number, edit: number, language: string) => {
  const caption = (i: number) => {
    const changed = i === Math.floor(count / 2);
    return language === "ja"
      ? `プレビュー計測用の字幕 ${changed ? `修正 ${edit}` : `番号 ${i}`} 日本語の折り返しを確認します`
      : `Caption ${changed ? `edited ${edit}` : `number ${i}`} for preview benchmark`;
  };
  return `<mekuru size="640x360" fps="30"><seq>${Array.from({ length: count }, (_, i) => `<dur len="30"><text x="10" y="20" size="32">${caption(i)}</text></dur>`).join("")}</seq></mekuru>`;
};
