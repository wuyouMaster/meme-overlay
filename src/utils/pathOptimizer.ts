export type Point = [number, number];

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Resampled points per unit of normalized arc-length (0-1 space diagonal ≈ 1.41). */
const SAMPLE_DENSITY = 60;
/** Minimum and maximum resampled point count, regardless of path length. */
const MIN_POINTS = 24;
const MAX_POINTS = 100;

/** Gaussian σ in resampled-point units. Kernel radius = ceil(σ × 2.5). */
const SMOOTH_SIGMA = 1.5;

/**
 * Closed-path detection:
 *   gap < max(CLOSED_ABSOLUTE, pathLength × CLOSED_RELATIVE)
 *
 * Using both thresholds keeps short paths from triggering false positives
 * while still allowing long loops to be detected even if the user lifts the
 * pen a little early.
 */
const CLOSED_ABSOLUTE = 0.04;
const CLOSED_RELATIVE = 0.05;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function calculatePathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

function euclidean(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Resampling  —  arc-length parameterised with adaptive point count
// ---------------------------------------------------------------------------

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

/**
 * Resample `points` to evenly-spaced positions along the arc.
 * When `count` is omitted, an adaptive count proportional to path length is used,
 * clamped to [MIN_POINTS, MAX_POINTS].
 */
export function resamplePoints(points: Point[], count?: number): Point[] {
  if (points.length < 2) return points;

  const totalLength = calculatePathLength(points);
  if (totalLength === 0) return points;

  const n =
    count ??
    Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.round(totalLength * SAMPLE_DENSITY)));

  const step = totalLength / (n - 1);
  const result: Point[] = [];

  for (let i = 0; i < n; i++) {
    result.push(getPointAtDistance(points, i * step));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Smoothing  —  Gaussian kernel with proper boundary handling
// ---------------------------------------------------------------------------

/** Build a normalised 1-D Gaussian kernel with the given σ. */
function buildGaussianKernel(sigma: number): number[] {
  const radius = Math.ceil(sigma * 2.5);
  const weights: number[] = [];
  let sum = 0;

  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(w);
    sum += w;
  }

  return weights.map((w) => w / sum);
}

/**
 * Smooth `points` using a Gaussian kernel.
 *
 * - **Open paths** (`isClosed = false`): boundary indices are clamped
 *   (replicate padding), preserving the overall position of endpoints
 *   while still blending their immediate neighbourhood.
 * - **Closed paths** (`isClosed = true`): indices wrap around so the
 *   join is smoothed continuously with no seam.
 */
export function smoothPoints(
  points: Point[],
  isClosed = false,
  sigma: number = SMOOTH_SIGMA,
): Point[] {
  if (points.length < 3) return points;

  const kernel = buildGaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const n = points.length;

  return points.map((_, i) => {
    let sumX = 0;
    let sumY = 0;

    for (let ki = 0; ki < kernel.length; ki++) {
      const offset = ki - radius;
      let idx = i + offset;

      if (isClosed) {
        // Wrap around seamlessly
        idx = ((idx % n) + n) % n;
      } else {
        // Clamp to edge (replicate padding)
        idx = Math.max(0, Math.min(n - 1, idx));
      }

      sumX += points[idx][0] * kernel[ki];
      sumY += points[idx][1] * kernel[ki];
    }

    return [sumX, sumY] as Point;
  });
}

// ---------------------------------------------------------------------------
// Closed-path detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the gap between the first and last point is small
 * enough to be considered a closed loop.
 *
 * The threshold is adaptive: `max(CLOSED_ABSOLUTE, totalLength × CLOSED_RELATIVE)`,
 * which handles both short squiggles (absolute floor prevents false positives)
 * and long paths (relative ceiling allows a bit of slop at the pen-up point).
 *
 * Requires at least 4 points to avoid degenerate cases.
 */
export function detectClosedPath(points: Point[], totalLength?: number): boolean {
  if (points.length < 4) return false;

  const gap = euclidean(points[0], points[points.length - 1]);
  const length = totalLength ?? calculatePathLength(points);
  const threshold = Math.max(CLOSED_ABSOLUTE, length * CLOSED_RELATIVE);

  return gap < threshold;
}

// ---------------------------------------------------------------------------
// High-level optimisation pipeline
// ---------------------------------------------------------------------------

export interface OptimizationResult {
  points: Point[];
  isClosed: boolean;
  originalCount: number;
  optimizedCount: number;
}

/**
 * Full pipeline applied to raw drawn points:
 *   1. Adaptive arc-length resample
 *   2. Detect closed/open on resampled points (before smoothing)
 *   3. Gaussian smooth with wrap-around for closed paths
 */
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

  // Step 1: even arc-length distribution, adaptive count
  const resampled = resamplePoints(rawPoints);

  // Step 2: detect closed/open before smoothing so user intent is respected
  const pathLength = calculatePathLength(resampled);
  const isClosed = detectClosedPath(resampled, pathLength);

  // Step 3: Gaussian smooth; closed paths wrap at boundaries for a seamless join
  const smoothed = smoothPoints(resampled, isClosed);

  return {
    points: smoothed,
    isClosed,
    originalCount,
    optimizedCount: smoothed.length,
  };
}

// ---------------------------------------------------------------------------
// Coordinate utilities
// ---------------------------------------------------------------------------

export function normalizePoint(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
): Point {
  return [
    Math.max(0, Math.min(1, x / canvasWidth)),
    Math.max(0, Math.min(1, y / canvasHeight)),
  ];
}
