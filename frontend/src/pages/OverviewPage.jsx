import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState("posts");
  const [authorFilter, setAuthorFilter] = useState("");

  useEffect(() => {
    apiGet(`/overview?limit=${limit}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [limit]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading overview...</p>;

  const stats = data.stats || {};
  const topShare = Number(data.insights?.top5_author_post_share || 0);
  const recent = data.recent_activity || [];
  const maxPosts = Math.max(...recent.map((row) => Number(row.post_count || 0)), 1);
  const peakDay = recent.reduce(
    (best, row) => (Number(row.post_count || 0) > Number(best.post_count || 0) ? row : best),
    { day: "N/A", post_count: 0 }
  );

  const filteredAuthors = (data.top_authors || [])
    .filter((row) => String(row.author || "").toLowerCase().includes(authorFilter.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") {
        return String(a.author || "").localeCompare(String(b.author || ""));
      }
      return Number(b.post_count || 0) - Number(a.post_count || 0);
    });

  const engagementLeaders = [...(data.engagement_leaders || [])].sort((a, b) => {
    if (sortBy === "engagement") {
      return Number(b.total_engagement || 0) - Number(a.total_engagement || 0);
    }
    return Number(b.post_count || 0) - Number(a.post_count || 0);
  });

  return (
    <section className="overview-page">
      <div className="overview-header">
        <div>
          <h2>Overview</h2>
          <p className="muted">
            High-level narrative health, participation concentration, and recent momentum.
          </p>
        </div>
        <div className="overview-controls">
          <label>
            Rows
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="posts">Posts</option>
              <option value="engagement">Engagement</option>
              <option value="name">Name</option>
            </select>
          </label>
          <label>
            Author Filter
            <input
              type="text"
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              placeholder="Type author handle"
            />
          </label>
        </div>
      </div>

      <div className="grid cards-4">
        <StatCard label="Total Posts" value={Number(stats.total_posts || 0).toLocaleString()} />
        <StatCard label="Unique Authors" value={Number(stats.unique_authors || 0).toLocaleString()} />
        <StatCard label="Avg Likes" value={Number(stats.avg_likes || 0).toFixed(1)} />
        <StatCard label="Avg Retweets" value={Number(stats.avg_retweets || 0).toFixed(1)} />
      </div>

      <div className="grid cards-4 overview-mini-cards">
        <StatCard label="Top 5 Author Share" value={`${topShare.toFixed(1)}%`} />
        <StatCard label="Peak Day Posts" value={Number(peakDay.post_count || 0).toLocaleString()} />
        <StatCard label="Peak Day" value={String(peakDay.day || "N/A")} />
        <StatCard label="Tracked Last" value={`${recent.length} days`} />
      </div>

      <p className="muted">
        Data coverage: {stats.date_min || "N/A"} to {stats.date_max || "N/A"}
      </p>

      <div className="chart-card trend-card">
        <h3>Recent Activity Trend</h3>
        <div className="mini-bars">
          {recent.length === 0 && <p className="muted">No recent activity data available.</p>}
          {recent.map((row) => {
            const count = Number(row.post_count || 0);
            const heightPct = Math.max((count / maxPosts) * 100, 3);
            return (
              <div className="mini-bar-wrap" key={row.day} title={`${row.day}: ${count} posts`}>
                <div className="mini-bar" style={{ height: `${heightPct}%` }} />
                <span>{String(row.day).slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid overview-panels-2">
        <div className="chart-card">
          <h3>Top Authors</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Author</th>
                <th>Posts</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuthors.map((row) => (
                <tr key={row.author}>
                  <td>@{row.author}</td>
                  <td>{row.post_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="chart-card">
          <h3>Engagement Leaders</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Author</th>
                <th>Total Eng.</th>
                <th>Avg Eng.</th>
              </tr>
            </thead>
            <tbody>
              {engagementLeaders.map((row) => (
                <tr key={row.author}>
                  <td>@{row.author}</td>
                  <td>{Number(row.total_engagement || 0).toLocaleString()}</td>
                  <td>{Number(row.avg_engagement || 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid overview-panels-3">
        <EntityList title="Top Subreddits" rows={data.top_subreddits || []} />
        <EntityList title="Top Domains" rows={data.top_domains || []} />
        <EntityList title="Top Hashtags" rows={data.top_hashtags || []} />
      </div>
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

function EntityList({ title, rows }) {
  return (
    <article className="chart-card">
      <h3>{title}</h3>
      <ul className="entity-list">
        {rows.length === 0 && <li className="muted">No data available</li>}
        {rows.map((row) => (
          <li key={row.value}>
            <span>{row.value}</span>
            <strong>{Number(row.count || 0).toLocaleString()}</strong>
          </li>
        ))}
      </ul>
    </article>
  );
}
