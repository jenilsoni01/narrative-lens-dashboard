import pickle
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

import duckdb
import faiss
import numpy as np
import pandas as pd
from flask import current_app


def _path(name: str) -> Path:
    return Path(current_app.config[name])


@lru_cache(maxsize=1)
def get_duckdb_connection() -> duckdb.DuckDBPyConnection:
    db_path = _path("DB_PATH")
    if not db_path.exists():
        raise FileNotFoundError(f"DuckDB not found: {db_path}")
    return duckdb.connect(str(db_path), read_only=True)


def query_duckdb(sql: str, params: list[Any] | None = None) -> pd.DataFrame:
    con = get_duckdb_connection()
    if params:
        df = con.execute(sql, params).fetchdf()
    else:
        df = con.execute(sql).fetchdf()

    max_rows = int(current_app.config["MAX_QUERY_ROWS"])
    if len(df) > max_rows:
        return df.head(max_rows)
    return df


@lru_cache(maxsize=1)
def load_faiss_index() -> faiss.Index:
    idx_path = _path("FAISS_INDEX_PATH")
    if not idx_path.exists():
        raise FileNotFoundError(f"FAISS index not found: {idx_path}")
    return faiss.read_index(str(idx_path))


@lru_cache(maxsize=1)
def load_embeddings() -> np.ndarray:
    emb_path = _path("EMBEDDINGS_PATH")
    if not emb_path.exists():
        raise FileNotFoundError(f"Embeddings not found: {emb_path}")
    return np.load(emb_path)


@lru_cache(maxsize=1)
def load_umap_coords() -> np.ndarray | None:
    coords_path = _path("UMAP_COORDS_PATH")
    if not coords_path.exists():
        return None
    return np.load(coords_path)


@lru_cache(maxsize=1)
def load_clusters() -> dict[str, Any] | None:
    clusters_path = _path("CLUSTERS_PATH")
    if not clusters_path.exists():
        return None
    with open(clusters_path, "rb") as f:
        return pickle.load(f)


@lru_cache(maxsize=1)
def load_sentence_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


def embed_query(query: str) -> np.ndarray:
    model = load_sentence_model()
    return model.encode([query], convert_to_numpy=True, normalize_embeddings=True).astype(np.float32)


def get_dataset_stats() -> dict[str, Any]:
    con = get_duckdb_connection()
    stats: dict[str, Any] = {}
    stats["total_posts"] = int(con.execute("SELECT COUNT(*) FROM posts").fetchone()[0])
    stats["unique_authors"] = int(con.execute("SELECT COUNT(DISTINCT author) FROM posts").fetchone()[0])
    date_range = con.execute("SELECT MIN(created_at), MAX(created_at) FROM posts").fetchone()
    stats["date_min"] = str(date_range[0]) if date_range and date_range[0] is not None else None
    stats["date_max"] = str(date_range[1]) if date_range and date_range[1] is not None else None
    avg_likes = con.execute("SELECT AVG(likes) FROM posts").fetchone()[0]
    avg_retweets = con.execute("SELECT AVG(retweets) FROM posts").fetchone()[0]
    stats["avg_likes"] = float(avg_likes or 0)
    stats["avg_retweets"] = float(avg_retweets or 0)
    return stats


def get_top_authors(limit: int = 10) -> list[dict[str, Any]]:
    sql = """
        SELECT author, COUNT(*) AS post_count
        FROM posts
        WHERE author IS NOT NULL AND author != 'unknown'
        GROUP BY author
        ORDER BY post_count DESC
        LIMIT ?
    """
    df = query_duckdb(sql, [limit])
    return df.to_dict(orient="records")


@lru_cache(maxsize=1)
def get_posts_columns() -> set[str]:
    con = get_duckdb_connection()
    info = con.execute("PRAGMA table_info('posts')").fetchdf()
    if info.empty or "name" not in info.columns:
        return set()
    return {str(name) for name in info["name"].tolist()}


def get_top_values(column: str, limit: int = 10) -> list[dict[str, Any]]:
    allowed = {"subreddit", "domain"}
    if column not in allowed:
        return []

    if column not in get_posts_columns():
        return []

    sql = f"""
        SELECT {column} AS value, COUNT(*) AS count
        FROM posts
        WHERE {column} IS NOT NULL
          AND TRIM(CAST({column} AS VARCHAR)) != ''
          AND LOWER(TRIM(CAST({column} AS VARCHAR))) NOT IN ('unknown', 'none', 'null', 'nan')
        GROUP BY {column}
        ORDER BY count DESC
        LIMIT ?
    """
    df = query_duckdb(sql, [limit])
    return df.to_dict(orient="records")


