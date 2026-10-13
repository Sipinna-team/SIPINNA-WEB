import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as mapboxgl from 'mapbox-gl/esm'
import 'mapbox-gl/dist/mapbox-gl.css'
import './InteractiveMap.css'
import { useAuth } from '../context/auth'
import { api } from '../lib/api'
import type { Case, Report, ReportDetail, Zone } from '../lib/api'
import { STATES, normalizeState, stateLabel } from '../lib/dashboardStats'
import { boundaryBounds, getBoundary } from '../lib/zoneBoundary'
import { ReportAddress } from '../components/ReportAddress'

type CoordinatePair = [number, number]

type MapContainerProps = {
  reports: Report[]
  selectedReport: Report | null
  onSelectReport: (folio: string | null) => void
  /** `null` = todo el estado; `undefined` = las zonas aún no cargan. */
  zone: Zone | null | undefined
  zoneControl: ReactNode
}

type StatusFormProps = {
  report: Report
  onUpdated: (folio: string, estado: string, stateChangedAt: string) => void
}

type CaseFormProps = {
  report: Report
  cases: Case[]
  onCaseChanged: (folio: string, caseId: string | null, caseName: string | null) => void
  onCaseCreated: (newCase: Case) => void
}

type ReportDetailsProps = StatusFormProps &
  Omit<CaseFormProps, 'report'> & {
    onDeleted: (folio: string) => void
  }

type SidePanelProps = {
  reports: Report[]
  selectedReportId: string | null
  loading: boolean
  error: string | null
  onSelectReport: (folio: string) => void
  onStatusUpdated: StatusFormProps['onUpdated']
  onDeleted: ReportDetailsProps['onDeleted']
  cases: Case[]
  onCaseChanged: CaseFormProps['onCaseChanged']
  onCaseCreated: CaseFormProps['onCaseCreated']
  onSearch: (folio: string) => Promise<void>
}

const INITIAL_CENTER: CoordinatePair = [-99.2734, 19.5645]
const INITIAL_ZOOM = 12.5
const REPORTS_SOURCE_ID = 'reports'
const REPORTS_HEATMAP_LAYER_ID = 'report-heat-zones'
const REPORTS_POINT_LAYER_ID = 'report-points'
const ZONE_SOURCE_ID = 'zone-boundary'
const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] }
const REPORT_COLOR = '#9b2247'
const SELECTED_REPORT_COLOR = '#a57f2c'
/** Color de los reportes que ya están en un caso, para distinguirlos de los pendientes de agrupar. */
const CASE_REPORT_COLOR = '#1e5b4f'

/** Nombre de la zona para el selector, con el municipio si es distinto. */
function zoneLabel(zone: Zone) {
  return zone.municipio && zone.municipio !== zone.name
    ? `${zone.municipio} (${zone.name})`
    : zone.name
}

/** Convierte los reportes en una FeatureCollection de puntos para Mapbox (GeoJSON pone la longitud primero). */
function reportsToGeoJSON(reports: Report[]) {
  return {
    type: 'FeatureCollection' as const,
    features: reports.map((report) => ({
      type: 'Feature' as const,
      id: report.folio,
      properties: {
        folio: report.folio,
        description: report.description,
        suspiciousLevel: report.suspicius_level,
        inCase: Boolean(report.case_id),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [report.longitude, report.latitude] as CoordinatePair,
      },
    })),
  }
}

/**
 * Mapa de Mapbox con mapa de calor y puntos de reportes, y el contorno de la zona seleccionada.
 * @remarks El contorno de la zona (o del estado) va debajo de los reportes y el mapa se encuadra en él.
 */
