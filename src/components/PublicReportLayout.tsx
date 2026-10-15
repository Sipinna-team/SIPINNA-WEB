import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import sipinnaLogo from '../assets/sipinna.svg';
import '../pages/NewReport.css';

type PublicReportLayoutProps = {
  children: ReactNode;
  showExit?: boolean;
  exitTo?: string;
  exitLabel?: string;
};

/** Estructura compartida de reporte, consulta de folio y aviso de privacidad. */
export default function PublicReportLayout({
  children,
  showExit = true,
  exitTo = '/inicio',
  exitLabel = 'Volver al inicio',
}: PublicReportLayoutProps) {
  return (
    <div className="rf-page">
      <header className="rf-topbar">
        <Link to="/inicio" aria-label="Ir al inicio">
          <img src={sipinnaLogo} alt="SIPINNA" className="rf-logo" />
        </Link>
        {showExit && <Link to={exitTo} className="rf-exit">{exitLabel}</Link>}
      </header>
      <main className="rf-main">{children}</main>
    </div>
  );
}
