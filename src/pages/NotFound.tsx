import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
import './NotFound.css';
import sipinnaLogo from '../assets/sipinna404.svg';

function NotFound() {
  const navigate = useNavigate();

  return (
    <main className="login-page">
      <div className="login-card not-found-card">
        <img src={sipinnaLogo} alt="Sipinna" className="login-logo" />

        <p className="not-found-code" aria-hidden="true">404</p>
        <h2>Página no encontrada</h2>
        <p className="not-found-text">
          La página que buscas no existe o fue movida. Revisa la dirección o vuelve al inicio.
        </p>

        {/* La raíz decide si mandar al login o al dashboard según la sesión. */}
        <Link to="/" replace viewTransition className="not-found-button">
          Ir al inicio
        </Link>

        <p>
          <a
            href="#"
            className="register-link"
            onClick={(event) => {
              event.preventDefault();
              navigate(-1);
            }}
          >
            Volver a la página anterior
          </a>
        </p>
      </div>
    </main>
  );
}

export default NotFound;
