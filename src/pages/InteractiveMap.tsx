import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as mapboxgl from 'mapbox-gl/esm'
import 'mapbox-gl/dist/mapbox-gl.css'
import './InteractiveMap.css'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Report, ReportDetail, Zone } from '../lib/api'
import { STATES, normalizeState, stateLabel } from '../lib/dashboardStats'
import { boundaryBounds, getBoundary } from '../lib/zoneBoundary'
import { ReportAddress } from '../components/ReportAddress'

type CoordinatePair = [number, number]

type MapContainerProps = {
  reports: Report[]
  selectedReport: Report | null
  onSelectReport: (folio: string) => void
  // null = todo el estado; undefined = las zonas aún no cargan.
  zone: Zone | null | undefined
  zoneControl: ReactNode
}

type StatusFormProps = {
  report: Report
  onUpdated: (folio: string, estado: string, stateChangedAt: string) => void
}

type ReportDetailsProps = StatusFormProps & {
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
  onSearch: (folio: string) => Promise<void>
}

const INITIAL_CENTER: CoordinatePair = [-99.2734, 19.5645]
const INITIAL_ZOOM = 12.5
const REPORTS_SOURCE_ID = 'reports'
const REPORTS_HEATMAP_LAYER_ID = 'report-heat-zones'
const REPORTS_POINT_LAYER_ID = 'report-points'
const ZONE_SOURCE_ID = 'zone-boundary'
const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] }

function zoneLabel(zone: Zone) {
  return zone.municipio && zone.municipio !== zone.name
    ? `${zone.municipio} (${zone.name})`
    : zone.name
}

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
      },
      geometry: {
        type: 'Point' as const,
        // GeoJSON and Mapbox expect longitude first, then latitude.
        coordinates: [report.longitude, report.latitude] as CoordinatePair,
      },
    })),
  }
}

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
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      // El contorno va debajo de los reportes; se llena cuando se elige la zona.
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
          'circle-color': '#9b2247',
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

  // Dibuja el contorno de la zona (o del estado) y encuadra el mapa en él.
  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map || zone === undefined) return

    let cancelled = false
    const source = map.getSource(ZONE_SOURCE_ID) as mapboxgl.GeoJSONSource
    source.setData(EMPTY_COLLECTION)

    // Una zona sin municipio no tiene contorno; se usa solo su coordenada.
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
          map.fitBounds(boundaryBounds(boundary), { padding: 40, duration: 1200 })
        } else if (zone?.latitude != null && zone.longitude != null) {
          map.flyTo({ center: [zone.longitude, zone.latitude], zoom: INITIAL_ZOOM, duration: 1200 })
        }
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
      '#a57f2c',
      '#9b2247',
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
    </>
  )
}

// El backend exige motivo para estos estados.
const STATES_REQUIRING_REASON = ['cancelado', 'archivado', 'reincidente']

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

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value || '—' : dateFormatter.format(date)
}

function ReportDetails({ report, onUpdated, onDeleted }: ReportDetailsProps) {
  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // El listado por zona no trae el horario ni las fotos; se piden al abrir el reporte.
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

function SidePanel({
  reports,
  selectedReportId,
  loading,
  error,
  onSelectReport,
  onStatusUpdated,
  onDeleted,
  onSearch,
}: SidePanelProps) {
  const selectedCardRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Cuando el reporte se elige desde el mapa, lo traemos a la vista en la lista.
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
            </button>
            {report.folio === selectedReportId && (
              <ReportDetails
                report={report}
                onUpdated={onStatusUpdated}
                onDeleted={onDeleted}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InteractiveMap() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const isAdmin = user?.userType === 'administrador'
  const [zones, setZones] = useState<Zone[]>([])
  const [zonesLoaded, setZonesLoaded] = useState(false)
  // '' = todas las zonas (solo administrador).
  const [selectedZoneId, setSelectedZoneId] = useState('')
  // /map?folio=X (desde la página de reportes) abre ese reporte al cargar.
  const [searchParams] = useSearchParams()
  const pendingFolioRef = useRef(searchParams.get('folio')?.trim().toUpperCase() || null)

  // El backend devuelve todas las zonas al administrador y solo la suya al alimentador.
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
    // Se espera a las zonas para no pedir todo y luego volver a pedir la zona del alimentador.
    if (!zonesLoaded) return
    const abortController = new AbortController()

    async function loadReports() {
      setLoading(true)
      setError(null)

      try {
        const data = selectedZoneId
          ? await api.getReportsByZone(selectedZoneId, abortController.signal)
          : await api.getAllReports(abortController.signal)
        // Go serializa un slice vacío como null.
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

  function handleDeleted(folio: string) {
    setReports((current) => current.filter((report) => report.folio !== folio))
    setSelectedReportId((current) => (current === folio ? null : current))
  }

  // Si el folio ya está en la lista solo se selecciona; si no (p. ej. otra zona, para
  // un administrador) se pide al backend y se agrega a la lista.
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
          onSearch={handleSearch}
        />
      </aside>
    </main>
  )
}
