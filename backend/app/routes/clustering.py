import numpy as np
from flask import Blueprint, Response, jsonify, request

from app.services.analytics import cluster_summary, embedding_map_html
from app.services.data_loader import load_clusters, load_embeddings, load_umap_coords, query_duckdb

clustering_bp = Blueprint("clustering", __name__)


@clustering_bp.get("/clusters")
def clusters() -> tuple:
    try:
        k = int(request.args.get("k", 8))
    except ValueError:
        return jsonify({"error": "k must be an integer"}), 400

    if k < 2 or k > 20:
        return jsonify({"error": "k must be between 2 and 20"}), 400

    try:
        embeddings = load_embeddings()
        precomputed = load_clusters()

        text_df = query_duckdb("SELECT text, author, created_at FROM posts LIMIT 50000")
        texts = text_df["text"].astype(str).tolist() if not text_df.empty else []

        summary = cluster_summary(embeddings=embeddings, texts=texts, k=k, precomputed=precomputed)

        distribution = summary.get("distribution", [])
        total_posts = int(sum(int(row.get("posts", 0) or 0) for row in distribution))
        top_cluster = max(distribution, key=lambda row: int(row.get("posts", 0) or 0), default=None)
        summary["metrics"] = {
            "total_posts": total_posts,
            "clusters": len(distribution),
            "largest_cluster": int(top_cluster.get("cluster", -1)) if top_cluster else None,
            "largest_cluster_posts": int(top_cluster.get("posts", 0)) if top_cluster else 0,
            "largest_cluster_pct": float(top_cluster.get("percentage", 0.0)) if top_cluster else 0.0,
        }

        labels = summary.get("labels", [])
        cluster_examples: dict[str, list[dict]] = {}
        if not text_df.empty and labels:
            for idx, label in enumerate(labels):
                if idx >= len(text_df):
                    break

                cluster_key = str(int(label))
                samples = cluster_examples.setdefault(cluster_key, [])
                if len(samples) >= 3:
                    continue

                row = text_df.iloc[idx]
                text = str(row.get("text", "") or "")
                samples.append(
                    {
                        "author": str(row.get("author", "unknown") or "unknown"),
                        "created_at": str(row.get("created_at", "N/A") or "N/A"),
                        "excerpt": text[:260] + ("..." if len(text) > 260 else ""),
                    }
                )

        summary["examples"] = cluster_examples

        coords = load_umap_coords()
        if coords is not None and len(coords) == len(summary["labels"]):
            summary["coords"] = np.asarray(coords).tolist()
        else:
            summary["coords"] = None

        return jsonify(summary), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@clustering_bp.get("/clusters/viz")
def clusters_viz() -> Response:
    try:
        k = int(request.args.get("k", 8))
    except ValueError:
        return Response("<html><body>k must be an integer.</body></html>", mimetype="text/html"), 400

    if k < 2 or k > 20:
        return Response("<html><body>k must be between 2 and 20.</body></html>", mimetype="text/html"), 400

    try:
        html = embedding_map_html(k)
        return Response(html, mimetype="text/html")
    except Exception as exc:
        return Response(f"<html><body>Failed to build embedding map: {exc}</body></html>", mimetype="text/html"), 500
