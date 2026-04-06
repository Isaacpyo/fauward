type AlertCardProps = {
  tone: "danger" | "warning";
  title: string;
  body: string;
};

export function AlertCard({ tone, title, body }: AlertCardProps) {
  const toneClass = tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <article className={`rounded-md border p-3 text-xs ${toneClass}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{body}</p>
    </article>
  );
}