function MapContainer({
  reports,
  selectedReport,
  onSelectReport,
  zone,
  zoneControl,
}: MapContainerProps) {
  const [center, setCenter] = useState<CoordinatePair>(INITIAL_CENTER)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [mapLoaded, setMapLoaded] = useState(false)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const onSelectReportRef = useRef(onSelectReport)
  /** Regresa al encuadre de la zona, el que tenía el mapa antes de abrir un reporte. */
  const flyHomeRef = useRef<() => void>(() => mapRef.current?.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM }))

  useEffect(() => {
    onSelectReportRef.current = onSelectReport
  }, [onSelectReport])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new mapboxgl.Map({
      accessToken: import.meta.env.VITE_MAP_BOX_TOKEN,
      container: mapContainerRef.current,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
    })

    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    const resetControl = document.createElement('div')
    resetControl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'
    resetControl.innerHTML = `<button type="button" class="map-reset-button" aria-label="Restablecer vista" title="Restablecer vista">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5" /></svg>
    </button>`
    resetControl.querySelector('button')!.addEventListener('click', () => {
      onSelectReportRef.current(null)
      flyHomeRef.current()
    })
    map.addControl({ onAdd: () => resetControl, onRemove: () => resetControl.remove() }, 'top-right')

    map.on('load', () => {
      map.addSource(ZONE_SOURCE_ID, { type: 'geojson', data: EMPTY_COLLECTION })
      map.addLayer({
        id: 'zone-boundary-fill',
        type: 'fill',
        source: ZONE_SOURCE_ID,
        paint: { 'fill-color': '#a57f2c', 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'zone-boundary-line',
        type: 'line',
        source: ZONE_SOURCE_ID,
        paint: { 'line-color': '#611232', 'line-width': 2, 'line-opacity': 0.7 },
      })

      map.addSource(REPORTS_SOURCE_ID, {
        type: 'geojson',
        data: reportsToGeoJSON([]),
      })

      map.addLayer({
        id: REPORTS_HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: REPORTS_SOURCE_ID,
        maxzoom: 17,
        paint: {
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 2, 15, 7],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(250,246,236,0)',
            0.2,
            'rgb(236,214,160)',
            0.4,
            'rgb(165,127,44)',
            0.6,
            'rgb(196,90,110)',
            0.8,
            'rgb(155,34,71)',
            1,
            'rgb(97,18,50)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 10, 15, 17, 35],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 14, 1, 17, 0],
        },
      })

      map.addLayer({
        id: REPORTS_POINT_LAYER_ID,
        type: 'circle',
        source: REPORTS_SOURCE_ID,
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 20, 9],
          'circle-color': ['case', ['get', 'inCase'], CASE_REPORT_COLOR, REPORT_COLOR],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.on('click', REPORTS_POINT_LAYER_ID, (event) => {
        const folio = event.features?.[0]?.toJSON().properties?.folio
        if (typeof folio === 'string') onSelectReportRef.current(folio)
      })

      map.on('mouseenter', REPORTS_POINT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', REPORTS_POINT_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })

      setMapLoaded(true)
    })

    map.on('move', () => {
      const mapCenter = map.getCenter()
      setCenter([mapCenter.lng, mapCenter.lat])
      setZoom(map.getZoom())
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map || zone === undefined) return

    let cancelled = false
    const source = map.getSource(ZONE_SOURCE_ID) as mapboxgl.GeoJSONSource
    source.setData(EMPTY_COLLECTION)

    /** Una zona sin municipio no tiene contorno; se usa solo su coordenada. */
    const boundaryRequest = zone && !zone.municipio ? Promise.resolve(null) : getBoundary(zone?.municipio)

    boundaryRequest
      .catch((error) => {
        console.error('No se pudo cargar el contorno de la zona:', error)
        return null
      })
      .then((boundary) => {
        if (cancelled) return

        if (boundary) {
          source.setData(boundary)
          flyHomeRef.current = () => map.fitBounds(boundaryBounds(boundary), { padding: 40, duration: 1200 })
        } else if (zone?.latitude != null && zone.longitude != null) {
          const center: CoordinatePair = [zone.longitude, zone.latitude]
          flyHomeRef.current = () => map.flyTo({ center, zoom: INITIAL_ZOOM, duration: 1200 })
        } else {
          return
        }
        flyHomeRef.current()
      })

    return () => {
      cancelled = true
    }
  }, [mapLoaded, zone])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    const source = mapRef.current.getSource(REPORTS_SOURCE_ID) as mapboxgl.GeoJSONSource
    source.setData(reportsToGeoJSON(reports))
  }, [mapLoaded, reports])

  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map) return

    map.setPaintProperty(REPORTS_POINT_LAYER_ID, 'circle-color', [
      'case',
      ['==', ['get', 'folio'], selectedReport?.folio ?? ''],
      SELECTED_REPORT_COLOR,
      ['get', 'inCase'],
      CASE_REPORT_COLOR,
      REPORT_COLOR,
    ])
    map.setPaintProperty(REPORTS_POINT_LAYER_ID, 'circle-radius', [
      'case',
      ['==', ['get', 'folio'], selectedReport?.folio ?? ''],
      11,
      7,
    ])

    if (selectedReport) {
      map.flyTo({
        center: [selectedReport.longitude, selectedReport.latitude],
        zoom: 18,
        duration: 1200,
        essential: true,
      })
    }
  }, [mapLoaded, selectedReport])

  return (
    <>
      <div className="map-toolbar">
        <Link to="/dashboard" viewTransition className="map-back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </Link>
        {zoneControl}
        <div className="map-status">
          Longitud: {center[0].toFixed(4)} · Latitud: {center[1].toFixed(4)} · Zoom:{' '}
          {zoom.toFixed(2)}
        </div>
      </div>
      <div id="map-container" ref={mapContainerRef} />
      <div className="map-legend" aria-label="Simbología">
        <span><i style={{ background: REPORT_COLOR }} />Sin caso</span>
        <span><i style={{ background: CASE_REPORT_COLOR }} />En un caso</span>
      </div>
    </>
  )
}

