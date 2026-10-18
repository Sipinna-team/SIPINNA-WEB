import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import './Register.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { api } from '../lib/api';
import { passwordError, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from '../lib/passwordPolicy';
import { homePathFor, useAuth } from '../context/auth';

/** Página de registro de ciudadanos; al terminar inicia sesión automáticamente. */
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
  const phoneInvalid = phone !== '' && !/^(?:[0-9]{10}|\+[1-9][0-9]{1,14})$/.test(phone);
  const emailInvalid = email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const contactRequired = !phone.trim() && !email.trim();

  const handleInvalid = (
    event: FormEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const field = event.currentTarget;
    const { validity } = field;
    if (validity.valueMissing) {
      field.setCustomValidity(
        field.id === 'phone' || field.id === 'email'
          ? 'Por favor, ingresa tu número telefónico o tu correo electrónico.'
          : 'Por favor, rellena este campo.'
      );
    } else if (validity.typeMismatch && field.id === 'email') {
      field.setCustomValidity('El correo electrónico no es correcto.');
    } else if (validity.tooShort) {
      field.setCustomValidity(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    } else if (validity.rangeUnderflow || validity.rangeOverflow) {
      field.setCustomValidity('Ingresa una edad válida (entre 10 y 120 años).');
    }
  };

  const clearValidity = (
    event: FormEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    event.currentTarget.setCustomValidity('');
  };

  const clearContactValidity = () => {
    (document.getElementById('phone') as HTMLInputElement | null)?.setCustomValidity('');
    (document.getElementById('email') as HTMLInputElement | null)?.setCustomValidity('');
  };

 const handleSubmit = async (
  event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    if (!name.trim() || !lastName.trim() || !gender || !age || (!phone.trim() && !email.trim())) {
      setErrorMessage('Completa tus datos e ingresa al menos un correo electrónico o número telefónico.');
      return;
    }
    if (phoneInvalid) {
      document.getElementById('phone')?.focus();
      return;
    }
    if (emailInvalid) {
      document.getElementById('email')?.focus();
      return;
    }
    const validationError = passwordError(password);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }
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
          : error instanceof Error
            ? error.message
            : 'No se pudo completar el registro. Revisa tus datos e inténtalo de nuevo.'
      );
      setIsSubmitting(false);
      return;
    }

    /** Correo con el que se inicia sesión tras registrarse, con las mismas credenciales. */
    const correo = email.trim();

    try {
      const sessionUser = await login({
        email: correo ? correo : null,
        number: correo ? null : phone.trim(),
        password,
      });
      navigate(homePathFor(sessionUser), { replace: true, viewTransition: true });
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
          <Link to="/inicio" className="auth-home-logo" aria-label="Ir al inicio">
            <img src={sipinnaLogo} alt="SIPINNA" className="register-logo" />
          </Link>

          <h1>
            Te damos la bienvenida
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
                  required
                  onInvalid={handleInvalid}
                  onInput={clearValidity}
                  autoComplete="given-name"
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
                  required
                  onInvalid={handleInvalid}
                  onInput={clearValidity}
                  autoComplete="family-name"
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
                  required
                  onInvalid={handleInvalid}
                  onInput={clearValidity}
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
                  required
                  onInvalid={handleInvalid}
                  onInput={clearValidity}
                  inputMode="numeric"
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
                    Número telefónico
                  </label>

                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    required={contactRequired}
                    onInvalid={handleInvalid}
                    onInput={clearContactValidity}
                    aria-invalid={phoneInvalid}
                    aria-describedby={phoneInvalid ? 'register-phone-error' : undefined}
                    placeholder="Ej. 5512345678"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                  />
                </div>

                <span className="contact-or">
                  o
                </span>

                <div className="form-group">
                  <label htmlFor="email">
                    Correo electrónico
                  </label>

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required={contactRequired}
                    onInvalid={handleInvalid}
                    onInput={clearContactValidity}
                    aria-invalid={emailInvalid}
                    aria-describedby={emailInvalid ? 'register-email-error' : undefined}
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

              {phoneInvalid && (
                <p id="register-phone-error" className="register-phone-error" role="alert">
                  El número telefónico no es correcto.
                </p>
              )}

              {emailInvalid && (
                <p id="register-email-error" className="register-email-error" role="alert">
                  El correo electrónico no es correcto.
                </p>
              )}

              <p className="contact-help">
                Puedes ingresar tu número telefónico,
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
                  required
                  onInvalid={handleInvalid}
                  onInput={clearValidity}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  aria-describedby="register-password-requirements"
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
                  required
                  onInvalid={handleInvalid}
                  onInput={clearValidity}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  aria-describedby="register-password-requirements"
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

            <p id="register-password-requirements" className="password-requirements">{PASSWORD_REQUIREMENTS}</p>

            {errorMessage && (
              <div className="register-error" role="alert">
                {errorMessage}
              </div>
            )}

            <button
              className="register-button"
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
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
          <Link to="/inicio" className="auth-back">Volver al inicio</Link>
        </section>
      </div>
    </main>
  );
}

export default Register;
