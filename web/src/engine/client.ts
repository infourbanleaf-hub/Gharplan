import type { GenerateOptions, GenerateResult, PlanInput } from "./types";
import type { GenerateRequest, GenerateResponse } from "./generate.worker";

/** Runs plan generation in a Web Worker and resolves with the result. One request at a time per client. */
export function createPlanClient(makeWorker: () => Worker = defaultWorker) {
  const worker = makeWorker();
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: GenerateResult) => void; reject: (e: Error) => void }>();

  worker.onmessage = (e: MessageEvent<GenerateResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.error !== undefined) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result!);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message));
    pending.clear();
  };

  return {
    generate(input: PlanInput, options: GenerateOptions = {}): Promise<GenerateResult> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const request: GenerateRequest = { id, input, options };
        worker.postMessage(request);
      });
    },
    terminate() {
      worker.terminate();
      pending.clear();
    },
  };
}

function defaultWorker(): Worker {
  return new Worker(new URL("./generate.worker.ts", import.meta.url), { type: "module" });
}

export type PlanClient = ReturnType<typeof createPlanClient>;
