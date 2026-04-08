import re
from collections import Counter, defaultdict
from functools import lru_cache
from itertools import combinations
from typing import Any

import datamapplot
import networkx as nx
import numpy as np
from sklearn.cluster import MiniBatchKMeans
from sklearn.feature_extraction.text import TfidfVectorizer

from flask import current_app

from .data_loader import query_duckdb


def get_timeseries(granularity: str) -> list[dict[str, Any]]:
    trunc_map = {"day": "day", "week": "week", "month": "month"}
    trunc_fn = trunc_map.get(granularity, "day")

    sql = f"""
        SELECT
            DATE_TRUNC('{trunc_fn}', CAST(created_at AS TIMESTAMP)) AS period,
            COUNT(*) AS post_count,
            COUNT(DISTINCT author) AS unique_authors,
            AVG(likes) AS avg_likes,
            AVG(retweets) AS avg_retweets
        FROM posts
        GROUP BY period
        ORDER BY period
    """

    df = query_duckdb(sql)
    if df.empty:
        return []

    df["period"] = df["period"].astype(str)
    return df.to_dict(orient="records")


def _clean_token(value: Any) -> str:
    token = str(value or "").strip().lower()
    if not token or token in {"nan", "none", "unknown", "null"}:
        return ""
    return token


def _normalize_url(value: Any) -> str:
    url = _clean_token(value)
    if not url:
        return ""
    url = url.split("?", 1)[0].split("#", 1)[0]
    return url


@lru_cache(maxsize=1)
def _posts_columns() -> set[str]:
    df = query_duckdb("PRAGMA table_info('posts')")
    if df.empty or "name" not in df.columns:
        return set()
    return {str(name) for name in df["name"].tolist()}


def _col_or_fallback(columns: set[str], column: str, fallback: str = "''") -> str:
    if column in columns:
        return column
    return f"{fallback} AS {column}"


def _fetch_network_rows(query: str | None = None) -> list[dict[str, Any]]:
    columns = _posts_columns()
    where_clause = ""
    params: list[Any] = []

    if query:
        term = f"%{query.lower()}%"
        search_columns = ["text", "subreddit", "domain", "url", "hashtags", "permalink", "title"]
        present_search_columns = [column for column in search_columns if column in columns]
        clauses = [f"LOWER(COALESCE(CAST({column} AS VARCHAR), '')) LIKE ?" for column in present_search_columns]
        if clauses:
            where_clause = "WHERE " + " OR ".join(clauses)
            params = [term] * len(clauses)

    select_exprs = [
        _col_or_fallback(columns, "author", "'unknown'"),
        _col_or_fallback(columns, "text"),
        _col_or_fallback(columns, "title"),
        _col_or_fallback(columns, "subreddit"),
        _col_or_fallback(columns, "domain"),
        _col_or_fallback(columns, "url"),
        _col_or_fallback(columns, "permalink"),
        _col_or_fallback(columns, "hashtags"),
        _col_or_fallback(columns, "mentions"),
        _col_or_fallback(columns, "crosspost_parent_author"),
        _col_or_fallback(columns, "crosspost_parent_subreddit"),
        _col_or_fallback(columns, "crosspost_parent_domain"),
    ]

    sql = f"""
        SELECT
            {",\n            ".join(select_exprs)}
        FROM posts
        {where_clause}
        LIMIT 15000
    """

    df = query_duckdb(sql, params if params else None)
    return df.to_dict(orient="records") if not df.empty else []


def _build_author_graph(rows: list[dict[str, Any]]) -> nx.DiGraph:
    graph = nx.DiGraph()
    token_groups: dict[str, set[str]] = defaultdict(set)
    edge_weights: Counter[tuple[str, str]] = Counter()

    for row in rows:
        author = _clean_token(row.get("author"))
        if not author:
            continue

        graph.add_node(author)

        parent_author = _clean_token(row.get("crosspost_parent_author"))
        if parent_author and parent_author != author:
            edge_weights[(author, parent_author)] += 3

        mentions = _clean_token(row.get("mentions"))
        if mentions:
            for mention in mentions.split(","):
                target = _clean_token(mention)
                if target and target != author:
                    edge_weights[(author, target)] += 1

        tokens = [
            f"subreddit:{_clean_token(row.get('subreddit'))}",
            f"domain:{_clean_token(row.get('domain'))}",
            f"url:{_normalize_url(row.get('url'))}",
            f"parent_subreddit:{_clean_token(row.get('crosspost_parent_subreddit'))}",
            f"parent_domain:{_clean_token(row.get('crosspost_parent_domain'))}",
        ]

        hashtags = _clean_token(row.get("hashtags"))
        if hashtags:
            tokens.extend(f"hashtag:{_clean_token(tag)}" for tag in hashtags.split(","))

        for token in tokens:
            if token and not token.endswith(":"):
                token_groups[token].add(author)

    for token, authors in token_groups.items():
        if len(authors) < 2 or len(authors) > 40:
            continue

        weight = 2 if token.startswith(("domain:", "url:")) else 1
        ordered_authors = sorted(authors)
        for source, target in combinations(ordered_authors, 2):
            edge_weights[(source, target)] += weight
            edge_weights[(target, source)] += weight

    for (source, target), weight in edge_weights.items():
        graph.add_edge(source, target, weight=int(weight))

    graph.remove_nodes_from(list(nx.isolates(graph)))
    return graph