/** El backend exige motivo para estos estados. */
const STATES_REQUIRING_REASON = ['cancelado', 'archivado', 'reincidente']

/** Formulario para cambiar el estado de un reporte, con motivo cuando el estado lo exige. */
function StatusForm({ report, onUpdated }: StatusFormProps) {
  const currentValue = STATES.find((s) => s.key === normalizeState(report.last_state))!.value
  const [estado, setEstado] = useState(currentValue)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reasonRequired = STATES_REQUIRING_REASON.includes(estado)
  const canSubmit = !saving && estado !== currentValue && (!reasonRequired || motivo.trim() !== '')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await api.updateReportStatus(report.folio, estado, motivo.trim())
      onUpdated(res.folio, res.estado, res.state_changed_at)
      setMotivo('')
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cambiar el estado',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="status-form" onSubmit={handleSubmit}>
      <label>
        Estado
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          {STATES.map((state) => (
            <option key={state.value} value={state.value}>
              {state.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Motivo{reasonRequired ? '' : ' (opcional)'}
        <textarea
          value={motivo}
          rows={2}
          required={reasonRequired}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </label>
      {error && <p className="status-form__error">{error}</p>}
      <button type="submit" disabled={!canSubmit}>
        {saving ? 'Guardando...' : 'Cambiar estado'}
      </button>
    </form>
  )
}

const NEW_CASE = '__new__'

/** Asigna el reporte a un caso existente o a uno nuevo, o lo quita del caso en el que está. */
function CaseForm({ report, cases, onCaseChanged, onCaseCreated }: CaseFormProps) {
  const [caseId, setCaseId] = useState(cases.length > 0 ? '' : NEW_CASE)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !saving && (caseId === NEW_CASE ? name.trim() !== '' : caseId !== '')

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el caso')
      setSaving(false)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (caseId === NEW_CASE) {
        const { case: created } = await api.createCase(name.trim(), [report.folio])
        onCaseCreated(created)
        onCaseChanged(report.folio, created.id, created.name)
      } else {
        const res = await api.setReportCase(report.folio, caseId)
        onCaseChanged(res.folio, res.case_id, res.case_name)
      }
    })
  }

  function handleRemove() {
    void run(async () => {
      await api.setReportCase(report.folio, null)
      onCaseChanged(report.folio, null, null)
    })
  }

  if (report.case_id) {
    return (
      <div className="status-form">
        <p className="case-form__current">
          Pertenece al caso <strong>{report.case_name || report.case_id}</strong>
        </p>
        {error && <p className="status-form__error">{error}</p>}
        <button type="button" disabled={saving} onClick={handleRemove}>
          {saving ? 'Guardando...' : 'Quitar del caso'}
        </button>
      </div>
    )
  }

  return (
    <form className="status-form" onSubmit={handleSubmit}>
      <label>
        Caso
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          {cases.length > 0 && (
            <option value="" disabled>
              Selecciona un caso
            </option>
          )}
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.report_count})
            </option>
          ))}
          <option value={NEW_CASE}>+ Nuevo caso</option>
        </select>
      </label>
      {caseId === NEW_CASE && (
        <label>
          Nombre del caso
          <input
            type="text"
            value={name}
            required
            placeholder="Ej. Calle Hidalgo esq. Juárez"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      {error && <p className="status-form__error">{error}</p>}
      <button type="submit" disabled={!canSubmit}>
        {saving ? 'Guardando...' : caseId === NEW_CASE ? 'Crear caso y agregar' : 'Agregar al caso'}
      </button>
    </form>
  )
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** Formatea una fecha ISO en estilo corto es-MX; el texto original (o "—") si no es válida. */
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value || '—' : dateFormatter.format(date)
}

