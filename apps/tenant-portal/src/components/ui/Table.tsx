import type { ReactNode, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TableProps = {
  columns: string[];
  children: ReactNode;
  className?: string;
};

export function Table({ columns, children, className }: TableProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-gray-200 bg-white", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

type TableRowProps = {
  onClick?: () => void;
  selected?: boolean;
  children: ReactNode;
};

export function TableRow({ onClick, selected, children }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-gray-200 text-sm text-gray-700 transition hover:bg-gray-50",
        onClick ? "cursor-pointer" : "",
        selected ? "bg-blue-50/40" : ""
      )}
    >
      {children}
    </tr>
  );
}

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
};

export function TableCell({ className, children, ...props }: TableCellProps) {
  return (
    <td className={cn("px-4 py-3 align-middle", className)} {...props}>
      {children}
    </td>
  );
}
