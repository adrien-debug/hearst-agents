import { LLMTimeoutError } from "./errors";

export const CHAT_TIMEOUT_MS = Number(process.env.LLM_CHAT_TIMEOUT_MS ?? "30000");
export const STREAM_TIMEOUT_MS = Number(process.env.LLM_STREAM_TIMEOUT_MS ?? "60000");

export function makeAbortSignal(
  defaultMs: number,
  userSignal?: AbortSignal,
): AbortSignal {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new LLMTimeoutError("unknown", defaultMs));
  }, defaultMs);

  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(userSignal.reason);
    } else {
      const abortListener = () => {
        clearTimeout(timeoutId);
        controller.abort(userSignal.reason);
      };
      userSignal.addEventListener("abort", abortListener);
    }
  }

  const origAbort = controller.abort.bind(controller);
  controller.abort = function (reason?: any) {
    clearTimeout(timeoutId);
    return origAbort(reason);
  };

  return controller.signal;
}
