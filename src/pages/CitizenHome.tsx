import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import sipinnaLogo from '../assets/sipinna.svg';
import './CitizenHome.css';

const NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio', shortLabel: 'Inicio' },
  { id: 'sipinna', label: '¿Qué es SIPINNA?', shortLabel: 'SIPINNA' },
  { id: 'rieti', label: 'Ruta RIETI', shortLabel: 'Ruta RIETI' },
];

const LEVELS = [
  { name: 'Nacional', text: 'Define la política para todo el país' },
  { name: 'Estatal', text: 'Coordina dependencias en cada estado' },
  { name: 'Municipal', text: 'Atiende directamente a las familias' },
];

const KEY_TOPICS = [
  'Violencia',
  'Matrimonio infantil',
  'Migración de menores no acompañados',
  'Situación de calle',
  'Trabajo infantil',
];

const MUNICIPALITIES = ['Atizapán de Zaragoza', 'Cuautitlán Izcalli', 'Naucalpan'];

const RIETI_AXES = ['Inspección', 'Detección', 'Atención', 'Registro de casos'];

/** Rellena con cero a la izquierda a 2 dígitos. */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Página de inicio para ciudadanos: llegan aquí al iniciar sesión o al terminar su registro.
 * El menú marca la sección que ocupa la parte superior de la pantalla.
 */
