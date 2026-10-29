"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMinor } from "@/lib/money";

export function CashflowChart({
  data,
  currency,
}: {
  data: { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }[];
  currency: string;
}) {
  if (data.length === 0) {
    return <div className="flex h-[210px] items-center justify-center text-[12px] text-muted">No transaction history yet.</div>;
  }
  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2e7d4f" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#2e7d4f" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f6ea3" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#2f6ea3" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(10,11,12,0.06)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#8a8f8b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: string) => {
              const [year, month] = value.split("-");
              const date = new Date(Number(year), Number(month) - 1, 1);
              return date.toLocaleDateString("en-US", { month: "short" });
            }}
          />
          <YAxis
            tick={{ fill: "#8a8f8b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatMinor(value, currency, { compact: true })}
            width={64}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid rgba(10,11,12,0.08)",
              borderRadius: 12,
              fontSize: 11,
              color: "#0a0b0c",
            }}
            labelStyle={{ color: "#5d615e", fontSize: 10, marginBottom: 4 }}
            formatter={(value, name) => [formatMinor(Number(value), currency), name === "incomeMinor" ? "Income" : "Expenses"]}
          />
          <Area type="monotone" dataKey="incomeMinor" stroke="#2e7d4f" strokeWidth={1.8} fill="url(#incomeFill)" />
          <Area type="monotone" dataKey="expenseMinor" stroke="#2f6ea3" strokeWidth={1.3} strokeDasharray="3 3" fill="url(#expenseFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
