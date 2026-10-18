import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as mapboxgl from 'mapbox-gl/esm';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../context/auth';
import { api } from '../lib/api';
import { AGE_OPTIONS, RISK_OPTIONS, WORK_OPTIONS } from '../lib/dashboardStats';
import { forwardGeocode, reverseGeocode } from '../lib/geocoding';
import PublicReportLayout from '../components/PublicReportLayout';
import ReportExitGuard from '../components/ReportExitGuard';

const QUANTITY_OPTIONS = ['1', '2', '3', '4', '5 o más', 'No sé'];
const YES_NO = ['Sí', 'No'];
const RISK_LABELS = RISK_OPTIONS.map((option) => option.label);
const WHEN_OPTIONS = ['Ahora mismo', 'En otro momento'];

const STEPS = ['Ubicación', 'Lo que viste', 'Descripción', 'Foto', 'Revisión'];
const CHOICE = -1;
const REVIEW = 4;
const DONE = 5;

const MIN_DESCRIPTION = 10;
const MAX_PHOTOS = 2;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAP_BOX_TOKEN;
/** Centro del Valle de México, igual que el mapa del dashboard. */
const DEFAULT_CENTER: [number, number] = [-99.2734, 19.5645];

type LngLat = [number, number];

/** Hora local en el formato que guarda el backend: `"YYYY-MM-DDTHH:mm"`. */
function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** `'5 o más'` → 5, `'No sé'` → `null`. */
function quantityValue(option: string) {
  if (option === 'No sé') return null;
  return option === '5 o más' ? 5 : Number(option);
}

/** Avance guardado para reintentar el envío. */
type SendProgress = {
  reportId?: string;
  editToken?: string;
  folio?: string;
  accessKey?: string;
  imageIds?: string[];
  uploaded: Set<number>;
};

