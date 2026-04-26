import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TabItem = {
  value: string;
  label: ReactNode;
};

type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  children: ReactNode;
};

export function Tabs({ value, onValueChange, items, children }: TabsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      <RadixTabs.List className="flex w-full flex-wrap gap-1 rounded-md border border-gray-200 bg-white p-1">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium text-gray-700",
              "flex-1 whitespace-nowrap sm:flex-none",
              "data-[state=active]:bg-[var(--tenant-primary)] data-[state=active]:text-white"
            )}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      <div className="mt-4">{children}</div>
    </RadixTabs.Root>
  );
}

export const TabsContent = RadixTabs.Content;
