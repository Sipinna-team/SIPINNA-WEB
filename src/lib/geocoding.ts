import { useEffect, useState } from 'react';

// Geocodificación inversa con Mapbox convierte coordenadas en calle, colonia y municipio.
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

    // Sin signal: la promesa se comparte entre componentes y no debe cancelarse con uno de ellos.
    request = fetch(`${GEOCODING_URL}?${params}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Mapbox respondió ${response.status}`);
        return response.json() as Promise<GeocodingResponse>;
      })
      .then(formatAddress)
      .catch((error) => {
        // Se olvida el fallo para reintentar la próxima vez que se pida.
        addressCache.delete(key);
        console.error('No se pudo obtener la dirección', error);
        return null;
      });
    addressCache.set(key, request);
  }

  return request;
}

// Dirección legible del punto, o null mientras carga o si no se encontró.
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

  // Evita mostrar la dirección del punto anterior mientras llega la nueva.
  return address?.key === key ? address.value : null;
}
