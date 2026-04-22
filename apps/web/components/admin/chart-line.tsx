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
            <linearGradient id="cedgymBlue" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(226, 232, 240)" vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke="rgb(100, 116, 139)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="rgb(100, 116, 139)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatter}
          />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid rgb(226, 232, 240)',
              borderRadius: 8,
              color: 'rgb(15, 23, 42)',
              fontSize: 12,
              boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)',
            }}
            formatter={(v: number) =>
              formatter ? formatter(v) : String(v)
            }
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke="url(#cedgymBlue)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#2563eb' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
