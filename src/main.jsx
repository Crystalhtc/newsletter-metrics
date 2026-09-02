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

const STORY_SAMPLE_ROWS = [
  { id: crypto.randomUUID(), link: "https://bcparksfoundation.ca/", uniqueClicks: 38 },
  {
    id: crypto.randomUUID(),
    link: "https://www.discoverparks.ca/Discover-Parks-Ambassadors",
    uniqueClicks: 53,
  },
  {
    id: crypto.randomUUID(),
    link: "https://bcparksfoundation.ca/campaigns/myra-bellevue-park-2/",
    uniqueClicks: 167,
  },
  { id: crypto.randomUUID(), link: "https://trailblazer.ca/", uniqueClicks: 73 },
  {
    id: crypto.randomUUID(),
    link: "https://www.discoverparks.ca/activities/self-guided-discover...",
    uniqueClicks: 154,
  },
  {
    id: crypto.randomUUID(),
    link: "https://bcparksfoundation.ca/updates/kitty-coleman-creek-is-...",
    uniqueClicks: 82,
  },
  {
    id: crypto.randomUUID(),
    link: "https://bcparksfoundation.ca/updates/of-storms-rainbows-and-...",
    uniqueClicks: 51,
  },
  {
    id: crypto.randomUUID(),
    link: "https://shop.bcparksfoundation.ca/collections/nature-is-quee...",
    uniqueClicks: 67,
  },
  {
    id: crypto.randomUUID(),
    link: "https://shop.bcparksfoundation.ca/collections/bottles-drinkware",
    uniqueClicks: 42,
  },
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

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadMetricsCsv(entries) {
  downloadCsv(
    "newsletter-metrics.csv",
    ["Month", "Open rate", "CTR", "Sent"],
    entries.map((entry) => [
      entry.label,
      pct(entry.openRate),
      pct(entry.ctr),
      entry.totalSent,
    ])
  );
}

function downloadStoriesCsv(rows) {
  downloadCsv(
    "top-stories.csv",
    ["Month", "Audiences", "Story", "Link", "Unique clicks"],
    rows.map((row) => [
      storyMonth(row),
      row.audience || "-",
      row.story || storyFromLink(row.link),
      row.link,
      row.uniqueClicks,
    ])
  );
}

function getStoredEntries() {
  try {
    return JSON.parse(window.localStorage.getItem("mail-log:entries")) || [];
  } catch {
    return [];
  }
}

function getStoredStories() {
  try {
    return JSON.parse(window.localStorage.getItem("mail-log:stories")) || [];
  } catch {
    return [];
  }
}

function storyFromLink(link) {
  try {
    const url = new URL(link.replace("...", ""));
    const parts = url.pathname.split("/").filter(Boolean);
    const raw = parts.at(-1) || url.hostname.replace(/^www\./, "");
    return raw
      .replace(/\.\.\.$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return link.replace(/^https?:\/\//, "").replace(/[-/]/g, " ");
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
  const [activeTab, setActiveTab] = useState("metrics");
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
          <h1>Newsletter Report</h1>
          <p>
            BCPF newsletter metrics and top stories tracking
          </p>
        </div>
      </header>

      <div className={`view-toggle ${activeTab}`} role="group" aria-label="Report view">
        <button
          className={activeTab === "metrics" ? "active" : ""}
          type="button"
          aria-pressed={activeTab === "metrics"}
          onClick={() => setActiveTab("metrics")}
        >
          Metrics
        </button>
        <button
          className={activeTab === "stories" ? "active" : ""}
          type="button"
          aria-pressed={activeTab === "stories"}
          onClick={() => setActiveTab("stories")}
        >
          Top Stories
        </button>
      </div>

      {activeTab === "metrics" ? (
        <>
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
        <div className="section-head">
          <h2>Metrics</h2>
          <button
            className="ghost-button"
            type="button"
            disabled={sortedEntries.length === 0}
            onClick={() => downloadMetricsCsv(sortedEntries)}
          >
            Download CSV
          </button>
        </div>
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
        </>
      ) : (
        <StoriesReport />
      )}
    </main>
  );
}

export function StoriesReport() {
  const now = new Date();
  const fileInputRef = useRef(null);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [audience, setAudience] = useState("Engaged");
  const [rows, setRows] = useState([]);
  const [reports, setReports] = useState(getStoredStories);
  const [imagePreview, setImagePreview] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState("");

  const savedTopStories = useMemo(() => topStories(reports), [reports]);

  function persist(nextReports) {
    setReports(nextReports);
    window.localStorage.setItem("mail-log:stories", JSON.stringify(nextReports));
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Please upload a PNG or JPG screenshot.");
      return;
    }

    setImagePreview(URL.createObjectURL(file));
    setRows(
      STORY_SAMPLE_ROWS.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        story: storyFromLink(row.link),
      }))
    );
    setStatus("Screenshot loaded. Review the extracted stories before saving.");
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  function updateRow(id, field, value) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: field === "uniqueClicks" ? Number(value) || 0 : value,
              story: field === "link" ? storyFromLink(value) : row.story,
            }
          : row
      )
    );
  }

  function addStory() {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        link: "",
        story: "",
        uniqueClicks: 0,
      },
    ]);
  }

  function removeStory(id) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function clearUpload() {
    setImagePreview("");
    setRows([]);
    setStatus("");
  }

  function saveStories() {
    const savedRows = rows
      .filter((row) => row.link.trim() || row.story.trim())
      .map((row) => ({
        id: crypto.randomUUID(),
        month,
        year,
        monthLabel: entryLabel(year, month),
        audience,
        story: row.story || storyFromLink(row.link),
        link: row.link,
        uniqueClicks: Number(row.uniqueClicks) || 0,
        updatedAt: new Date().toISOString(),
      }));

    persist([...reports, ...savedRows]);
    setStatus(`Saved ${savedRows.length} stories for ${MONTHS[month]} ${year}.`);
    setImagePreview("");
    setRows([]);
  }

  function deleteStoryGroup(target) {
    persist(
      reports.filter(
        (report) =>
          storyMonth(report) !== storyMonth(target) ||
          (report.audience || "-") !== (target.audience || "-")
      )
    );
  }

  return (
    <>
      <section className="upload-panel" aria-label="Upload stories screenshot">
        <div className="date-row">
          <span>This screenshot covers</span>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            aria-label="Story month"
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
            aria-label="Story year"
          >
            {Array.from({ length: 6 }, (_, index) => now.getFullYear() - 3 + index).map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              )
            )}
          </select>
          <label className="audience-field">
            Audience
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            >
              <option value="Engaged">Engaged</option>
              <option value="Disengaged">Disengaged</option>
            </select>
          </label>
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
            <img src={imagePreview} alt="Uploaded story link screenshot preview" />
          ) : (
            <div className="drop-message">
              <span className="upload-icon">↑</span>
              <span>Drop a link report screenshot here, or click to browse</span>
              <small>PNG or JPG - links and unique clicks</small>
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
          <button
            className="primary-button"
            type="button"
            disabled={rows.length === 0}
            onClick={saveStories}
          >
            Save stories
          </button>
          {imagePreview && (
            <button className="ghost-button" type="button" onClick={clearUpload}>
              Clear
            </button>
          )}
          {status && <span className="status-text">{status}</span>}
        </div>

        {rows.length > 0 && (
          <div className="preview-panel">
            <p>Extracted rows</p>
            <EditableStoriesTable rows={rows} onUpdate={updateRow} onRemove={removeStory} />
            <div className="action-row">
              <button className="ghost-button" type="button" onClick={addStory}>
                Add story
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="ledger-section">
        <div className="section-head">
          <h2>Top Stories</h2>
          <button
            className="ghost-button"
            type="button"
            disabled={savedTopStories.length === 0}
            onClick={() => downloadStoriesCsv(savedTopStories)}
          >
            Download CSV
          </button>
        </div>
        {savedTopStories.length === 0 ? (
          <div className="empty-state compact">No saved stories yet.</div>
        ) : (
          <StoriesTable rows={savedTopStories} onDelete={deleteStoryGroup} />
        )}
      </section>
    </>
  );
}

function topStories(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${storyMonth(row)}::${row.audience || "-"}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()]
    .flatMap((group) =>
      group
        .sort((a, b) => Number(b.uniqueClicks) - Number(a.uniqueClicks))
        .slice(0, 3)
    )
    .sort(
      (a, b) =>
        storyMonth(a).localeCompare(storyMonth(b)) ||
        String(a.audience || "").localeCompare(String(b.audience || "")) ||
        Number(b.uniqueClicks) - Number(a.uniqueClicks)
    );
}

