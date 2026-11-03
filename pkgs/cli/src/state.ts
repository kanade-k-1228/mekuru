import type { WorkerCompilation, StateDto } from "@mekuru/protocol";

export const compiledState = (state: StateDto, version: number, result: WorkerCompilation): StateDto => ({
  ...state,
  status: result.preview ? "ready" : "error",
  diagnostics: result.diagnostics,
  previewVersion: result.preview ? version : state.previewVersion,
});
