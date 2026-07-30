"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Mirrors lib/generation.ts's MASTERED_ELO_THRESHOLD. Not imported directly:
// that module pulls in Node-only fs/path code that can't ship to the client.
const MASTERED_ELO_THRESHOLD = 1200;

export interface MasteryDatum {
  subtopicId: string;
  name: string;
  elo: number;
}

export interface TrendDatum {
  sessionId: string;
  label: string;
  accuracyPct: number;
  medianSeconds: number | null;
}

const styleBlock = `
.pd-viz {
  color-scheme: light;
  --pd-ink: #0b0b0b;
  --pd-ink-secondary: #52514e;
  --pd-muted: #898781;
  --pd-grid: #e1e0d9;
  --pd-axis: #c3c2b7;
  --pd-surface: #ffffff;
  --pd-blue: #2a78d6;
  --pd-orange: #eb6834;
  --pd-good: #0ca30c;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .pd-viz {
    color-scheme: dark;
    --pd-ink: #ffffff;
    --pd-ink-secondary: #c3c2b7;
    --pd-muted: #898781;
    --pd-grid: #2c2c2a;
    --pd-axis: #383835;
    --pd-surface: #171717;
    --pd-blue: #3987e5;
    --pd-orange: #d95926;
    --pd-good: #0ca30c;
  }
}
:root[data-theme="dark"] .pd-viz {
  color-scheme: dark;
  --pd-ink: #ffffff;
  --pd-ink-secondary: #c3c2b7;
  --pd-muted: #898781;
  --pd-grid: #2c2c2a;
  --pd-axis: #383835;
  --pd-surface: #171717;
  --pd-blue: #3987e5;
  --pd-orange: #d95926;
  --pd-good: #0ca30c;
}
`;

function tooltipStyle() {
  return {
    background: "var(--pd-surface)",
    border: "1px solid var(--pd-grid)",
    borderRadius: 8,
    color: "var(--pd-ink)",
    fontSize: 13,
  };
}

export function MasteryBarChart({ data }: { data: MasteryDatum[] }) {
  const maxElo = Math.max(MASTERED_ELO_THRESHOLD + 100, ...data.map((d) => d.elo), 1000);

  return (
    <div className="pd-viz">
      <style>{styleBlock}</style>
      <div className="flex items-center gap-4 mb-2 text-xs text-[var(--pd-ink-secondary)]">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--pd-good)" }}
          />
          Mastered (≥{MASTERED_ELO_THRESHOLD})
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--pd-blue)" }}
          />
          Practicing
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--pd-grid)" />
          <XAxis
            type="number"
            domain={[800, maxElo]}
            tick={{ fill: "var(--pd-muted)", fontSize: 11 }}
            stroke="var(--pd-axis)"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fill: "var(--pd-ink-secondary)", fontSize: 12 }}
            stroke="var(--pd-axis)"
          />
          <ReferenceLine
            x={MASTERED_ELO_THRESHOLD}
            stroke="var(--pd-muted)"
            strokeDasharray="4 4"
          />
          <Tooltip
            contentStyle={tooltipStyle()}
            formatter={(value) => [Math.round(Number(value)), "Elo"]}
          />
          <Bar dataKey="elo" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d) => (
              <Cell
                key={d.subtopicId}
                fill={d.elo >= MASTERED_ELO_THRESHOLD ? "var(--pd-good)" : "var(--pd-blue)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccuracyTrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <div className="pd-viz">
      <style>{styleBlock}</style>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--pd-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--pd-muted)", fontSize: 11 }}
            stroke="var(--pd-axis)"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--pd-muted)", fontSize: 11 }}
            stroke="var(--pd-axis)"
            width={36}
          />
          <ReferenceLine y={85} stroke="var(--pd-muted)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={tooltipStyle()}
            formatter={(value) => [`${Math.round(Number(value))}%`, "Accuracy"]}
          />
          <Line
            type="monotone"
            dataKey="accuracyPct"
            stroke="var(--pd-blue)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--pd-blue)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpeedTrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <div className="pd-viz">
      <style>{styleBlock}</style>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--pd-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--pd-muted)", fontSize: 11 }}
            stroke="var(--pd-axis)"
          />
          <YAxis tick={{ fill: "var(--pd-muted)", fontSize: 11 }} stroke="var(--pd-axis)" width={36} />
          <Tooltip
            contentStyle={tooltipStyle()}
            formatter={(value) => [`${Math.round(Number(value))}s`, "Median time"]}
          />
          <Line
            type="monotone"
            dataKey="medianSeconds"
            stroke="var(--pd-orange)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--pd-orange)" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
