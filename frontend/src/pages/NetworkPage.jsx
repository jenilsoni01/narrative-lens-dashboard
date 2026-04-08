import { useEffect, useMemo, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { apiGet } from "../api/client";

export default function NetworkPage() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [removeTop, setRemoveTop] = useState(false);
  const [maxNodes, setMaxNodes] = useState(120);
  const [minEdgeWeight, setMinEdgeWeight] = useState(1);
  const [graphHeight, setGraphHeight] = useState(620);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphWidth, setGraphWidth] = useState(980);
  const [showLabels, setShowLabels] = useState(false);

  useEffect(() => {
    function syncWidth() {
      const sideOffset = window.innerWidth <= 960 ? 64 : 360;
      const nextWidth = Math.max(320, Math.min(1280, window.innerWidth - sideOffset));
      setGraphWidth(nextWidth);
    }
    syncWidth();
    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  useEffect(() => {
    apiGet(
      `/network?q=${encodeURIComponent(appliedQuery)}&remove_top=${removeTop}&max_nodes=${maxNodes}&min_edge_weight=${minEdgeWeight}`
    )
      .then((data) => {
        setPayload(data);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [appliedQuery, removeTop, maxNodes, minEdgeWeight]);

  const graphData = useMemo(() => {
    const nodes = payload?.nodes || [];
    const links = (payload?.edges || []).map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight || 1,
    }));

    return { nodes, links };
  }, [payload]);

  function onSubmit(event) {
    event.preventDefault();
    setSelectedNode(null);
    setAppliedQuery(query.trim());
  }

  function clearSelection() {
    setSelectedNode(null);
  }

  const selectedInfluencer = useMemo(() => {
    if (!selectedNode) return null;
    return (payload?.top_influencers || []).find((row) => row.user === selectedNode.id) || null;
  }, [payload, selectedNode]);

  return (
    <section className="network-page">
      <div className="overview-header network-header">
        <div>
          <h2>Network</h2>
          <p className="muted">
            Explore shared behavior and influence patterns. Click a node for details, or filter the graph to a topic.
          </p>
        </div>
        <div className="network-header-actions">
          <button type="button" className="ghost-button" onClick={clearSelection} disabled={!selectedNode}>
            Clear selection
          </button>
        </div>
      </div>
      <form onSubmit={onSubmit} className="search-form network-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Focus on a keyword, hashtag, subreddit, or URL"
        />

        <label>
          Max Nodes
          <select value={maxNodes} onChange={(e) => setMaxNodes(Number(e.target.value))}>
            <option value={60}>60</option>
            <option value={90}>90</option>
            <option value={120}>120</option>
            <option value={150}>150</option>
          </select>
        </label>

        <label>
          Min Edge Weight
          <select value={minEdgeWeight} onChange={(e) => setMinEdgeWeight(Number(e.target.value))}>
            <option value={1}>1+</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
          </select>
        </label>

        <label>
          Graph Height
          <select value={graphHeight} onChange={(e) => setGraphHeight(Number(e.target.value))}>
            <option value={520}>Compact</option>
            <option value={620}>Default</option>
            <option value={760}>Expanded</option>
          </select>
        </label>

        <label className="control-inline inline-toggle">
          <input
            type="checkbox"
            checked={removeTop}
            onChange={(e) => setRemoveTop(e.target.checked)}
          />
          Remove top influencer
        </label>

        <label className="control-inline inline-toggle">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          Show labels
        </label>

        <button type="submit">Update graph</button>
      </form>

      <div className="network-legend muted">
        <span><i className="legend-dot legend-core" /> Core influencers (larger nodes)</span>
        <span><i className="legend-dot legend-edge" /> Link thickness = stronger shared behavior</span>
      </div>

      {error && <p className="error">{error}</p>}
      {!payload && !error && <p>Loading network...</p>}

      {payload && (
        <>
          {payload.query && <p className="muted">Focused on: {payload.query}</p>}
          <div className="grid cards-4">
            <Metric label="Nodes" value={payload.metrics?.nodes ?? 0} />
            <Metric label="Edges" value={payload.metrics?.edges ?? 0} />
            <Metric label="Density" value={(payload.metrics?.density ?? 0).toFixed(4)} />
            <Metric label="Top PageRank" value={(payload.metrics?.top_pagerank ?? 0).toFixed(4)} />
            <Metric label="Matches" value={payload.metrics?.matches ?? 0} />
            <Metric label="Avg Degree" value={(payload.metrics?.avg_degree ?? 0).toFixed(2)} />
          </div>

          <div className="chart-card network-graph-card">
            {graphData.nodes.length > 0 ? (
              <div className="network-graph-wrap">
                <ForceGraph2D
                  graphData={graphData}
                  width={graphWidth}
                  height={graphHeight}
                  nodeLabel={(node) => `@${node.id}\nPageRank: ${Number(node.pagerank || 0).toFixed(4)}`}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = `@${node.id}`;
                    const isSelected = selectedNode?.id === node.id;
                    const fontSize = Math.max(10 / globalScale, 4);
                    const radius = Math.max(3, Math.sqrt((node.pagerank || 0) * 600) + 3);
                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.fillStyle = isSelected ? "#0f766e" : "#2563eb";
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                    ctx.fill();
                    if (isSelected) {
                      ctx.strokeStyle = "#0f766e";
                      ctx.lineWidth = 2;
                      ctx.stroke();
                    }
                    if (showLabels || isSelected || globalScale < 1.2) {
                      ctx.fillStyle = "#0f172a";
                      ctx.fillText(label, node.x + 5, node.y + 4);
                    }
                  }}
                  linkWidth={(link) => Math.max(1, Math.sqrt(link.weight || 1))}
                  linkDirectionalArrowLength={3}
                  linkDirectionalArrowRelPos={1}
                  linkColor={(link) => ((link.weight || 1) >= 3 ? "rgba(14, 165, 233, 0.58)" : "rgba(148, 163, 184, 0.24)")}
                  nodeRelSize={4}
                  onNodeClick={setSelectedNode}
                  onNodeRightClick={clearSelection}
                  cooldownTicks={100}
                  d3ChargeStrength={-250}
                  d3VelocityDecay={0.75}
                  enableNodeDrag
                  backgroundColor="#ffffff"
                />
              </div>
            ) : (
              <p className="muted">No network data matched this focus term.</p>
            )}
          </div>

          {selectedNode && (
            <article className="result-card network-selected-card">
              <div className="network-selected-head">
                <h3>Selected Node</h3>
                <span className="source-index">@{selectedNode.id}</span>
              </div>
              <div className="network-selected-stats">
                <span>PageRank {Number(selectedNode.pagerank || 0).toFixed(4)}</span>
                <span>In {selectedNode.in_degree || 0}</span>
                <span>Out {selectedNode.out_degree || 0}</span>
              </div>
              {selectedInfluencer && (
                <p className="muted">
                  Rank #{selectedInfluencer.rank} among current influencers.
                </p>
              )}
            </article>
          )}

          {payload.simulation && (
            <p className="muted">
              Top node removed in simulation: @{payload.simulation.removed} (PageRank {Number(payload.simulation.removed_score || 0).toFixed(4)})
            </p>
          )}

          <h3>Top Influencers</h3>
          <table className="data-table network-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>User</th>
                <th>PageRank</th>
                <th>Mentioned By</th>
                <th>Mentions Others</th>
              </tr>
            </thead>
            <tbody>
              {(payload.top_influencers || []).map((row) => (
                <tr
                  key={row.rank}
                  className={selectedNode?.id === row.user ? "cluster-row-selected" : ""}
                  onClick={() => setSelectedNode({ id: row.user, pagerank: row.pagerank, in_degree: row.mentioned_by, out_degree: row.mentions_others })}
                >
                  <td>{row.rank}</td>
                  <td>@{row.user}</td>
                  <td>{row.pagerank.toFixed(4)}</td>
                  <td>{row.mentioned_by}</td>
                  <td>{row.mentions_others}</td>
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
