import { NavLink, Outlet } from "react-router-dom";
import { BrandLogo } from "@/components/common/BrandLogo";
import { SyncBanner } from "@/components/sync/SyncBanner";
import { useAuthStore } from "@/store/useAuthStore";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/jobs", label: "Jobs" },
  { to: "/settings", label: "Settings" },
];

export const AppShell = () => {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-3 pb-28 pt-4">
        <header className="panel sticky top-3 z-20 overflow-hidden p-4">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/80 to-transparent" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <BrandLogo compact />
              <p className="mt-2 text-sm text-stone-600">
                {user?.tenantLabel} - {user?.role}
              </p>
            </div>
          </div>
        </header>

        <SyncBanner />

        <main className="flex-1 px-1 pb-4 pt-5">
          <Outlet />
        </main>

        <nav className="fixed bottom-4 left-0 right-0 z-20">
          <div className="mx-auto max-w-md px-3">
            <div className="panel grid grid-cols-3 gap-1 p-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `rounded-2xl px-2 py-3 text-center text-[0.68rem] font-semibold uppercase tracking-[0.18em] transition ${
                      isActive ? "bg-brand text-white" : "text-stone-500 hover:bg-stone-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};
