import * as RadixAvatar from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

type AvatarProps = {
  src?: string;
  fallback: string;
  className?: string;
};

export function Avatar({ src, fallback, className }: AvatarProps) {
  return (
    <RadixAvatar.Root className={cn("inline-flex h-10 w-10 overflow-hidden rounded-full border border-gray-200", className)}>
      {src ? <RadixAvatar.Image src={src} alt={fallback} className="h-full w-full object-cover" /> : null}
      <RadixAvatar.Fallback className="flex h-full w-full items-center justify-center bg-gray-100 text-sm font-semibold text-gray-700">
        {fallback
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
