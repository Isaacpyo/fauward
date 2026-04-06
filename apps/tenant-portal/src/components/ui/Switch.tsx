import * as RadixSwitch from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

type SwitchProps = {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
};

export function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "relative h-6 w-10 rounded-full border border-gray-300 bg-gray-100 transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-light)]",
        "data-[state=checked]:border-transparent data-[state=checked]:bg-[var(--tenant-primary)]"
      )}
    >
      <RadixSwitch.Thumb
        className={cn(
          "block h-4 w-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform",
          "data-[state=checked]:translate-x-5"
        )}
      />
    </RadixSwitch.Root>
  );
}
