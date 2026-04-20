'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ChartBarProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  height?: number;
  formatter?: (v: number) => string;
}

export function ChartBar<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  height = 260,
  formatter,
}: ChartBarProps<T>) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke="rgba(255,255,255,0.4)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="rgba(255,255,255,0.4)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatter}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,107,26,0.08)' }}
            contentStyle={{
              background: 'rgba(15,15,15,0.95)',
              border: '1px solid rgba(255,107,26,0.2)',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
            }}
            formatter={(v: number) =>
              formatter ? formatter(v) : String(v)
            }
          />
          <Bar dataKey={yKey} fill="#ff6b1a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
