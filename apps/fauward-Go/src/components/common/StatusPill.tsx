type StatusPillTone = "neutral" | "info" | "success" | "warning" | "danger";

type StatusPillProps = {
  label: string;
  tone?: StatusPillTone;
};

const toneClassName: Record<StatusPillTone, string> = {
  neutral: "border-stone-300 bg-stone-100 text-stone-700",
  info: "border-cyan-200 bg-cyan-50 text-cyan-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export const StatusPill = ({ label, tone = "neutral" }: StatusPillProps) => (
  <span
    className={`inline-flex rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${toneClassName[tone]}`}
  >
    {label}
  </span>
);