def _limit_graph(graph: nx.DiGraph, pagerank: dict[str, float], max_nodes: int) -> nx.DiGraph:
    if graph.number_of_nodes() <= max_nodes:
        return graph

    top_nodes = [node for node, _ in sorted(pagerank.items(), key=lambda item: item[1], reverse=True)[:max_nodes]]
    return graph.subgraph(top_nodes).copy()


def _filter_edges_by_weight(graph: nx.DiGraph, min_edge_weight: int) -> nx.DiGraph:
    if min_edge_weight <= 1:
        return graph

    filtered = nx.DiGraph()
    filtered.add_nodes_from(graph.nodes(data=True))
    for source, target, data in graph.edges(data=True):
        if int(data.get("weight", 1)) >= min_edge_weight:
            filtered.add_edge(source, target, **data)

    filtered.remove_nodes_from(list(nx.isolates(filtered)))
    return filtered


def network_summary(
    query: str | None = None,
    remove_top: bool = False,
    max_nodes: int | None = None,
    min_edge_weight: int = 1,
) -> dict[str, Any]:
    rows = _fetch_network_rows(query=query)
    graph = _build_author_graph(rows)
    if graph.number_of_nodes() == 0:
        return {
            "metrics": {},
            "query": query or "",
            "nodes": [],
            "edges": [],
            "top_influencers": [],
            "simulation": None,
        }

    graph = _filter_edges_by_weight(graph, max(1, int(min_edge_weight)))
    if graph.number_of_nodes() == 0:
        return {
            "metrics": {},
            "query": query or "",
            "nodes": [],
            "edges": [],
            "top_influencers": [],
            "simulation": None,
        }

    pagerank = nx.pagerank(graph, weight="weight")
    simulation = None

    if remove_top and pagerank:
        top_influencer = max(pagerank, key=pagerank.get)
        removed_score = float(pagerank.get(top_influencer, 0.0))
        graph = graph.copy()
        graph.remove_node(top_influencer)
        graph.remove_nodes_from(list(nx.isolates(graph)))
        pagerank = nx.pagerank(graph, weight="weight") if graph.number_of_nodes() > 0 else {}
        simulation = {
            "removed": top_influencer,
            "removed_score": removed_score,
        }

    configured_max = int(current_app.config.get("MAX_NETWORK_NODES", 150))
    if max_nodes is None:
        max_nodes = configured_max
    max_nodes = max(30, min(int(max_nodes), configured_max))
    graph = _limit_graph(graph, pagerank, max_nodes=max_nodes)

    nodes = []
    for node in graph.nodes():
        nodes.append(
            {
                "id": node,
                "pagerank": float(pagerank.get(node, 0.0)),
                "in_degree": int(graph.in_degree(node)),
                "out_degree": int(graph.out_degree(node)),
            }
        )

    edges_payload = []
    for source, target, data in graph.edges(data=True):
        edges_payload.append(
            {
                "source": source,
                "target": target,
                "weight": int(data.get("weight", 1)),
            }
        )

    top_users = sorted(pagerank.items(), key=lambda x: x[1], reverse=True)[:10]
    top_influencers = []
    for rank, (user, pr) in enumerate(top_users, 1):
        top_influencers.append(
            {
                "rank": rank,
                "user": user,
                "pagerank": float(pr),
                "mentioned_by": int(graph.in_degree(user)),
                "mentions_others": int(graph.out_degree(user)),
            }
        )

    metrics = {
        "nodes": int(graph.number_of_nodes()),
        "edges": int(graph.number_of_edges()),
        "density": float(nx.density(graph)) if graph.number_of_nodes() > 1 else 0.0,
        "top_pagerank": float(max(pagerank.values())) if pagerank else 0.0,
        "components": int(nx.number_weakly_connected_components(graph)) if graph.number_of_nodes() > 0 else 0,
        "matches": len(rows),
        "avg_degree": float((2.0 * graph.number_of_edges()) / graph.number_of_nodes()) if graph.number_of_nodes() > 0 else 0.0,
        "max_nodes": int(max_nodes),
        "min_edge_weight": int(min_edge_weight),
    }

    return {
        "metrics": metrics,
        "query": query or "",
        "nodes": nodes,
        "edges": edges_payload,
        "top_influencers": top_influencers,
        "simulation": simulation,
    }


