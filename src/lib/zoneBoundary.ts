// Contornos del Marco Geoestadístico de INEGI. zonas.municipio no guarda la clave INEGI,
// así que se busca por nombre en el catálogo de municipios del Estado de México (15).
const INEGI_BASE_URL = 'https://gaia.inegi.org.mx/wscatgeo/v2';
const STATE_CODE = '15';

type Position = [number, number];
type Ring = Position[];

export type Boundary = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
};
export type Bounds = [Position, Position];

type CatalogEntry = { cvegeo: string; nomgeo: string };

// Sin acentos ni mayúsculas: "Atizapán" y "ATIZAPAN" deben coincidir.
const normalize = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

let catalogPromise: Promise<CatalogEntry[]> | null = null;
const boundaryCache = new Map<string, Promise<Boundary | null>>();

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${INEGI_BASE_URL}${path}`, { signal });
  if (!response.ok) throw new Error(`INEGI respondió ${response.status}`);
  return response.json() as Promise<T>;
}

function getCatalog() {
  // Sin signal: el catálogo se comparte entre llamadas y no debe cancelarse con una de ellas.
  catalogPromise ??= fetchJson<{ datos: CatalogEntry[] }>(`/mgem/${STATE_CODE}`)
    .then((data) => data.datos)
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

// Coincidencia exacta primero; si no, prefijo en cualquier sentido
// ("Valle de Chalco" ↔ "Valle de Chalco Solidaridad").
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

// Sin municipio devuelve el contorno de todo el estado. null si el municipio no está en INEGI.
export async function getBoundary(municipio?: string): Promise<Boundary | null> {
  if (!municipio) return fetchBoundary(`/geo/mgee/${STATE_CODE}`);

  const cvegeo = findCvegeo(await getCatalog(), municipio);
  return cvegeo ? fetchBoundary(`/geo/mgem/${cvegeo}`) : null;
}

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
    // El anillo exterior basta para la caja.
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
