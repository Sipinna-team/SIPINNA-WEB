import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type KpiCarouselProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function KpiCarousel({ label, className, children }: KpiCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const pageStep = useCallback(() => {
    const track = trackRef.current!;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return track.clientWidth + gap;
  }, []);

  const update = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = pageStep();
    const total = Math.max(1, Math.ceil(track.scrollWidth / step - 0.01));
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    setPages(total);
    setPage(atEnd ? total - 1 : Math.round(track.scrollLeft / step));
  }, [pageStep]);

  useEffect(() => {
    const track = trackRef.current!;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    track.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      track.removeEventListener('scroll', update);
    };
  }, [update]);

  const goTo = (target: number) => {
    trackRef.current!.scrollTo({
      left: target * pageStep(),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const paged = pages > 1;

  return (
    <section
      className={`kpi-carousel${paged ? ' kpi-carousel--paged' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-roledescription={paged ? 'carrusel' : undefined}
    >
      {paged && (
        <button
          type="button"
          className="kpi-carousel-arrow kpi-carousel-arrow--prev"
          onClick={() => goTo(page - 1)}
          disabled={page === 0}
          aria-label="Indicadores anteriores"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}

      <div className="kpi-carousel-track" ref={trackRef}>
        {children}
      </div>

      {paged && (
        <button
          type="button"
          className="kpi-carousel-arrow kpi-carousel-arrow--next"
          onClick={() => goTo(page + 1)}
          disabled={page >= pages - 1}
          aria-label="Indicadores siguientes"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      {paged && (
        <div className="kpi-carousel-dots">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`kpi-carousel-dot${i === page ? ' is-active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Página ${i + 1} de ${pages}`}
              aria-current={i === page ? 'true' : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