function CitizenHome() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0] ?? '';
  const [activeSection, setActiveSection] = useState(NAV_ITEMS[0].id);

  useEffect(() => {
    const sections = NAV_ITEMS.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error('Error al cerrar sesión', err);
    } finally {
      navigate('/login', { replace: true, viewTransition: true });
    }
  }

  return (
    <div className="citizen-page">
      <header className="citizen-header">
        <div className="citizen-container citizen-header-inner">
          <img src={sipinnaLogo} alt="SIPINNA" className="citizen-logo" />

          <nav className="citizen-nav" aria-label="Secciones">
            {NAV_ITEMS.map(({ id, label, shortLabel }) => (
              <a
                key={id}
                href={`#${id}`}
                className={activeSection === id ? 'is-active' : undefined}
                aria-current={activeSection === id ? 'location' : undefined}
              >
                <span className="citizen-nav-long">{label}</span>
                <span className="citizen-nav-short">{shortLabel}</span>
              </a>
            ))}
          </nav>

          <div className="citizen-user">
            <span className="citizen-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="9" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0Z" />
              </svg>
            </span>
            <div className="citizen-user-info">
              <span>Ciudadano</span>
              <strong>{user?.name}</strong>
            </div>
            <button type="button" className="citizen-logout" onClick={handleLogout} aria-label="Cerrar sesión">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h12" />
              </svg>
              <span className="citizen-logout-label">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        <section id="inicio" className="citizen-hero">
          <div className="citizen-container citizen-hero-inner">
            <div className="citizen-hero-copy">
              <p className="citizen-eyebrow">Bienvenida y bienvenido</p>
              <h1>{firstName ? `Hola, ${firstName}.` : 'Hola.'} Juntos protegemos a la niñez.</h1>
              <p className="citizen-hero-text">
                Conoce cómo el Sistema de Protección Integral y la Ruta RIETI trabajan para que niñas,
                niños y adolescentes vivan libres de violencia y de trabajo infantil.
              </p>
              <div className="citizen-hero-actions">
                <a href="#sipinna" className="citizen-btn citizen-btn-light">Conocer SIPINNA</a>
                <a href="#rieti" className="citizen-btn citizen-btn-outline">Ver la Ruta RIETI</a>
              </div>
            </div>

            <div className="citizen-levels">
              <p className="citizen-eyebrow">Tres niveles de protección</p>
              {LEVELS.map(({ name, text }, index) => (
                <div key={name} className="citizen-level">
                  <span className="citizen-number">{pad(index + 1)}</span>
                  <div>
                    <strong>{name}</strong>
                    <span>{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="sipinna" className="citizen-section citizen-section-white">
          <div className="citizen-container">
            <div className="citizen-section-head">
              <div>
                <span className="citizen-tag">SIPINNA</span>
                <h2>¿Qué es SIPINNA?</h2>
              </div>
              <p>
                El Sistema Nacional de Protección Integral de Niñas, Niños y Adolescentes (SIPINNA) es
                un mecanismo institucional del Gobierno de México mandatado por la Ley General de los
                Derechos de Niñas, Niños y Adolescentes.
              </p>
            </div>

            <div className="citizen-card-grid">
              <article className="citizen-card citizen-card-cream">
                <svg className="citizen-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <h3>Objetivo principal</h3>
                <p>
                  Garantizar el pleno goce, respeto, protección y promoción de los derechos humanos de
                  la infancia y adolescencia en México.
                </p>
              </article>

              <article className="citizen-card citizen-card-cream">
                <svg className="citizen-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="5" r="2.5" />
                  <circle cx="5" cy="19" r="2.5" />
                  <circle cx="19" cy="19" r="2.5" />
                  <path d="M12 7.5v4M12 11.5 6.5 17M12 11.5l5.5 5.5" />
                </svg>
                <h3>¿Cómo funciona?</h3>
                <p>
                  Opera bajo un modelo descentralizado de tres niveles: Nacional, Estatal y Municipal.
                  Coordina a las diferentes dependencias del gobierno (salud, educación, seguridad,
                  DIF, etc.) y a la sociedad civil para alinear políticas públicas y crear presupuestos
                  que protejan a los menores.
                </p>
              </article>

              <article className="citizen-card citizen-card-cream">
                <svg className="citizen-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                <h3>Funciones clave</h3>
                <p>Atiende temas críticos como:</p>
                <ul className="citizen-chips">
                  {KEY_TOPICS.map((topic) => (
                    <li key={topic} className="citizen-chip citizen-chip-outline">{topic}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="rieti" className="citizen-section">
          <div className="citizen-container">
            <div className="citizen-section-head">
              <div>
                <span className="citizen-tag citizen-tag-gold">Ruta RIETI</span>
                <h2>¿Qué es la Ruta RIETI?</h2>
              </div>
              <p>
                La Ruta Intermunicipal para la Erradicación del Trabajo Infantil (RIETI) es una
                iniciativa regional surgida principalmente en los municipios del Valle de México
                (Estado de México).
              </p>
            </div>

            <div className="citizen-rieti-row">
              <article className="citizen-card">
                <h3>Origen y alcance</h3>
                <p>
                  Fue impulsada mediante un convenio sin precedentes firmado por varios municipios de
                  México, entre ellos:
                </p>
                <ul className="citizen-chips">
                  {MUNICIPALITIES.map((municipality) => (
                    <li key={municipality} className="citizen-chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
                      </svg>
                      {municipality}
                    </li>
                  ))}
                  <li className="citizen-chip citizen-chip-muted">entre otros</li>
                </ul>
              </article>

              <article className="citizen-card citizen-card-green">
                <h3>Relación con SIPINNA</h3>
                <p>
                  La Ruta RIETI opera bajo el paraguas y los principios de los SIPINNA municipales,
                  quienes en conjunto con los sistemas DIF locales, ejecutan las acciones de rescate,
                  atención psicológica, reintegración escolar y apoyo a familias en situación de
                  vulnerabilidad económica.
                </p>
              </article>
            </div>

            <article className="citizen-card citizen-card-wide">
              <h3>Objetivo principal</h3>
              <p>
                Combatir y frenar el trabajo infantil en la región, creando un modelo estructurado que
                fortalece cuatro ejes de atención a niñas y niños trabajadores:
              </p>
              <ol className="citizen-axes">
                {RIETI_AXES.map((axis, index) => (
                  <li key={axis}>
                    <span className="citizen-number citizen-number-gold">{pad(index + 1)}</span>
                    <strong>{axis}</strong>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>
      </main>

      <footer className="citizen-footer">
        <div className="citizen-container citizen-footer-inner">
          <span>Sistema de Protección Integral de Niñas, Niños y Adolescentes</span>
          <span>Ley General de los Derechos de Niñas, Niños y Adolescentes</span>
        </div>
      </footer>
    </div>
  );
}

export default CitizenHome;
