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
            cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
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
          <Bar dataKey={yKey} fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
