import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  value: number;
  max?: number;
  size?: number;
  className?: string;
  showValue?: boolean;
  count?: number;
}

export function RatingStars({
  value,
  max = 5,
  size = 14,
  className,
  showValue,
  count,
}: RatingStarsProps) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <div className="flex">
        {Array.from({ length: max }).map((_, i) => {
          const filled = i < full || (i === full && half);
          return (
            <Star
              key={i}
              size={size}
              className={cn(
                'transition-colors',
                filled
                  ? 'fill-brand-orange text-brand-orange'
                  : 'text-white/20',
              )}
            />
          );
        })}
      </div>
      {(showValue || count !== undefined) && (
        <span className="ml-1 text-[11px] text-white/60">
          {showValue && <span className="font-bold text-white/80">{value.toFixed(1)}</span>}
          {count !== undefined && <span> ({count})</span>}
        </span>
      )}
    </div>
  );
}
