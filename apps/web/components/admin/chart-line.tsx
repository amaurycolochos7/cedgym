'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ChartLineProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  height?: number;
  formatter?: (v: number) => string;
}

export function ChartLine<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  height = 260,
  formatter,
}: ChartLineProps<T>) {
  return (
    <div className="h-[260px] w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="brandOrange" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ff6b1a" />
              <stop offset="100%" stopColor="#ff8a3d" />
            </linearGradient>
          </defs>
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
          <Line
            type="monotone"
            dataKey={yKey}
            stroke="url(#brandOrange)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#ff6b1a' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
