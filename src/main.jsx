import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

const AUDIENCES = ["Engaged", "Disengaged"];

function entryKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function entryLabel(year, month) {
  return `${MONTHS[month].slice(0, 3)} '${String(year).slice(2)}`;
}

function pct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

function reportYearOptions(selectedYear) {
  const currentYear = new Date().getFullYear();
  return [...new Set([
    ...Array.from({ length: 6 }, (_, index) => currentYear - 3 + index),
    Number(selectedYear),
  ])].sort((a, b) => a - b);
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

function pdfText(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(value, maxChars) {
  const words = String(value ?? "-").split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      line = "";
    } else if (`${line} ${word}`.trim().length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function downloadPdf(filename, title, headers, rows, columnWidths) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 36;
  const lineHeight = 13;
  const charWidth = 5.3;
  const pages = [];
  let y = margin;
  let commands = [];

  function add(command) {
    commands.push(command);
  }

  function text(x, yTop, value, size = 10, font = "F1") {
    add(`BT /${font} ${size} Tf ${x} ${pageHeight - yTop} Td (${pdfText(value)}) Tj ET`);
  }

  function startPage() {
    commands = [];
    y = margin;
    add("0.165 0.157 0.153 rg");
    text(margin, y, title, 18, "F2");
    y += 30;
    drawHeader();
  }

  function finishPage() {
    pages.push(commands.join("\n"));
  }

  function drawHeader() {
    let x = margin;
    add("0.902 1 0.655 rg");
    add(`${margin} ${pageHeight - y - 22} ${pageWidth - margin * 2} 24 re f`);
    add("0.165 0.157 0.153 rg");
    headers.forEach((header, index) => {
      text(x + 5, y + 16, header, 9, "F2");
      x += columnWidths[index];
    });
    y += 30;
  }

  function ensureSpace(height) {
    if (y + height <= pageHeight - margin) return;
    finishPage();
    startPage();
  }

  startPage();
  rows.forEach((row) => {
    const wrappedCells = row.map((cell, index) =>
      wrapPdfText(cell, Math.max(8, Math.floor((columnWidths[index] - 10) / charWidth)))
    );
    const rowHeight = Math.max(...wrappedCells.map((cell) => cell.length)) * lineHeight + 10;
    ensureSpace(rowHeight);
    let x = margin;
    add("1 1 1 rg");
    add(`${margin} ${pageHeight - y - rowHeight + 4} ${pageWidth - margin * 2} ${rowHeight} re f`);
    add("0.165 0.157 0.153 rg");
    wrappedCells.forEach((cellLines, cellIndex) => {
      cellLines.forEach((line, lineIndex) => {
        text(x + 5, y + 14 + lineIndex * lineHeight, line, 9);
      });
      x += columnWidths[cellIndex];
    });
    y += rowHeight + 4;
  });
  finishPage();

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids ${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")} /Count ${pages.length} >>`,
  ];

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${page.length} >>\nstream\n${page}\nendstream`
    );
  });

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([body], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function storeEntries(entries) {
  window.localStorage.setItem("mail-log:entries", JSON.stringify(entries));
}

function storeStories(stories) {
  window.localStorage.setItem("mail-log:stories", JSON.stringify(stories));
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

function parseNumber(value) {
  return Number(String(value).replace(/,/g, ""));
}

function extractMetric(text, label, isPercent = false) {
  const normalized = text.replace(/\s+/g, " ");
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = normalized.match(new RegExp(`${escaped}\\s+([\\d,.]+)${isPercent ? "%?" : ""}`, "i"));
  return match ? parseNumber(match[1]) : 0;
}

function extractLastMetric(text, label, isPercent = false) {
  const normalized = text.replace(/\s+/g, " ");
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const matches = [
    ...normalized.matchAll(new RegExp(`${escaped}\\s+([\\d,.]+)${isPercent ? "%?" : ""}`, "gi")),
  ];
  return matches.length ? parseNumber(matches.at(-1)[1]) : 0;
}

function extractUniqueCtr(text) {
  const normalized = text.replace(/\s+/g, " ");
  const normalMatch = normalized.match(/Unique\s+Click\s+Through\s+Rate\s+([\d,.]+)%?/i);
  const splitMatch = normalized.match(/Unique\s+Click\s+Through\s+([\d,.]+)%?\s+Rate/i);
  return parseNumber(normalMatch?.[1] ?? splitMatch?.[1] ?? 0);
}

function extractSubjectLine(text) {
  const normalized = text.replace(/\s+/g, " ");
  const match = normalized.match(/Subject\s+(.+?)\s+Tracker\s+Domain/i);
  return match?.[1]?.trim() || "";
}

async function extractPdfText(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const layoutPages = [];
  const rawPages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    rawPages.push(content.items.map((item) => item.str).join("\n"));
    const items = content.items
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
      }))
      .filter((item) => item.text.trim());
    layoutPages.push(linesFromTextItems(items));
  }

  return {
    layoutText: layoutPages.flat().join("\n"),
    rawText: rawPages.join("\n"),
  };
}

function linesFromTextItems(items) {
  const lines = [];
  for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) < 3);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines.map((line) =>
    line.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(" ")
  );
}

function parsePdfReport(pdfText) {
  const rawText = pdfText.rawText ?? pdfText;
  const layoutText = pdfText.layoutText ?? pdfText;

  return {
    metrics: {
      totalSent: extractMetric(rawText, "Total Sent"),
      openRate: extractLastMetric(rawText, "HTML Open Rate", true),
      ctr: extractUniqueCtr(rawText),
    },
    subjectLine: extractSubjectLine(rawText),
    stories: parseStoryRows(layoutText),
  };
}

function parseStoryRows(text) {
  const tableStart = findStoryTableStart(text);
  const normalized = text
    .slice(tableStart >= 0 ? tableStart : 0)
    .replace(/[“”]/g, '"')
    .replace(/[|]/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  const chunks = normalized.match(/https?:\/\/.*?(?=\s+https?:\/\/|$)/gi) || [];

  return chunks
    .map((chunk) => {
      const match =
        chunk.match(/^(.*?)\s+(\d{1,6})\s+\d{1,6}(?:\s|$)/) ||
        chunk.match(/^(.*?)\s+(\d{1,6})(?:\s|$)/);
      if (!match) return null;
      const link = cleanPdfLink(match[1]);
      if (!link || !isStoryReportLink(link)) return null;

      return {
        id: crypto.randomUUID(),
        link,
        story: storyFromLink(link),
        uniqueClicks: Number(match[2]),
      };
    })
    .filter(Boolean);
}

function findStoryTableStart(text) {
  const tableStart = text.search(/Clicks\s+LINK/i);
  if (tableStart >= 0) return tableStart;

  const linkHeaderStart = text.search(/LINK\s+.*?UNIQUE\s+CLICKS\s+.*?TOTAL\s+CLICKS/i);
  if (linkHeaderStart >= 0) return linkHeaderStart;

  return 0;
}

function cleanPdfLink(link) {
  const compact = link
    .replace(/-\s+/g, "")
    .replace(/\s+/g, "")
    .replace(/[),.;:]+$/, "")
    .replace(/\/{3,}/g, "//");
  const match = compact.match(/https?:\/\/.+/i);
  return match?.[0] || null;
}

function isStoryReportLink(link) {
  const normalized = link.toLowerCase();
  if (
    normalized.includes("salesforce.com") ||
    normalized.includes("articleview") ||
    normalized.includes("/email/read") ||
    normalized.includes("setup")
  ) {
    return false;
  }

  return /^https?:\/\//i.test(link);
}

function buildMetricEntry(previousEntry, year, month, audience, metrics) {
  const sources = {
    ...(previousEntry?.sources || {}),
    [audience]: metrics,
  };
  const sourceValues = Object.values(sources).filter((source) => source.totalSent > 0);
  const totalSent = sourceValues.reduce((sum, source) => sum + source.totalSent, 0);
  const openRate =
    totalSent === 0
      ? 0
      : sourceValues.reduce((sum, source) => sum + source.totalSent * source.openRate, 0) /
        totalSent;
  const ctr =
    totalSent === 0
      ? 0
      : sourceValues.reduce((sum, source) => sum + source.totalSent * source.ctr, 0) /
        totalSent;

  return {
    id: entryKey(year, month),
    month,
    year,
    label: entryLabel(year, month),
    openRate: Number(openRate.toFixed(2)),
    ctr: Number(ctr.toFixed(2)),
    totalSent,
    sources,
    updatedAt: new Date().toISOString(),
  };
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

function downloadMetricsPdf(entries) {
  downloadPdf(
    "newsletter-metrics.pdf",
    "Newsletter Metrics",
    ["Month", "Open rate", "CTR", "Sent"],
    entries.map((entry) => [
      entry.label,
      pct(entry.openRate),
      pct(entry.ctr),
      entry.totalSent.toLocaleString(),
    ]),
    [160, 160, 160, 160]
  );
}

function downloadStoriesCsv(rows) {
  downloadCsv(
    "top-stories.csv",
    ["Month", "Audiences", "Subject line", "Story", "Link", "Unique clicks"],
    rows.map((row) => [
      storyMonth(row),
      row.audience || "-",
      row.subjectLine || "-",
      row.story || storyFromLink(row.link),
      row.link,
      row.uniqueClicks,
    ])
  );
}

function downloadStoriesPdf(rows) {
  downloadPdf(
    "top-stories.pdf",
    "Top Stories",
    ["Month", "Audiences", "Subject line", "Story", "Link", "Unique clicks"],
    rows.map((row) => [
      storyMonth(row),
      row.audience || "-",
      row.subjectLine || "-",
      row.story || storyFromLink(row.link),
      row.link,
      row.uniqueClicks,
    ]),
    [60, 70, 150, 150, 260, 70]
  );
}

export default function App() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState("metrics");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState(getStoredEntries);
  const [stories, setStories] = useState(getStoredStories);
  const [statuses, setStatuses] = useState({});
  const [pendingReports, setPendingReports] = useState({});

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.id.localeCompare(b.id)),
    [entries]
  );
  const topStoryRows = useMemo(() => topStories(stories), [stories]);
  const pendingCount = Object.keys(pendingReports).length;
  const canConfirmReports = AUDIENCES.every((audience) => pendingReports[audience]);

  function persistEntries(nextEntries) {
    setEntries(nextEntries);
    storeEntries(nextEntries);
  }

  function persistStories(nextStories) {
    setStories(nextStories);
    storeStories(nextStories);
  }

  async function handlePdfUpload(audience, file) {
    if (!file || file.type !== "application/pdf") {
      setStatuses((current) => ({ ...current, [audience]: "Please upload a PDF." }));
      return;
    }

    setStatuses((current) => ({ ...current, [audience]: "Reading PDF..." }));
    try {
      const text = await extractPdfText(file);
      const report = parsePdfReport(text);
      setPendingReports((current) => ({
        ...current,
        [audience]: {
          audience,
          fileName: file.name,
          metrics: report.metrics,
          subjectLine: report.subjectLine,
          stories: report.stories,
        },
      }));
      setStatuses((current) => ({
        ...current,
        [audience]: `Ready to review: ${report.stories.length} rows from ${file.name}.`,
      }));
    } catch {
      setStatuses((current) => ({
        ...current,
        [audience]: "Could not read that PDF. Try exporting it from Salesforce again.",
      }));
    }
  }

  function confirmPendingReports() {
    if (!canConfirmReports) return;

    const id = entryKey(year, month);
    const monthLabel = entryLabel(year, month);
    const previousEntry = entries.find((entry) => entry.id === id);
    const nextEntry = AUDIENCES.reduce(
      (entry, audience) =>
        buildMetricEntry(entry, year, month, audience, pendingReports[audience].metrics),
      previousEntry
    );
    const importedStories = AUDIENCES.flatMap((audience) =>
      pendingReports[audience].stories.map((story) => ({
        ...story,
        month,
        year,
        monthLabel,
        audience,
        subjectLine: pendingReports[audience].subjectLine,
        updatedAt: new Date().toISOString(),
      }))
    );
    const nextEntries = [
      ...entries.filter((entry) => entry.id !== id),
      nextEntry,
    ].sort((a, b) => a.id.localeCompare(b.id));
    const nextStories = [
      ...stories.filter(
        (story) =>
          storyMonth(story) !== monthLabel || !AUDIENCES.includes(story.audience)
      ),
      ...importedStories,
    ];

    persistEntries(nextEntries);
    persistStories(nextStories);
    setPendingReports({});
    setStatuses({
      Engaged: `Confirmed ${pendingReports.Engaged.stories.length} story rows.`,
      Disengaged: `Confirmed ${pendingReports.Disengaged.stories.length} story rows.`,
    });
  }

  function clearPendingReports() {
    setPendingReports({});
    setStatuses({});
  }

  function deleteMetricEntry(id) {
    persistEntries(entries.filter((entry) => entry.id !== id));
  }

  function deleteStoryGroup(target) {
    persistStories(
      stories.filter(
        (story) =>
          storyMonth(story) !== storyMonth(target) ||
          (story.audience || "-") !== (target.audience || "-")
      )
    );
  }

  function updateReportDate(target, nextMonth, nextYear) {
    const oldLabel = target.label || storyMonth(target);
    const newId = entryKey(nextYear, nextMonth);
    const newLabel = entryLabel(nextYear, nextMonth);
    const targetEntry = entries.find(
      (entry) => entry.id === target.id || entry.label === oldLabel
    );

    if (targetEntry) {
      const movedEntry = {
        ...targetEntry,
        id: newId,
        month: nextMonth,
        year: nextYear,
        label: newLabel,
        updatedAt: new Date().toISOString(),
      };
      persistEntries(
        [
          ...entries.filter((entry) => entry.id !== targetEntry.id && entry.id !== newId),
          movedEntry,
        ].sort((a, b) => a.id.localeCompare(b.id))
      );
    }

    persistStories(
      stories.map((story) =>
        storyMonth(story) === oldLabel
          ? {
              ...story,
              month: nextMonth,
              year: nextYear,
              monthLabel: newLabel,
              updatedAt: new Date().toISOString(),
            }
          : story
      )
    );
  }

  function updateSavedStory(id, field, value) {
    persistStories(
      stories.map((story) =>
        story.id === id
          ? {
              ...story,
              [field]: value,
              story: field === "link" && !story.story ? storyFromLink(value) : story.story,
              updatedAt: new Date().toISOString(),
            }
          : story
      )
    );
  }

  return (
    <main className="mail-log">
      <header className="topbar">
        <div>
          <p className="brand-label">BC Parks Foundation</p>
          <h1>Newsletter Report</h1>
          <p>BCPF newsletter metrics and top stories tracking</p>
        </div>
      </header>

      <section className="upload-panel" aria-label="Upload PDF reports">
        <div className="date-row">
          <span>This report covers</span>
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
        </div>

        <div className="pdf-upload-grid">
          {AUDIENCES.map((audience) => (
            <PdfUploadBox
              audience={audience}
              key={audience}
              onUpload={(file) => handlePdfUpload(audience, file)}
              status={statuses[audience]}
            />
          ))}
        </div>

        {pendingCount > 0 ? (
          <ConfirmImportPanel
            canConfirm={canConfirmReports}
            monthLabel={entryLabel(year, month)}
            onClear={clearPendingReports}
            onConfirm={confirmPendingReports}
            reports={pendingReports}
          />
        ) : null}
      </section>

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
        <MetricsView
          entries={sortedEntries}
          onDateChange={updateReportDate}
          onDelete={deleteMetricEntry}
        />
      ) : (
        <TopStoriesView
          rows={topStoryRows}
          onDateChange={updateReportDate}
          onDelete={deleteStoryGroup}
          onUpdate={updateSavedStory}
        />
      )}
    </main>
  );
}

function PdfUploadBox({ audience, onUpload, status }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file) {
    if (file) onUpload(file);
  }

  return (
    <div
      className={`dropzone pdf-dropzone ${dragOver ? "drag" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        handleFile(event.dataTransfer.files?.[0]);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") inputRef.current?.click();
      }}
    >
      <div className="drop-message">
        <span className="upload-icon">↑</span>
        <span>{audience} PDF</span>
        <small>{status || "Drop report PDF here, or click to browse"}</small>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
    </div>
  );
}

