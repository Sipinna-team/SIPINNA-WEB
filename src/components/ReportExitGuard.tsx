import { useCallback, useEffect, useRef } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

/** Protege el avance sin escribir información del reporte en el almacenamiento del navegador. */
export default function ReportExitGuard({ active, sending }: { active: boolean; sending: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    active && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (!active) return;
    event.preventDefault();
    event.returnValue = '';
  }, [active]));

  useEffect(() => {
    if (blocker.state === 'blocked') dialogRef.current?.showModal();
  }, [blocker.state]);

  if (blocker.state !== 'blocked') return null;

  const stay = () => {
    dialogRef.current?.close();
    blocker.reset();
  };

  return (
    <dialog ref={dialogRef} className="sip-confirm" aria-labelledby="report-exit-title" aria-describedby="report-exit-description" onCancel={(event) => { event.preventDefault(); stay(); }}>
      <h2 id="report-exit-title">{sending ? 'Tu reporte se está enviando' : '¿Salir sin enviar el reporte?'}</h2>
      <p id="report-exit-description">
        {sending
          ? 'Espera a que termine el envío para recibir tu folio y tu clave de consulta.'
          : 'Si sales, perderás lo que has completado. Puedes quedarte para continuar con tu reporte.'}
      </p>
      <div className="sip-confirm-actions">
        <button type="button" className="sip-btn sip-btn--primary" autoFocus onClick={stay}>Seguir con el reporte</button>
        {!sending && <button type="button" className="sip-btn sip-btn--secondary" onClick={() => blocker.proceed()}>Salir sin enviar</button>}
      </div>
    </dialog>
  );
}
