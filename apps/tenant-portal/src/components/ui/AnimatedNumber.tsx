import { useEffect, useMemo, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  durationMs?: number;
  formatter?: (value: number) => string;
};

export function AnimatedNumber({
  value,
  durationMs = 600,
  formatter = (nextValue) => nextValue.toLocaleString()
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplayValue(value * progress);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value, durationMs]);

  const formatted = useMemo(() => formatter(displayValue), [formatter, displayValue]);
  return <>{formatted}</>;
}

