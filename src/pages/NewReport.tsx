import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as mapboxgl from 'mapbox-gl/esm';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../context/auth';
import { api } from '../lib/api';
import { forwardGeocode, reverseGeocode } from '../lib/geocoding';
import sipinnaLogo from '../assets/sipinna.svg';
import './NewReport.css';

/** Mismas opciones que la app de Android, para que el dashboard las agrupe igual. */
const AGE_OPTIONS = ['Menos de 5 años', '5 - 7 años', '8 - 10 años', '11 - 13 años', '14 - 17 años'];
const WORK_OPTIONS = [
  'Vendedor ambulante',
  'Limpieza de calles',
  'Cargador / Cargadora',
  'Recolección de basura',
  'Agricultura / Campo',
  'Mendicidad',
  'Construcción',
  'Otro',
];
const CONDITION_OPTIONS = ['Solo / Sola', 'Con adultos', 'Con otros niños', 'Con familiares', 'En situación de riesgo'];

const STEPS = ['Ubicación', 'Fotos', 'Descripción', 'Niña o niño', 'Revisión'];
const CHOICE = -1;
const REVIEW = 4;
const DONE = 5;

const MIN_DESCRIPTION = 10;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAP_BOX_TOKEN;
/** Centro del Valle de México, igual que el mapa del dashboard. */
const DEFAULT_CENTER: [number, number] = [-99.2734, 19.5645];

type LngLat = [number, number];

/** Hora local en el formato que guarda el backend: `"YYYY-MM-DDTHH:mm"`. */
function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Avance del envío; permite reintentar sin crear otro borrador ni volver a subir fotos. */
type SendProgress = { reportId?: string; editToken?: string; folio?: string; imageIds?: string[]; uploaded: Set<number> };

/**
 * Flujo para que un ciudadano haga un reporte, con o sin sesión.
 * Sin sesión primero elige entre reportar de forma anónima o iniciar sesión.
 */
