import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { cn } from './cn.js';
import { EmptyState } from './EmptyState.js';
import { SkeletonRow } from './SkeletonRow.js';

export type DenseTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: number;
};

type DenseTableProps<T> = {
  data: T[];
  columns: DenseTableColumn<T>[];
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState?: ReactNode;
  className?: string;
  height?: number;
};

function alignClass(align?: DenseTableColumn<unknown>['align']) {
  if (align === 'right') return 'text-right justify-end';
  if (align === 'center') return 'text-center justify-center';
  return 'text-left justify-start';
}

export function DenseTable<T>({ data, columns, getRowId, onRowClick, loading = false, emptyState, className, height = 560 }: DenseTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const tableColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: () => column.header,
        cell: (ctx) => column.cell(ctx.row.original),
        enableSorting: column.sortable ?? false,
        size: column.width ?? 160
      })),
    [columns]
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: true,
    columnResizeMode: 'onChange',
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 8
  });

  const minWidth = table.getTotalSize();

  return (
    <div className={cn('overflow-hidden rounded-md border border-[var(--color-border)] bg-white dark:bg-neutral-950', className)}>
      <div ref={parentRef} className="overflow-auto" style={{ maxHeight: height }}>
        <div style={{ minWidth }}>
          <div className="sticky top-0 z-10 flex border-b border-[var(--color-border)] bg-[var(--color-surface-50)] dark:bg-neutral-900">
            {table.getHeaderGroups()[0]?.headers.map((header, index) => {
              const columnDef = columns[index];
              const sorted = header.column.getIsSorted();
              return (
                <div key={header.id} className={cn('relative flex items-center gap-1 p-3 text-xs font-semibold text-[var(--color-text-muted)]', alignClass(columnDef?.align as never))} style={{ width: header.getSize() }}>
                  <button
                    type="button"
                    disabled={!header.column.getCanSort()}
                    onClick={header.column.getToggleSortingHandler()}
                    className="inline-flex min-w-0 items-center gap-1 disabled:cursor-default"
                  >
                    <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                    {header.column.getCanSort() ? (
                      sorted === 'asc' ? <ChevronUp size={13} aria-hidden /> : sorted === 'desc' ? <ChevronDown size={13} aria-hidden /> : <ChevronsUpDown size={13} aria-hidden />
                    ) : null}
                  </button>
                  {header.column.getCanResize() ? (
                    <button
                      type="button"
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--fauward-amber)]"
                      aria-label="Resize column"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {loading ? (
            <div>
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonRow key={index} columns={columns.length} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            emptyState ?? <EmptyState title="No rows found" message="Adjust filters or try again later." />
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                const rowStyle: CSSProperties = {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`
                };

                return (
                  <div
                    key={row.id}
                    style={rowStyle}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn('flex border-b border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-50)] dark:hover:bg-neutral-900', onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell, index) => {
                      const columnDef = columns[index];
                      return (
                        <div key={cell.id} className={cn('flex min-h-12 items-center p-3', alignClass(columnDef?.align as never))} style={{ width: cell.column.getSize() }}>
                          <div className="min-w-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
