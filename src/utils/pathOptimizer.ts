export type Point = [number, number];

const TARGET_POINTS = 40;
const CLOSED_THRESHOLD = 0.05;
const SMOOTHING_WINDOW = 2;

export function calculatePathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

function getPointAtDistance(points: Point[], targetDist: number): Point {
  let accumulated = 0;
  
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const segLength = Math.sqrt(dx * dx + dy * dy);
    
    if (accumulated + segLength >= targetDist) {
      const t = (targetDist - accumulated) / segLength;
      return [
        points[i - 1][0] + dx * t,
        points[i - 1][1] + dy * t,
      ];
    }
    accumulated += segLength;
  }
  
  return points[points.length - 1];
}

export function resamplePoints(points: Point[], count: number = TARGET_POINTS): Point[] {
  if (points.length < 2) return points;
  
  const totalLength = calculatePathLength(points);
  if (totalLength === 0) return points;
  
  const step = totalLength / (count - 1);
  const result: Point[] = [];
  
  for (let i = 0; i < count; i++) {
    const target = i * step;
    result.push(getPointAtDistance(points, target));
  }
  
  return result;
}

export function smoothPoints(points: Point[], windowSize: number = SMOOTHING_WINDOW): Point[] {
  if (points.length < 3) return points;
  
  return points.map((_, i) => {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(points.length, i + windowSize + 1);
    const window = points.slice(start, end);
    
    let sumX = 0;
    let sumY = 0;
    for (const p of window) {
      sumX += p[0];
      sumY += p[1];
    }
    
    return [sumX / window.length, sumY / window.length];
  });
}

export function detectClosedPath(points: Point[]): boolean {
  if (points.length < 3) return false;
  
  const first = points[0];
  const last = points[points.length - 1];
  const dx = first[0] - last[0];
  const dy = first[1] - last[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return distance < CLOSED_THRESHOLD;
}

export interface OptimizationResult {
  points: Point[];
  isClosed: boolean;
  originalCount: number;
  optimizedCount: number;
}

export function optimizePath(rawPoints: Point[]): OptimizationResult {
  const originalCount = rawPoints.length;
  
  if (rawPoints.length < 2) {
    return {
      points: rawPoints,
      isClosed: false,
      originalCount,
      optimizedCount: rawPoints.length,
    };
  }
  
  const resampled = resamplePoints(rawPoints, TARGET_POINTS);
  const smoothed = smoothPoints(resampled, SMOOTHING_WINDOW);
  const isClosed = detectClosedPath(smoothed);
  
  return {
    points: smoothed,
    isClosed,
    originalCount,
    optimizedCount: smoothed.length,
  };
}

export function normalizePoint(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number
): Point {
  return [
    Math.max(0, Math.min(1, x / canvasWidth)),
    Math.max(0, Math.min(1, y / canvasHeight)),
  ];
}