function NewReport() {
  const { user, isLoading } = useAuth();
  const [step, setStep] = useState(CHOICE);
  const [reachedReview, setReachedReview] = useState(false);

  const [location, setLocation] = useState<LngLat | null>(null);
  const [resolved, setResolved] = useState<{ point: LngLat; address: string | null } | null>(null);
  /** Dirección del pin actual; `null` mientras se busca. */
  const address = resolved && resolved.point === location ? resolved.address : null;
  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [age, setAge] = useState('');
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [condition, setCondition] = useState('');

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);
  const progress = useRef<SendProgress>({ uploaded: new Set() });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const currentStep = user && step === CHOICE ? 0 : step;

  useEffect(() => {
    if (!location) return;
    let active = true;
    reverseGeocode(location[1], location[0]).then((value) => {
      if (active) setResolved({ point: location, address: value });
    });
    return () => {
      active = false;
    };
  }, [location]);

  // Si cambia algo después de un intento fallido, el siguiente envío crea un borrador nuevo.
  useEffect(() => {
    progress.current = { uploaded: new Set() };
  }, [location, address, photos, description, age, workTypes, condition]);

  // Lleva el foco al título de cada paso para lectores de pantalla y teclado.
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  const goNext = () => {
    const next = reachedReview ? REVIEW : currentStep + 1;
    if (next === REVIEW) setReachedReview(true);
    setStep(next);
  };
  const goBack = () => setStep(Math.max(currentStep - 1, user ? 0 : CHOICE));

  async function handleSend() {
    if (!location) return;
    setSending(true);
    setSendError(null);
    const p = progress.current;

    try {
      if (!p.reportId) {
        const details = [description.trim()];
        if (address) details.push(`Dirección: ${address}`);
        details.push(`Condición: ${condition}`);

        const created = await api.createReport({
          description: details.join('\n'),
          latitude: location[1],
          longitude: location[0],
          children_quantity: 1,
          children_age: age,
          work_type: workTypes.join(', '),
          sighting_time: localDateTime(),
        });
        p.reportId = created.reporte_id;
        p.editToken = created.edit_token;
        p.folio = created.folio;
      }

      if (photos.length > 0 && !p.imageIds) {
        p.imageIds = (await api.registerReportImages(p.reportId, photos, p.editToken)).success;
      }
      for (const [index, photo] of photos.entries()) {
        if (p.uploaded.has(index)) continue;
        await api.uploadReportImage(p.reportId, p.imageIds![index]!, photo, p.editToken);
        p.uploaded.add(index);
      }

      await api.submitReport(p.reportId, p.editToken);
      setFolio(p.folio ?? null);
      progress.current = { uploaded: new Set() };
      setStep(DONE);
    } catch (error) {
      console.error('No se pudo enviar el reporte', error);
      setSendError(
        error instanceof TypeError
          ? 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
          : 'No se pudo enviar el reporte. Inténtalo de nuevo; no se perderá lo que escribiste.',
      );
    } finally {
      setSending(false);
    }
  }

  function restart() {
    setLocation(null);
    setPhotos([]);
    setDescription('');
    setAge('');
    setWorkTypes([]);
    setCondition('');
    setReachedReview(false);
    setStep(user ? 0 : CHOICE);
  }

  if (isLoading) return <div className="rf-page" aria-busy="true" />;

  const childComplete = age !== '' && workTypes.length > 0 && condition !== '';
  const descriptionLength = description.trim().length;

  return (
    <div className="rf-page">
      <header className="rf-topbar">
        <Link to="/inicio" aria-label="Ir al inicio">
          <img src={sipinnaLogo} alt="SIPINNA" className="rf-logo" />
        </Link>
        {currentStep !== DONE && (
          <Link to="/inicio" className="rf-exit">
            Volver al inicio
          </Link>
        )}
      </header>

      <main className="rf-main">
        <section className="rf-card sip-card" data-step={currentStep} aria-labelledby="rf-title">
          {currentStep >= 0 && currentStep < DONE && (
            <StepHeader step={currentStep} onBack={goBack} canGoBack={!sending && (currentStep > 0 || !user)} />
          )}

          {currentStep === CHOICE && (
            <>
              <StepTitle headingRef={headingRef} title="Hacer un reporte">
                Avísanos si viste a una niña, niño o adolescente trabajando. Te tomará unos 3 minutos.
              </StepTitle>
              <div className="rf-choices">
                <button type="button" className="rf-choice" onClick={() => setStep(0)}>
                  <span className="rf-choice-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
                    </svg>
                  </span>
                  <span>
                    <strong>Reportar de forma anónima</strong>
                    <span>No te pedimos nombre ni datos de contacto. No podrás dar seguimiento al reporte.</span>
                  </span>
                </button>
                <Link to="/login?next=/reportar" className="rf-choice">
                  <span className="rf-choice-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                    </svg>
                  </span>
                  <span>
                    <strong>Iniciar sesión</strong>
                    <span>El reporte queda en tu cuenta y puedes consultar su estado.</span>
                  </span>
                </Link>
              </div>
              <p className="rf-muted rf-center">
                ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
              </p>
              <section className="rf-intro-guide" aria-labelledby="rf-intro-guide-title">
                <h2 id="rf-intro-guide-title">Completa tu reporte en 5 pasos</h2>
                <ol className="rf-intro-steps">
                  {[
                    ['Ubicación', 'Marca el lugar en el mapa.'],
                    ['Fotos', 'Agrega imágenes si las tienes; es opcional.'],
                    ['Descripción', 'Cuéntanos qué viste.'],
                    ['Datos aproximados', 'Indica la edad, actividad y compañía.'],
                    ['Revisión', 'Confirma los datos antes de enviar.'],
                  ].map(([title, description], index) => (
                    <li key={title}>
                      <span className="rf-intro-step-number" aria-hidden="true">{index + 1}</span>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {currentStep === 0 && (
            <>
              <StepTitle headingRef={headingRef} title="¿Dónde fue?">
                Busca la dirección, usa tu ubicación o toca el mapa. Puedes arrastrar el pin para ajustarlo.
              </StepTitle>
              <LocationPicker value={location} onChange={setLocation} />
              <p className="rf-address" aria-live="polite">
                {location ? address ?? 'Buscando la dirección…' : 'Aún no has marcado el lugar.'}
              </p>
              <button type="button" className="sip-btn sip-btn--primary sip-btn--block" disabled={!location} onClick={goNext}>
                Confirmar ubicación
              </button>
            </>
          )}

          {currentStep === 1 && (
            <>
              <StepTitle headingRef={headingRef} title="Fotos del lugar">
                Opcional. Una foto ayuda a confirmar el reporte y a atenderlo más rápido. Evita que se vea el
                rostro del niño si no es necesario.
              </StepTitle>
              <PhotoPicker photos={photos} onChange={setPhotos} />
              <button type="button" className="sip-btn sip-btn--primary sip-btn--block" onClick={goNext}>
                {photos.length > 0 ? 'Siguiente' : 'Continuar sin fotos'}
              </button>
            </>
          )}

          {currentStep === 2 && (
            <form
              className="rf-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (descriptionLength >= MIN_DESCRIPTION) goNext();
              }}
            >
              <StepTitle headingRef={headingRef} title="¿Qué pasó?">
                Cuéntanos qué viste: qué estaba haciendo, a qué hora y cualquier detalle que ayude a encontrarlo.
              </StepTitle>
              <label className="rf-label" htmlFor="rf-description">
                Descripción
              </label>
              <textarea
                id="rf-description"
                className="rf-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ej. Vi a un niño de unos 8 años vendiendo dulces entre los coches del semáforo, cerca de las 7 p. m."
                rows={6}
                maxLength={1000}
                aria-describedby="rf-description-hint"
              />
              <p id="rf-description-hint" className="rf-muted rf-hint">
                {descriptionLength < MIN_DESCRIPTION
                  ? `Escribe al menos ${MIN_DESCRIPTION} caracteres.`
                  : `${description.length} / 1000`}
              </p>
              <button type="submit" className="sip-btn sip-btn--primary sip-btn--block" disabled={descriptionLength < MIN_DESCRIPTION}>
                Siguiente
              </button>
            </form>
          )}

          {currentStep === 3 && (
            <>
              <StepTitle headingRef={headingRef} title="Sobre la niña o niño">
                Responde lo que hayas visto; un aproximado está bien.
              </StepTitle>
              <div className="rf-child-fields">
                <SelectQuestion label="¿Qué edad aproximada tiene?" options={AGE_OPTIONS} value={age} onChange={setAge} />
                <ChipGroup
                  label="¿Qué estaba haciendo?"
                  hint="Puedes elegir más de una opción."
                  options={WORK_OPTIONS}
                  selected={workTypes}
                  onToggle={(option) =>
                    setWorkTypes((current) =>
                      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
                    )
                  }
                />
                <SelectQuestion
                  label="¿Con quién estaba?"
                  options={CONDITION_OPTIONS}
                  value={condition}
                  onChange={setCondition}
                />
              </div>
              <button type="button" className="sip-btn sip-btn--primary sip-btn--block" disabled={!childComplete} onClick={goNext}>
                Revisar reporte
              </button>
            </>
          )}

          {currentStep === REVIEW && location && (
            <>
              <StepTitle headingRef={headingRef} title="Revisa tu reporte">
                Confirma que todo esté bien antes de enviarlo.
              </StepTitle>
              <div className="rf-summary">
                <SummaryRow title="Ubicación" onEdit={() => setStep(0)}>
                  {MAPBOX_TOKEN && (
                    <img
                      className="rf-static-map"
                      alt=""
                      src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+9b2247(${location[0]},${location[1]})/${location[0]},${location[1]},15,0/640x220@2x?access_token=${MAPBOX_TOKEN}`}
                    />
                  )}
                  <p>{address ?? `${location[1].toFixed(5)}, ${location[0].toFixed(5)}`}</p>
                </SummaryRow>
                <SummaryRow title="Fotos" onEdit={() => setStep(1)}>
                  {photos.length > 0 ? <PhotoThumbs photos={photos} /> : <p className="rf-muted">Sin fotos</p>}
                </SummaryRow>
                <SummaryRow title="Descripción" onEdit={() => setStep(2)}>
                  <p className="rf-pre">{description.trim()}</p>
                </SummaryRow>
                <SummaryRow title="Niña o niño" onEdit={() => setStep(3)}>
                  <dl className="rf-facts">
                    <dt>Edad</dt>
                    <dd>{age}</dd>
                    <dt>Actividad</dt>
                    <dd>{workTypes.join(', ')}</dd>
                    <dt>Con quién</dt>
                    <dd>{condition}</dd>
                  </dl>
                </SummaryRow>
              </div>
              <p className="rf-muted rf-center">
                {user ? `Se enviará a nombre de ${user.name}.` : 'Se enviará de forma anónima.'}
              </p>
              {sendError && (
                <p className="rf-error" role="alert">
                  {sendError}
                </p>
              )}
              <button type="button" className="sip-btn sip-btn--primary sip-btn--block" disabled={sending} aria-busy={sending} onClick={handleSend}>
                {sending ? 'Enviando…' : sendError ? 'Reintentar envío' : 'Enviar reporte'}
              </button>
            </>
          )}

          {currentStep === DONE && (
            <div className="rf-done">
              <span className="rf-done-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <StepTitle headingRef={headingRef} title="¡Gracias! Recibimos tu reporte">
                El equipo de SIPINNA de la zona lo revisará para dar atención.
              </StepTitle>
              {folio && (
                <div className="rf-folio">
                  <span>Folio</span>
                  <strong>{folio}</strong>
                </div>
              )}
              <p className="rf-muted rf-center">
                {user
                  ? 'Puedes consultar su estado desde tu cuenta.'
                  : 'Guarda este folio: como el reporte es anónimo, es la única forma de referirte a él.'}
              </p>
              <div className="rf-done-actions">
                <Link to="/inicio" className="sip-btn sip-btn--primary sip-btn--block">
                  Volver al inicio
                </Link>
                <button type="button" className="sip-btn sip-btn--secondary sip-btn--block" onClick={restart}>
                  Hacer otro reporte
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="rf-emergency">
          ¿Una niña o niño está en peligro en este momento? <a href="tel:911">Llama al 911</a>
        </p>
      </main>
    </div>
  );
}

/** Barra superior del paso: regresar, nombre del paso y progreso. */
function StepHeader({ step, onBack, canGoBack }: { step: number; onBack: () => void; canGoBack: boolean }) {
  return (
    <div className="rf-step-header">
      <div className="rf-step-row">
        {canGoBack ? (
          <button type="button" className="rf-back" onClick={onBack} aria-label="Paso anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        ) : (
          <span className="rf-back-placeholder" />
        )}
        <span className="rf-step-name">{STEPS[step]}</span>
        <span className="rf-step-count">
          Paso {step + 1} de {STEPS.length}
        </span>
      </div>
      <div
        className="rf-progress"
        role="progressbar"
        aria-label="Avance del reporte"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
      >
        {STEPS.map((name, index) => (
          <span key={name} className={index <= step ? 'is-done' : undefined} />
        ))}
      </div>
    </div>
  );
}

function StepTitle({
  title,
  children,
  headingRef,
}: {
  title: string;
  children: ReactNode;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="rf-title">
      <h1 id="rf-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p>{children}</p>
    </div>
  );
}

/** Mapa con buscador, botón de "mi ubicación" y un pin que se mueve con clic o arrastrándolo. */
function LocationPicker({ value, onChange }: { value: LngLat | null; onChange: (value: LngLat) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new mapboxgl.Map({
      accessToken: MAPBOX_TOKEN,
      container: containerRef.current,
      center: value ?? DEFAULT_CENTER,
      zoom: value ? 16 : 11,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (event) => onChangeRef.current([event.lngLat.lng, event.lngLat.lat]));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo al montar: después el pin se mueve sin recrear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#007e87', draggable: true })
        .setLngLat(value)
        .addTo(map)
        .on('dragend', () => {
          const { lng, lat } = markerRef.current!.getLngLat();
          onChangeRef.current([lng, lat]);
        });
    } else {
      markerRef.current.setLngLat(value);
    }
  }, [value]);

  function moveTo(point: LngLat) {
    onChange(point);
    mapRef.current?.flyTo({ center: point, zoom: 16 });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setStatus('Buscando…');
    const point = await forwardGeocode(query, value ?? DEFAULT_CENTER);
    if (point) {
      setStatus(null);
      moveTo(point);
    } else {
      setStatus('No encontramos esa dirección. Prueba con calle y municipio, o toca el mapa.');
    }
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      setStatus('Tu navegador no permite obtener la ubicación.');
      return;
    }
    setLocating(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        moveTo([coords.longitude, coords.latitude]);
      },
      () => {
        setLocating(false);
        setStatus('No pudimos obtener tu ubicación. Busca la dirección o toca el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="rf-location">
      <form className="rf-search" role="search" onSubmit={handleSearch}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Calle, colonia o municipio"
          aria-label="Buscar dirección"
        />
        <button type="submit">Buscar</button>
      </form>
      <div className="rf-map">
        <div ref={containerRef} className="rf-map-canvas" />
        <button type="button" className="rf-locate" onClick={handleLocate} disabled={locating}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {locating ? 'Ubicando…' : 'Usar mi ubicación'}
        </button>
      </div>
      {status && (
        <p className="rf-muted rf-hint" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

/** Elegir fotos existentes o tomar una con la cámara (en celular). */
function PhotoPicker({ photos, onChange }: { photos: File[]; onChange: (photos: File[]) => void }) {
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    const valid = files.filter((file) => file.type.startsWith('image/') && file.size <= MAX_PHOTO_BYTES);
    const room = MAX_PHOTOS - photos.length;
    setError(
      valid.length < files.length
        ? 'Algunas fotos no se agregaron: deben ser imágenes de máximo 10 MB.'
        : valid.length > room
          ? `Puedes agregar hasta ${MAX_PHOTOS} fotos.`
          : null,
    );
    onChange([...photos, ...valid.slice(0, room)]);
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <div className="rf-photos">
      <div className="rf-photo-actions">
        <label className={`rf-upload${full ? ' is-disabled' : ''}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={full}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="9" cy="10" r="2" />
            <path d="m21 16-5-5-9 9" />
          </svg>
          Elegir fotos
        </label>
        <label className={`rf-upload${full ? ' is-disabled' : ''}`}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={full}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Tomar foto
        </label>
      </div>
      {photos.length > 0 && (
        <PhotoThumbs photos={photos} onRemove={(index) => onChange(photos.filter((_, i) => i !== index))} />
      )}
      <p className="rf-muted rf-hint" role={error ? 'alert' : undefined}>
        {error ?? `${photos.length} de ${MAX_PHOTOS} fotos`}
      </p>
    </div>
  );
}

// ponytail: las URLs no se revocan; son a lo más 5 fotos por reporte y se liberan al salir de la página.
const previewUrls = new WeakMap<File, string>();
function previewUrl(file: File) {
  let url = previewUrls.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    previewUrls.set(file, url);
  }
  return url;
}

function PhotoThumbs({ photos, onRemove }: { photos: File[]; onRemove?: (index: number) => void }) {
  const urls = photos.map(previewUrl);

  return (
    <ul className="rf-thumbs">
      {urls.map((url, index) => (
        <li key={url}>
          <img src={url} alt={`Foto ${index + 1}`} />
          {onRemove && (
            <button type="button" onClick={() => onRemove(index)} aria-label={`Quitar foto ${index + 1}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function SelectQuestion({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rf-question rf-select-question">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled>Selecciona una opción</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ChipGroup({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <fieldset className="rf-question">
      <legend>{label}</legend>
      {hint && <p className="rf-muted rf-hint">{hint}</p>}
      <div className="rf-chips">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="rf-chip"
            aria-pressed={selected.includes(option)}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SummaryRow({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rf-summary-row">
      <div className="rf-summary-head">
        <h2>{title}</h2>
        <button type="button" onClick={onEdit}>
          Editar
        </button>
      </div>
      {children}
    </section>
  );
}

export default NewReport;
