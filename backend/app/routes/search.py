from flask import Blueprint, jsonify, request

from app.services.data_loader import embed_query, get_posts_by_row_indices, load_faiss_index
from app.services.llm_helper import generate_followup_queries, is_llm_available

search_bp = Blueprint("search", __name__)


@search_bp.get("/search")
def search() -> tuple:
    query = request.args.get("q", "").strip()
    try:
        top_k = int(request.args.get("top_k", 5))
        min_score = float(request.args.get("min_score", 0.0))
    except ValueError:
        return jsonify({"error": "top_k must be an integer and min_score must be numeric"}), 400

    if len(query) < 3:
        return jsonify({"error": "query must be at least 3 characters"}), 400

    top_k = max(3, min(top_k, 20))
    min_score = max(-1.0, min(min_score, 1.0))

    try:
        index = load_faiss_index()
        query_vec = embed_query(query)
        scores, indices = index.search(query_vec, top_k)

        idx_raw = [int(i) for i in indices[0].tolist()]
        score_raw = [float(s) for s in scores[0].tolist()]
        pairs = [(idx, score) for idx, score in zip(idx_raw, score_raw) if idx >= 0 and score >= min_score]
        idx_list = [idx for idx, _ in pairs]
        score_list = [score for _, score in pairs]

        posts_df = get_posts_by_row_indices(idx_list, columns="text, author, created_at, likes, retweets, hashtags, row_idx")
        results = []
        if not posts_df.empty:
            score_by_idx = {idx: score for idx, score in zip(idx_list, score_list)}
            for _, row in posts_df.iterrows():
                ridx = int(row.get("row_idx", -1))
                results.append(
                    {
                        "row_idx": ridx,
                        "score": score_by_idx.get(ridx, 0.0),
                        "text": str(row.get("text", "")),
                        "author": str(row.get("author", "unknown")),
                        "created_at": str(row.get("created_at", "")),
                        "likes": int(row.get("likes", 0) or 0),
                        "retweets": int(row.get("retweets", 0) or 0),
                        "hashtags": str(row.get("hashtags", "") or ""),
                    }
                )

        results.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)

        followups = generate_followup_queries(query, [item.get("text", "") for item in results])

        best_score = max([float(item.get("score", 0.0)) for item in results], default=0.0)
        avg_score = (sum(float(item.get("score", 0.0)) for item in results) / len(results)) if results else 0.0

        return jsonify(
            {
                "query": query,
                "results": results,
                "followups": followups,
                "llm_available": is_llm_available(),
                "params": {"top_k": top_k, "min_score": min_score},
                "stats": {
                    "returned": len(results),
                    "best_score": best_score,
                    "avg_score": avg_score,
                },
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
