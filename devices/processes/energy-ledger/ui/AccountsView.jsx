import React from 'react'
import {
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'

// Who the energy was for (the ledger's cost accounts, accounts.ts): the
// owner's private costs, the business's, the tenants' - what to re-bill them
// (no invoices made) - and the rest no account has; the accounts by kind,
// each its electricity (its meters) and heat (its heat meters at its
// system's cost of heat).

const KINDS = [
  ['private', 'Private', "The owner's own costs - the house"],
  ['business', 'Business', "The business's costs - its offices, workshop, halls"],
  ['tenant', 'To re-bill to tenants', 'The let units - their electricity and heat'],
]

const money = (v) =>
  v === null || v === undefined
    ? '-'
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kwh = (v) =>
  v === null || v === undefined
    ? '-'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })

const AccountsView = ({ accounts }) => {
  if (!accounts?.items?.length) return null
  return (
    <section className="d-flex flex-column gap-3" aria-label="Who the energy was for">
      <div className="fw-semibold">Who the energy was for</div>
      <div
        className="d-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}
      >
        {KINDS.map(([key, label, hint]) => (
          <StatTile key={key} label={label} hint={hint}>
            <KeyValue value={money(accounts.byKind?.[key])} unit="€" />
          </StatTile>
        ))}
        <StatTile
          label="Other"
          hint="The consumption no account has - the field's own needs, the meters not on an account"
        >
          <KeyValue value={money(accounts.otherEur)} unit="€" />
        </StatTile>
      </div>
      <CTable small responsive hover className="mb-0">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Account</CTableHeaderCell>
            <CTableHeaderCell className="text-end" title="Its meters' electricity">
              Electricity, kWh
            </CTableHeaderCell>
            <CTableHeaderCell className="text-end">€</CTableHeaderCell>
            <CTableHeaderCell
              className="text-end"
              title="Its heat meters' heat, at its system's cost of heat"
            >
              Heat, kWh
            </CTableHeaderCell>
            <CTableHeaderCell className="text-end">€</CTableHeaderCell>
            <CTableHeaderCell className="text-end">Total, €</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {KINDS.map(([kind, label]) => {
            const items = accounts.items.filter((x) => x.kind === kind)
            if (!items.length) return null
            return (
              <React.Fragment key={kind}>
                <CTableRow>
                  <CTableDataCell colSpan={5} className="fw-semibold text-body-secondary small">
                    {label}
                  </CTableDataCell>
                  <CTableDataCell className="text-end fw-semibold">
                    {money(accounts.byKind?.[kind])}
                  </CTableDataCell>
                </CTableRow>
                {items.map((x) => (
                  <CTableRow key={x.key}>
                    <CTableDataCell className="ps-3">{x.name}</CTableDataCell>
                    <CTableDataCell className="text-end">{kwh(x.elecKwh)}</CTableDataCell>
                    <CTableDataCell className="text-end">{money(x.elecEur)}</CTableDataCell>
                    <CTableDataCell className="text-end">
                      {x.heatKwh ? kwh(x.heatKwh) : '-'}
                    </CTableDataCell>
                    <CTableDataCell className="text-end">
                      {x.heatKwh ? money(x.heatEur) : '-'}
                    </CTableDataCell>
                    <CTableDataCell className="text-end">{money(x.totalEur)}</CTableDataCell>
                  </CTableRow>
                ))}
              </React.Fragment>
            )
          })}
        </CTableBody>
      </CTable>
    </section>
  )
}

export default AccountsView
