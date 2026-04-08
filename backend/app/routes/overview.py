from flask import Blueprint, jsonify, request

from app.services.data_loader import (
    get_author_engagement,
    get_dataset_stats,
    get_overview_insights,
    get_recent_activity,
    get_top_authors,
    get_top_hashtags,
    get_top_values,
)

overview_bp = Blueprint("overview", __name__)


@overview_bp.get("/overview")
def overview() -> tuple:
    try:
        try:
            limit = int(request.args.get("limit", 10))
        except ValueError:
            return jsonify({"error": "limit must be an integer"}), 400

        limit = max(5, min(limit, 25))
        stats = get_dataset_stats()
        top_authors = get_top_authors(limit)

        payload = {
            "stats": stats,
            "top_authors": top_authors,
            "top_subreddits": get_top_values("subreddit", limit),
            "top_domains": get_top_values("domain", limit),
            "top_hashtags": get_top_hashtags(limit),
            "engagement_leaders": get_author_engagement(limit=limit, min_posts=2),
            "recent_activity": get_recent_activity(days=30),
            "insights": get_overview_insights(top_authors, stats),
        }
        return jsonify(payload), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