/**
 * Detalle del reporte seleccionado: datos, imágenes, cambio de estado y eliminación.
 * El listado no trae el horario ni las fotos, así que se piden al abrir el reporte.
 */
function ReportDetails({
  report,
  onUpdated,
  onDeleted,
  cases,
  onCaseChanged,
  onCaseCreated,
}: ReportDetailsProps) {
  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const abortController = new AbortController()

    api
      .getReportByFolio(report.folio, abortController.signal)
      .then((data) => setDetail(data.report))
      .catch((requestError) => {
        if (abortController.signal.aborted) return
        setDetailError(
          requestError instanceof Error ? requestError.message : 'No se pudo cargar el detalle',
        )
      })

    return () => abortController.abort()
  }, [report.folio])

  async function handleDelete() {
    const confirmed = window.confirm(
      `¿Eliminar el reporte ${report.folio}? Esta acción no se puede deshacer.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setDeleteError(null)

    try {
      await api.deleteReport(report.folio)
      onDeleted(report.folio)
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error ? requestError.message : 'No se pudo eliminar el reporte',
      )
      setDeleting(false)
    }
  }

  const details: [string, ReactNode][] = [
    ['Reportado por', report.citizen_name || '—'],
    ['Fecha del reporte', formatDate(report.created_at)],
    ['Horario de avistamiento', detail?.sighting_time || '—'],
    ['Tipo de trabajo', report.work_type || '—'],
    ['Zona', report.zone_name || 'Zona sin especificar'],
    ['Niñas, niños o adolescentes', report.children_quantity],
    ['Edades', report.children_age || '—'],
    ['Nivel de sospecha', report.suspicius_level],
    ['Último cambio de estado', formatDate(report.state_changed_at)],
    [
      'Ubicación',
      <ReportAddress
        latitude={report.latitude}
        longitude={report.longitude}
        fallback={`${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}
      />,
    ],
  ]

  return (
    <div className="report-details">
      <dl className="report-details__list">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {detailError && <p className="status-form__error">{detailError}</p>}
      {detail && detail.images.length > 0 && (
        <div className="report-details__images">
          {detail.images.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`Foto del reporte ${report.folio}`} />
            </a>
          ))}
        </div>
      )}

      <CaseForm
        key={report.case_id ?? ''}
        report={report}
        cases={cases}
        onCaseChanged={onCaseChanged}
        onCaseCreated={onCaseCreated}
      />

      <StatusForm key={report.last_state} report={report} onUpdated={onUpdated} />

      {deleteError && <p className="status-form__error">{deleteError}</p>}
      <button
        type="button"
        className="report-delete-button"
        disabled={deleting}
        onClick={handleDelete}
      >
        {deleting ? 'Eliminando...' : 'Eliminar reporte'}
      </button>
    </div>
  )
}

/**
 * Panel lateral con búsqueda por folio, lista de reportes y detalle del seleccionado.
 * Cuando el reporte se elige desde el mapa, se desplaza la lista hasta él.
 */
