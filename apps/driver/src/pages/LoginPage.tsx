import { Fingerprint } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDriverStore } from "@/stores/useDriverStore";

export function LoginPage() {
  const navigate = useNavigate();
  const tenant = useDriverStore((state) => state.tenant);
  const login = useDriverStore((state) => state.login);
  const [email, setEmail] = useState("driver@fauward.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const biometricAvailable = useMemo(() => typeof window !== "undefined" && "PublicKeyCredential" in window, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    login(email);
    setLoading(false);
    navigate("/route");
  }

  return (
    <div className="min-h-screen bg-[var(--surface-bg)]">
      <header className="bg-[var(--tenant-primary)] px-6 py-8 text-white">
        <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-10 w-auto object-contain" />
        <h1 className="mt-4 text-2xl font-bold">Driver Sign In</h1>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto mt-6 max-w-md space-y-4 px-4">
        <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" required />
        <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" required />
        <Button type="submit" className="w-full">
          {loading ? "Signing in..." : "Sign In"}
        </Button>
        <a href="#forgot" className="block text-center text-sm text-gray-600 underline">
          Forgot password
        </a>
        {biometricAvailable ? (
          <Button type="button" variant="secondary" leftIcon={<Fingerprint size={18} />} className="w-full">
            Use biometric login
          </Button>
        ) : null}
      </form>
    </div>
  );
}