def get_top_hashtags(limit: int = 10) -> list[dict[str, Any]]:
    if "hashtags" not in get_posts_columns():
        return []

    df = query_duckdb("SELECT hashtags FROM posts WHERE hashtags IS NOT NULL AND TRIM(CAST(hashtags AS VARCHAR)) != ''")
    if df.empty:
        return []

    counts: Counter[str] = Counter()
    for value in df["hashtags"].astype(str).tolist():
        for tag in value.split(","):
            normalized = tag.strip().lower()
            if normalized and normalized not in {"unknown", "none", "null", "nan"}:
                counts[normalized] += 1

    payload = []
    for tag, count in counts.most_common(limit):
        payload.append({"value": f"#{tag}", "count": int(count)})
    return payload


def get_author_engagement(limit: int = 10, min_posts: int = 2) -> list[dict[str, Any]]:
    columns = get_posts_columns()
    if "author" not in columns:
        return []

    likes_expr = "COALESCE(likes, 0)" if "likes" in columns else "0"
    retweets_expr = "COALESCE(retweets, 0)" if "retweets" in columns else "0"

    sql = f"""
        SELECT
            author,
            COUNT(*) AS post_count,
            AVG({likes_expr}) AS avg_likes,
            AVG({retweets_expr}) AS avg_retweets,
            AVG({likes_expr} + {retweets_expr}) AS avg_engagement,
            SUM({likes_expr} + {retweets_expr}) AS total_engagement
        FROM posts
        WHERE author IS NOT NULL
          AND TRIM(CAST(author AS VARCHAR)) != ''
          AND LOWER(TRIM(CAST(author AS VARCHAR))) NOT IN ('unknown', 'none', 'null', 'nan')
        GROUP BY author
        HAVING COUNT(*) >= ?
        ORDER BY total_engagement DESC
        LIMIT ?
    """
    df = query_duckdb(sql, [max(1, min_posts), limit])
    return df.to_dict(orient="records")


def get_recent_activity(days: int = 30) -> list[dict[str, Any]]:
    if "created_at" not in get_posts_columns():
        return []

    sql = """
        WITH max_date AS (
            SELECT MAX(CAST(created_at AS TIMESTAMP)) AS latest_ts
            FROM posts
            WHERE created_at IS NOT NULL
        )
        SELECT
            CAST(DATE_TRUNC('day', CAST(created_at AS TIMESTAMP)) AS DATE) AS day,
            COUNT(*) AS post_count,
            COUNT(DISTINCT author) AS unique_authors,
            AVG(COALESCE(likes, 0) + COALESCE(retweets, 0)) AS avg_engagement
        FROM posts
        CROSS JOIN max_date
        WHERE max_date.latest_ts IS NOT NULL
          AND CAST(created_at AS TIMESTAMP) >= max_date.latest_ts - (? * INTERVAL '1 day')
          AND CAST(created_at AS TIMESTAMP) <= max_date.latest_ts
        GROUP BY day
        ORDER BY day
    """
    df = query_duckdb(sql, [max(1, days)])
    if df.empty:
        return []

    df["day"] = df["day"].astype(str)
    return df.to_dict(orient="records")


def get_overview_insights(top_authors: list[dict[str, Any]], stats: dict[str, Any]) -> dict[str, Any]:
    total_posts = int(stats.get("total_posts", 0) or 0)
    top_posts = sum(int(row.get("post_count", 0) or 0) for row in top_authors[:5])
    concentration = float((top_posts / total_posts) * 100.0) if total_posts > 0 else 0.0

    return {
        "top5_author_post_share": concentration,
    }


def get_posts_by_row_indices(indices: list[int], columns: str = "*") -> pd.DataFrame:
    if not indices:
        return pd.DataFrame()

    valid_indices = [int(i) for i in indices if int(i) >= 0]
    if not valid_indices:
        return pd.DataFrame()

    placeholders = ",".join(str(i) for i in valid_indices)
    sql = f"""
        SELECT {columns}
        FROM (
            SELECT *, rowid AS row_idx
            FROM posts
        ) sub
        WHERE row_idx IN ({placeholders})
    """
    df = query_duckdb(sql)
    if df.empty:
        return df

    order_map = {idx: pos for pos, idx in enumerate(valid_indices)}
    if "row_idx" in df.columns:
        df["_ord"] = df["row_idx"].map(order_map)
        df = df.sort_values("_ord").drop(columns=["_ord"])
    return df
