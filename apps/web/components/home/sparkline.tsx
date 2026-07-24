import { cn } from "@supertrainer/ui/lib/utils";

// A tiny achromatic trend line for a KPI card — single series, no axes, no
// legend, no interaction (the KPI number + delta carry the value). Hand-rolled
// SVG so the Home bundle carries no chart library; the real interactive charts
// (7.5/7.6) use Recharts/visx. Domain is fixed to [0,100] so the shape is
// comparable across cards; the line breaks over missing days.
export function Sparkline({
  data,
  className,
  width = 120,
  height = 32,
}: {
  data: (number | null)[];
  className?: string;
  width?: number;
  height?: number;
}) {
  const points = data.map((value, index) => ({
    x: data.length > 1 ? (index / (data.length - 1)) * width : width / 2,
    y: value === null ? null : height - (Math.max(0, Math.min(100, value)) / 100) * height,
  }));

  // Split into contiguous segments so a missing day is a gap, not a line to zero.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ x: point.x, y: point.y });
    }
  }
  if (current.length) segments.push(current);

  const toPath = (segment: { x: number; y: number }[]) =>
    segment.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const last = [...points].reverse().find((p) => p.y !== null);

  const hasLine = segments.some((s) => s.length > 1);
  if (!hasLine && !last) {
    return (
      <div
        className={cn("h-8 w-full text-muted-foreground/60", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-8 w-full overflow-visible text-muted-foreground", className)}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {segments.map((segment, index) =>
        segment.length > 1 ? (
          <path
            key={index}
            d={toPath(segment)}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
      {last && (
        <circle cx={last.x} cy={last.y ?? 0} r={2.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
