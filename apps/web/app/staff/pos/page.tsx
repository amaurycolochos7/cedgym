'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Search,
  X,
  Printer,
} from 'lucide-react';
import { api } from '@/lib/api';
import { planDisplayName } from '@/lib/utils';
import {
  staffPosApi,
  type PosMenu,
  type PosProductItem,
  type PosMembershipItem,
  type PosCourseItem,
  type PaymentMethod,
  type StaffMemberSearchResult,
} from '@/lib/staff-api';

// ─── Cart types ──────────────────────────────────────────────────
type CartLine =
  | {
      kind: 'PRODUCT';
      key: string;
      sku: string;
      name: string;
      price_mxn: number;
      qty: number;
    }
  | {
      kind: 'MEMBERSHIP';
      key: string;
      plan: 'STARTER' | 'PRO' | 'ELITE';
      billing_cycle: 'MONTHLY';
      name: string;
      price_mxn: number;
      qty: 1;
    }
  | {
      kind: 'COURSE';
      key: string;
      course_id: string;
      name: string;
      price_mxn: number;
      qty: 1;
    };

// ─── Helpers ─────────────────────────────────────────────────────
function mxn(n: number) {
  return `$${n.toLocaleString('es-MX')}`;
}

function paymentLabel(m: PaymentMethod) {
  return m === 'CASH' ? 'Efectivo' : m === 'CARD_TERMINAL' ? 'Terminal' : 'QR Mercado Pago';
}

type CatalogTab = 'PRODUCT' | 'MEMBERSHIP' | 'COURSE';

