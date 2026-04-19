import { useEffect, useRef } from "react";

type SignaturePadProps = {
  value?: string;
  onChange: (nextValue?: string) => void;
};

export const SignaturePad = ({ value, onChange }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.scale(dpr, dpr);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#0b6b54";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    if (value) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, width, height);
      };
      image.src = value;
    }
  }, [value]);

  const getContext = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    return { canvas, context };
  };

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const bounds = canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvasContext = getContext();

    if (!canvasContext) {
      return;
    }

    const { context } = canvasContext;
    const point = getPoint(event);

    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const canvasContext = getContext();

    if (!canvasContext) {
      return;
    }

    const { context } = canvasContext;
    const point = getPoint(event);

    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finishSignature = () => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    onChange(canvas.toDataURL("image/png"));
  };

  const clearCanvas = () => {
    const canvasContext = getContext();

    if (!canvasContext) {
      return;
    }

    const { canvas, context } = canvasContext;
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    onChange(undefined);
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="h-40 w-full rounded-2xl border border-stone-300 bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSignature}
        onPointerLeave={finishSignature}
      />
      <button type="button" className="secondary-btn w-full" onClick={clearCanvas}>
        Clear signature
      </button>
    </div>
  );
};
