/// <reference lib="webworker" />
import { generatePlans } from "./generate";
import type { GenerateOptions, GenerateResult, PlanInput } from "./types";

export interface GenerateRequest {
  id: number;
  input: PlanInput;
  options: GenerateOptions;
}

export interface GenerateResponse {
  id: number;
  result?: GenerateResult;
  error?: string;
}

// Runs the search off the main thread so the page stays responsive during a long search.
self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { id, input, options } = e.data;
  try {
    const result = generatePlans(input, options);
    const response: GenerateResponse = { id, result };
    self.postMessage(response);
  } catch (err) {
    const response: GenerateResponse = { id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};