function SidePanel({
  reports,
  selectedReportId,
  loading,
  error,
  onSelectReport,
  onStatusUpdated,
  onDeleted,
  cases,
  onCaseChanged,
  onCaseCreated,
  onSearch,
}: SidePanelProps) {
  const selectedCardRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedReportId])

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    const folio = search.trim().toUpperCase()
    if (!folio) return

    setSearching(true)
    setSearchError(null)

    try {
      await onSearch(folio)
      setSearch('')
    } catch (requestError) {
      setSearchError(
        requestError instanceof Error ? requestError.message : 'No se encontró el reporte',
      )
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="reports-panel">
      <div className="sidePanelTitle">
        <h1>Reportes</h1>
        <span className="report-count">{reports.length}</span>
      </div>

      <form className="report-search" onSubmit={handleSearch}>
        <input
          type="search"
          placeholder="Buscar por folio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" disabled={searching || search.trim() === ''}>
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
      {searchError && <p className="panel-message panel-message--error">{searchError}</p>}

      {loading && <p className="panel-message">Cargando reportes...</p>}
      {error && <p className="panel-message panel-message--error">{error}</p>}
      {!loading && !error && reports.length === 0 && (
        <p className="panel-message">No hay reportes disponibles.</p>
      )}

      <div className="report-list">
        {reports.map((report) => (
          <div
            key={report.folio}
            ref={report.folio === selectedReportId ? selectedCardRef : undefined}
            className="report-item"
          >
            <button
              type="button"
              className={
                report.folio === selectedReportId
                  ? 'report-card report-card--selected'
                  : 'report-card'
              }
              aria-expanded={report.folio === selectedReportId}
              onClick={() => onSelectReport(report.folio)}
            >
              <span className="report-card__heading">
                <strong>{report.folio}</strong>
                <span>{stateLabel(report.last_state)}</span>
              </span>
              <span className="report-card__description">{report.description}</span>
              <span className="report-card__meta">
                {report.zone_name || 'Zona sin especificar'} · {report.work_type}
              </span>
              <span className={report.case_id ? 'report-card__case report-card__case--assigned' : 'report-card__case'}>
                {report.case_id ? `Caso: ${report.case_name || report.case_id}` : 'Sin caso'}
              </span>
            </button>
            {report.folio === selectedReportId && (
              <ReportDetails
                report={report}
                onUpdated={onStatusUpdated}
                onDeleted={onDeleted}
                cases={cases}
                onCaseChanged={onCaseChanged}
                onCaseCreated={onCaseCreated}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Página `/map`: mapa interactivo de reportes filtrable por zona.
 *
 * @remarks El backend devuelve todas las zonas al administrador y solo la suya al alimentador.
 * Los reportes se piden hasta que cargan las zonas, para no pedir todo y luego volver a pedir
 * la zona del alimentador.
 */
export default function InteractiveMap() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const isAdmin = user?.userType === 'administrador'
  const [zones, setZones] = useState<Zone[]>([])
  const [zonesLoaded, setZonesLoaded] = useState(false)
  const [cases, setCases] = useState<Case[]>([])
  /** '' = todas las zonas (solo administrador). */
  const [selectedZoneId, setSelectedZoneId] = useState('')
  /** /map?folio=X (desde la página de reportes) abre ese reporte al cargar. */
  const [searchParams] = useSearchParams()
  const pendingFolioRef = useRef(searchParams.get('folio')?.trim().toUpperCase() || null)

  useEffect(() => {
    const abortController = new AbortController()

    api
      .getZones(abortController.signal)
      .then((data) => {
        const list = data.zones ?? []
        setZones(list)
        if (!isAdmin) setSelectedZoneId(list[0]?.id ?? '')
      })
      .catch((requestError) => {
        if (!abortController.signal.aborted) console.error('No se pudieron cargar las zonas:', requestError)
      })
      .finally(() => {
        if (!abortController.signal.aborted) setZonesLoaded(true)
      })

    return () => abortController.abort()
  }, [isAdmin])

  useEffect(() => {
    const abortController = new AbortController()

    api
      .getCases(abortController.signal)
      .then((data) => setCases(data.cases ?? []))
      .catch((requestError) => {
        if (!abortController.signal.aborted) console.error('No se pudieron cargar los casos:', requestError)
      })

    return () => abortController.abort()
  }, [])

  useEffect(() => {
    if (!zonesLoaded) return
    const abortController = new AbortController()

    async function loadReports() {
      setLoading(true)
      setError(null)

      try {
        const data = selectedZoneId
          ? await api.getReportsByZone(selectedZoneId, abortController.signal)
          : await api.getAllReports(abortController.signal)
        const list = data.reports ?? []
        setReports(list)

        const folio = pendingFolioRef.current
        if (folio) {
          try {
            if (!list.some((report) => report.folio === folio)) {
              const { report } = await api.getReportByFolio(folio, abortController.signal)
              setReports((current) => [report, ...current])
            }
            pendingFolioRef.current = null
            setSelectedReportId(folio)
          } catch (folioError) {
            if (abortController.signal.aborted) return
            pendingFolioRef.current = null
            console.error(`No se pudo abrir el reporte ${folio}:`, folioError)
          }
        }
      } catch (requestError) {
        if (abortController.signal.aborted) return

        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudieron cargar los reportes',
        )
      } finally {
        if (!abortController.signal.aborted) setLoading(false)
      }
    }

    void loadReports()
    return () => abortController.abort()
  }, [zonesLoaded, selectedZoneId])

  const selectedReport =
    reports.find((report) => report.folio === selectedReportId) ?? null
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null

  function handleZoneChange(zoneId: string) {
    setSelectedZoneId(zoneId)
    setSelectedReportId(null)
  }

  let zoneControl: ReactNode = null
  if (isAdmin) {
    zoneControl = (
      <label className="map-zone">
        Zona
        <select
          value={selectedZoneId}
          disabled={!zonesLoaded}
          onChange={(event) => handleZoneChange(event.target.value)}
        >
          <option value="">Todas las zonas</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zoneLabel(zone)}
            </option>
          ))}
        </select>
      </label>
    )
  } else if (selectedZone) {
    zoneControl = <span className="map-zone map-zone--fixed">{zoneLabel(selectedZone)}</span>
  }

  function handleStatusUpdated(folio: string, estado: string, stateChangedAt: string) {
    setReports((current) =>
      current.map((report) =>
        report.folio === folio
          ? { ...report, last_state: estado, state_changed_at: stateChangedAt }
          : report,
      ),
    )
  }

  /** Actualiza el caso del reporte y el conteo de reportes de los casos involucrados. */
  function handleCaseChanged(folio: string, caseId: string | null, caseName: string | null) {
    const previousCaseId = reports.find((report) => report.folio === folio)?.case_id ?? null
    setReports((current) =>
      current.map((report) =>
        report.folio === folio ? { ...report, case_id: caseId, case_name: caseName } : report,
      ),
    )
    setCases((current) =>
      current.map((c) => {
        if (c.id === previousCaseId) return { ...c, report_count: c.report_count - 1 }
        if (c.id === caseId) return { ...c, report_count: c.report_count + 1 }
        return c
      }),
    )
  }

  /** El caso nuevo llega con el conteo en 0; `handleCaseChanged` le suma el reporte. */
  function handleCaseCreated(newCase: Case) {
    setCases((current) => [{ ...newCase, report_count: 0 }, ...current])
  }

  function handleDeleted(folio: string) {
    setReports((current) => current.filter((report) => report.folio !== folio))
    setSelectedReportId((current) => (current === folio ? null : current))
  }

  /**
   * Si el folio ya está en la lista solo se selecciona; si no (p. ej. otra zona, para
   * un administrador) se pide al backend y se agrega a la lista.
   */
  async function handleSearch(folio: string) {
    const existing = reports.find((report) => report.folio === folio)
    if (existing) {
      setSelectedReportId(existing.folio)
      return
    }

    const { report } = await api.getReportByFolio(folio)
    setReports((current) =>
      current.some((r) => r.folio === report.folio) ? current : [report, ...current],
    )
    setSelectedReportId(report.folio)
  }

  return (
    <main className="interactive-map-layout">
      <section className="map-panel">
        <MapContainer
          reports={reports}
          selectedReport={selectedReport}
          onSelectReport={setSelectedReportId}
          zone={zonesLoaded ? selectedZone : undefined}
          zoneControl={zoneControl}
        />
      </section>

      <aside className="information-panel">
        <SidePanel
          reports={reports}
          selectedReportId={selectedReportId}
          loading={loading}
          error={error}
          onSelectReport={(folio) =>
            setSelectedReportId((current) => (current === folio ? null : folio))
          }
          onStatusUpdated={handleStatusUpdated}
          onDeleted={handleDeleted}
          cases={cases}
          onCaseChanged={handleCaseChanged}
          onCaseCreated={handleCaseCreated}
          onSearch={handleSearch}
        />
      </aside>
    </main>
  )
}
