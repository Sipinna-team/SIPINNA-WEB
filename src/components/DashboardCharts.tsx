import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

type Tip = { x: number; y: number; content: ReactNode } | null;

// Tooltip compartido: se posiciona relativo al contenedor de cada gráfica.
function useTooltip() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<Tip>(null);

  function show(event: MouseEvent, content: ReactNode) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, content });
  }

  const node = tip && (
    <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  );

  return { containerRef, show, hide: () => setTip(null), node };
}

// Máximo del eje Y dividido en 4 marcas enteras y redondas (p. ej. 0, 10, 20, 30, 40).
function niceMax(value: number) {
  const raw = Math.max(value, 4) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((s) => raw <= s * magnitude)!;
  return step * magnitude * 4;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cuenta desde el valor anterior hasta el nuevo. Solo se re-renderiza este número.
export function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value || prefersReducedMotion()) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 4;
      const current = Math.round(from + (value - from) * eased);
      fromRef.current = current;
      setDisplay(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{display}</>;
}

// Retraso escalonado para animaciones CSS que leen --i.
const staggerStyle = (i: number) => ({ '--i': i }) as CSSProperties;

export type Series = { label: string; color: string; values: number[] };

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="chart-legend">
      {series.map((s) => (
        <li key={s.label}>
          <span className="chart-swatch" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Dona ---------- */
export type DonutSegment = { label: string; value: number; color: string };

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: number;
  centerLabel: string;
}) {
  const { containerRef, show, hide, node } = useTooltip();
  const maskId = useId();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  // Hueco de 2px entre segmentos (en unidades del viewBox de 120).
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <div className="donut" ref={containerRef}>
      <svg viewBox="0 0 120 120" className="donut-svg" role="img" aria-label={`${centerValue} ${centerLabel}`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(22,26,29,0.08)" strokeWidth="16" />
        {total > 0 && (
          // La máscara se monta junto con los datos y "barre" la dona en una sola pasada.
          <mask id={maskId}>
            <circle
              className="donut-sweep"
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#fff"
              strokeWidth="18"
              pathLength="1"
              transform="rotate(-90 60 60)"
            />
          </mask>
        )}
        <g mask={total > 0 ? `url(#${CSS.escape(maskId)})` : undefined}>
        {total > 0 &&
          segments.map((s) => {
            const length = (s.value / total) * circumference;
            const dash = Math.max(length - gap, 0);
            const circle = (
              <circle
                key={s.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
                onMouseMove={(e) => show(e, <><strong>{s.label}</strong> {s.value} ({Math.round((s.value / total) * 100)}%)</>)}
                onMouseLeave={hide}
              />
            );
            offset += length;
            return s.value > 0 ? circle : null;
          })}
        </g>
        <text x="60" y="60" textAnchor="middle" className="donut-value"><AnimatedNumber value={centerValue} /></text>
        <text x="60" y="74" textAnchor="middle" className="donut-label">{centerLabel}</text>
      </svg>

      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="chart-swatch chart-swatch--round" style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</strong>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}

/* ---------- Barras horizontales ---------- */
export function HorizontalBarChart({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="hbar-list">
      {items.map((item, i) => (
        <li key={item.label} className="hbar-row" title={`${item.label}: ${item.value}`}>
          <span className="hbar-label">{item.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(item.value / max) * 100}%`, ...staggerStyle(i) }} />
          </span>
          <strong className="hbar-value">{item.value}</strong>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Ejes compartidos para columnas y líneas ---------- */
const W = 320;
const H = 130;
const PAD = { top: 8, right: 6, bottom: 18, left: 26 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function Axes({ max, categories }: { max: number; categories: string[] }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const band = PLOT_W / categories.length;

  return (
    <g className="chart-axes">
      {ticks.map((tick) => {
        const y = PAD.top + PLOT_H - (tick / max) * PLOT_H;
        return (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className="chart-grid" />
            <text x={PAD.left - 4} y={y + 3} textAnchor="end">{Math.round(tick)}</text>
          </g>
        );
      })}
      {categories.map((c, i) => (
        <text key={c} x={PAD.left + band * i + band / 2} y={H - 5} textAnchor="middle">{c}</text>
      ))}
    </g>
  );
}

function tooltipRows(category: string, series: Series[], index: number) {
  return (
    <>
      <strong>{category}</strong>
      {series.map((s) => (
        <span key={s.label} className="chart-tooltip-row">
          <span className="chart-swatch" style={{ background: s.color }} />
          {s.label}: {s.values[index]}
        </span>
      ))}
    </>
  );
}

/* ---------- Columnas (una o varias series) ---------- */
export function ColumnChart({ series, categories, label }: { series: Series[]; categories: string[]; label: string }) {
  const { containerRef, show, hide, node } = useTooltip();
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const band = PLOT_W / categories.length;
  const barWidth = Math.min(8, (band * 0.6) / series.length);
  const groupWidth = barWidth * series.length + 2 * (series.length - 1);

  return (
    <div className="chart" ref={containerRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <Axes max={max} categories={categories} />
        {categories.map((category, i) => {
          const groupX = PAD.left + band * i + (band - groupWidth) / 2;
          return (
            <g
              key={category}
              onMouseMove={(e) => show(e, tooltipRows(category, series, i))}
              onMouseLeave={hide}
            >
              {/* Zona de hover más grande que la barra. */}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={PLOT_H} fill="transparent" />
              {series.map((s, j) => {
                const h = (s.values[i] / max) * PLOT_H;
                const x = groupX + j * (barWidth + 2);
                const y = PAD.top + PLOT_H - h;
                const r = Math.min(2, h);
                // Solo el extremo superior va redondeado; la base queda en el eje.
                return h > 0 ? (
                  <path
                    key={s.label}
                    className="chart-column"
                    style={staggerStyle(i)}
                    fill={s.color}
                    d={`M${x},${PAD.top + PLOT_H} V${y + r} Q${x},${y} ${x + r},${y} H${x + barWidth - r} Q${x + barWidth},${y} ${x + barWidth},${y + r} V${PAD.top + PLOT_H} Z`}
                  />
                ) : null;
              })}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
      {node}
    </div>
  );
}

/* ---------- Líneas ---------- */
export function LineChart({ series, categories, label }: { series: Series[]; categories: string[]; label: string }) {
  const { containerRef, show, hide, node } = useTooltip();
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const band = PLOT_W / categories.length;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + PLOT_H - (v / max) * PLOT_H;

  return (
    <div className="chart" ref={containerRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <Axes max={max} categories={categories} />
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + PLOT_H} className="chart-crosshair" />
        )}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              // La key cambia con los datos para que el trazo se vuelva a dibujar al llegar.
              key={s.values.join(',')}
              className="chart-line"
              pathLength="1"
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
            {active !== null && (
              <circle cx={x(active)} cy={y(s.values[active])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
            )}
          </g>
        ))}
        {categories.map((category, i) => (
          <rect
            key={category}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={PLOT_H}
            fill="transparent"
            onMouseMove={(e) => {
              setActive(i);
              show(e, tooltipRows(category, series, i));
            }}
            onMouseLeave={() => {
              setActive(null);
              hide();
            }}
          />
        ))}
      </svg>
      <Legend series={series} />
      {node}
    </div>
  );
}
