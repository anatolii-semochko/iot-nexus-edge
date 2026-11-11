import React from 'react'
import {
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import SeriesChart from 'src/components/charts/SeriesChart'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'
import UnitPopup from 'src/components/nodeInfo/UnitPopup'
import { fmt } from './useHeatingData'
import { TANK_FLOW_COLORS } from './HeatingPopup'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('heating-control')

// The heating overview's popups (the user, 2026-11-09): every block opens the biggest popup, as in the
// other scenes - Status (the summed readings, today's big charts) and Systems (each system's own
// figures). Only the shared values: powers and energy - the systems' sums, temperatures - averages,
// the COP - the heat over the electricity, all of them together. No node - no Model / Map tabs.

const ELEC_COLOR = '#b8329e'

const sum = (xs) => xs.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0)
const avg = (xs) => {
  const v = xs.filter(Number.isFinite)
  return v.length ? sum(v) / v.length : null
}

/** One system's figures for a block - the Systems tab's row. */
const systemRow = (kind, s, cooling) => {
  const tot = s.m.totals ?? {}
  const heat = Math.abs(tot.heatKw ?? 0)
  const elec = Math.abs(tot.electricKw ?? 0)
  const coils = s.m.consumers ?? []
  switch (kind) {
    case 'outdoors':
      return [
        fmt(s.m.outdoor?.temperatureC, 1) + ' °C',
        fmt(cooling ? heat + elec : heat - elec, 1) + ' kW',
      ]
    case 'electricity':
      return [fmt(elec, 1) + ' kW', fmt(elec > 0.05 ? heat / elec : null, 1)]
    case 'pumps':
      return [
        fmt(heat, 1) + ' kW',
        fmt(elec > 0.05 ? heat / elec : null, 1),
        `${(s.m.pumps ?? []).filter((p) => p.running && p.on).length} / ${(s.m.pumps ?? []).length}`,
      ]
    case 'storage':
      return [
        fmt(tot.storedKwh, 0) + ' kWh',
        fmt(tot.fullKwh > 0 ? (tot.storedKwh / tot.fullKwh) * 100 : null, 0) + ' %',
      ]
    default:
      return [
        fmt(avg(coils.map((c) => c.roomC)), 1) + ' °C',
        fmt(Math.abs(tot.consumersKw ?? 0), 1) + ' kW',
        `${coils.filter((c) => c.on && c.working).length} / ${coils.length}`,
      ]
  }
}