@lru_cache(maxsize=8)
def embedding_map_html(k: int) -> str:
    from .data_loader import load_clusters, load_embeddings, load_umap_coords

    coords = load_umap_coords()
    embeddings = load_embeddings()
    precomputed = load_clusters()

    text_df = query_duckdb("SELECT text, author, subreddit FROM posts LIMIT 50000")
    texts = text_df["text"].astype(str).tolist() if not text_df.empty else []

    summary = cluster_summary(embeddings=embeddings, texts=texts, k=k, precomputed=precomputed)

    if coords is None:
        return "<html><body style='background:#050816;color:#e7edf7;font-family:sans-serif;padding:24px'>No embedding coordinates are available.</body></html>"

    limit = min(len(coords), len(summary.get("labels", [])), len(texts))
    if limit == 0:
        return "<html><body style='background:#050816;color:#e7edf7;font-family:sans-serif;padding:24px'>No embedding data is available.</body></html>"

    coords = np.asarray(coords[:limit])
    labels = [f"Cluster {int(label)}" for label in summary["labels"][:limit]]

    hover_text = []
    for idx in range(limit):
        row = text_df.iloc[idx]
        snippet = str(row.get("text", ""))
        snippet = snippet[:240] + ("..." if len(snippet) > 240 else "")
        hover_text.append(
            f"@{row.get('author', 'unknown')} | r/{row.get('subreddit', 'unknown')}<br>{snippet}"
        )

    figure = datamapplot.create_interactive_plot(
        coords,
        labels,
        hover_text=hover_text,
        inline_data=True,
        width="100%",
        height=900,
        darkmode=True,
        label_wrap_width=14,
    )
    return figure._html_str


def extract_keywords(texts: list[str], labels: np.ndarray, k: int, top_n: int = 6) -> dict[int, list[str]]:
    keywords: dict[int, list[str]] = {}

    vectorizer = TfidfVectorizer(
        max_features=3000,
        stop_words="english",
        max_df=0.85,
        min_df=2,
        ngram_range=(1, 2),
    )

    try:
        tfidf = vectorizer.fit_transform(texts)
        features = vectorizer.get_feature_names_out()

        for cid in range(k):
            mask = labels == cid
            if mask.sum() == 0:
                keywords[cid] = ["(empty)"]
                continue

            cluster_mean = np.asarray(tfidf[mask].mean(axis=0)).flatten()
            top_idx = cluster_mean.argsort()[-top_n:][::-1]
            keywords[cid] = [str(features[i]) for i in top_idx]

    except Exception as exc:
        for cid in range(k):
            keywords[cid] = [f"(error: {str(exc)[:30]})"]

    return keywords


def cluster_summary(embeddings: np.ndarray, texts: list[str], k: int, precomputed: dict[str, Any] | None) -> dict[str, Any]:
    if precomputed and int(precomputed.get("k", -1)) == k:
        labels = np.array(precomputed["labels"])
        keywords = precomputed.get("keywords", {})
        source = "precomputed"
    else:
        kmeans = MiniBatchKMeans(
            n_clusters=k,
            random_state=42,
            batch_size=256,
            n_init=3,
            max_iter=300,
        )
        labels = kmeans.fit_predict(embeddings)
        keywords = extract_keywords(texts, labels, k) if texts else {i: [f"Cluster {i}"] for i in range(k)}
        source = "recomputed"

    unique, counts = np.unique(labels, return_counts=True)
    dist = []
    for cid, count in zip(unique, counts):
        cid_int = int(cid)
        kws = keywords.get(cid_int, [f"Cluster {cid_int}"])
        dist.append(
            {
                "cluster": cid_int,
                "posts": int(count),
                "percentage": float((count / len(labels)) * 100.0),
                "keywords": kws,
            }
        )

    return {
        "k": int(k),
        "source": source,
        "labels": labels.tolist(),
        "distribution": dist,
        "keywords": {str(kv): vv for kv, vv in keywords.items()},
    }
