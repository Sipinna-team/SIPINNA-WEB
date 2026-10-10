import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';

type ZoomablePanelProps = HTMLAttributes<HTMLElement> & {
  className: string;
  children: ReactNode;
  /** Contenido de la vista ampliada; por defecto, `children`. */
  zoomContent?: ReactNode;
  /** Clase de la vista ampliada; por defecto, `className`. */
  zoomClassName?: string;
};

/** Panel del dashboard que al hacer clic se abre ampliado en un diálogo modal. */
export function ZoomablePanel({ className, children, zoomContent, zoomClassName, ...rest }: ZoomablePanelProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) dialogRef.current?.close();
  }

  return (
    <>
      <section
        {...rest}
        className={`dashboard-panel dashboard-panel--zoomable ${className}`}
        onClick={() => setOpen(true)}
      >
        {children}
        <button className="dashboard-zoom-button" type="button" aria-label="Ampliar" title="Ampliar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6" />
          </svg>
        </button>
      </section>

      {open && (
        <dialog
          ref={dialogRef}
          className="dashboard-zoom"
          {...rest}
          onClose={() => setOpen(false)}
          onClick={handleDialogClick}
        >
          <div className={`dashboard-panel dashboard-zoom-panel ${zoomClassName ?? className}`}>
            {zoomContent ?? children}
            <button
              className="dashboard-zoom-close"
              type="button"
              aria-label="Cerrar"
              title="Cerrar"
              onClick={() => dialogRef.current?.close()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
