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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
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
      billing_cycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
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

// ─────────────────────────────────────────────────────────────────
export default function StaffPOSPage() {
  const searchParams = useSearchParams();
  const preselectedUserId = searchParams?.get('user_id') || null;

  // Unified catalog
  const { data: menu, refetch: refetchMenu } = useQuery<PosMenu>({
    queryKey: ['pos', 'menu'],
    queryFn: () => staffPosApi.productsMenu(),
  });

  const [tab, setTab] = useState<'PRODUCT' | 'MEMBERSHIP' | 'COURSE'>('PRODUCT');
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

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="grid md:grid-cols-[1fr_380px] gap-6 h-[calc(100vh-4rem)]">
      {/* ─── Left: catalog with tabs ─── */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 overflow-y-auto">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="PRODUCT">Productos</TabsTrigger>
            <TabsTrigger value="MEMBERSHIP">Membresías</TabsTrigger>
            <TabsTrigger value="COURSE">Cursos</TabsTrigger>
          </TabsList>

          <TabsContent value="PRODUCT">
            {products.length === 0 ? (
              <p className="text-zinc-500 text-sm">Inventario vacío.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {products.map((p) => (
                  <button
                    key={p.sku}
                    onClick={() => addProduct(p)}
                    disabled={p.stock <= 0}
                    className="bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-left disabled:opacity-40"
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-zinc-500">Stock: {p.stock}</div>
                    <div className="text-blue-400 font-bold mt-1">
                      {mxn(p.price_mxn)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="MEMBERSHIP">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {memberships.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMembership(m)}
                  className="bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-left"
                >
                  <div className="text-[10px] uppercase tracking-widest text-brand-orange mb-1">
                    {m.plan}
                  </div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-blue-400 font-bold text-lg mt-2">
                    {mxn(m.price_mxn)}
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="COURSE">
            {courses.length === 0 ? (
              <p className="text-zinc-500 text-sm">No hay cursos publicados.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addCourse(c)}
                    disabled={c.seats_left <= 0}
                    className="bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-left disabled:opacity-40"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-brand-orange mb-1">
                      {c.sport ?? 'Curso'}
                    </div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {c.seats_left} cupos · inicia{' '}
                      {new Date(c.starts_at).toLocaleDateString('es-MX')}
                    </div>
                    <div className="text-blue-400 font-bold text-lg mt-2">
                      {mxn(c.price_mxn)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Right: cart sidebar ─── */}
      <aside className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 flex flex-col min-h-0">
        {/* Member search */}
        <div className="mb-4">
          <label className="text-xs uppercase text-zinc-500 block mb-1">
            Asociar a socio
          </label>
          {selectedMember ? (
            <div className="bg-zinc-800/70 border border-zinc-700 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{selectedMember.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {selectedMember.plan ?? 'Sin plan'}
                  {selectedMember.days_remaining
                    ? ` — vence en ${selectedMember.days_remaining}d`
                    : selectedMember.expires_at
                      ? ' — vencida'
                      : ''}
                </div>
              </div>
              <button onClick={() => setSelectedMember(null)}>
                <X className="w-4 h-4 text-zinc-500 hover:text-red-400" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={memberQuery}
                onChange={(e) => {
                  setMemberQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Nombre o teléfono…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm"
              />
              {showSearchDropdown &&
                debouncedQuery.length >= 2 &&
                (searchResults?.length ?? 0) > 0 && (
                  <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-lg max-h-52 overflow-y-auto">
                    {searchResults!.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedMember(m);
                          setShowSearchDropdown(false);
                          setMemberQuery('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
                      >
                        <div className="text-sm">{m.name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {m.phone} · {m.plan ?? 'Sin plan'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}
          {!selectedMember && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Sin socio: sólo se permiten productos (venta anónima).
            </p>
          )}
        </div>

        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Carrito ({cart.length})
        </h2>
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {cart.length === 0 && <p className="text-zinc-500 text-sm">Vacío</p>}
          {cart.map((l) => (
            <div key={l.key} className="bg-zinc-800/70 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase text-zinc-500 tracking-widest">
                    {l.kind === 'PRODUCT'
                      ? 'Producto'
                      : l.kind === 'MEMBERSHIP'
                        ? 'Membresía'
                        : 'Curso'}
                  </div>
                  <div className="text-sm font-medium truncate">{l.name}</div>
                </div>
                <button onClick={() => removeLine(l.key)}>
                  <Trash2 className="w-4 h-4 text-zinc-500 hover:text-red-400" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                {l.kind === 'PRODUCT' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(l.key, -1)}
                      className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm w-6 text-center">{l.qty}</span>
                    <button
                      onClick={() => changeQty(l.key, 1)}
                      className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-500">×1</span>
                )}
                <div className="text-sm font-semibold">
                  {mxn(l.price_mxn * l.qty)}
                </div>
              </div>
            </div>
          ))}
          {requiresMember && !selectedMember && (
            <div className="bg-amber-900/20 border border-amber-700/40 text-amber-200 text-xs rounded-lg p-2">
              Asocia un socio para cobrar membresías o cursos.
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          <div>
            <label className="text-xs uppercase text-zinc-500">Método de pago</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD_TERMINAL">Terminal</option>
              <option value="MP_LINK">QR Mercado Pago</option>
            </select>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-zinc-400">Total</span>
            <span className="text-2xl font-bold">{mxn(total)} MXN</span>
          </div>
          <Button
            className="w-full"
            disabled={!canCheckout}
            onClick={doCheckout}
            loading={processing}
          >
            Cobrar
          </Button>
        </div>
      </aside>

      {/* ─── Receipt modal ─── */}
      {receipt && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setReceipt(null)}
        >
          <div
            id="receipt"
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full"
          >
            <h3 className="text-xl font-bold mb-3">Venta registrada</h3>
            {receipt.customer_name && (
              <div className="text-sm text-zinc-400 mb-2">
                Socio: <span className="text-zinc-100">{receipt.customer_name}</span>
              </div>
            )}
            <div className="text-xs text-zinc-500 mb-3">
              Pago: {paymentLabel(receipt.method)}
            </div>
            <ul className="text-sm space-y-1 border-y border-zinc-800 py-3 mb-3">
              {receipt.lines.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate mr-2">
                    {l.qty} × {l.name}
                  </span>
                  <span>{mxn(l.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between font-semibold mb-4">
              <span>Total</span>
              <span>{mxn(receipt.total_mxn)} MXN</span>
            </div>
            {receipt.operations.length > 0 && (
              <div className="text-[11px] text-zinc-500 mb-3 space-y-0.5">
                {receipt.operations.map((op, i) => (
                  <div key={i}>• {op}</div>
                ))}
              </div>
            )}
            {receipt.init_points.length > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-xs text-zinc-400">
                  Muestra este enlace al cliente para completar el pago:
                </p>
                {receipt.init_points.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    className="block text-center bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm"
                  >
                    Abrir Mercado Pago #{i + 1}
                  </a>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setReceipt(null);
                  setCart([]);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
