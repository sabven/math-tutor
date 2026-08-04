import type { LessonDiagram } from "@/lib/generation";

function SingleBar({
  numerator,
  denominator,
  label,
}: {
  numerator: number;
  denominator: number;
  label?: string;
}) {
  const width = 200;
  const height = 36;
  const segWidth = width / denominator;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
        {Array.from({ length: denominator }).map((_, i) => (
          <rect
            key={i}
            x={i * segWidth}
            y={0}
            width={segWidth}
            height={height}
            className={
              i < numerator
                ? "fill-purple-500 dark:fill-purple-400 stroke-neutral-400 dark:stroke-neutral-600"
                : "fill-white dark:fill-neutral-800 stroke-neutral-400 dark:stroke-neutral-600"
            }
            strokeWidth={1.5}
          />
        ))}
      </svg>
      {label && (
        <span className="font-fun text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          {label}
        </span>
      )}
    </div>
  );
}

function FractionBarDiagram({
  bars,
}: {
  bars: { numerator: number; denominator: number; label?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-5">
      {bars.map((bar, i) => (
        <SingleBar key={i} {...bar} />
      ))}
    </div>
  );
}

function FractionGridDiagram({
  rows,
  cols,
  rowsShaded,
  colsShaded,
  aLabel,
  bLabel,
}: {
  rows: number;
  cols: number;
  rowsShaded: number;
  colsShaded: number;
  aLabel?: string;
  bLabel?: string;
}) {
  const cellSize = 30;
  const width = cols * cellSize;
  const height = rows * cellSize;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const rowShaded = r < rowsShaded;
            const colShaded = c < colsShaded;
            const fillClass =
              rowShaded && colShaded
                ? "fill-purple-500 dark:fill-purple-400"
                : rowShaded
                  ? "fill-sky-200 dark:fill-sky-900"
                  : colShaded
                    ? "fill-amber-200 dark:fill-amber-900"
                    : "fill-white dark:fill-neutral-800";
            return (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                className={`${fillClass} stroke-neutral-400 dark:stroke-neutral-600`}
                strokeWidth={1}
              />
            );
          })
        )}
      </svg>
      {(aLabel || bLabel) && (
        <div className="flex gap-4 text-xs font-fun font-semibold text-neutral-600 dark:text-neutral-300">
          {aLabel && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-sky-200 dark:bg-sky-900" />
              {aLabel}
            </span>
          )}
          {bLabel && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-200 dark:bg-amber-900" />
              {bLabel}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-purple-500 dark:bg-purple-400" />
            product
          </span>
        </div>
      )}
    </div>
  );
}

export function ConceptDiagram({ diagram }: { diagram: LessonDiagram }) {
  if (diagram.type === "bar") return <FractionBarDiagram bars={diagram.bars} />;
  return <FractionGridDiagram {...diagram} />;
}
