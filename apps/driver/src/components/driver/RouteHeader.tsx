type RouteHeaderProps = {
  stopCount: number;
};

export function RouteHeader({ stopCount }: RouteHeaderProps) {
  const today = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(new Date());

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
      <h1 className="text-xl font-semibold text-gray-900">Today's Route</h1>
      <p className="mt-1 text-sm text-gray-600">{today}</p>
      <p className="mt-1 text-sm font-medium text-gray-800">{stopCount} stops</p>
    </div>
  );
}