const HeatingOverviewPopup = ({ kind, systems, view, picture, onClose }) => {
  const {
    cooling,
    pump,
    tank,
    coil,
    outdoorC,
    airKw,
    heatKw,
    electricKw,
    running,
    pumps,
    working,
    coils,
  } = view
  const what = cooling ? t('Cold') : t('Heat')
  // every system's series of a value; the virtual keys (SeriesChart `combine`) - their sums / averages
  const keysOf = (k) => systems.map((s) => `process:${s.process.id}:heat.${k}`)
  const coilKeys = systems.flatMap((s) =>
    (s.m.consumers ?? []).map((c) => `process:${s.process.id}:heat.coil.${c.nodeId}.roomC`),
  )
  const combine = {
    'all:outdoorC': { op: 'avg', keys: keysOf('outdoorC') },
    'all:heatKw': { op: 'sum', keys: keysOf('heatKw'), abs: true },
    'all:electricKw': { op: 'sum', keys: keysOf('electricKw'), abs: true },
    'all:cop': {
      op: 'ratio',
      keys: keysOf('heatKw'),
      den: keysOf('electricKw'),
      abs: true,
    },
    'all:tanksInKw': { op: 'sum', keys: keysOf('tanksInKw'), abs: true },
    'all:tanksOutKw': { op: 'sum', keys: keysOf('tanksOutKw'), abs: true },
    'all:tankPct': { op: 'avg', keys: keysOf('tankPct') },
    'all:consumersKw': { op: 'sum', keys: keysOf('consumersKw'), abs: true },
    'all:roomC': { op: 'avg', keys: coilKeys },
  }
  const chart = {
    outdoors: {
      keys: ['all:outdoorC', ['all:heatKw', 'all:electricKw']],
      labels: [t('Outdoor, °C'), t('{{what}} and the electricity, kW', { what })],
      legends: [[], [what.toLowerCase(), t('electricity')]],
      colors: [undefined, [TANK_FLOW_COLORS[0], ELEC_COLOR]],
    },
    electricity: {
      keys: ['all:electricKw', 'all:cop'],
      labels: [t('Heating electricity, kW'), cooling ? 'EER' : 'COP'],
      colors: [ELEC_COLOR],
    },
    pumps: {
      keys: [['all:heatKw', 'all:electricKw'], 'all:cop'],
      labels: [t('{{what}} and the electricity, kW', { what }), cooling ? 'EER' : 'COP'],
      legends: [[what.toLowerCase(), t('electricity')]],
      colors: [[TANK_FLOW_COLORS[0], ELEC_COLOR]],
    },
    storage: {
      keys: [['all:tanksInKw', 'all:tanksOutKw'], 'all:tankPct'],
      labels: [t('{{v0}} in and out, kW', { v0: what }), t('Stored heat, %')],
      legends: [[t('in - from the heat pumps'), t('out - to the fan coils')]],
      colors: [TANK_FLOW_COLORS],
    },
    rooms: {
      keys: ['all:consumersKw', 'all:roomC'],
      labels: [t('{{what}} to the rooms, kW', { what }), t('The rooms, °C')],
      colors: [TANK_FLOW_COLORS[1]],
    },
  }[kind]
  const titles = {
    outdoors: t('Outdoors'),
    electricity: t('Electricity'),
    pumps: t('Heat pumps'),
    storage: t('Heat storage'),
    rooms: t('Rooms'),
  }
  const Stat = StatTile
  const stats = {
    outdoors: (
      <>
        <Stat label={t('Outdoor')} hint={t("The systems' average")}>
          <KeyValue value={fmt(outdoorC, 1)} unit="°C" />
        </Stat>
        <Stat
          label={cooling ? t('Heat to the air') : t('Heat from the air')}
          hint={t('The heat pumps take it from the air (or give it back while cooling)')}
        >
          <KeyValue value={fmt(airKw, 1)} unit="kW" />
        </Stat>
        <Stat label={t('Systems')}>{systems.length}</Stat>
      </>
    ),
    electricity: (
      <>
        <Stat label={t('Electricity')} hint={t('All the heat pumps take now')}>
          <KeyValue value={fmt(electricKw, 1)} unit="kW" />
        </Stat>
        <Stat label={what} hint={t('What they give for it')}>
          <KeyValue value={fmt(heatKw, 1)} unit="kW" />
        </Stat>
        <Stat label={cooling ? 'EER' : 'COP'} hint={t('The heat per unit of electricity')}>
          <KeyValue value={fmt(pump.cop, 1)} />
        </Stat>
        <Stat label={t('Running')}>
          {running} {t('of')} {pumps}
        </Stat>
      </>
    ),
    pumps: (
      <>
        <Stat label={what} hint={t('All the heat pumps give now')}>
          <KeyValue value={fmt(heatKw, 1)} unit="kW" />
        </Stat>
        <Stat label={t('Electricity')}>
          <KeyValue value={fmt(electricKw, 1)} unit="kW" />
        </Stat>
        <Stat label={cooling ? 'EER' : 'COP'} hint={t('The heat per unit of electricity')}>
          <KeyValue value={fmt(pump.cop, 1)} />
        </Stat>
        <Stat label={t('Running')}>
          {running} {t('of')} {pumps}
        </Stat>
        <Stat label={t('Modulation')} hint={t("The running ones' average")}>
          {fmt(pump.modulation * 100, 0)} %
        </Stat>
        <Stat
          label={t('Flow / return')}
          hint={t('The water to the tanks / back from them - the average')}
        >
          {fmt(pump.flowC)} / {fmt(pump.returnC)} °C
        </Stat>
      </>
    ),
    storage: (
      <>
        <Stat
          label={t('Stored')}
          hint={t('The heat above the lowest useful temperature - all the tanks')}
        >
          {fmt(tank.storedKwh, 0)} {t('of')} {fmt(tank.fullKwh, 0)} kWh
        </Stat>
        <Stat label={t('Charge')}>{fmt(tank.pct, 0)} %</Stat>
        <Stat label={t('In')} hint={t('From the heat pumps now')}>
          <KeyValue value={fmt(view.tanksInKw, 1)} unit="kW" color={TANK_FLOW_COLORS[0]} />
        </Stat>
        <Stat label={t('Out')} hint={t('To the fan coils now')}>
          <KeyValue value={fmt(view.tanksOutKw, 1)} unit="kW" color={TANK_FLOW_COLORS[1]} />
        </Stat>
        <Stat label={t('Average')} hint={t("The tanks' middle sensors - the average")}>
          <KeyValue value={fmt(tank.avgC)} unit="°C" />
        </Stat>
        <Stat label={t('Top / bottom')}>
          {fmt(tank.topC)} / {fmt(tank.bottomC)} °C
        </Stat>
      </>
    ),
    rooms: (
      <>
        <Stat label={t('Rooms')} hint={t("The rooms' average")}>
          <KeyValue value={coil.roomC ?? '-'} unit="°C" />
        </Stat>
        <Stat label={t('Humidity')} hint={t("The rooms' average")}>
          {coil.humidityPct ?? '-'} %
        </Stat>
        <Stat label={t('Setpoint')} hint={t("The rooms' average target")}>
          <KeyValue value={coil.setpointC ?? '-'} unit="°C" />
        </Stat>
        <Stat label={what} hint={t('All the fan coils give the rooms now')}>
          <KeyValue value={fmt(coil.heatKw, 1)} unit="kW" />
        </Stat>
        <Stat label={t('Fan coils')}>
          {working} {t('of')} {coils} {t('running')}
        </Stat>
      </>
    ),
  }[kind]
  const columns = {
    outdoors: [t('Outdoor'), cooling ? t('Heat to the air') : t('Heat from the air')],
    electricity: [t('Electricity'), cooling ? 'EER' : 'COP'],
    pumps: [what, cooling ? 'EER' : 'COP', t('Running')],
    storage: [t('Stored'), t('Charge')],
    rooms: [t('Rooms'), what, t('Fan coils')],
  }[kind]
  const systemsTab = (
    <CTable small hover responsive className="mb-0">
      <CTableHead>
        <CTableRow>
          <CTableHeaderCell>{t('System')}</CTableHeaderCell>
          {columns.map((c) => (
            <CTableHeaderCell key={c} className="text-end">
              {c}
            </CTableHeaderCell>
          ))}
        </CTableRow>
      </CTableHead>
      <CTableBody>
        {systems.map((s) => (
          <CTableRow key={s.process.id}>
            <CTableDataCell>{s.process.name}</CTableDataCell>
            {systemRow(kind, s, s.m.mode === 'cooling').map((v, i) => (
              <CTableDataCell key={i} className="text-end text-nowrap">
                {v}
              </CTableDataCell>
            ))}
          </CTableRow>
        ))}
      </CTableBody>
    </CTable>
  )
  return (
    <UnitPopup
      title={titles[kind]}
      // the pictures' colours (the grid's bolt, the sky's) - the scenes' variables, the modal is outside them
      className="ef-colors"
      picture={picture}
      onClose={onClose}
      charts={<SeriesChart {...chart} combine={combine} />}
      extraTabs={[
        {
          key: 'systems',
          label: t('Systems'),
          hint: t("Each heating system's own figures"),
          content: systemsTab,
        },
      ]}
    >
      <div
        className="d-grid mb-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}
      >
        {stats}
      </div>
    </UnitPopup>
  )
}

export default HeatingOverviewPopup
