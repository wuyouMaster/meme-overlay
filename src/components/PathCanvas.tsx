import { useRef, useState, useEffect, useCallback } from "react";
import { normalizePoint, optimizePath, Point } from "../utils/pathOptimizer";

type Props = {
  width?: number;
  height?: number;
  value?: Point[];
  onChange: (path: Point[]) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function PathCanvas({
  width = 400,
  height = 225,
  value,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [rawPoints, setRawPoints] = useState<Point[]>([]);
  const [optimizedPoints, setOptimizedPoints] = useState<Point[] | null>(null);
  const [isClosed, setIsClosed] = useState(false);
  const [originalCount, setOriginalCount] = useState(0);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 25;
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw raw path (faded)
    if (rawPoints.length > 1) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rawPoints[0][0] * width, rawPoints[0][1] * height);
      for (let i = 1; i < rawPoints.length; i++) {
        ctx.lineTo(rawPoints[i][0] * width, rawPoints[i][1] * height);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw optimized path
    const points = optimizedPoints || rawPoints;
    if (points.length > 1) {
      // Path line
      ctx.strokeStyle = "#0a84ff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0][0] * width, points[0][1] * height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] * width, points[i][1] * height);
      }
      ctx.stroke();

      // Start point (green)
      ctx.fillStyle = "#30d158";
      ctx.beginPath();
      ctx.arc(points[0][0] * width, points[0][1] * height, 6, 0, Math.PI * 2);
      ctx.fill();

      // End point (red or green if closed)
      const endColor = isClosed ? "#30d158" : "#ff453a";
      ctx.fillStyle = endColor;
      ctx.beginPath();
      const lastPoint = points[points.length - 1];
      ctx.arc(lastPoint[0] * width, lastPoint[1] * height, 6, 0, Math.PI * 2);
      ctx.fill();

      // Arrow indicators for direction
      for (let i = 0; i < points.length - 1; i += 5) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const midX = (p1[0] + p2[0]) / 2 * width;
        const midY = (p1[1] + p2[1]) / 2 * height;
        const angle = Math.atan2(
          (p2[1] - p1[1]) * height,
          (p2[0] - p1[0]) * width
        );

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(10, 132, 255, 0.6)";
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Labels
    ctx.fillStyle = "#636366";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Start", 8, 16);
    if (optimizedPoints) {
      ctx.fillText(
        `Points: ${optimizedPoints.length} | Original: ${originalCount}`,
        width - 150,
        height - 8
      );
    }
  }, [width, height, rawPoints, optimizedPoints, isClosed, originalCount]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    if (value && value.length > 0) {
      setRawPoints(value);
      setOptimizedPoints(value);
    }
  }, [value]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const normalized = normalizePoint(x, y, width, height);

    setIsDrawing(true);
    setRawPoints([normalized]);
    setOptimizedPoints(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const normalized = normalizePoint(x, y, width, height);

    // Sample every 3px to reduce points
    const lastPoint = rawPoints[rawPoints.length - 1];
    const dx = (normalized[0] - lastPoint[0]) * width;
    const dy = (normalized[1] - lastPoint[1]) * height;
    if (Math.sqrt(dx * dx + dy * dy) < 3) return;

    setRawPoints((prev) => [...prev, normalized]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (rawPoints.length < 2) return;

    // Optimize path
    const result = optimizePath(rawPoints);
    setOptimizedPoints(result.points);
    setIsClosed(result.isClosed);
    setOriginalCount(result.originalCount);
  };

  const handleClear = () => {
    setRawPoints([]);
    setOptimizedPoints(null);
    setIsClosed(false);
    setOriginalCount(0);
    onChange([]);
  };

  const handleSave = () => {
    if (optimizedPoints && optimizedPoints.length >= 2) {
      onChange(optimizedPoints);
      onSave();
    }
  };

  return (
    <div className="path-canvas-container">
      <div className="path-canvas-header">
        <span>Draw Motion Path</span>
        {optimizedPoints && (
          <span className="path-canvas-info">
            {optimizedPoints.length} points
            {isClosed ? " | Loop" : " | Bounce"}
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="path-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="path-canvas-actions">
        <button className="path-canvas-btn clear" onClick={handleClear}>
          Clear
        </button>
        <button
          className="path-canvas-btn save"
          onClick={handleSave}
          disabled={!optimizedPoints || optimizedPoints.length < 2}
        >
          Save Path
        </button>
        <button className="path-canvas-btn cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
