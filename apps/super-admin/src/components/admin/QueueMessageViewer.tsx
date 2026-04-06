import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type QueueMessageViewerProps = {
  queueName?: string;
};

export function QueueMessageViewer({ queueName }: QueueMessageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(() => {
    if (!queueName) return [];
    return Array.from({ length: 220 }).map((_, index) => ({
      id: `msg_${index + 1}`,
      queue: queueName,
      payload: {
        shipment_id: `shp_${1000 + index}`,
        event: "shipment.status_changed"
      }
    }));
  }, [queueName]);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 72,
    overscan: 8
  });

  if (!queueName) {
    return (
      <section className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs text-[var(--color-text-muted)]">
        Select a queue to inspect recent messages.
      </section>
    );
  }

  return (
    <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">Recent messages: {queueName}</h3>
      <div ref={containerRef} className="mt-2 max-h-[360px] overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-50)]">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            return (
              <pre
                key={message.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${item.start}px)`
                }}
                className="border-b border-[var(--color-border)] p-2 font-mono text-[11px]"
              >
{JSON.stringify(message, null, 2)}
              </pre>
            );
          })}
        </div>
      </div>
    </section>
  );
}
