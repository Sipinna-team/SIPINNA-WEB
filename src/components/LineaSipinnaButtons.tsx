import './LineaSipinnaButtons.css';

// Número de LineaSipinna (el asistente de Twilio)
const PHONE: string = import.meta.env.VITE_LINEA_SIPINNA_PHONE?.trim() || '+17402848974';
const WHATSAPP: string = import.meta.env.VITE_LINEA_SIPINNA_WHATSAPP?.trim() || '+52 55 6965 6769';

// Mensaje con el que se abre el chat de WhatsApp
const WHATSAPP_GREETING = 'Hola LineaSipinna, quiero hacer un reporte.';

// wa.me pide el número sin "+"
const whatsappHref = `https://wa.me/${WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(WHATSAPP_GREETING)}`;
const phoneHref = `tel:${PHONE.replace(/[^\d+]/g, '')}`;

/** Botones flotantes para contactar a LineaSipinna por WhatsApp o llamada. */
export default function LineaSipinnaButtons() {
  return (
    <nav className="linea-sipinna" aria-label="Contactar a LineaSipinna">
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="linea-sipinna__item"
        aria-label="Escribir a LineaSipinna por WhatsApp"
      >
        <span className="linea-sipinna__label">WhatsApp</span>
        <span className="linea-sipinna__fab linea-sipinna__fab--whatsapp">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
          </svg>
        </span>
      </a>
      <a href={phoneHref} className="linea-sipinna__item" aria-label="Llamar a LineaSipinna">
        <span className="linea-sipinna__label">Llamar</span>
        <span className="linea-sipinna__fab linea-sipinna__fab--call">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
          </svg>
        </span>
      </a>
    </nav>
  );
}
