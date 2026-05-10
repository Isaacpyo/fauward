import type { Customer360 } from "../api";
export default function PeopleTab({ data }: { data: Customer360 }) {
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">People</h2><div className="mt-3 space-y-2">{data.tenant.users.map((user) => <p key={user.id} className="flex justify-between rounded border border-[var(--color-border)] px-3 py-2 text-sm"><span>{user.name ?? user.email}</span><span>{user.role}</span></p>)}</div></section>;
}
