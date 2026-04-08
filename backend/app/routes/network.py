from flask import Blueprint, jsonify, request

from app.services.analytics import network_summary

network_bp = Blueprint("network", __name__)


@network_bp.get("/network")
def network() -> tuple:
    query = request.args.get("q", "").strip()
    remove_top = request.args.get("remove_top", "false").lower() == "true"
    try:
        max_nodes = int(request.args.get("max_nodes", 120))
        min_edge_weight = int(request.args.get("min_edge_weight", 1))
    except ValueError:
        return jsonify({"error": "max_nodes and min_edge_weight must be integers"}), 400

    try:
        payload = network_summary(
            query=query or None,
            remove_top=remove_top,
            max_nodes=max_nodes,
            min_edge_weight=min_edge_weight,
        )
        return jsonify(payload), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
