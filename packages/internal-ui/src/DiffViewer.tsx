import ReactDiffViewer from 'react-diff-viewer-continued';
import { cn } from './cn.js';

type DiffViewerProps = {
  before: unknown;
  after: unknown;
  splitView?: boolean;
  className?: string;
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function DiffViewer({ before, after, splitView = true, className }: DiffViewerProps) {
  return (
    <div className={cn('overflow-auto rounded-md border border-[var(--color-border)] bg-white text-sm dark:bg-neutral-950', className)}>
      <ReactDiffViewer oldValue={pretty(before)} newValue={pretty(after)} splitView={splitView} useDarkTheme={false} />
    </div>
  );
}
