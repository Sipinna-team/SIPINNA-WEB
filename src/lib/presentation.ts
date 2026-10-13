/** Iniciales de hasta dos palabras; conserva el fallback elegido por cada vista. */
export function initials(name: string, fallback = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]!.toUpperCase()).join('') || fallback;
}

/** Preferencia de accesibilidad compartida por las animaciones y el carrusel. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
