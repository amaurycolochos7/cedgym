'use client';

import * as React from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  type Country,
  parseE164,
  toE164,
} from '@/lib/countries';

export interface PhoneInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'value' | 'type'
  > {
  /** Valor en formato E.164 (ej: "+525512345678"). Vacío = "". */
  value?: string;
  /** Devuelve siempre E.164 (o "" si el usuario vació el input). */
  onChange?: (e164: string) => void;
  error?: boolean;
  defaultCountry?: string; // ISO alpha-2
}

/** Agrupa dígitos en bloques de 3-4 para mostrar. */
function formatDisplay(digits: string, country: Country): string {
  const d = digits.slice(0, 15);
  if (country.code === 'MX' || country.digits === 10) {
    return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10)].filter(Boolean).join(' ');
  }
  const groups: string[] = [];
  let i = 0;
  while (i < d.length) {
    const size = i === 0 ? 3 : 3;
    groups.push(d.slice(i, i + size));
    i += size;
  }
  return groups.filter(Boolean).join(' ');
}

/**
 * Phone input con selector de país. Guarda E.164 via onChange y decodifica
 * E.164 desde value para pre-rellenar (reset password, perfil, etc).
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, error, className, defaultCountry = 'MX', ...rest }, ref) => {
    // Estado controlado por la prop `value` (E.164). Si value llega vacío
    // mantenemos el país previamente seleccionado para no resetear al tipear.
    const parsed = React.useMemo(() => parseE164(value), [value]);
    const [country, setCountry] = React.useState<Country>(
      parsed.country || COUNTRIES.find((c) => c.code === defaultCountry) || DEFAULT_COUNTRY,
    );
    React.useEffect(() => {
      if (value && parsed.country.code !== country.code) {
        setCountry(parsed.country);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const national = parsed.national;
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');

    const filtered = React.useMemo(() => {
      const q = search.trim().toLowerCase();
      if (!q) return COUNTRIES;
      return COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q) ||
          c.code.toLowerCase().includes(q),
      );
    }, [search]);

    const emit = (newCountry: Country, newDigits: string) => {
      onChange?.(toE164(newCountry, newDigits));
    };

    return (
      <div className="relative">
        <div
          className={cn(
            'flex h-11 w-full items-stretch overflow-hidden rounded-xl border border-white/10 bg-input/60 focus-within:border-brand-orange/60 focus-within:ring-2 focus-within:ring-brand-orange/30',
            error && 'border-red-400/60 focus-within:border-red-400 focus-within:ring-red-400/30',
            className,
          )}
        >
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 border-r border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            aria-label="Seleccionar país"
          >
            <span aria-hidden>{country.flag}</span>
            <span>{country.dial}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <input
            ref={ref}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder={country.code === 'MX' ? '55 1234 5678' : 'Número'}
            value={formatDisplay(national, country)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '').slice(0, 15);
              emit(country, raw);
            }}
            className="flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            {...rest}
          />
        </div>

        {open && (
          <>
            {/* Overlay para cerrar al click fuera */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setOpen(false);
                setSearch('');
              }}
              aria-hidden
            />
            <div className="absolute left-0 right-0 top-12 z-50 max-h-72 overflow-hidden rounded-xl border border-white/10 bg-neutral-950 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-white/50" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar país o código…"
                  autoFocus
                  className="flex-1 bg-transparent text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
              </div>
              <ul className="max-h-60 overflow-y-auto">
                {filtered.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-white/40">
                    Sin resultados
                  </li>
                )}
                {filtered.map((c) => (
                  <li key={`${c.code}-${c.dial}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setCountry(c);
                        emit(c, national);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-white/5',
                        c.code === country.code && 'bg-brand-orange/10 text-brand-orange',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="text-base">{c.flag}</span>
                        <span className="font-medium text-white">{c.name}</span>
                      </span>
                      <span className="font-mono text-white/60">{c.dial}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
