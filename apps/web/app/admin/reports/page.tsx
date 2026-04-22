'use client';

import { FileText, Download } from 'lucide-react';
import { api } from '@/lib/api';

const REPORTS = [
  {
    key: 'active_members',
    label: 'Socios activos',
    path: '/admin/reports/active-members',
  },
  {
    key: 'pos_sales',
    label: 'Estado de caja (POS)',
    path: '/admin/pos/sales?format=csv',
  },
  {
    key: 'expiring_30d',
    label: 'Membresías por vencer (30d)',
    path: '/admin/memberships?expires_before=30&format=csv',
  },
  {
    key: 'inactive_30d',
    label: 'Inactivos últimos 30 días',
    path: '/admin/reports/inactive',
  },
  {
    key: 'birthdays',
    label: 'Cumpleañeros del mes',
    path: '/admin/reports/birthdays',
  },
  {
    key: 'payments',
    label: 'Pagos (todos)',
    path: '/admin/payments?format=csv',
  },
];

export default function AdminReportsPage() {
  const download = (path: string, label: string) => {
    const base = api.defaults.baseURL;
    const url = `${base}${path}`;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = `${label}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Reportes
        </h1>
        <p className="text-slate-600 mt-1">
          Exportaciones para contabilidad y seguimiento.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <button
            type="button"
            key={r.key}
            onClick={() => download(r.path, r.label)}
            className="text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-2xl p-5 transition"
          >
            <span className="inline-flex rounded-lg bg-blue-50 p-2.5 text-blue-700 mb-3">
              <FileText className="w-5 h-5" />
            </span>
            <div className="font-semibold text-slate-900">{r.label}</div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Download className="w-3 h-3" /> Exportar CSV
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