function storyMonth(row) {
  if (row.monthLabel) return row.monthLabel;
  if (Number.isInteger(row.year) && Number.isInteger(row.month)) {
    return entryLabel(row.year, row.month);
  }
  return "-";
}

export function StoriesTable({ rows, onDelete, showActions = true }) {
  const mergedRows = rows.map((row, index) => {
    const previous = rows[index - 1];
    const month = storyMonth(row);
    const audience = row.audience || "-";
    const startsMonth = !previous || storyMonth(previous) !== month;
    const startsAudience = !previous || previous.audience !== audience || startsMonth;
    const monthSpan = startsMonth
      ? rows.slice(index).findIndex((item) => storyMonth(item) !== month)
      : 0;
    const audienceSpan = startsAudience
      ? rows
          .slice(index)
          .findIndex(
            (item) =>
              storyMonth(item) !== month ||
              (item.audience || "-") !== audience
          )
      : 0;

    return {
      ...row,
      month,
      audience,
      showMonth: startsMonth,
      showAudience: startsAudience,
      monthSpan: monthSpan === -1 ? rows.length - index : monthSpan,
      audienceSpan: audienceSpan === -1 ? rows.length - index : audienceSpan,
    };
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Audiences</th>
            <th>Story</th>
            <th>Link</th>
            <th>Unique clicks</th>
            {showActions && <th aria-label="Actions"></th>}
          </tr>
        </thead>
        <tbody>
          {mergedRows.map((row) => (
            <tr key={row.id}>
              {row.showMonth && <td rowSpan={row.monthSpan}>{row.month}</td>}
              {row.showAudience && <td rowSpan={row.audienceSpan}>{row.audience}</td>}
              <td>{row.story || storyFromLink(row.link)}</td>
              <td>
                {row.link ? (
                  <a href={row.link.replace("...", "")} target="_blank" rel="noreferrer">
                    {row.link}
                  </a>
                ) : (
                  "-"
                )}
              </td>
              <td>{Number(row.uniqueClicks).toLocaleString()}</td>
              {showActions && row.showAudience && (
                <td className="row-actions" rowSpan={row.audienceSpan}>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => onDelete(row)}
                    aria-label={`Delete ${row.month} ${row.audience} stories`}
                    title="Delete audience group"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EditableStoriesTable({ rows, onUpdate, onRemove }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Story</th>
            <th>Link</th>
            <th>Unique clicks</th>
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <input
                  value={row.story}
                  onChange={(event) => onUpdate(row.id, "story", event.target.value)}
                />
              </td>
              <td>
                <input
                  value={row.link}
                  onChange={(event) => onUpdate(row.id, "link", event.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  value={row.uniqueClicks}
                  onChange={(event) =>
                    onUpdate(row.id, "uniqueClicks", event.target.value)
                  }
                />
              </td>
              <td className="row-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onRemove(row.id)}
                  aria-label="Remove story"
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

export function TrendLineChart({ entries }) {
  const width = 760;
  const height = 260;
  const padding = { top: 18, right: 28, bottom: 42, left: 58 };
  const values = entries.flatMap((entry) => [entry.openRate, entry.ctr]);
  const tickStep = 5;
  const maxValue = Math.max(tickStep, Math.ceil(Math.max(...values) / tickStep) * tickStep);
  const yTicks = Array.from(
    { length: maxValue / tickStep },
    (_, index) => maxValue - index * tickStep
  );
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

  return (
    <div className="line-chart" aria-label="Saved monthly metric line chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <title>Open rate and CTR trend by saved month</title>
        {yTicks.map((value) => {
          const y = yFor(value);
          return (
            <g key={value}>
              <text className="y-axis-label" x={padding.left - 10} y={y}>
                {value}
              </text>
              <line
                className="grid-line"
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
              />
            </g>
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