function ConfirmImportPanel({ canConfirm, monthLabel, onClear, onConfirm, reports }) {
  return (
    <div className="confirm-panel" aria-live="polite">
      <div className="confirm-copy">
        <h2>Review upload</h2>
        <p>
          Confirm both PDFs before the {monthLabel} metrics and top stories are saved.
        </p>
      </div>

      <div className="confirm-grid">
        {AUDIENCES.map((audience) => {
          const report = reports[audience];

          return (
            <div className="confirm-card" key={audience}>
              <div>
                <span>{audience}</span>
                <strong>{report ? report.fileName : "PDF needed"}</strong>
              </div>
              <dl>
                <div>
                  <dt>Total sent</dt>
                  <dd>{report?.metrics.totalSent?.toLocaleString() || "-"}</dd>
                </div>
                <div>
                  <dt>Open rate</dt>
                  <dd>{pct(report?.metrics.openRate)}</dd>
                </div>
                <div>
                  <dt>Unique CTR</dt>
                  <dd>{pct(report?.metrics.ctr)}</dd>
                </div>
                <div>
                  <dt>Story rows</dt>
                  <dd>{report?.stories.length ?? "-"}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="confirm-actions">
        <button
          className="primary-button"
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          Confirm and save
        </button>
        <button className="ghost-button" type="button" onClick={onClear}>
          Clear uploads
        </button>
        {!canConfirm ? (
          <span className="status-text">Upload both audience PDFs to continue.</span>
        ) : null}
      </div>
    </div>
  );
}

function DateControls({ month, year, onChange, label }) {
  const safeMonth = Number.isInteger(month) ? month : new Date().getMonth();
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const [isOpen, setIsOpen] = useState(false);
  const [draftMonth, setDraftMonth] = useState(safeMonth);
  const [draftYear, setDraftYear] = useState(safeYear);

  function openEditor() {
    setDraftMonth(safeMonth);
    setDraftYear(safeYear);
    setIsOpen(true);
  }

  function saveDate() {
    onChange(draftMonth, draftYear);
    setIsOpen(false);
  }

  return (
    <>
      <div className="cell-with-action">
        <span>{entryLabel(safeYear, safeMonth)}</span>
        <button
          className="edit-icon-button"
          type="button"
          onClick={openEditor}
          aria-label={`Edit ${label} date`}
          title="Edit date"
        >
          ✎
        </button>
      </div>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Edit ${label} date`}>
            <h2>Edit date</h2>
            <label className="modal-field">
              Month
              <select
                value={draftMonth}
                onChange={(event) => setDraftMonth(Number(event.target.value))}
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              Year
              <select
                value={draftYear}
                onChange={(event) => setDraftYear(Number(event.target.value))}
              >
                {reportYearOptions(draftYear).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="primary-button" type="button" onClick={saveDate}>
                Save
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MetricsView({ entries, onDateChange, onDelete }) {
  return (
    <>
      <section className="ledger-section">
        <div className="section-head">
          <h2>Metrics</h2>
          <div className="download-actions">
            <button
              className="ghost-button"
              type="button"
              disabled={entries.length === 0}
              onClick={() => downloadMetricsCsv(entries)}
            >
              Download CSV
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={entries.length === 0}
              onClick={() => downloadMetricsPdf(entries)}
            >
              Download PDF
            </button>
          </div>
        </div>
        {entries.length === 0 ? (
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
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <DateControls
                        month={entry.month}
                        year={entry.year}
                        label={entry.label}
                        onChange={(nextMonth, nextYear) =>
                          onDateChange(entry, nextMonth, nextYear)
                        }
                      />
                    </td>
                    <td className="green-text">{pct(entry.openRate)}</td>
                    <td className="red-text">{pct(entry.ctr)}</td>
                    <td>{entry.totalSent.toLocaleString()}</td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => onDelete(entry.id)}
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

      <section className="trend-section">
        <h2>Trend</h2>
        {entries.length === 0 ? (
          <div className="empty-state">Upload PDFs to start the monthly report.</div>
        ) : (
          <>
            <TrendLineChart entries={entries} />
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
    </>
  );
}

function TopStoriesView({ rows, onDateChange, onDelete, onUpdate }) {
  return (
    <section className="ledger-section">
      <div className="section-head">
        <h2>Top Stories</h2>
        <div className="download-actions">
          <button
            className="ghost-button"
            type="button"
            disabled={rows.length === 0}
            onClick={() => downloadStoriesCsv(rows)}
          >
            Download CSV
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={rows.length === 0}
            onClick={() => downloadStoriesPdf(rows)}
          >
            Download PDF
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state compact">No saved stories yet.</div>
      ) : (
        <StoriesTable
          rows={rows}
          onDateChange={onDateChange}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      )}
    </section>
  );
}

export function StoriesTable({
  rows,
  onDateChange,
  onDelete,
  onUpdate,
  showActions = true,
}) {
  const mergedRows = rows.map((row, index) => {
    const previous = rows[index - 1];
    const displayMonth = storyMonth(row);
    const audience = row.audience || "-";
    const startsMonth = !previous || storyMonth(previous) !== displayMonth;
    const startsAudience = !previous || previous.audience !== audience || startsMonth;
    const subjectLine =
      rows.find((item) => storyMonth(item) === displayMonth && item.subjectLine)
        ?.subjectLine || row.subjectLine || "-";
    const monthSpan = startsMonth
      ? rows.slice(index).findIndex((item) => storyMonth(item) !== displayMonth)
      : 0;
    const audienceSpan = startsAudience
      ? rows
          .slice(index)
          .findIndex(
            (item) =>
              storyMonth(item) !== displayMonth ||
              (item.audience || "-") !== audience
          )
      : 0;

    return {
      ...row,
      displayMonth,
      audience,
      subjectLine,
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
            <th>Subject line</th>
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
              {row.showMonth && (
                <td rowSpan={row.monthSpan}>
                  {onDateChange ? (
                    <DateControls
                      month={row.month}
                      year={row.year}
                      label={row.displayMonth}
                      onChange={(nextMonth, nextYear) =>
                        onDateChange(row, nextMonth, nextYear)
                      }
                    />
                  ) : (
                    row.displayMonth
                  )}
                </td>
              )}
              {row.showMonth && <td rowSpan={row.monthSpan}>{row.subjectLine}</td>}
              {row.showAudience && <td rowSpan={row.audienceSpan}>{row.audience}</td>}
              <td>
                {onUpdate ? (
                  <input
                    aria-label={`Story name for ${row.link || row.id}`}
                    value={row.story || storyFromLink(row.link)}
                    onChange={(event) => onUpdate(row.id, "story", event.target.value)}
                  />
                ) : (
                  row.story || storyFromLink(row.link)
                )}
              </td>
              <td>
                {onUpdate ? (
                  <input
                    aria-label={`Story link for ${row.story || row.id}`}
                    value={row.link}
                    onChange={(event) => onUpdate(row.id, "link", event.target.value)}
                  />
                ) : row.link ? (
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
                    aria-label={`Delete ${row.displayMonth} ${row.audience} stories`}
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

const rootElement = document.getElementById("root");
const root = rootElement._reactRoot || createRoot(rootElement);
rootElement._reactRoot = root;
root.render(<App />);
