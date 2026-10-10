import type { MouseEvent } from 'react';
import { useAddress } from '../lib/geocoding';

type ReportAddressProps = {
  latitude: number;
  longitude: number;
  /** Texto mientras llega la dirección o si no se pudo obtener. */
  fallback: string;
  className?: string;
};

/** Enlace universal de Google Maps (no requiere API key); abre la app en móvil. */
const googleMapsUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

/** Evita que el clic en el enlace active también al contenedor (p. ej. el zoom del panel). */
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

type ReportMapLinkProps = {
  latitude: number;
  longitude: number;
  className?: string;
};

/** Enlace compacto "Ver mapa" que abre la ubicación del reporte en Google Maps. */
export function ReportMapLink({ latitude, longitude, className }: ReportMapLinkProps) {
  return (
    <a
      className={`report-address${className ? ` ${className}` : ''}`}
      href={googleMapsUrl(latitude, longitude)}
      target="_blank"
      rel="noreferrer"
      title="Abrir en Google Maps"
      onClick={stopPropagation}
    >
      Ver mapa
    </a>
  );
}

/**
 * Muestra la calle, colonia y municipio del reporte en lugar de sus coordenadas,
 * como enlace que abre la ubicación en Google Maps.
 */
export function ReportAddress({ latitude, longitude, fallback, className }: ReportAddressProps) {
  const address = useAddress(latitude, longitude);
  const text = address ?? fallback;

  return (
    <a
      className={`report-address${className ? ` ${className}` : ''}`}
      href={googleMapsUrl(latitude, longitude)}
      target="_blank"
      rel="noreferrer"
      title={`${address ? `${address} (${fallback})` : fallback}. Abrir en Google Maps`}
      onClick={stopPropagation}
    >
      {text}
    </a>
  );
}