// ─────────────────────────────────────────────────────────────────
export default function StaffPOSPage() {
  const searchParams = useSearchParams();
  const preselectedUserId = searchParams?.get('user_id') || null;

  // Unified catalog
  const { data: menu, refetch: refetchMenu } = useQuery<PosMenu>({
    queryKey: ['pos', 'menu'],
    queryFn: () => staffPosApi.productsMenu(),
  });

  const [tab, setTab] = useState<CatalogTab>('PRODUCT');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');

  // Member association
  const [memberQuery, setMemberQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<StaffMemberSearchResult | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Debounce query input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(memberQuery), 200);
    return () => clearTimeout(t);
  }, [memberQuery]);

  const { data: searchResults } = useQuery({
    queryKey: ['staff', 'members', 'search', debouncedQuery],
    queryFn: () => staffPosApi.searchMembers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  // Pre-select member via ?user_id= (hydrate from admin/miembros detail).
  useEffect(() => {
    if (!preselectedUserId || selectedMember) return;
    api
      .get(`/admin/miembros/${preselectedUserId}`)
      .then((r) => {
        const u = r.data;
        if (!u) return;
        setSelectedMember({
          id: u.id,
          name: u.full_name || u.name,
          phone: u.phone,
          email: u.email,
          plan: u.membership?.plan ?? null,
          membership_status: u.membership?.status ?? null,
          expires_at: u.membership?.expires_at ?? null,
          days_remaining: u.membership?.expires_at
            ? Math.max(
                0,
                Math.ceil(
                  (new Date(u.membership.expires_at).getTime() - Date.now()) /
                    86_400_000,
                ),
              )
            : 0,
        });
      })
      .catch(() => {});
  }, [preselectedUserId, selectedMember]);

  // ─── Cart ops ──────────────────────────────────────────────────
  function addProduct(p: PosProductItem) {
    setCart((c) => {
      const idx = c.findIndex((l) => l.kind === 'PRODUCT' && l.sku === p.sku);
      if (idx >= 0) {
        const next = c.slice();
        const line = next[idx];
        if (line.kind === 'PRODUCT') next[idx] = { ...line, qty: line.qty + 1 };
        return next;
      }
      return [
        ...c,
        {
          kind: 'PRODUCT',
          key: `P:${p.sku}`,
          sku: p.sku,
          name: p.name,
          price_mxn: p.price_mxn,
          qty: 1,
        },
      ];
    });
  }

  function addMembership(m: PosMembershipItem) {
    setCart((c) => {
      // Only one membership line at a time — replace if another exists.
      const filtered = c.filter((l) => l.kind !== 'MEMBERSHIP');
      return [
        ...filtered,
        {
          kind: 'MEMBERSHIP',
          key: `M:${m.plan}_${m.billing_cycle}`,
          plan: m.plan,
          billing_cycle: m.billing_cycle,
          name: m.name,
          price_mxn: m.price_mxn,
          qty: 1,
        },
      ];
    });
  }

  function addCourse(c: PosCourseItem) {
    setCart((prev) => {
      if (prev.some((l) => l.kind === 'COURSE' && l.course_id === c.id)) return prev;
      return [
        ...prev,
        {
          kind: 'COURSE',
          key: `C:${c.id}`,
          course_id: c.id,
          name: c.name,
          price_mxn: c.price_mxn,
          qty: 1,
        },
      ];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l;
        if (l.kind !== 'PRODUCT') return l;
        return { ...l, qty: Math.max(1, l.qty + delta) };
      }),
    );
  }

  function removeLine(key: string) {
    setCart((c) => c.filter((l) => l.key !== key));
  }

  const total = cart.reduce((s, l) => s + l.price_mxn * l.qty, 0);

  // Constraints
  const hasMembershipOrCourse = cart.some(
    (l) => l.kind === 'MEMBERSHIP' || l.kind === 'COURSE',
  );
  const requiresMember = hasMembershipOrCourse;

  // ─── Checkout flow ─────────────────────────────────────────────
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<null | {
    lines: { name: string; qty: number; subtotal: number }[];
    total_mxn: number;
    method: PaymentMethod;
    init_points: string[];
    customer_name: string | null;
    operations: string[];
  }>(null);

  const canCheckout =
    cart.length > 0 && (!requiresMember || !!selectedMember) && !processing;

  async function doCheckout() {
    if (!canCheckout) return;
    setProcessing(true);
    const ops: string[] = [];
    const initPoints: string[] = [];
    try {
      // 1) Products via POS /pos/sale
      const productLines = cart.filter(
        (l): l is Extract<CartLine, { kind: 'PRODUCT' }> => l.kind === 'PRODUCT',
      );
      if (productLines.length) {
        const r = await staffPosApi.sale({
          items: productLines.map((l) => ({ sku: l.sku, qty: l.qty })),
          user_id: selectedMember?.id,
          payment_method: method,
        });
        ops.push(`Venta POS (${productLines.length} ítems) — ${mxn(r.total_mxn)}`);
        if (r.init_point) initPoints.push(r.init_point);
      }

      // 2) Membership via /staff/extend-membership (user required)
      const membershipLine = cart.find(
        (l): l is Extract<CartLine, { kind: 'MEMBERSHIP' }> => l.kind === 'MEMBERSHIP',
      );
      if (membershipLine && selectedMember) {
        const r = await staffPosApi.extendMembership({
          user_id: selectedMember.id,
          plan: membershipLine.plan,
          billing_cycle: membershipLine.billing_cycle,
          payment_method: method,
        });
        ops.push(`Membresía ${membershipLine.name} — ${mxn(r.amount_mxn)}`);
        if (r.init_point) initPoints.push(r.init_point);
      }

      // 3) Courses
      const courseLines = cart.filter(
        (l): l is Extract<CartLine, { kind: 'COURSE' }> => l.kind === 'COURSE',
      );
      for (const cl of courseLines) {
        if (!selectedMember) break;
        const r = await staffPosApi.enrollCourse({
          user_id: selectedMember.id,
          course_id: cl.course_id,
          payment_method: method,
        });
        ops.push(`Curso ${cl.name} — ${mxn(r.amount_mxn)}`);
        if (r.init_point) initPoints.push(r.init_point);
      }

      setReceipt({
        lines: cart.map((l) => ({
          name: l.name,
          qty: l.qty,
          subtotal: l.price_mxn * l.qty,
        })),
        total_mxn: total,
        method,
        init_points: initPoints,
        customer_name: selectedMember?.name || null,
        operations: ops,
      });
      // Clear cart unless we still have pending MP QRs that the customer
      // needs to scan (keep until staff closes the modal).
      if (initPoints.length === 0) {
        setCart([]);
      }
      // Refresh product stock after any sale.
      refetchMenu();
    } catch (e: any) {
      alert(e?.response?.data?.error?.message ?? e?.message ?? 'Error al cobrar');
    } finally {
      setProcessing(false);
    }
  }

  // ─── Render helpers ────────────────────────────────────────────
  const products = menu?.products ?? [];
  const memberships = menu?.memberships ?? [];
  const courses = menu?.courses ?? [];

  const tabs: { key: CatalogTab; label: string }[] = [
    { key: 'PRODUCT', label: 'Productos' },
    { key: 'MEMBERSHIP', label: 'Membresías' },
    { key: 'COURSE', label: 'Cursos' },
  ];

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="grid h-[calc(100vh-4rem)] gap-6 md:grid-cols-[1fr_380px]">
      {/* ─── Left: catalog with tabs ─── */}
      <div className="overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5">
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? 'inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-sm'
                  : 'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'PRODUCT' &&
            (products.length === 0 ? (
              <p className="text-sm text-slate-500">Inventario vacío.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {products.map((p) => (
                  <button
                    key={p.sku}
                    onClick={() => addProduct(p)}
                    disabled={p.stock <= 0}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="truncate text-sm font-medium text-slate-900">
                      {p.name}
                    </div>
                    <div className="text-xs text-slate-500">Stock: {p.stock}</div>
                    <div className="mt-1 font-bold text-blue-600">
                      {mxn(p.price_mxn)}
                    </div>
                  </button>
                ))}
              </div>
            ))}

          {tab === 'MEMBERSHIP' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {memberships.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMembership(m)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-400 hover:shadow-md"
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-600">
                    {planDisplayName(m.plan)}
                  </div>
                  <div className="font-semibold text-slate-900">{m.name}</div>
                  <div className="mt-2 text-lg font-bold text-blue-600">
                    {mxn(m.price_mxn)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === 'COURSE' &&
            (courses.length === 0 ? (
              <p className="text-sm text-slate-500">No hay cursos publicados.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addCourse(c)}
                    disabled={c.seats_left <= 0}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-600">
                      {c.sport ?? 'Curso'}
                    </div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {c.seats_left} cupos · inicia{' '}
                      {new Date(c.starts_at).toLocaleDateString('es-MX')}
                    </div>
                    <div className="mt-2 text-lg font-bold text-blue-600">
                      {mxn(c.price_mxn)}
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>

      {/* ─── Right: cart sidebar ─── */}
      <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-5">
        {/* Member search */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
            Asociar a socio
          </label>
          {selectedMember ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">
                  {selectedMember.name}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {selectedMember.plan ? planDisplayName(selectedMember.plan) : 'Sin plan'}
                  {selectedMember.days_remaining
                    ? ` — vence en ${selectedMember.days_remaining}d`
                    : selectedMember.expires_at
                      ? ' — vencida'
                      : ''}
                </div>
              </div>
              <button onClick={() => setSelectedMember(null)}>
                <X className="h-4 w-4 text-slate-400 hover:text-rose-600" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={memberQuery}
                onChange={(e) => {
                  setMemberQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Nombre o teléfono…"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              {showSearchDropdown &&
                debouncedQuery.length >= 2 &&
                (searchResults?.length ?? 0) > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {searchResults!.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedMember(m);
                          setShowSearchDropdown(false);
                          setMemberQuery('');
                        }}
                        className="w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                      >
                        <div className="text-sm text-slate-900">{m.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {m.phone} · {m.plan ? planDisplayName(m.plan) : 'Sin plan'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}
          {!selectedMember && (
            <p className="mt-1 text-[11px] text-slate-500">
              Sin socio: sólo se permiten productos (venta anónima).
            </p>
          )}
        </div>

        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <ShoppingCart className="h-4 w-4" /> Carrito ({cart.length})
        </h2>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {cart.length === 0 && (
            <p className="text-sm text-slate-500">Vacío</p>
          )}
          {cart.map((l) => (
            <div
              key={l.key}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    {l.kind === 'PRODUCT'
                      ? 'Producto'
                      : l.kind === 'MEMBERSHIP'
                        ? 'Membresía'
                        : 'Curso'}
                  </div>
                  <div className="truncate text-sm font-medium text-slate-900">
                    {l.name}
                  </div>
                </div>
                <button onClick={() => removeLine(l.key)}>
                  <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {l.kind === 'PRODUCT' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(l.key, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm text-slate-900">
                      {l.qty}
                    </span>
                    <button
                      onClick={() => changeQty(l.key, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">×1</span>
                )}
                <div className="text-sm font-semibold text-slate-900">
                  {mxn(l.price_mxn * l.qty)}
                </div>
              </div>
            </div>
          ))}
          {requiresMember && !selectedMember && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Asocia un socio para cobrar membresías o cursos.
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
              Método de pago
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD_TERMINAL">Terminal</option>
              <option value="MP_LINK">QR Mercado Pago</option>
            </select>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-3xl font-bold text-slate-900">
              {mxn(total)} MXN
            </span>
          </div>
          <button
            type="button"
            disabled={!canCheckout}
            onClick={doCheckout}
            className="w-full rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Procesando…' : 'Cobrar'}
          </button>
        </div>
      </aside>

      {/* ─── Receipt modal ─── */}
      {receipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setReceipt(null)}
        >
          <div
            id="receipt"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="mb-3 text-xl font-bold text-slate-900">
              Venta registrada
            </h3>
            {receipt.customer_name && (
              <div className="mb-2 text-sm text-slate-600">
                Socio:{' '}
                <span className="text-slate-900">{receipt.customer_name}</span>
              </div>
            )}
            <div className="mb-3 text-xs text-slate-500">
              Pago: {paymentLabel(receipt.method)}
            </div>
            <ul className="mb-3 space-y-1 border-y border-slate-200 py-3 text-sm">
              {receipt.lines.map((l, i) => (
                <li key={i} className="flex justify-between text-slate-900">
                  <span className="mr-2 truncate">
                    {l.qty} × {l.name}
                  </span>
                  <span>{mxn(l.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mb-4 flex justify-between font-semibold text-slate-900">
              <span>Total</span>
              <span>{mxn(receipt.total_mxn)} MXN</span>
            </div>
            {receipt.operations.length > 0 && (
              <div className="mb-3 space-y-0.5 text-[11px] text-slate-500">
                {receipt.operations.map((op, i) => (
                  <div key={i}>• {op}</div>
                ))}
              </div>
            )}
            {receipt.init_points.length > 0 && (
              <div className="mb-3 space-y-2">
                <p className="text-xs text-slate-600">
                  Muestra este enlace al cliente para completar el pago:
                </p>
                {receipt.init_points.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    className="block rounded-xl bg-blue-600 py-2 text-center text-sm font-bold text-white hover:bg-blue-700"
                  >
                    Abrir Mercado Pago #{i + 1}
                  </a>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button
                type="button"
                onClick={() => {
                  setReceipt(null);
                  setCart([]);
                }}
                className="inline-flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
