export function AccessPending({ email, onLogout }: { email?: string; onLogout: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
      <h2 className="text-lg font-semibold">Access pending</h2>
      <p className="mt-2 text-sm">Your account does not have agent permissions yet. Contact your tenant admin.</p>
      {email ? <p className="mt-3 text-xs">Signed in as {email}</p> : null}
      <button
        type="button"
        onClick={onLogout}
        className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-900"
      >
        Sign out
      </button>
    </div>
  );
}