export type BillingPlan = "starter" | "pro" | "enterprise";

export type BillingSummary = {
  plan: BillingPlan;
  cycle: "monthly" | "annual";
  amount: number;
  renewalDate: string;
  trialDaysRemaining?: number;
  paymentStatus: "active" | "failed" | "suspended";
  usage: {
    shipments: { used: number; limit: number };
    staff: { used: number; limit: number };
    apiCalls: { used: number; limit: number };
  };
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  invoices: Array<{
    id: string;
    date: string;
    invoiceNumber: string;
    amount: number;
    status: "PAID" | "SENT" | "OVERDUE" | "VOID";
    pdfUrl: string;
  }>;
};
