import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SAMPLE_ROWS = [
  { id: crypto.randomUUID(), sent: 14862, openRate: 6.7, ctr: 0.29 },
  { id: crypto.randomUUID(), sent: 11736, openRate: 58.43, ctr: 4.43 },
];

function entryKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function entryLabel(year, month) {
  return `${MONTHS[month].slice(0, 3)} '${String(year).slice(2)}`;
}

function pct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

function getStoredEntries() {
  try {
    return JSON.parse(window.localStorage.getItem("mail-log:entries")) || [];
  } catch {
    return [];
  }
}

function weighted(rows, field) {
  const validRows = rows.filter((row) => Number(row.sent) > 0);
  const totalSent = validRows.reduce((sum, row) => sum + Number(row.sent), 0);
  if (!totalSent) return { totalSent: 0, value: 0 };

  return {
    totalSent,
    value:
      validRows.reduce(
        (sum, row) => sum + Number(row.sent) * (Number(row[field]) || 0),
        0
      ) / totalSent,
  };
}

export default function App() {
  const now = new Date();
  const fileInputRef = useRef(null);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState(SAMPLE_ROWS);
  const [entries, setEntries] = useState(getStoredEntries);
  const [imagePreview, setImagePreview] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState("");

  const open = useMemo(() => weighted(rows, "openRate"), [rows]);
  const click = useMemo(() => weighted(rows, "ctr"), [rows]);
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.id.localeCompare(b.id)),
    [entries]
  );
  const currentEntryExists = entries.some((entry) => entry.id === entryKey(year, month));

  function persist(nextEntries) {
    setEntries(nextEntries);
    window.localStorage.setItem("mail-log:entries", JSON.stringify(nextEntries));
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Please upload a PNG or JPG screenshot.");
      return;
    }

    setImagePreview(URL.createObjectURL(file));
    setRows(SAMPLE_ROWS.map((row) => ({ ...row, id: crypto.randomUUID() })));
    setStatus("Screenshot loaded. Confirm or edit the rows below.");
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  function updateRow(id, field, value) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, [field]: value === "" ? "" : Number(value) } : row
      )
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      { id: crypto.randomUUID(), sent: "", openRate: "", ctr: "" },
    ]);
  }

  function removeRow(id) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function clearUpload() {
    setImagePreview("");
    setRows(SAMPLE_ROWS.map((row) => ({ ...row, id: crypto.randomUUID() })));
    setStatus("");
  }

  function saveMonth() {
    const id = entryKey(year, month);
    const nextEntry = {
      id,
      month,
      year,
      label: entryLabel(year, month),
      openRate: Number(open.value.toFixed(2)),
      ctr: Number(click.value.toFixed(2)),
      totalSent: open.totalSent,
      rows: rows.map(({ sent, openRate, ctr }) => ({ sent, openRate, ctr })),
      updatedAt: new Date().toISOString(),
    };
    const nextEntries = [
      ...entries.filter((entry) => entry.id !== id),
      nextEntry,
    ].sort((a, b) => a.id.localeCompare(b.id));

    persist(nextEntries);
    setStatus(`Saved ${MONTHS[month]} ${year}.`);
    setImagePreview("");
  }

  function deleteEntry(id) {
    persist(entries.filter((entry) => entry.id !== id));
  }

  return (
    <main className="mail-log">
      <header className="topbar">
        <div>
          <p className="brand-label">BC Parks Foundation</p>
          <h1>Newsletter Metrics</h1>
          <p>
            Protect now, enjoy forever. Track the stories, campaigns, and park
            updates that keep the community connected.
          </p>
        </div>
      </header>

      <section className="upload-panel" aria-label="Upload screenshot">
        <div className="date-row">
          <span>This screenshot covers</span>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            aria-label="Month"
          >
            {MONTHS.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Year"
          >
            {Array.from({ length: 6 }, (_, index) => now.getFullYear() - 3 + index).map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              )
            )}
          </select>
          {currentEntryExists && (
            <strong className="replace-note">Saving will replace this month.</strong>
          )}
        </div>

        <div
          className={`dropzone ${dragOver ? "drag" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter") fileInputRef.current?.click();
          }}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Uploaded dashboard screenshot preview" />
          ) : (
            <div className="drop-message">
              <span className="upload-icon">↑</span>
              <span>Drop a dashboard screenshot here, or click to browse</span>
              <small>PNG or JPG - one or more campaign rows per image</small>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>

        <div className="action-row">
          <button className="primary-button" type="button" disabled={!imagePreview} onClick={saveMonth}>
            Save to {MONTHS[month]} {year}
          </button>
          {imagePreview && (
            <button className="ghost-button" type="button" onClick={clearUpload}>
              Clear
            </button>
          )}
          {status && <span className="status-text">{status}</span>}
        </div>

        {imagePreview && (
          <div className="preview-panel">
            <p>
              Found {rows.length} row{rows.length === 1 ? "" : "s"} - weighted by emails
              sent
            </p>
            <RowTable rows={rows} onUpdate={updateRow} onRemove={removeRow} />
            <div className="preview-footer">
              <Metric label="Weighted open rate" value={pct(open.value)} tone="green" />
              <Metric label="Weighted CTR" value={pct(click.value)} tone="red" />
              <Metric label="Total sent" value={open.totalSent.toLocaleString()} />
              <button className="ghost-button" type="button" onClick={addRow}>
                Add row
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="trend-section">
        <h2>Trend</h2>
        {sortedEntries.length === 0 ? (
          <div className="empty-state">No months saved yet. Upload a screenshot to start the log.</div>
        ) : (
          <>
            <TrendLineChart entries={sortedEntries} />
            <div className="legend">
              <span>
                <i className="open-dot" /> Open rate
              </span>
              <span>
                <i className="ctr-dot" /> CTR
              </span>
            </div>
          </>
        )}
      </section>

      <section className="ledger-section">
        <h2>Ledger</h2>
        {sortedEntries.length === 0 ? (
          <div className="empty-state compact">Nothing logged yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Open rate</th>
                  <th>CTR</th>
                  <th>Sent</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.label}</td>
                    <td className="green-text">{pct(entry.openRate)}</td>
                    <td className="red-text">{pct(entry.ctr)}</td>
                    <td>{entry.totalSent.toLocaleString()}</td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => deleteEntry(entry.id)}
                        aria-label={`Delete ${entry.label}`}
                        title="Delete"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export function TrendLineChart({ entries }) {
  const width = 760;
  const height = 260;
  const padding = { top: 18, right: 28, bottom: 42, left: 42 };
  const values = entries.flatMap((entry) => [entry.openRate, entry.ctr]);
  const maxValue = Math.max(10, ...values);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  function xFor(index) {
    if (entries.length === 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (entries.length - 1)) * plotWidth;
  }

  function yFor(value) {
    return padding.top + plotHeight - (value / maxValue) * plotHeight;
  }

  function pathFor(key) {
    return entries
      .map((entry, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(entry[key])}`)
      .join(" ");
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="line-chart" aria-label="Saved monthly metric line chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <title>Open rate and CTR trend by saved month</title>
        {gridLines.map((step) => {
          const y = padding.top + plotHeight * step;
          return (
            <line
              className="grid-line"
              key={step}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
            />
          );
        })}
        <line
          className="axis-line"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        <line
          className="axis-line"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
        <path className="trend-path open" d={pathFor("openRate")} />
        <path className="trend-path ctr" d={pathFor("ctr")} />
        {entries.map((entry, index) => (
          <g key={entry.id}>
            <circle
              className="trend-dot open"
              cx={xFor(index)}
              cy={yFor(entry.openRate)}
              r="4"
            >
              <title>{`${entry.label} open rate ${pct(entry.openRate)}`}</title>
            </circle>
            <circle
              className="trend-dot ctr"
              cx={xFor(index)}
              cy={yFor(entry.ctr)}
              r="4"
            >
              <title>{`${entry.label} CTR ${pct(entry.ctr)}`}</title>
            </circle>
            <text className="chart-label" x={xFor(index)} y={height - 16}>
              {entry.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function RowTable({ rows, onUpdate, onRemove }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sent</th>
            <th>Open rate</th>
            <th>CTR</th>
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <input
                  type="number"
                  min="0"
                  value={row.sent}
                  onChange={(event) => onUpdate(row.id, "sent", event.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.openRate}
                  onChange={(event) => onUpdate(row.id, "openRate", event.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.ctr}
                  onChange={(event) => onUpdate(row.id, "ctr", event.target.value)}
                />
              </td>
              <td className="row-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onRemove(row.id)}
                  aria-label="Remove row"
                  title="Remove"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Metric({ label, value, tone = "" }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
