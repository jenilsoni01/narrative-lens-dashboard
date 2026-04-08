import { useEffect, useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { apiGet } from "../api/client";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const METRICS = {
  post_count: { label: "Post Volume", color: "#38bdf8" },
  unique_authors: { label: "Unique Authors", color: "#22c55e" },
  avg_likes: { label: "Average Likes", color: "#f59e0b" },
  avg_retweets: { label: "Average Retweets", color: "#f97316" },
  avg_engagement: { label: "Average Engagement", color: "#a78bfa" },
};

export default function TimeseriesPage() {
  const [granularity, setGranularity] = useState("day");
  const [metric, setMetric] = useState("post_count");
  const [windowSize, setWindowSize] = useState(3);
  const [rangeMode, setRangeMode] = useState("all");
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [compareAuthors, setCompareAuthors] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet(`/timeseries?granularity=${granularity}`)
      .then((data) => {
        setPayload(data);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [granularity]);

  const filteredRows = useMemo(() => {
    const rows = (payload?.data || []).map((row) => ({
      ...row,
      avg_engagement: Number(row.avg_likes || 0) + Number(row.avg_retweets || 0),
    }));

    if (rangeMode === "all") return rows;

    const n = Number(rangeMode);
    if (!Number.isFinite(n) || n <= 0) return rows;
    return rows.slice(Math.max(0, rows.length - n));
  }, [payload, rangeMode]);

  const movingAverage = useMemo(() => {
    if (!showMovingAverage) return [];

    const values = filteredRows.map((row) => Number(row[metric] || 0));
    const out = [];
    for (let i = 0; i < values.length; i += 1) {
      const start = Math.max(0, i - windowSize + 1);
      const chunk = values.slice(start, i + 1);
      const avg = chunk.reduce((sum, val) => sum + val, 0) / chunk.length;
      out.push(Number(avg.toFixed(3)));
    }
    return out;
  }, [filteredRows, metric, showMovingAverage, windowSize]);

  const chartData = useMemo(() => {
    const metricConfig = METRICS[metric] || METRICS.post_count;
    return {
      labels: filteredRows.map((r) => r.period),
      datasets: [
        {
          label: metricConfig.label,
          data: filteredRows.map((r) => Number(r[metric] || 0)),
          borderColor: metricConfig.color,
          backgroundColor: `${metricConfig.color}33`,
          tension: 0.25,
          fill: true,
          pointRadius: 2,
        },
        ...(showMovingAverage
          ? [
              {
                label: `Moving Average (${windowSize})`,
                data: movingAverage,
                borderColor: "#e2e8f0",
                borderDash: [6, 6],
                tension: 0.2,
                fill: false,
                pointRadius: 0,
              },
            ]
          : []),
        ...(compareAuthors && metric !== "unique_authors"
          ? [
              {
                label: "Unique Authors",
                data: filteredRows.map((r) => Number(r.unique_authors || 0)),
                borderColor: "#22c55e",
                tension: 0.25,
                fill: false,
                pointRadius: 2,
              },
            ]
          : []),
      ],
    };
  }, [filteredRows, metric, showMovingAverage, movingAverage, windowSize, compareAuthors]);

  const insights = useMemo(() => {
    const values = filteredRows.map((row) => Number(row[metric] || 0));
    const periods = filteredRows.map((row) => row.period);

    if (values.length === 0) {
      return {
        total: 0,
        avg: 0,
        peakValue: 0,
        peakPeriod: "N/A",
        growthPct: 0,
        volatility: 0,
      };
    }

    const total = values.reduce((sum, val) => sum + val, 0);
    const avg = total / values.length;

    let peakIdx = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] > values[peakIdx]) peakIdx = i;
    }

    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    const growthPct = first === 0 ? (last > 0 ? 100 : 0) : ((last - first) / first) * 100;

    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    const volatility = Math.sqrt(variance);

    return {
      total,
      avg,
      peakValue: values[peakIdx],
      peakPeriod: periods[peakIdx],
      growthPct,
      volatility,
    };
  }, [filteredRows, metric]);

  const topPeriods = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0))
      .slice(0, 5);
  }, [filteredRows, metric]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e7edf7" } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#96a2bc", maxRotation: 45, minRotation: 0 },
          grid: { color: "#1f2a4433" },
        },
        y: {
          ticks: { color: "#96a2bc" },
          grid: { color: "#1f2a4466" },
        },
      },
    }),
    []
  );

  function exportVisibleCsv() {
    if (!filteredRows.length) return;

    const headers = ["period", "post_count", "unique_authors", "avg_likes", "avg_retweets", "avg_engagement"];
    const lines = [headers.join(",")];
    for (const row of filteredRows) {
      const values = headers.map((key) => {
        const raw = key === "avg_engagement" ? Number(row.avg_likes || 0) + Number(row.avg_retweets || 0) : row[key];
        const value = String(raw ?? "").replaceAll('"', '""');
        return `"${value}"`;
      });
      lines.push(values.join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timeseries_${granularity}_${rangeMode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="timeseries-page">
      <h2>Time Series</h2>

      <div className="timeseries-controls">
        <label>
          Granularity
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>

        <label>
          Metric
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="post_count">Post Volume</option>
            <option value="unique_authors">Unique Authors</option>
            <option value="avg_likes">Average Likes</option>
            <option value="avg_retweets">Average Retweets</option>
            <option value="avg_engagement">Average Engagement</option>
          </select>
        </label>

        <label>
          Time Range
          <select value={rangeMode} onChange={(e) => setRangeMode(e.target.value)}>
            <option value="all">All Periods</option>
            <option value="7">Last 7</option>
            <option value="14">Last 14</option>
            <option value="30">Last 30</option>
            <option value="60">Last 60</option>
          </select>
        </label>

        <label>
          MA Window
          <select value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={7}>7</option>
          </select>
        </label>
      </div>

      <div className="timeseries-toggles">
        <label>
          <input type="checkbox" checked={showMovingAverage} onChange={(e) => setShowMovingAverage(e.target.checked)} />
          Show moving average
        </label>
        <label>
          <input type="checkbox" checked={compareAuthors} onChange={(e) => setCompareAuthors(e.target.checked)} />
          Compare with unique authors
        </label>
        <button type="button" onClick={exportVisibleCsv}>
          Export Visible CSV
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {!payload && !error && <p>Loading timeseries...</p>}

      {payload && (
        <>
          <div className="grid cards-4">
            <StatCard label="Visible Total" value={insights.total.toLocaleString()} />
            <StatCard label="Avg / Period" value={insights.avg.toFixed(2)} />
            <StatCard label="Peak Value" value={insights.peakValue.toLocaleString()} />
            <StatCard label="Growth" value={`${insights.growthPct.toFixed(1)}%`} />
          </div>

          <div className="chart-card">
            <div className="timeseries-chart-wrap">
              <Line data={chartData} options={chartOptions} />
            </div>
            <p className="muted">
              Peak period: {insights.peakPeriod || "N/A"} | Volatility (std dev): {insights.volatility.toFixed(2)}
            </p>
          </div>

          <div className="chart-card">
            <h3>Top Periods By Selected Metric</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Value</th>
                  <th>Posts</th>
                  <th>Unique Authors</th>
                </tr>
              </thead>
              <tbody>
                {topPeriods.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period}</td>
                    <td>{Number(row[metric] || 0).toLocaleString()}</td>
                    <td>{Number(row.post_count || 0).toLocaleString()}</td>
                    <td>{Number(row.unique_authors || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Summary</h3>
          <p>{payload.summary}</p>
          {!payload.llm_available && <p className="muted">LLM unavailable: using fallback summary.</p>}
        </>
      )}
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <article className="card">
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
    </article>
  );
}
