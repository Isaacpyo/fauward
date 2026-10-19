import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DropdownItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type DropdownProps = {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "center" | "end";
  className?: string;
};

export function Dropdown({ trigger, items, align = "end", className }: DropdownProps) {
  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>{trigger}</RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          align={align}
          sideOffset={8}
          className={cn("z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1 shadow-sm", className)}
        >
          {items.map((item) => (
            <RadixDropdown.Item
              key={item.key}
              onSelect={item.disabled ? (event) => event.preventDefault() : item.onSelect}
              disabled={item.disabled}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none",
                item.destructive ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100",
                item.disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
              )}
            >
              {item.icon}
              {item.label}
            </RadixDropdown.Item>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}
