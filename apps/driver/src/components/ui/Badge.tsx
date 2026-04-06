type BadgeProps = {
  children: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const toneMap: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700"
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${toneMap[tone]}`}>{children}</span>;
}

