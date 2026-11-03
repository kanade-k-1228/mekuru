import type { Compilation, StateDto } from "@mekuru/protocol";

export const compiledState = (state: StateDto, version: number, result: Compilation): StateDto => ({
  ...state,
  status: result.preview ? "ready" : "error",
  diagnostics: result.diagnostics,
  preview: result.preview ?? state.preview,
  previewVersion: result.preview ? version : state.previewVersion,
});
