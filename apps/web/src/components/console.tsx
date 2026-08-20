import { useEffect, useState } from 'react'

/* Deterministic pseudo-random for sparkline (no rerender on hydration) */
function rand(seed: number) {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export function Sparkline({
  values,
  height = 24,
  width = 96,
  color = 'var(--action)',
  fill = true,
}: {
  values?: number[]
  height?: number
  width?: number
  color?: string
  fill?: boolean
}) {
  const series = values ?? Array.from({ length: 18 }, (_, i) => rand(i + 1) * 0.6 + 0.2 + (i / 18) * 0.2)
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const step = width / (series.length - 1)
  const points = series.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`).join(' ')
  const last = series[series.length - 1]
  const lastX = (series.length - 1) * step
  const lastY = height - ((last - min) / span) * (height - 4) - 2
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#spark-fill)" />}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color}>
        <animate attributeName="r" values="2.5;4;2.5" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

export function NumberTicker({ value, suffix, decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const start = display
    const delta = value - start
    if (Math.abs(delta) < 0.01) {
      setDisplay(value)
      return
    }
    const duration = 600
    const startTime = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(start + delta * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString('zh-CN')
  return <span className="tabular">{formatted}{suffix ? <small>{suffix}</small> : null}</span>
}

export function ClockTick() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('zh-CN', { hour12: false })
  return <span className="status-bar-clock">{time}</span>
}

export function ProgressArc({
  value,
  max = 100,
  size = 80,
  stroke = 6,
  color = 'var(--action)',
  label,
  variant,
}: {
  value: number
  max?: number
  size?: number
  stroke?: number
  color?: string
  label?: string
  variant?: 'A' | 'B' | 'C' | 'D'
}) {
  const pct = Math.max(0, Math.min(1, value / max))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * pct
  const gradeColor = variant === 'A' ? 'var(--grade-a)'
    : variant === 'B' ? 'var(--grade-b)'
    : variant === 'C' ? 'var(--grade-c)'
    : variant === 'D' ? 'var(--grade-d)'
    : color
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`arc-${variant ?? 'd'}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={gradeColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={gradeColor} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#arc-${variant ?? 'd'})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 6px ${gradeColor})` }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink)"
        fontSize={size / 3.5}
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        {label ?? Math.round(value)}
      </text>
    </svg>
  )
}

export function RadarChart({
  dimensions,
  size = 220,
}: {
  dimensions: Array<{ label: string; value: number; max: number }>
  size?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 36
  const count = dimensions.length
  const angle = (i: number) => (Math.PI * 2 * i) / count - Math.PI / 2

  const point = (value: number, max: number, i: number) => {
    const r = (value / max) * radius
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r]
  }

  const points = dimensions.map((d, i) => point(d.value, d.max, i).join(',')).join(' ')
  const grid = [0.25, 0.5, 0.75, 1].map((scale) => {
    const p = dimensions.map((_, i) => {
      const r = radius * scale
      return `${cx + Math.cos(angle(i)) * r},${cy + Math.sin(angle(i)) * r}`
    }).join(' ')
    return p
  })

  return (
    <svg className="radar-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <defs>
        <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--action)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {grid.map((p, idx) => <polygon key={idx} points={p} />)}
      {dimensions.map((_, i) => (
        <line
          key={i}
          className="axis"
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(angle(i)) * radius}
          y2={cy + Math.sin(angle(i)) * radius}
        />
      ))}
      <polygon className="area" points={points} fill="url(#radar-fill)" />
      {dimensions.map((d, i) => {
        const [x, y] = point(d.value, d.max, i)
        const lx = cx + Math.cos(angle(i)) * (radius + 18)
        const ly = cy + Math.sin(angle(i)) * (radius + 18)
        return (
          <g key={d.label}>
            <circle className="point" cx={x} cy={y} r="3.5" />
            <text className="label" x={lx} y={ly} textAnchor="middle" dominantBaseline="central">
              {d.label}
              <tspan className="val" x={lx} dy={12}>{d.value}/{d.max}</tspan>
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function ThinkingTrace({
  steps,
}: {
  steps: Array<{ label: string; state: 'done' | 'active' | 'pending'; meta?: string }>
}) {
  const hasDone = steps.some((s) => s.state === 'done')
  return (
    <div className={`thinking-trace${hasDone ? ' has-done' : ''}`}>
      {steps.map((step, i) => (
        <div key={i} className={`thinking-trace-row ${step.state}`}>
          <span className="step">{step.state === 'done' ? '✓' : i + 1}</span>
          <span className="label">{step.label}</span>
          {step.state === 'active' && <span className="dot-pulse" aria-hidden="true" />}
          {step.meta && <span className="meta">{step.meta}</span>}
        </div>
      ))}
    </div>
  )
}

export function StreamText({ text, speed = 14 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setShown('')
    setDone(false)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) {
        window.clearInterval(id)
        setDone(true)
      }
    }, speed)
    return () => window.clearInterval(id)
  }, [text, speed])
  return (
    <>
      {shown}
      {!done && <span className="message-tail" aria-hidden="true" />}
    </>
  )
}
