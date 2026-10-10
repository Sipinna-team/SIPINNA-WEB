import { useEffect, useState } from 'react';

/**
 * @file Geocodificación inversa con Mapbox: convierte coordenadas en calle, colonia y municipio.
 */

const GEOCODING_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';
const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAP_BOX_TOKEN;

type ContextEntry = { name?: string; address_number?: string; street_name?: string };
type GeocodingResponse = {
  features?: {
    properties?: {
      full_address?: string;
      name?: string;
      context?: Partial<Record<'address' | 'street' | 'neighborhood' | 'locality' | 'place', ContextEntry>>;
    };
  }[];
};

const addressCache = new Map<string, Promise<string | null>>();

/**
 * Arma "calle, colonia, municipio" a partir de la respuesta de Mapbox.
 * @returns La dirección, `full_address` si no hay partes, o `null` sin resultados.
 */
function formatAddress(data: GeocodingResponse): string | null {
  const properties = data.features?.[0]?.properties;
  if (!properties) return null;

  const context = properties.context ?? {};
  const parts = [
    context.address?.name ?? context.street?.name ?? properties.name,
    context.neighborhood?.name ?? context.locality?.name,
    context.place?.name,
  ].filter((part): part is string => Boolean(part));

  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(', ') : properties.full_address ?? null;
}

/**
 * Obtiene la dirección legible de un punto. Las peticiones se cachean por
 * coordenada (5 decimales) y se comparten entre componentes, por eso no aceptan `signal`.
 * Un fallo se saca de la caché para reintentar la próxima vez.
 * @param latitude - Latitud.
 * @param longitude - Longitud.
 * @returns La dirección, o `null` si no hay token de Mapbox, no se encontró o falló.
 */
export function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return Promise.resolve(null);

  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  let request = addressCache.get(key);

  if (!request) {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      language: 'es',
      limit: '1',
      access_token: MAPBOX_TOKEN,
    });

    request = fetch(`${GEOCODING_URL}?${params}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Mapbox respondió ${response.status}`);
        return response.json() as Promise<GeocodingResponse>;
      })
      .then(formatAddress)
      .catch((error) => {
        addressCache.delete(key);
        console.error('No se pudo obtener la dirección', error);
        return null;
      });
    addressCache.set(key, request);
  }

  return request;
}

/**
 * Hook de React con la dirección legible del punto. Nunca devuelve la dirección del punto
 * anterior mientras llega la nueva.
 * @returns La dirección, o `null` mientras carga o si no se encontró.
 */
export function useAddress(latitude: number, longitude: number) {
  const [address, setAddress] = useState<{ key: string; value: string | null } | null>(null);
  const key = `${latitude},${longitude}`;

  useEffect(() => {
    let active = true;
    reverseGeocode(latitude, longitude).then((value) => {
      if (active) setAddress({ key, value });
    });
    return () => {
      active = false;
    };
  }, [key, latitude, longitude]);

  return address?.key === key ? address.value : null;
}
