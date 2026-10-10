import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from 'react';

type KpiCarouselProps = {
  /** Nombre accesible del carrusel. */
  label: string;
  className?: string;
  children: ReactNode;
};

/** Tiempo sin interacción antes de mostrar la pista de "desliza". */
const HINT_IDLE_MS = 6500;
/** Cuánto avanza el carrusel en la pista, como fracción del ancho de una tarjeta. */
const HINT_TILE_FRACTION = 0.6;
const HINT_MAX_PX = 160;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Recorrido de la pista: `[posición destino (0 = origen, 1 = distancia completa), duración ms, curva]`.
 * Avanza y deja ver la siguiente tarjeta, se detiene un momento, regresa, da un segundo
 * empujoncito y se asienta.
 */
const HINT_PATH: [number, number, (t: number) => number][] = [
  [1, 650, easeInOut],
  [1, 350, easeOut],
  [0, 550, easeInOut],
  [0.3, 260, easeOut],
  [0, 380, easeOut],
];
/** Distancia mínima de arrastre para cambiar de página. */
const DRAG_THRESHOLD_PX = 40;
const LEARNED_KEY = 'kpiCarousel.swipeLearned';

/** Indica si el usuario pidió reducir animaciones. */
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Indica si el usuario ya deslizó alguna vez (guardado en localStorage). */
const readLearned = () => {
  try {
    return localStorage.getItem(LEARNED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Recuerda que el usuario ya aprendió a deslizar, para no volver a mostrar la pista.
 * Sin almacenamiento disponible la pista seguirá apareciendo; no es crítico.
 */
const saveLearned = () => {
  try {
    localStorage.setItem(LEARNED_KEY, '1');
  } catch {
    return;
  }
};

/**
 * Carrusel paginado de tarjetas KPI con arrastre, rueda, teclado e indicadores de página.
 * Tras un rato sin interacción muestra una pista animada de "desliza" hasta que el usuario la aprende.
 *
 * @remarks La pista desplaza el carrusel de verdad (sin snap) y lo regresa a donde estaba;
 * deja de mostrarse en cuanto el usuario desliza.
 */
export function KpiCarousel({ label, className, children }: KpiCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startScroll: number; startPage: number } | null>(null);
  const learnedRef = useRef(readLearned());
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [atStart, setAtStart] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<'next' | 'prev' | null>(null);
  const [activity, setActivity] = useState(0);

  /**
   * Una página avanza solo las tarjetas completas que caben; la que se asoma
   * cortada en el borde pasa a ser la primera de la siguiente página.
   */
  const pageStep = useCallback(() => {
    const track = trackRef.current!;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const tile = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? track.clientWidth;
    const perPage = Math.max(1, Math.floor((track.clientWidth + gap) / (tile + gap)));
    return perPage * (tile + gap);
  }, []);

  const update = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = pageStep();
    const maxScroll = track.scrollWidth - track.clientWidth;
    const total = maxScroll > 2 ? Math.ceil(maxScroll / step - 0.01) + 1 : 1;
    const atEnd = track.scrollLeft >= maxScroll - 2;
    setPages(total);
    setAtStart(track.scrollLeft <= 2);
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

  const paged = pages > 1;

  /** Cualquier interacción reinicia el contador de inactividad. */
  const markActive = useCallback(() => setActivity((n) => n + 1), []);

  const markLearned = () => {
    if (learnedRef.current) return;
    learnedRef.current = true;
    saveLearned();
  };

  useEffect(() => {
    if (!paged || dragging || learnedRef.current || prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      const track = trackRef.current;
      if (!track || document.visibilityState !== 'visible') return;
      const rect = track.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      setHint(page >= pages - 1 ? 'prev' : 'next');
    }, HINT_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [paged, dragging, page, pages, activity]);

  useEffect(() => {
    if (!hint) return;
    const track = trackRef.current!;
    const origin = track.scrollLeft;
    const tile = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    const distance = Math.min(tile * HINT_TILE_FRACTION, HINT_MAX_PX) * (hint === 'next' ? 1 : -1);
    let segment = 0;
    let from = 0;
    let segmentStart = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const [to, duration, ease] = HINT_PATH[segment]!;
      const t = Math.min(1, (now - segmentStart) / duration);
      track.scrollLeft = origin + distance * (from + (to - from) * ease(t));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      segment += 1;
      if (segment >= HINT_PATH.length) {
        setHint(null);
        markActive();
        return;
      }
      from = to;
      segmentStart = now;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      track.scrollLeft = origin;
    };
  }, [hint, markActive]);

  /** Si el usuario interactúa a media pista, se corta y todo vuelve a su lugar. */
  const stopHint = () => {
    if (!hint) return;
    flushSync(() => setHint(null));
  };

  const goTo = (target: number) => {
    trackRef.current!.scrollTo({
      left: Math.max(0, Math.min(target, pages - 1)) * pageStep(),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  /** Arrastre con mouse. En pantallas táctiles el desplazamiento nativo ya funciona. */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!paged || e.pointerType !== 'mouse' || e.button !== 0) return;
    stopHint();
    const track = trackRef.current!;
    track.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startScroll: track.scrollLeft, startPage: page };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    trackRef.current!.scrollLeft = drag.startScroll - (e.clientX - drag.startX);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    markActive();
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) >= DRAG_THRESHOLD_PX) {
      markLearned();
      goTo(drag.startPage + (delta < 0 ? 1 : -1));
    } else {
      goTo(drag.startPage);
    }
  };

  /** Deslizar con el dedo o con el trackpad también cuenta como "aprendido". */
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    stopHint();
    markActive();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) markLearned();
  };

  const onTouchMove = () => {
    stopHint();
    markActive();
    markLearned();
  };

  /** Sin flechas ni puntos, el teclado navega con ← → / Inicio / Fin sobre el carrusel enfocado. */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowRight: page + 1,
      ArrowLeft: page - 1,
      Home: 0,
      End: pages - 1,
    };
    if (!paged || !(e.key in targets)) return;
    e.preventDefault();
    stopHint();
    markActive();
    goTo(targets[e.key]!);
  };

  const trackClass = [
    'kpi-carousel-track',
    paged && !atStart && 'has-prev',
    paged && page < pages - 1 && 'has-next',
    dragging && 'is-dragging',
    hint && `is-hinting is-hinting--${hint}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      className={`kpi-carousel${paged ? ' kpi-carousel--paged' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-roledescription={paged ? 'carrusel' : undefined}
    >
      <div
        className={trackClass}
        ref={trackRef}
        tabIndex={paged ? 0 : undefined}
        aria-label={paged ? `${label}, página ${page + 1} de ${pages}. Usa las flechas para ver más.` : undefined}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
      >
        {children}
      </div>
    </section>
  );
}
