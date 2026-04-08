from flask import Blueprint, jsonify, request

from app.services.data_loader import embed_query, get_posts_by_row_indices, load_faiss_index
from app.services.llm_helper import generate_followup_queries, is_llm_available, rag_response

chatbot_bp = Blueprint("chatbot", __name__)


@chatbot_bp.post("/chat")
def chat() -> tuple:
    body = request.get_json(silent=True) or {}
    question = str(body.get("question", "")).strip()

    if len(question) < 3:
        return jsonify({"error": "question must be at least 3 characters"}), 400

    try:
        index = load_faiss_index()
        query_vec = embed_query(question)
        _, indices = index.search(query_vec, 3)
        idx_list = [int(i) for i in indices[0].tolist() if int(i) >= 0]

        df = get_posts_by_row_indices(idx_list, columns="text, author, created_at, likes, row_idx")
        context_docs = []
        context_items = []
        if not df.empty:
            for _, row in df.iterrows():
                author = str(row.get("author", "unknown") or "unknown")
                created_at = str(row.get("created_at", "N/A") or "N/A")
                text = str(row.get("text", "") or "")
                likes = int(row.get("likes", 0) or 0)
                row_idx = int(row.get("row_idx", -1) or -1)
                context_docs.append(f"[@{author} on {created_at}] {text}")
                context_items.append(
                    {
                        "row_idx": row_idx,
                        "author": author,
                        "created_at": created_at,
                        "likes": likes,
                        "text": text,
                        "excerpt": text[:320] + ("..." if len(text) > 320 else ""),
                    }
                )

        followups = generate_followup_queries(question, context_docs)

        if not context_docs:
            return jsonify(
                {
                    "question": question,
                    "answer": "No relevant context was retrieved for this question. Try a broader or more specific follow-up.",
                    "context": [],
                    "followups": followups,
                    "llm_available": is_llm_available(),
                }
            ), 200

        answer = rag_response(question, context_docs)
        return jsonify(
            {
                "question": question,
                "answer": answer,
                "context": context_items,
                "followups": followups,
                "llm_available": is_llm_available(),
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
