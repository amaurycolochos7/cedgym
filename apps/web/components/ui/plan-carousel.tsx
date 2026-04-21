'use client';

import * as React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanCarouselProps {
  children: React.ReactNode[];
  className?: string;
}

/**
 * Mobile-first swipeable carousel for membership plan cards.
 * Desktop (md+) shows all children in a grid — the carousel only
 * activates on screens smaller than 768px.
 */
export function PlanCarousel({ children, className }: PlanCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    containScroll: 'trimSnaps',
    dragFree: false,
    loop: false,
  });
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  const scrollTo = React.useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  return (
    <>
      {/* Mobile: carousel */}
      <div className={cn('md:hidden', className)}>
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex touch-pan-y">
            {React.Children.map(children, (child, i) => (
              <div key={i} className="min-w-0 flex-[0_0_85%] pl-4 first:pl-6 last:pr-6">
                {child}
              </div>
            ))}
          </div>
        </div>
        {/* Dots + arrows */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            className="rounded-full border border-zinc-700 p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
            aria-label="Anterior"
            disabled={selectedIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {React.Children.map(children, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollTo(i)}
                aria-label={`Ir al plan ${i + 1}`}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === selectedIndex ? 'w-6 bg-brand-orange' : 'w-2 bg-zinc-700'
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            className="rounded-full border border-zinc-700 p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
            aria-label="Siguiente"
            disabled={selectedIndex === React.Children.count(children) - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Desktop: plain grid */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-6">
        {children}
      </div>
    </>
  );
}
