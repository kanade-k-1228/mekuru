import type { WorkerCompilation, StateDto } from "@mekuru/protocol";

export const compiledState = (state: StateDto, result: WorkerCompilation): StateDto => ({
  ...state,
  status: result.previewVersion !== null ? "ready" : "error",
  diagnostics: result.diagnostics,
  previewVersion: result.previewVersion ?? state.previewVersion,
});
