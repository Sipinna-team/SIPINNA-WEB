import PublicReportLayout from '../components/PublicReportLayout';

/** Aviso de privacidad para reportes ciudadanos. */
function PrivacyNotice() {
  return (
    <PublicReportLayout variant="reading" exitTo="/reportar" exitLabel="Hacer un reporte">
      <article className="rf-card sip-card rf-legal" aria-labelledby="privacy-title">
        <div className="rf-title">
          <h1 id="privacy-title">Aviso de privacidad simplificado</h1>
          <p>Sistema RIETI de reporte, geolocalización y seguimiento de posibles casos de trabajo infantil.</p>
        </div>

        <h2>¿Qué datos recabamos?</h2>
        <p>
          La ubicación del lugar, la fecha y hora, la actividad observada, la cantidad y edad aproximada de las niñas,
          niños o adolescentes, si existe riesgo, tu descripción y, si decides agregarla, una fotografía. No pedimos
          tu nombre ni teléfono. Si eliges el reporte con seguimiento, solo pedimos un correo electrónico.
        </p>

        <h2>¿Para qué los usamos?</h2>
        <p>
          Para que la autoridad municipal competente verifique la situación, canalice y dé atención; para enviarte el
          folio si nos diste un correo, y para generar estadísticas y mapas anonimizados que orienten acciones de
          prevención.
        </p>

        <h2>¿Con quién se comparten?</h2>
        <p>
          Solo con las autoridades e instituciones que intervienen en la verificación, canalización y atención del
          caso. Las fotografías y datos de los reportes nunca se publican en mapas ni tableros públicos.
        </p>

        <h2>¿Cómo los protegemos?</h2>
        <p>
          Cada municipio solo accede a los reportes que le corresponden, se registra quién consulta o modifica la
          información, y tu correo se borra al cerrar el reporte. Al consultar tu folio solo verás el estado general.
        </p>

        <h2>Tus derechos</h2>
        <p>
          Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición ante la unidad de
          transparencia del municipio que atiende tu reporte.
        </p>
      </article>
    </PublicReportLayout>
  );
}

export default PrivacyNotice;
