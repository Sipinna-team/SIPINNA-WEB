import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import './Register.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] =useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

 const handleSubmit = async (
  event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await api.registerCitizen({
        nombre: `${name} ${lastName}`,
        edad: Number(age),
        genero: gender,
        email: email,
        telefono: phone,
        password: password,
      });
    } catch (error) {
      console.error('Error en el registro:', error);
      setErrorMessage(
        error instanceof TypeError
          ? 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
          : 'No se pudo completar el registro. Revisa tus datos e inténtalo de nuevo.'
      );
      setIsSubmitting(false);
      return;
    }

    // Al registrarse se inicia sesión con las mismas credenciales.
    const correo = email.trim();

    try {
      await login({
        email: correo ? correo : null,
        number: correo ? null : phone.trim(),
        password,
      });
      navigate('/dashboard', { replace: true, viewTransition: true });
    } catch (error) {
      console.error('Error al iniciar sesión tras el registro:', error);
      setErrorMessage(
        'Tu cuenta se creó, pero no se pudo iniciar sesión automáticamente. Inicia sesión manualmente.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <main className="register-page">
      <div className="register-card">
        <section className="register-left">
          <img
            src={sipinnaLogo}
            alt="Sipinna"
            className="register-logo"
          />

          <h1>
            ¡Gracias por registrarte!
          </h1>

          <p>
            "México será tan fuerte como su niñez".
            <br />
            Completa tus datos para
            continuar.
          </p>
          
        </section>

        <section className="register-right">
          <div className="register-header">
            <h2>Regístrate</h2>

            <p>
              Crea tu cuenta para comenzar
            </p>
          </div>

          <form
            className="register-form"
            onSubmit={handleSubmit}
          >
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">
                  Nombre
                </label>

                <input
                  id="name"
                  type="text"
                  placeholder="Ingresa tu nombre"
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName">
                  Apellido
                </label>

                <input
                  id="lastName"
                  type="text"
                  placeholder="Ingresa tu apellido"
                  value={lastName}
                  onChange={(event) =>
                    setLastName(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="gender">
                  Género
                </label>

                <select
                  id="gender"
                  value={gender}
                  onChange={(event) =>
                    setGender(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Selecciona tu género
                  </option>

                  <option value="mujer">
                    Mujer
                  </option>

                  <option value="hombre">
                    Hombre
                  </option>

                  <option value="otro">
                    Otro
                  </option>

                  <option value="prefiero-no-decir">
                    Prefiero no decirlo
                  </option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="age">
                  Edad
                </label>

                <input
                  id="age"
                  type="number"
                  min="10"
                  max="120"
                  placeholder="Ingresa tu edad"
                  value={age}
                  onChange={(event) =>
                    setAge(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="contact-section">
              <div className="contact-row">
                <div className="form-group">
                  <label htmlFor="phone">
                    Número
                  </label>

                  <input
                    id="phone"
                    type="tel"
                    placeholder="Ej. 300 123 4567"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                  />
                </div>

                <span className="contact-or">
                  ó
                </span>

                <div className="form-group">
                  <label htmlFor="email">
                    Correo electrónico
                  </label>

                  <input
                    id="email"
                    type="email"
                    placeholder="ejemplo@correo.com"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value
                      )
                    }
                  />
                </div>
              </div>

              <p className="contact-help">
                Puedes ingresar tu número,
                tu correo o ambos.
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="password">
                  Contraseña
                </label>

                <input
                  id="password"
                  type="password"
                  placeholder="Crea una contraseña"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">
                  Confirmar contraseña
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirma tu contraseña"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            {errorMessage && (
              <div className="register-error" role="alert">
                {errorMessage}
              </div>
            )}

            <button
              className="register-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="register-loading">
                  <span className="register-spinner" aria-hidden="true" />
                  Cargando...
                </span>
              ) : (
                'Crear cuenta'
              )}
            </button>
          </form>

          <p className="back-login">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" viewTransition className="back-login-link">
              Inicia sesión
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export default Register;