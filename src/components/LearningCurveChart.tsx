"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type LearningWeekPoint = {
  label: string;
  outcomes: number;
  achieved: number;
  rulesInForce: number;
  lessonsLearned: number;
  verdictsHeld: number;
  verdictsContradicted: number;
};

/** Bars: rules LANDED has learned and keeps in force. Line: share of that week's advice that worked. */
export function LearningCurveChart({ weeks, height = 200, compact = false }: { weeks: LearningWeekPoint[]; height?: number; compact?: boolean }) {
  const data = weeks.map((w) => ({
    ...w,
    hitRate: w.outcomes > 0 ? Math.round((w.achieved / w.outcomes) * 100) : null,
  }));
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={compact ? { top: 6, right: 6, left: 6, bottom: 0 } : { top: 8, right: 4, left: -20, bottom: 0 }}>
          {compact ? null : <CartesianGrid stroke="rgba(10,11,12,0.06)" vertical={false} />}
          <XAxis dataKey="label" hide={compact} tick={{ fill: "#8a8f8b", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="rules" hide={compact} tick={{ fill: "#8a8f8b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
          <YAxis yAxisId="rate" hide={compact} orientation="right" domain={[0, 105]} tick={{ fill: "#8a8f8b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.min(100, v)}%`} ticks={[0, 50, 100]} width={40} />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid rgba(10,11,12,0.08)", borderRadius: 12, fontSize: 11, color: "#0a0b0c" }}
            labelStyle={{ color: "#5d615e", fontSize: 10, marginBottom: 4 }}
            formatter={(value, name, item) => {
              const p = item.payload as (typeof data)[number];
              if (name === "hitRate") return [value === null ? "no outcome" : `${value}% (${p.achieved}/${p.outcomes})`, "Advice that worked"];
              return [`${value} (+${p.lessonsLearned} learned)`, "Rules in force"];
            }}
          />
          <Bar yAxisId="rules" dataKey="rulesInForce" fill="rgba(47,110,163,0.28)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="hitRate"
            stroke="#2e7d4f"
            strokeWidth={2}
            connectNulls
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: { hitRate: number | null } }) => (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={props.payload?.hitRate == null ? 0 : 3.5}
                fill={props.payload?.hitRate === 100 ? "#2e7d4f" : "#c2412d"}
              />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
