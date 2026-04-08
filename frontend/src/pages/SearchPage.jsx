import { useMemo, useState } from "react";
import { apiGet } from "../api/client";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [minScore, setMinScore] = useState(0.1);
  const [sortBy, setSortBy] = useState("score");
  const [expanded, setExpanded] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  async function onSearch(event) {
    event.preventDefault();
    setError("");
    setPayload(null);
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
      setError("Query must be at least 3 characters.");
      return;
    }
    setIsLoading(true);

    try {
      const data = await apiGet(
        `/search?q=${encodeURIComponent(normalizedQuery)}&top_k=${topK}&min_score=${encodeURIComponent(minScore)}`
      );
      setPayload(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const sortedResults = useMemo(() => {
    const rows = [...(payload?.results || [])];
    if (sortBy === "engagement") {
      rows.sort((a, b) => (b.likes + b.retweets) - (a.likes + a.retweets));
    } else if (sortBy === "recent") {
      rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    } else {
      rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    }
    return rows;
  }, [payload, sortBy]);

  function runFollowup(nextQuery) {
    setQuery(nextQuery);
    setTimeout(() => {
      const form = document.getElementById("semantic-search-form");
      if (form) form.requestSubmit();
    }, 0);
  }

  function toggleResult(rowIdx) {
    setExpanded((prev) => ({ ...prev, [rowIdx]: !prev[rowIdx] }));
  }

  function textPreview(text, isExpanded) {
    if (isExpanded || text.length <= 280) return text;
    return `${text.slice(0, 280)}...`;
  }

  return (
    <section className="search-page">
      <h2>Semantic Search</h2>

      <form id="semantic-search-form" onSubmit={onSearch} className="search-form semantic-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: coordinated vaccine narratives in regional communities"
        />

        <input
          type="number"
          min="3"
          max="20"
          value={topK}
          onChange={(e) => setTopK(Number(e.target.value))}
        />

        <input
          type="number"
          min="-1"
          max="1"
          step="0.05"
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          title="Minimum cosine similarity score"
        />

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Searching..." : "Search"}
        </button>
      </form>

      <div className="search-toolbar">
        <label>
          Sort results
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="score">Best Similarity</option>
            <option value="engagement">Highest Engagement</option>
            <option value="recent">Most Recent</option>
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="muted">Embedding query and retrieving nearest semantic matches...</p>}

      {payload && (
        <>
          <div className="grid cards-4">
            <StatCard label="Returned" value={Number(payload.stats?.returned || 0).toLocaleString()} />
            <StatCard label="Top Score" value={Number(payload.stats?.best_score || 0).toFixed(3)} />
            <StatCard label="Avg Score" value={Number(payload.stats?.avg_score || 0).toFixed(3)} />
            <StatCard label="LLM Followups" value={payload.llm_available ? "Yes" : "Fallback"} />
          </div>

          <h3>Results</h3>
          {sortedResults.length === 0 ? (
            <p className="muted">No semantic matches were found for this query.</p>
          ) : (
            sortedResults.map((item) => {
              const isExpanded = Boolean(expanded[item.row_idx]);
              const engagement = Number(item.likes || 0) + Number(item.retweets || 0);
              return (
                <article key={`${item.row_idx}-${item.score}`} className="result-card semantic-result-card">
                  <div className="semantic-result-meta">
                    <span>@{item.author}</span>
                    <span>Similarity {Number(item.score || 0).toFixed(3)}</span>
                    <span>Engagement {engagement.toLocaleString()}</span>
                    <span>{item.created_at || "N/A"}</span>
                  </div>
                  <div className="score-track" aria-hidden>
                    <div className="score-fill" style={{ width: `${Math.max(0, Math.min(100, ((Number(item.score || 0) + 1) / 2) * 100))}%` }} />
                  </div>
                  <p>{textPreview(item.text || "", isExpanded)}</p>
                  <div className="semantic-actions">
                    {item.text?.length > 280 && (
                      <button type="button" onClick={() => toggleResult(item.row_idx)}>
                        {isExpanded ? "Show less" : "Read more"}
                      </button>
                    )}
                    {item.hashtags && <span className="muted">Tags: {item.hashtags}</span>}
                  </div>
                </article>
              );
            })
          )}

          <h3>Follow-up Queries</h3>
          {(payload.followups || []).length === 0 ? (
            <p className="muted">No follow-up suggestions available.</p>
          ) : (
            <div className="followup-chips">
              {(payload.followups || []).map((q) => (
                <button type="button" key={q} className="chip" onClick={() => runFollowup(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
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