/** Reporte ciudadano con o sin sesión y seguimiento opcional por correo. */
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
  const [danger, setDanger] = useState('');
  const [quantity, setQuantity] = useState('');
  const [risk, setRisk] = useState('');
  const [when, setWhen] = useState('');
  const [sightingAt, setSightingAt] = useState('');
  const [reference, setReference] = useState('');

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState<string | null>(null);
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

  // Los cambios invalidan el borrador del intento anterior.
  useEffect(() => {
    progress.current = { uploaded: new Set() };
  }, [location, photos, description, age, workTypes, danger, quantity, risk, when, sightingAt, reference, user]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest('.rf-card')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
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
        const created = await api.createReport({
          description: description.trim(),
          latitude: location[1],
          longitude: location[0],
          children_quantity: quantityValue(quantity),
          children_age: age,
          work_type: workTypes.join(', '),
          sighting_time: when === 'Ahora mismo' ? localDateTime() : sightingAt,
          risk: RISK_OPTIONS.find((option) => option.label === risk)!.value,
          immediate_danger: danger === 'Sí',
          reference: reference.trim(),
        });
        p.reportId = created.reporte_id;
        p.editToken = created.edit_token;
        p.folio = created.folio;
        p.accessKey = created.clave_consulta;
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
      setAccessKey(p.accessKey ?? null);
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
    setDanger('');
    setQuantity('');
    setRisk('');
    setWhen('');
    setSightingAt('');
    setReference('');
    setFolio(null);
    setAccessKey(null);
    setSendError(null);
    progress.current = { uploaded: new Set() };
    setReachedReview(false);
    setStep(user ? 0 : CHOICE);
  }

  if (isLoading) return <div className="rf-page" aria-busy="true" />;

  const observedComplete =
    danger !== '' &&
    quantity !== '' &&
    age !== '' &&
    workTypes.length > 0 &&
    risk !== '' &&
    (when === 'Ahora mismo' || (when === 'En otro momento' && sightingAt !== ''));
  const descriptionLength = description.trim().length;
  const hasProgress = currentStep !== DONE && (location !== null || description !== '' || photos.length > 0 || danger !== '' || reference !== '');

  return (
    <PublicReportLayout showExit={currentStep !== DONE}>
      <ReportExitGuard active={hasProgress || sending} sending={sending} />
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
              <button
                type="button"
                className="rf-choice"
                onClick={() => setStep(0)}
              >
                <span className="rf-choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
                  </svg>
                </span>
                <span>
                  <strong>Reporte anónimo</strong>
                  <span>No te pedimos nombre, teléfono ni correo. Al final te damos un folio y una clave para consultar el avance.</span>
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
                  <span>Si ya tienes cuenta, el reporte queda guardado en ella.</span>
                </span>
              </Link>
            </div>
            <p className="rf-muted rf-center">
              <Link to="/mis-reportes">Ver mis reportes</Link> o <Link to="/consultar-folio">consultar con folio y clave</Link>
            </p>
            <section className="rf-intro-guide" aria-labelledby="rf-intro-guide-title">
              <h2 id="rf-intro-guide-title">Completa tu reporte en 5 pasos</h2>
              <ol className="rf-intro-steps">
                {[
                  ['Ubicación', 'Marca el lugar en el mapa.'],
                  ['Lo que viste', 'Cuántos eran, edad aproximada y qué hacían.'],
                  ['Descripción', 'Cuéntanos brevemente qué observaste.'],
                  ['Foto', 'Opcional, de preferencia del lugar.'],
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
            <label className="rf-label" htmlFor="rf-reference">
              Calle o punto de referencia (opcional)
            </label>
            <input
              id="rf-reference"
              className="rf-input"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ej. Semáforo frente a la tienda, esquina con Av. Juárez"
              maxLength={300}
            />
            <button type="button" className="sip-btn sip-btn--primary sip-btn--block" disabled={!location} onClick={goNext}>
              Confirmar ubicación
            </button>
          </>
        )}

        {currentStep === 1 && (
          <>
            <StepTitle headingRef={headingRef} title="¿Qué viste?">
              Un aproximado está bien. Tú solo cuéntanos lo que observaste; la autoridad lo analiza.
            </StepTitle>
            <div className="rf-child-fields">
              <ChipGroup
                label="¿La niña, niño o adolescente se encuentra en peligro inmediato?"
                options={YES_NO}
                selected={[danger]}
                onToggle={setDanger}
              />
              {danger === 'Sí' && (
                <div className="rf-alert" role="alert">
                  <strong>
                    Llama ahora al <a href="tel:911">911</a>.
                  </strong>
                  <p>
                    Este formulario no sustituye a los servicios de emergencia ni a los mecanismos formales de
                    denuncia. Puedes continuar el reporte: se atenderá con prioridad alta.
                  </p>
                </div>
              )}
              <ChipGroup
                label="¿Cuántas niñas, niños o adolescentes observaste?"
                options={QUANTITY_OPTIONS}
                selected={[quantity]}
                onToggle={setQuantity}
              />
              <ChipGroup label="Edad aproximada" options={AGE_OPTIONS} selected={[age]} onToggle={setAge} />
              <ChipGroup
                label="¿Qué estaban haciendo?"
                hint="Puedes elegir más de una opción."
                options={WORK_OPTIONS}
                selected={workTypes}
                onToggle={(option) =>
                  setWorkTypes((current) =>
                    current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
                  )
                }
              />
              <ChipGroup
                label="¿Observaste alguna situación de riesgo?"
                options={RISK_LABELS}
                selected={[risk]}
                onToggle={setRisk}
              />
              <ChipGroup label="¿Cuándo lo viste?" options={WHEN_OPTIONS} selected={[when]} onToggle={setWhen} />
              {when === 'En otro momento' && (
                <label className="rf-question">
                  <span className="rf-label">Fecha y hora aproximada</span>
                  <input
                    type="datetime-local"
                    className="rf-input"
                    value={sightingAt}
                    max={localDateTime()}
                    onChange={(event) => setSightingAt(event.target.value)}
                  />
                </label>
              )}
            </div>
            <button type="button" className="sip-btn sip-btn--primary sip-btn--block" disabled={!observedComplete} onClick={goNext}>
              Siguiente
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
            <StepTitle headingRef={headingRef} title="Cuéntanos brevemente qué observaste">
              Cualquier detalle que ayude a encontrar a la niña, niño o adolescente.
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
            <StepTitle headingRef={headingRef} title="Foto o evidencia">
              Opcional. De preferencia toma la foto del lugar o sitio donde viste a la niña, niño o adolescente,
              para facilitar a las autoridades su localización.
            </StepTitle>
            <p className="rf-notice">
              Evita tomar fotografías que pongan en riesgo a niñas, niños o adolescentes. No confrontes a las
              personas involucradas ni te expongas para obtener evidencia.
            </p>
            <PhotoPicker photos={photos} onChange={setPhotos} />
            <button type="button" className="sip-btn sip-btn--primary sip-btn--block" onClick={goNext}>
              {photos.length > 0 ? 'Revisar reporte' : 'Continuar sin foto'}
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
                {reference.trim() && <p className="rf-muted">Referencia: {reference.trim()}</p>}
              </SummaryRow>
              <SummaryRow title="Lo que viste" onEdit={() => setStep(1)}>
                <dl className="rf-facts">
                  <dt>Peligro inmediato</dt>
                  <dd>{danger}</dd>
                  <dt>Cuántos</dt>
                  <dd>{quantity}</dd>
                  <dt>Edad</dt>
                  <dd>{age}</dd>
                  <dt>Actividad</dt>
                  <dd>{workTypes.join(', ')}</dd>
                  <dt>Riesgo</dt>
                  <dd>{risk}</dd>
                  <dt>Cuándo</dt>
                  <dd>{when === 'Ahora mismo' ? 'Ahora mismo' : sightingAt.replace('T', ' ')}</dd>
                </dl>
              </SummaryRow>
              <SummaryRow title="Descripción" onEdit={() => setStep(2)}>
                <p className="rf-pre">{description.trim()}</p>
              </SummaryRow>
              <SummaryRow title="Foto" onEdit={() => setStep(3)}>
                {photos.length > 0 ? <PhotoThumbs photos={photos} /> : <p className="rf-muted">Sin foto</p>}
              </SummaryRow>
            </div>
            <p className="rf-muted rf-center">
              {user ? `Se enviará a nombre de ${user.name}.` : 'Se enviará de forma anónima.'}{' '}
              Consulta el <Link to="/aviso-privacidad">aviso de privacidad</Link>.
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
            <StepTitle headingRef={headingRef} title="¡Gracias por ayudar a proteger los derechos de niñas, niños y adolescentes!">
              Tu reporte fue recibido correctamente.
            </StepTitle>
            {folio && (
              <div className="rf-folio">
                <span>Folio</span>
                <strong>{folio}</strong>
              </div>
            )}
            {accessKey && (
              <div className="rf-folio">
                <span>Clave de consulta</span>
                <strong className="rf-key">{accessKey}</strong>
              </div>
            )}
            <p className="rf-muted rf-center">
              Guarda el folio y la clave: con ellos consultas el avance de tu reporte.{' '}
              {user ? <Link to="/mis-reportes">Ver mis reportes</Link> : folio && accessKey && (
                <Link to={`/consultar-folio?folio=${encodeURIComponent(folio)}&clave=${encodeURIComponent(accessKey)}`}>
                  Consultar avance
                </Link>
              )}
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
        ¿Una niña o niño está en peligro en este momento? <a href="tel:911">Llama al 911</a>. Este formulario no
        sustituye a los servicios de emergencia ni a los mecanismos formales de denuncia.
      </p>
    </PublicReportLayout>
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

/** Selector de ubicación con búsqueda y pin móvil. */
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
    if (!list?.length) return;
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
      <p id="rf-photo-help" className="rf-muted rf-hint">
        Toma una foto o elige de tu galería. Máximo {MAX_PHOTOS} fotos, de 10 MB cada una.
      </p>
      <div className="rf-photo-actions">
        <label className={`rf-upload${full ? ' is-disabled' : ''}`}>
          <input
            type="file"
            accept="image/*"
            aria-label="Elegir fotos de la galería"
            aria-describedby="rf-photo-help"
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
            aria-label="Tomar foto con la cámara"
            aria-describedby="rf-photo-help"
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
        <PhotoThumbs photos={photos} onRemove={(index) => {
          setError(null);
          onChange(photos.filter((_, i) => i !== index));
        }} />
      )}
      <p className="rf-muted rf-hint" role="status">
        {photos.length} de {MAX_PHOTOS} fotos
      </p>
      {error && <p className="rf-error" role="alert">{error}</p>}
    </div>
  );
}

function PhotoThumbs({ photos, onRemove }: { photos: File[]; onRemove?: (index: number) => void }) {
  return (
    <ul className="rf-thumbs">
      {photos.map((file, index) => (
        <PhotoThumbnail
          key={`${file.name}-${file.lastModified}-${index}`}
          file={file}
          index={index}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

function PhotoThumbnail({ file, index, onRemove }: { file: File; index: number; onRemove?: (index: number) => void }) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <li>
      <img ref={imageRef} alt={`Foto ${index + 1}`} />
      {onRemove && (
        <button type="button" onClick={() => onRemove(index)} aria-label={`Quitar foto ${index + 1}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </li>
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
