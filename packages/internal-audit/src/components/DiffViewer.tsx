import ReactDiffViewer from 'react-diff-viewer-continued';

type DiffViewerProps = {
  before: unknown;
  after: unknown;
  splitView?: boolean;
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function DiffViewer({ before, after, splitView = true }: DiffViewerProps) {
  return (
    <div className="overflow-auto rounded-md border border-[var(--color-border)] bg-white text-sm dark:bg-neutral-950">
      <ReactDiffViewer oldValue={pretty(before)} newValue={pretty(after)} splitView={splitView} useDarkTheme={false} />
    </div>
  );
}
