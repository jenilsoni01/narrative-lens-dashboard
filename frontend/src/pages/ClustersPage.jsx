import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { API_BASE, apiGet } from "../api/client";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function ClustersPage() {
  const [k, setK] = useState(8);
  const [sortBy, setSortBy] = useState("size");
  const [minPct, setMinPct] = useState(0);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const [mapHeight, setMapHeight] = useState(760);
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setError("");
    apiGet(`/clusters?k=${k}`)
      .then((data) => {
        setPayload(data);
        const firstCluster = data?.distribution?.[0]?.cluster;
        setSelectedCluster(typeof firstCluster === "number" ? firstCluster : null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [k]);

  const processedRows = useMemo(() => {
    const rows = [...(payload?.distribution || [])].filter((row) => Number(row.percentage || 0) >= minPct);

    rows.sort((a, b) => {
      if (sortBy === "cluster") return Number(a.cluster) - Number(b.cluster);
      if (sortBy === "share") return Number(b.percentage || 0) - Number(a.percentage || 0);
      return Number(b.posts || 0) - Number(a.posts || 0);
    });

    return rows;
  }, [payload, sortBy, minPct]);

  const selectedRow = useMemo(() => {
    if (!processedRows.length) return null;
    const found = processedRows.find((row) => Number(row.cluster) === Number(selectedCluster));
    return found || processedRows[0];
  }, [processedRows, selectedCluster]);

  const selectedExamples = useMemo(() => {
    const clusterId = selectedRow?.cluster;
    if (clusterId === undefined || clusterId === null) return [];
    return payload?.examples?.[String(clusterId)] || [];
  }, [payload, selectedRow]);

  const barData = useMemo(() => {
    const rows = processedRows;
    return {
      labels: rows.map((r) => `C${r.cluster}`),
      datasets: [
        {
          label: "Posts",
          data: rows.map((r) => r.posts),
          backgroundColor: rows.map((row) =>
            Number(row.cluster) === Number(selectedRow?.cluster) ? "rgba(56,189,248,0.86)" : "rgba(34,197,94,0.65)"
          ),
          borderRadius: 6,
        },
      ],
    };
  }, [processedRows, selectedRow]);

  const barOptions = useMemo(
    () => ({
      responsive: true,
      plugins: {
        legend: { labels: { color: "#e7edf7" } },
      },
      scales: {
        x: {
          ticks: { color: "#96a2bc" },
          grid: { color: "#1f2a4433" },
        },
        y: {
          ticks: { color: "#96a2bc" },
          grid: { color: "#1f2a4466" },
        },
      },
      onClick: (_, elements) => {
        if (!elements?.length) return;
        const idx = elements[0].index;
        const row = processedRows[idx];
        if (row) setSelectedCluster(Number(row.cluster));
      },
    }),
    [processedRows]
  );

  const embeddingUrl = `${API_BASE}/clusters/viz?k=${k}`;

  return (
    <section className="clusters-page">
      <div className="overview-header">
        <div>
          <h2>Topic Clusters</h2>
          <p className="muted">Explore semantic groups, compare cluster share, and inspect representative posts.</p>
        </div>

        <div className="clusters-controls">
          <label>
            Clusters (k)
            <input type="range" min="2" max="20" value={k} onChange={(e) => setK(Number(e.target.value))} />
          </label>

          <label>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="size">Largest First</option>
              <option value="share">Highest Share</option>
              <option value="cluster">Cluster ID</option>
            </select>
          </label>

          <label>
            Min Share %
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={minPct}
              onChange={(e) => setMinPct(Number(e.target.value) || 0)}
            />
          </label>
        </div>
      </div>

      <div className="grid cards-4">
        <Metric label="K" value={String(k)} />
        <Metric label="Total Posts" value={Number(payload?.metrics?.total_posts || 0).toLocaleString()} />
        <Metric
          label="Largest Cluster"
          value={
            payload?.metrics?.largest_cluster === null || payload?.metrics?.largest_cluster === undefined
              ? "N/A"
              : `C${payload.metrics.largest_cluster}`
          }
        />
        <Metric label="Largest Share" value={`${Number(payload?.metrics?.largest_cluster_pct || 0).toFixed(1)}%`} />
      </div>

      {error && <p className="error">{error}</p>}
      {!payload && !error && (isLoading ? <p>Loading clusters...</p> : <p>No clustering data yet.</p>)}

      {payload && (
        <>
          <p className="muted">
            Source: {payload.source} | Showing {processedRows.length} clusters after filters
          </p>

          <div className="chart-card">
            <Bar data={barData} options={barOptions} />
            <p className="muted">Click a bar or table row to inspect that cluster.</p>
          </div>

          <div className="clusters-panel-grid">
            <article className="chart-card">
              <h3>
                Selected Cluster {selectedRow ? `C${selectedRow.cluster}` : "N/A"}
              </h3>

              {!selectedRow ? (
                <p className="muted">No cluster selected.</p>
              ) : (
                <>
                  <p className="muted">
                    {Number(selectedRow.posts || 0).toLocaleString()} posts | {Number(selectedRow.percentage || 0).toFixed(2)}%
                  </p>
                  <p>
                    <strong>Keywords:</strong> {(selectedRow.keywords || []).join(", ")}
                  </p>

                  <h4>Representative Posts</h4>
                  {selectedExamples.length === 0 ? (
                    <p className="muted">No examples available for this cluster.</p>
                  ) : (
                    <div className="cluster-samples">
                      {selectedExamples.map((item, idx) => (
                        <article className="source-card" key={`${selectedRow.cluster}-${idx}`}>
                          <div className="source-header">
                            <span className="source-index">Sample {idx + 1}</span>
                            <span className="source-meta">@{item.author || "unknown"}</span>
                          </div>
                          <div className="source-submeta">
                            <span>{item.created_at || "N/A"}</span>
                          </div>
                          <p>{item.excerpt || "No excerpt available."}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </article>

            <article className="chart-card">
              <div className="clusters-map-header">
                <h3>Interactive Embedding Map</h3>
                <label className="control-inline">
                  <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
                  Show map
                </label>
              </div>

              {showMap && (
                <>
                  <label className="clusters-map-height muted">
                    Height
                    <select value={mapHeight} onChange={(e) => setMapHeight(Number(e.target.value))}>
                      <option value={620}>Compact</option>
                      <option value={760}>Default</option>
                      <option value={920}>Expanded</option>
                    </select>
                  </label>
                  <div className="viz-frame" style={{ minHeight: `${mapHeight}px` }}>
                    <iframe title="Embedding Map" src={embeddingUrl} style={{ height: `${mapHeight}px` }} />
                  </div>
                </>
              )}
            </article>
          </div>

          <h3>Keywords by Cluster</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Posts</th>
                <th>Share</th>
                <th>Keywords</th>
              </tr>
            </thead>
            <tbody>
              {processedRows.map((row) => (
                <tr
                  key={row.cluster}
                  className={Number(selectedRow?.cluster) === Number(row.cluster) ? "cluster-row-selected" : ""}
                  onClick={() => setSelectedCluster(Number(row.cluster))}
                >
                  <td>{row.cluster}</td>
                  <td>{Number(row.posts || 0).toLocaleString()}</td>
                  <td>{Number(row.percentage || 0).toFixed(2)}%</td>
                  <td>{(row.keywords || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <article className="card">
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
    </article>
  );
}
