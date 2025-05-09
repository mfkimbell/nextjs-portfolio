"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface CommitPoint {
  period: string;
  commits: number;
}

export default function CommitsChart({ data }: { data: CommitPoint[] }) {
  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="period" stroke="var(--muted)" />
        <YAxis stroke="var(--muted)" />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        />
        <Line
          type="monotone"
          dataKey="commits"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
