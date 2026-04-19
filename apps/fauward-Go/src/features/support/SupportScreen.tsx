import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";

export const SupportScreen = () => {
  return (
    <section className="space-y-6">
      <BackLink to="/settings" label="Back to settings" />
      <ScreenHeader
        title="Support"
        subtitle="Choose how you want to contact support for field issues, access problems, or general help."
        kicker="Help"
      />

      <div className="grid gap-3">
        <button type="button" className="action-card reveal-card-left cursor-default text-left">
          <p className="tiny-label">Call</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">Call support</h2>
          <p className="mt-2 text-sm text-stone-600">Support phone line not configured yet.</p>
        </button>

        <a
          href="mailto:support@fauward.com?subject=Fauward%20Go%20Issue%20Report"
          className="action-card reveal-card-right block"
        >
          <p className="tiny-label">Email</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">Email support</h2>
          <p className="mt-2 text-sm text-stone-600">
            Send a problem, access issue, or field feedback to support@fauward.com.
          </p>
        </a>
      </div>
    </section>
  );
};
