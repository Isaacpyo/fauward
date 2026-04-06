import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useDriverStore } from "@/stores/useDriverStore";

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useDriverStore((state) => state.user);
  const logout = useDriverStore((state) => state.logout);

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-lg font-semibold text-gray-900">Profile</h1>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <p className="text-sm text-gray-500">Name</p>
        <p className="text-base font-semibold text-gray-900">{user.name}</p>
        <p className="mt-3 text-sm text-gray-500">Email</p>
        <p className="text-base text-gray-800">{user.email}</p>
        <p className="mt-3 text-sm text-gray-500">Phone</p>
        <p className="text-base text-gray-800">{user.phone}</p>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <p className="text-sm text-gray-500">Vehicle</p>
        <p className="text-base text-gray-800">{user.vehicle}</p>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <p className="text-sm text-gray-500">App version</p>
        <p className="mono text-sm text-gray-800">v0.1.0</p>
      </section>

      <div className="fixed inset-x-0 bottom-16 border-t border-[var(--border-color)] bg-white px-4 py-3">
        <Button
          variant="danger"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Log Out
        </Button>
      </div>
    </div>
  );
}

