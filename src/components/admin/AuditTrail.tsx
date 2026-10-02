import { useMemo, useState } from "react"
import {
  Eye,
  Filter,
  RefreshCw,
  Search,
  X,
  Download,
  CalendarDays,
  ClipboardCheck,
  BarChart3,
  UserRound,
  Layers3,
  UsersRound,
  Settings2,
  ChevronDown,
  Printer,
  Clock3,
  MoreVertical,
} from "lucide-react"
import { Button } from "../ui/Button"
import { Modal } from "../ui/Modal"
import {
  auditActionLabel,
  auditActionTone,
  auditCSV,
  auditDetailSummary,
  auditStats,
  auditTimestamp,
  emptyAuditFilters,
  filterAuditRecords,
  type AuditFilters,
  type AuditRecord,
} from "./auditTrailModel"
import "../../styles/audit-trail.css"
import { jsPDF } from "jspdf"

export default function AuditTrail({
  records,
  total,
  loading,
  loaded,
  error,
  onRefresh,
}: {
  records: AuditRecord[]
  total: number
  loading: boolean
  loaded: boolean
  error: string | null
  onRefresh: () => void
}) {
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters)
  const [page, setPage] = useState(1)
  const [filterOpen, setFilterOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [selected, setSelected] = useState<AuditRecord | null>(null)
  const [pageSize, setPageSize] = useState(7)
  const stats = auditStats(records)
  const filtered = useMemo(
    () => filterAuditRecords(records, filters),
    [records, filters],
  )
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const actions = Array.from(new Set(records.map((record) => record.action)))
    .filter(Boolean)
    .sort()
  const actors = Array.from(new Set(records.map((record) => record.actor)))
    .filter(Boolean)
    .sort()
  const targetTypes = Array.from(
    new Set(records.map((record) => record.resourceType)),
  )
    .filter(Boolean)
    .sort()
  const setFilter = (key: keyof AuditFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }
  const setRange = (days: number | null) => {
    if (days === null) {
      setFilters((current) => ({ ...current, from: "", to: "" }))
    } else {
      const to = new Date()
      const from = new Date(to)
      from.setDate(to.getDate() - days + 1)
      const key = (date: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
          date,
        )
      setFilters((current) => ({ ...current, from: key(from), to: key(to) }))
    }
    setPage(1)
    setRangeOpen(false)
  }
  const rangeLabel =
    filters.from && filters.to ? `${filters.from} – ${filters.to}` : "All time"
  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([auditCSV(filtered)], { type: "text/csv;charset=utf-8" }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `aeroprice-audit-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const exportPdf = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    })
    const margin = 30
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let y = 150
    doc.setFillColor(241, 247, 255)
    doc.rect(0, 0, pageWidth, 88, "F")
    doc.setFillColor(37, 99, 235)
    doc.roundedRect(margin, 20, 48, 48, 12, 12, "F")
    doc.setTextColor(255, 255, 255)
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(3)
    doc.line(margin + 13, 43, margin + 22, 52)
    doc.line(margin + 22, 52, margin + 36, 34)
    doc.setTextColor(15, 35, 75)
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text("AeroPrice India — Audit Trail", margin + 64, 39)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(80, 100, 130)
    doc.text("Governance and compliance activity report", margin + 64, 56)
    doc.setFontSize(9)
    doc.setTextColor(90, 105, 130)
    doc.text(
      `Exported ${new Date().toLocaleString("en-IN")} · ${filtered.length} filtered event${
        filtered.length === 1 ? "" : "s"
      }`,
      margin,
      82,
    )
    const pdfStats = [
      ["Total events", stats.total],
      ["Unique actors", stats.actors],
      ["Action types", stats.actions],
      ["User changes", stats.userChanges],
      ["System events", stats.systemEvents],
    ] as const
    const metricWidth = (pageWidth - margin * 2 - 32) / pdfStats.length
    pdfStats.forEach(([label, value], index) => {
      const x = margin + index * (metricWidth + 8)
      const iconX = x + metricWidth - 24
      doc.setFillColor(247, 250, 255)
      doc.setDrawColor(220, 229, 243)
      doc.roundedRect(x, 98, metricWidth, 34, 7, 7, "FD")
      doc.setFillColor(
        index === 4 ? 255 : 226,
        index === 4 ? 244 : 237,
        index === 4 ? 194 : 255,
      )
      doc.circle(iconX, 115, 10, "F")
      doc.setDrawColor(
        index === 4 ? 220 : 37,
        index === 4 ? 150 : 99,
        index === 4 ? 20 : 235,
      )
      doc.setLineWidth(1.2)
      if (index === 0) {
        doc.line(iconX - 4, 120, iconX - 4, 111)
        doc.line(iconX, 120, iconX, 108)
        doc.line(iconX + 4, 120, iconX + 4, 113)
      } else if (index === 1) {
        doc.circle(iconX, 112, 2.5, "S")
        doc.line(iconX - 4, 120, iconX + 4, 120)
      } else if (index === 2) {
        doc.line(iconX - 5, 112, iconX + 5, 112)
        doc.line(iconX - 5, 115, iconX + 5, 115)
        doc.line(iconX - 5, 118, iconX + 5, 118)
      } else {
        doc.circle(iconX, 115, 4, "S")
        doc.line(iconX, 108, iconX, 122)
      }
      doc.setTextColor(85, 105, 135)
      doc.setFontSize(7.5)
      doc.setFont("helvetica", "normal")
      doc.text(label.toUpperCase(), x + 8, 110)
      doc.setTextColor(15, 35, 75)
      doc.setFontSize(13)
      doc.setFont("helvetica", "bold")
      doc.text(String(value), x + 8, 125)
    })
    const columns = [
      "Timestamp",
      "Actor",
      "Action",
      "Target / resource",
      "Details",
    ]
    const widths = [105, 135, 105, 175, pageWidth - margin * 2 - 520]
    let rowNumber = 0
    const drawRow = (values: string[], header = false) => {
      const lines = values.map((value, index) =>
        doc.splitTextToSize(value || "Not recorded", widths[index] - 8),
      )
      const height = Math.max(...lines.map((line) => line.length), 1) * 11 + 10
      if (y + height > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      if (header) {
        doc.setFillColor(226, 237, 255)
        doc.rect(margin, y - 9, pageWidth - margin * 2, height, "F")
      } else if (rowNumber % 2 === 0) {
        doc.setFillColor(249, 251, 255)
        doc.rect(margin, y - 9, pageWidth - margin * 2, height, "F")
      }
      let x = margin
      lines.forEach((line, index) => {
        doc.setTextColor(header ? 20 : 45, header ? 70 : 60, header ? 130 : 80)
        doc.setFontSize(header ? 8 : 8.5)
        doc.setFont("helvetica", header ? "bold" : "normal")
        doc.text(line, x + 4, y, { baseline: "top" })
        x += widths[index]
      })
      doc.setDrawColor(220, 228, 240)
      doc.line(margin, y + height - 2, pageWidth - margin, y + height - 2)
      y += height
      if (!header) rowNumber += 1
    }
    drawRow(columns, true)
    filtered.forEach((record) => {
      const time = auditTimestamp(record.ts)
      drawRow([
        `${time.date} ${time.time}`,
        record.actorName || record.actor || "System",
        auditActionLabel(record),
        `${record.target || record.resourceId || "System event"}${
          record.resourceType ? ` · ${record.resourceType}` : ""
        }`,
        auditDetailSummary(record),
      ])
    })
    for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
      doc.setPage(page)
      doc.setDrawColor(220, 228, 240)
      doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24)
      doc.setTextColor(110, 125, 145)
      doc.setFontSize(8)
      doc.text(
        "AeroPrice India · Confidential governance report",
        margin,
        pageHeight - 11,
      )
      doc.text(
        `Page ${page} of ${doc.getNumberOfPages()}`,
        pageWidth - margin - 70,
        pageHeight - 11,
      )
    }
    doc.save(`aeroprice-audit-${new Date().toISOString().slice(0, 10)}.pdf`)
  }
  const status = (record: AuditRecord) => (
    <span className={`audit-action-badge ${auditActionTone(record.action)}`}>
      {auditActionLabel(record)}
    </span>
  )
  return (
    <div className="audit-trail-page">
      <header className="audit-trail-header">
        <div className="audit-header-icon">
          <ClipboardCheck size={27} />
        </div>
        <div>
          <span>ADMIN CONTROL CENTER · GOVERNANCE</span>
          <h1>Audit Trail</h1>
          <p>
            Trace administrator changes with clear timestamps, actors, and
            affected accounts. All critical system events are recorded for
            governance and compliance.
          </p>
        </div>
        <div className="audit-range-wrap">
          <button
            className="audit-range-button"
            onClick={() => setRangeOpen((value) => !value)}
            aria-expanded={rangeOpen}
          >
            <CalendarDays size={16} />
            {rangeLabel}
            <ChevronDown size={15} />
          </button>
          {rangeOpen && (
            <div className="audit-range-menu" role="menu">
              <button onClick={() => setRange(null)}>All time</button>
              <button onClick={() => setRange(1)}>Last 24 hours</button>
              <button onClick={() => setRange(7)}>Last 7 days</button>
              <button onClick={() => setRange(30)}>Last 30 days</button>
            </div>
          )}
        </div>
      </header>
      <div className="audit-kpis">
        {[
          ["Total Events", total, <BarChart3 size={17} />],
          ["Unique Actors", stats.actors, <UserRound size={17} />],
          ["Action Types", stats.actions, <Layers3 size={17} />],
          ["User Changes", stats.userChanges, <UsersRound size={17} />],
          ["System Events", stats.systemEvents, <Settings2 size={17} />],
        ].map(([label, value, icon]) => (
          <div key={label as string}>
            <span>{label as string}</span>
            <strong>{value as number}</strong>
            <i className="audit-kpi-icon">{icon}</i>
            {total > records.length && label === "Total Events" && (
              <small>All records</small>
            )}
          </div>
        ))}
      </div>
      <div className="audit-toolbar">
        <label className="audit-search">
          <Search size={16} />
          <input
            value={filters.query}
            onChange={(event) => setFilter("query", event.target.value)}
            placeholder="Search actor, action, user, or details…"
            aria-label="Search audit log"
          />
        </label>
        <div className="audit-desktop-filters">
          <select
            value={filters.action}
            onChange={(event) => setFilter("action", event.target.value)}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {auditActionLabel({ action, metadata: {} })}
              </option>
            ))}
          </select>
          <select
            value={filters.actor}
            onChange={(event) => setFilter("actor", event.target.value)}
            aria-label="Filter by actor"
          >
            <option value="">All actors</option>
            {actors.map((actor) => (
              <option key={actor}>{actor}</option>
            ))}
          </select>
          <select
            value={filters.targetType}
            onChange={(event) => setFilter("targetType", event.target.value)}
            aria-label="Filter by target type"
          >
            <option value="">All target types</option>
            {targetTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
        <Button
          className="audit-mobile-filter"
          size="xs"
          variant="neutral"
          onClick={() => setFilterOpen(true)}
          iconStart={<Filter size={14} />}
        >
          Filters
        </Button>
        {(filters.query ||
          filters.action ||
          filters.actor ||
          filters.targetType ||
          filters.from ||
          filters.to) && (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              setFilters(emptyAuditFilters)
              setPage(1)
            }}
            iconStart={<X size={13} />}
          >
            Clear filters
          </Button>
        )}
        <Button
          size="xs"
          variant="neutral"
          onClick={() => { setPage(1); onRefresh() }}
          loading={loading}
          iconStart={<RefreshCw size={13} />}
        >
          Refresh
        </Button>
        <Button
          size="xs"
          variant="neutral"
          onClick={exportCsv}
          disabled={!filtered.length}
          iconStart={<Download size={13} />}
        >
          Export CSV
        </Button>
        <Button
          size="xs"
          variant="neutral"
          onClick={exportPdf}
          disabled={!filtered.length}
          iconStart={<Printer size={13} />}
        >
          Export PDF
        </Button>
      </div>
      {total > records.length && (
        <p className="audit-retention-note">
          Showing the latest {records.length} of {total} events. Filters and
          export apply to the loaded events.
        </p>
      )}
      {loading && (
        <p className="audit-retention-note" role="status">
          Refreshing audit trail...
        </p>
      )}
      {error && !records.length ? (
        <div className="audit-empty">
          <strong>Audit events unavailable</strong>
          <span>{error}</span>
          <Button size="xs" variant="neutral" onClick={onRefresh}>
            Try again
          </Button>
        </div>
      ) : !filtered.length ? (
        <div className="audit-empty">
          <Search />
          <strong>{loaded ? "No matching events" : "No audit events shown yet"}</strong>
          <span>
            {loaded
              ? "Try another search or filter."
              : "The latest audit events will appear here as soon as the server responds."}
          </span>
        </div>
      ) : (
        <>
          <div className="audit-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp ↕</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target user / resource</th>
                  <th>Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((record) => {
                  const time = auditTimestamp(record.ts)
                  return (
                    <tr
                      key={
                        record.id ||
                        `${record.ts}-${record.action}-${record.actor}`
                      }
                    >
                      <td>
                        <div className="audit-timestamp-cell">
                          <Clock3 size={15} />
                          <div>
                            <strong>{time.date}</strong>
                            <small>{time.time}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="audit-actor">
                          <span>
                            {(record.actorName || record.actor || "S")
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                          <div>
                            {record.actorName || record.actor || "System"}
                            <small>
                              {record.actorRole || "Role not recorded"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{status(record)}</td>
                      <td>
                        <div className="audit-target">
                          <span>
                            <UserRound size={14} />
                          </span>
                          <div>
                            <strong>
                              {record.target ||
                                record.resourceId ||
                                "System event"}
                            </strong>
                            <small>
                              {record.resourceType || "Resource not recorded"}
                              {record.targetRole
                                ? ` · ${record.targetRole}`
                                : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="audit-detail">
                        {auditDetailSummary(record)}
                      </td>
                      <td>
                        <div className="audit-row-actions">
                          <Button
                            size="xs"
                            variant="neutral"
                            onClick={() => setSelected(record)}
                            iconStart={<Eye size={13} />}
                          >
                            View details
                          </Button>
                          <button
                            className="audit-more"
                            aria-label="More event actions"
                            onClick={() => setSelected(record)}
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="audit-cards">
            {visible.map((record) => {
              const time = auditTimestamp(record.ts)
              return (
                <article key={record.id || `${record.ts}-${record.action}`}>
                  <div className="audit-card-top">
                    {status(record)}
                    <small>
                      {time.date} · {time.time}
                    </small>
                  </div>
                  <h3>
                    {record.target || record.resourceId || "System event"}
                  </h3>
                  <p className="audit-card-actor">
                    Actor · {record.actorName || record.actor || "System"}
                    {record.actorRole ? ` · ${record.actorRole}` : ""}
                  </p>
                  <p>{auditDetailSummary(record)}</p>
                  <Button
                    size="xs"
                    variant="neutral"
                    onClick={() => setSelected(record)}
                    iconStart={<Eye size={13} />}
                  >
                    View details
                  </Button>
                </article>
              )
            })}
          </div>
          <div className="audit-pagination">
            <span>
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filtered.length)} of {filtered.length}{" "}
              events
            </span>
            <div className="audit-page-controls">
              <Button
                size="xs"
                variant="subtle"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                ‹
              </Button>
              {Array.from(
                { length: Math.min(pages, 3) },
                (_, index) => index + 1,
              ).map((number) => (
                <Button
                  key={number}
                  size="xs"
                  variant={page === number ? "primary" : "subtle"}
                  onClick={() => setPage(number)}
                >
                  {number}
                </Button>
              ))}
              <Button
                size="xs"
                variant="subtle"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                ›
              </Button>
              <select
                className="audit-page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
                aria-label="Events per page"
              >
                <option value={7}>7 rows per page</option>
                <option value={14}>14 rows per page</option>
                <option value={20}>20 rows per page</option>
              </select>
            </div>
          </div>
        </>
      )}
      {selected && (
        <Modal
          isOpen
          title="Audit event details"
          onClose={() => setSelected(null)}
          size="lg"
        >
          <div className="audit-detail-modal">
            <h3>{auditActionLabel(selected)}</h3>
            <dl>
              <div>
                <dt>Event ID</dt>
                <dd>{selected.id || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>
                  {auditTimestamp(selected.ts).date} ·{" "}
                  {auditTimestamp(selected.ts).time}
                </dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>
                  {selected.actorName || selected.actor || "System"}
                  {selected.actorRole ? ` · ${selected.actorRole}` : ""}
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>
                  {selected.target || selected.resourceId || "Not recorded"}
                </dd>
              </div>
              <div>
                <dt>Target type</dt>
                <dd>{selected.resourceType || "Not recorded"}</dd>
              </div>
            </dl>
            <h4>Full details</h4>
            <pre>{selected.detail || "No additional details recorded"}</pre>
          </div>
        </Modal>
      )}
      {filterOpen && (
        <div
          className="audit-filter-sheet"
          role="dialog"
          aria-label="Audit filters"
        >
          <div>
            <h2>Filters</h2>
            <button
              aria-label="Close filters"
              onClick={() => setFilterOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {[
            ["action", "Action", actions],
            ["actor", "Actor", actors],
            ["targetType", "Target type", targetTypes],
          ].map(([key, label, values]) => (
            <label key={key as string}>
              {label as string}
              <select
                value={filters[(key as keyof AuditFilters)]}
                onChange={(event) =>
                  setFilter(key as keyof AuditFilters, event.target.value)
                }
              >
                <option value="">All</option>
                {(values as string[]).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
          <Button
            size="sm"
            variant="primary"
            onClick={() => setFilterOpen(false)}
          >
            Apply filters
          </Button>
        </div>
      )}
    </div>
  )
}
