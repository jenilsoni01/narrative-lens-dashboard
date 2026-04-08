from datetime import datetime, timezone

from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health() -> tuple:
    return (
        jsonify(
            {
                "status": "ok",
                "service": "backend",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ),
        200,
    )