declare module "@paystack/inline-js" {
  export type PaystackResumeCallbacks = {
    onSuccess?: (response: { reference: string; id?: number; message?: string }) => void;
    onCancel?: () => void;
    onError?: (error: { message?: string }) => void;
    onLoad?: (response: { id?: number; accessCode?: string; customer?: unknown }) => void;
  };

  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: PaystackResumeCallbacks): unknown;
  }
}
