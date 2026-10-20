import type { ButtonHTMLAttributes } from "react";
import { usePermission, type Permission } from "@fauward/internal-rbac";

/** An action the user cannot perform is rendered disabled with "Requires <permission>" — never hidden, never enabled (§4). */
export function PermissionButton({ permission, disabled, title, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { permission: Permission }) {
  const allowed = usePermission(permission) === true;
  return <button type="button" {...props} disabled={!allowed || disabled} title={allowed ? title : `Requires ${permission}`} />;
}
