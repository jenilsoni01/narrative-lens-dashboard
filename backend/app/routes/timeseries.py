from flask import Blueprint, jsonify, request

from app.services.analytics import get_timeseries
from app.services.llm_helper import summarize_timeseries, is_llm_available

timeseries_bp = Blueprint("timeseries", __name__)


@timeseries_bp.get("/timeseries")
def timeseries() -> tuple:
    granularity = request.args.get("granularity", "day")
    if granularity not in {"day", "week", "month"}:
        return jsonify({"error": "granularity must be one of: day, week, month"}), 400

    try:
        data = get_timeseries(granularity)
        trend_data = {row["period"]: int(row["post_count"]) for row in data}
        summary = summarize_timeseries(trend_data, granularity)

        return jsonify(
            {
                "granularity": granularity,
                "data": data,
                "summary": summary,
                "llm_available": is_llm_available(),
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
