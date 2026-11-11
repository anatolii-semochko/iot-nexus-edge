import React, { useEffect, useState } from 'react'
import { request } from 'src/api/client'
import { useNow } from 'src/hooks/useNow'
import SummaryLine from 'src/components/SummaryLine'
import { packageT } from 'src/i18n'
import {
  HourCurve,
  WeatherCard,
  WIDGET_CSS,
} from '../../weather-control/ui/WeatherWidgets'
import { GridIcon, SCENE_CSS as ENERGY_CSS } from '../../energy-field/ui/fieldIcons'

const tr = packageT('heating-control')

// the curve's day back and day ahead (as the weather's), reloaded this often
const DAY_MS = 86_400_000
const RELOAD_MS = 5 * 60_000
// the recorded day - this many points (a quarter of an hour each)
const PAST_POINTS = 96

const niceTop = (v) => {
  if (!(v > 0)) return 1
  const step = 10 ** Math.floor(Math.log10(v)) / 2
  return Math.ceil((v * 1.1) / step) * step
}

/**
 * The heating's electricity from the grid (the user, 2026-11-07) - beside the weather and as it looks: a
 * grid tower as tall as the weather's icon, the power now (the heat pumps and the fan coils' fans), the
 * last day recorded and the next one by the heating planner's plan (its slots' electricity) - one curve,
 * "now" in the middle.
 */
const GridSupply = ({ process, kw, cardClass }) => {
  const now = useNow(RELOAD_MS)
  const [past, setPast] = useState([])
  const [plan, setPlan] = useState([])
  const seriesKey = `process:${process.id}:heat.electricKw`
  const plannerId = process.config?.plannerProcessId ?? null
  useEffect(() => {
    let cancelled = false
    request(
      `/series/data?keys=${encodeURIComponent(seriesKey)}&from=${now - DAY_MS}&to=${now}&points=${PAST_POINTS}`,
    )
      .then((d) => !cancelled && setPast((d.series?.[seriesKey] ?? []).map((p) => ({ t: p.t, v: Math.abs(p.v) }))))
      .catch(() => !cancelled && setPast([]))
    if (plannerId)
      request(`/heating-planner/${plannerId}/plan`)
        .then((d) => {
          if (cancelled) return
          const system = d.plan?.systems?.find((x) => x.processId === process.id)
          setPlan(
            (system?.slots ?? [])
              .filter((x) => x.t > now && x.t <= now + DAY_MS)
              .map((x) => ({ t: x.t, v: Math.abs(x.electricKw ?? 0) })),
          )
        })
        .catch(() => !cancelled && setPlan([]))
    return () => {
      cancelled = true
    }
  }, [seriesKey, plannerId, process.id, now])
  const hours = [...past, ...(kw !== null ? [{ t: now, v: kw }] : []), ...plan].sort((a, b) => a.t - b.t)
  const top = niceTop(Math.max(0, ...hours.map((h) => h.v)))
  const on = kw > 0.05
  return (
    <>
      <style>{WIDGET_CSS}</style>
      <style>{ENERGY_CSS}</style>
      <WeatherCard
        cardClass={`${cardClass} ef-colors`}
        aspect={88 / 104}
        icon={(h) => <GridIcon height={h} flow={on ? 'import' : 'none'} />}
      >
        <SummaryLine
          className="wx-line"
          hint={tr(
            "The heating's electricity from the grid now - the heat pumps and the fan coils' fans",
          )}
          color={on ? 'var(--ef-cost)' : 'var(--ef-off)'}
          items={[{ v: kw === null ? null : kw.toFixed(1) }, tr('kW from the grid')]}
        >
          <span className="wx-muted">{tr('the heat pumps and the fans')}</span>
        </SummaryLine>
        <HourCurve
          hours={hours}
          now={now}
          value={(h) => h.v}
          min={0}
          max={top}
          color="var(--ef-cost)"
          label={tr('The electricity from the grid - the last day and the plan for the next, kW')}
        />
      </WeatherCard>
    </>
  )
}

export default GridSupply
