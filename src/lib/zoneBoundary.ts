/**
 * @file Contornos del Marco Geoestadístico de INEGI. `zonas.municipio` no guarda la clave INEGI,
 * así que se busca por nombre en el catálogo de municipios del Estado de México (15).
 */
const INEGI_BASE_URL = 'https://gaia.inegi.org.mx/wscatgeo/v2';
const STATE_CODE = '15';

type Position = [number, number];
type Ring = Position[];

/** Contorno GeoJSON de un estado o municipio. */
export type Boundary = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
};
/** Caja `[[minLng, minLat], [maxLng, maxLat]]`. */
export type Bounds = [Position, Position];

type CatalogEntry = { cvegeo: string; nomgeo: string };

/** Quita acentos y mayúsculas: "Atizapán" y "ATIZAPAN" deben coincidir. */
const normalize = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

let catalogPromise: Promise<CatalogEntry[]> | null = null;
const boundaryCache = new Map<string, Promise<Boundary | null>>();

/**
 * GET a la API de INEGI.
 * @throws {Error} Si la respuesta no es 2xx.
 */
async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${INEGI_BASE_URL}${path}`, { signal });
  if (!response.ok) throw new Error(`INEGI respondió ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Catálogo de municipios del estado, descargado una sola vez (se reintenta si falla).
 * No recibe `signal`: la promesa se comparte entre llamadas y no debe cancelarse con una de ellas.
 */
function getCatalog() {
  catalogPromise ??= fetchJson<{ datos: CatalogEntry[] }>(`/mgem/${STATE_CODE}`)
    .then((data) => data.datos)
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

/**
 * Busca la clave INEGI de un municipio por nombre. Coincidencia exacta primero; si no,
 * prefijo en cualquier sentido ("Valle de Chalco" ↔ "Valle de Chalco Solidaridad").
 * @returns La clave `cvegeo`, o `null` si no hay coincidencia.
 */
function findCvegeo(catalog: CatalogEntry[], municipio: string) {
  const target = normalize(municipio);
  if (!target) return null;

  const exact = catalog.find((entry) => normalize(entry.nomgeo) === target);
  if (exact) return exact.cvegeo;

  const partial = catalog.find((entry) => {
    const name = normalize(entry.nomgeo);
    return name.startsWith(target) || target.startsWith(name);
  });
  return partial?.cvegeo ?? null;
}

/** Descarga (y cachea por ruta) el primer contorno de una ruta de INEGI. */
function fetchBoundary(path: string) {
  let promise = boundaryCache.get(path);
  if (!promise) {
    promise = fetchJson<{ features?: Boundary[] }>(path)
      .then((data) => data.features?.[0] ?? null)
      .catch((error) => {
        boundaryCache.delete(path);
        throw error;
      });
    boundaryCache.set(path, promise);
  }
  return promise;
}

/**
 * Obtiene el contorno de un municipio del Estado de México.
 * @param municipio - Nombre del municipio; sin él devuelve el contorno de todo el estado.
 * @returns El contorno, o `null` si el municipio no está en INEGI.
 */
export async function getBoundary(municipio?: string): Promise<Boundary | null> {
  if (!municipio) return fetchBoundary(`/geo/mgee/${STATE_CODE}`);

  const cvegeo = findCvegeo(await getCatalog(), municipio);
  return cvegeo ? fetchBoundary(`/geo/mgem/${cvegeo}`) : null;
}

/**
 * Calcula la caja que envuelve un contorno, para centrar el mapa. Basta con el anillo exterior de cada polígono.
 * @param boundary - Contorno de {@link getBoundary}.
 */
export function boundaryBounds(boundary: Boundary): Bounds {
  const polygons =
    boundary.geometry.type === 'Polygon'
      ? [boundary.geometry.coordinates]
      : boundary.geometry.coordinates;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0]) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
