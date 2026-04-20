'use client';

import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  href?: string | null;
  className?: string;
  /** Solo imagen (sin wordmark), ideal para headers cuando no quieras tipografía al lado. */
  imageOnly?: boolean;
}

/**
 * Logo oficial CED·GYM — Fábrica de Monstruos.
 * El archivo vive en /public/logo.png (copiado desde assets/logos.png).
 */
export function Logo({ size = 'md', href = '/', className, imageOnly = false }: LogoProps) {
  const px = { sm: 32, md: 44, lg: 64 } as const;
  const dim = px[size];

  const content = (
    <span
      className={cn(
        'group relative inline-flex items-center gap-2 font-black tracking-tight',
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt="CED·GYM"
        width={dim}
        height={dim}
        priority
        className="rounded-full shrink-0"
      />
      {!imageOnly && (
        <span
          className={cn(
            'hidden sm:inline-flex flex-col leading-none',
            size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm',
          )}
          style={{ letterSpacing: '-0.02em' }}
        >
          <span className="text-white">
            <span className="text-brand-orange">CED</span>·GYM
          </span>
          <span className="text-[0.5em] font-semibold tracking-[0.3em] text-white/50 uppercase">
            Fábrica de monstruos
          </span>
        </span>
      )}
    </span>
  );

  if (href === null) return content;
  return (
    <Link href={href} aria-label="CED·GYM inicio" className="inline-block">
      {content}
    </Link>
  );
}
