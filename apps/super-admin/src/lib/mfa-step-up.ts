// Event bus between the console API client and the MfaStepUpModal mounted in ShellLayout (architecture §2.5).
// Concurrent MFA_REQUIRED responses share one modal and one verification.

export class StepUpCancelledError extends Error {
  constructor() {
    super("MFA verification was cancelled.");
    this.name = "StepUpCancelledError";
  }
}

export type StepUpRequest = { resolve: () => void; reject: (reason: unknown) => void };
type StepUpHandler = (request: StepUpRequest) => void;

let handler: StepUpHandler | null = null;
let pending: Promise<void> | null = null;

export function registerStepUpHandler(next: StepUpHandler) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function requestStepUp(): Promise<void> {
  if (pending) return pending;
  const current = handler;
  if (!current) return Promise.reject(new StepUpCancelledError());
  pending = new Promise<void>((resolve, reject) => current({ resolve, reject })).finally(() => {
    pending = null;
  });
  return pending;
}
