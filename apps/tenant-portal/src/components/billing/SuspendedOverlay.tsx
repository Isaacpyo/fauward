import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";

type SuspendedOverlayProps = {
  active: boolean;
  reason?: string | null;
};

export function SuspendedOverlay({ active, reason }: SuspendedOverlayProps) {
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");

  if (!active) {
    return null;
  }

  async function submitAppeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      await api.post("/v1/tenants/me/suspension-appeal", {
        reason: appealReason,
        contactEmail
      });
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-lg border border-red-300 bg-white p-6">
        <h2 className="text-xl font-semibold text-red-700">Account suspended</h2>
        <p className="mt-2 text-sm text-gray-700">
          {reason ?? "Access is temporarily restricted. Contact support or submit an appeal to request review."}
        </p>
        <p className="mt-2 text-sm text-gray-700">support@fauward.com</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/settings?tab=billing">Open billing settings</Link>
          </Button>
          <Button variant="secondary" onClick={() => setAppealOpen((open) => !open)} disabled={status === "submitted"}>
            Submit an appeal
          </Button>
        </div>

        {appealOpen ? (
          <form className="mt-5 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3" onSubmit={submitAppeal}>
            <Input
              type="email"
              required
              placeholder="Contact email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
            <Textarea
              required
              minLength={50}
              placeholder="Explain why the suspension should be reviewed"
              value={appealReason}
              onChange={(event) => setAppealReason(event.target.value)}
            />
            <Button type="submit" disabled={status === "submitting" || status === "submitted"}>
              {status === "submitting" ? "Submitting..." : "Send appeal"}
            </Button>
            {status === "submitted" ? <p className="text-sm text-emerald-700">Appeal submitted. We'll respond within 24 hours.</p> : null}
            {status === "error" ? <p className="text-sm text-red-700">Unable to submit appeal right now.</p> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
