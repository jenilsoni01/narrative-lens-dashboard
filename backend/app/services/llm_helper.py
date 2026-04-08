import json
from typing import Generator

from flask import current_app


def _get_client():
    api_key = current_app.config.get("GROQ_API", "")
    if not api_key:
        return None
    try:
        from openai import OpenAI

        return OpenAI(api_key=api_key, base_url=current_app.config["GROQ_BASE_URL"])
    except Exception:
        return None


def is_llm_available() -> bool:
    return _get_client() is not None


def summarize_timeseries(trend_data: dict[str, int], granularity: str = "day") -> str:
    client = _get_client()
    if client is None:
        return _fallback_timeseries_summary(trend_data, granularity)

    payload = json.dumps(trend_data)
    if len(payload) > 3000:
        keys = list(trend_data.keys())
        step = max(1, len(keys) // 50)
        sampled = {keys[i]: trend_data[keys[i]] for i in range(0, len(keys), step)}
        payload = json.dumps(sampled)

    prompt = (
        f"Analyze this social-media time-series data aggregated by {granularity}.\n\n"
        f"Data: {payload}\n\n"
        "Return 2-3 concise sentences highlighting spikes, dips, and overall direction."
    )

    try:
        response = client.chat.completions.create(
            model=current_app.config["DEFAULT_LLM_MODEL"],
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.5,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        return f"{_fallback_timeseries_summary(trend_data, granularity)}\n\n(LLM error: {exc})"


def generate_followup_queries(query: str, results: list[str]) -> list[str]:
    client = _get_client()
    if client is None:
        return _fallback_followup_queries(results)

    results_text = "\n".join([f"- {r}" for r in results[:5]])
    prompt = (
        f"A user searched: {query}\n\n"
        f"Top results:\n{results_text}\n\n"
        "Suggest exactly 2 related follow-up search queries as JSON array of strings."
    )

    try:
        response = client.chat.completions.create(
            model=current_app.config["DEFAULT_LLM_MODEL"],
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7,
        )
        content = response.choices[0].message.content.strip()
        if "[" in content and "]" in content:
            start = content.index("[")
            end = content.rindex("]") + 1
            parsed = json.loads(content[start:end])
            if isinstance(parsed, list):
                return [str(item) for item in parsed[:2]]
    except Exception:
        pass

    return _fallback_followup_queries(results)


def rag_response(question: str, context_docs: list[str]) -> str:
    client = _get_client()
    if client is None:
        return _fallback_rag_response(question, context_docs)

    context = "\n\n".join([f"[Document {i + 1}] {doc}" for i, doc in enumerate(context_docs[:3])])

    messages = [
        {
            "role": "system",
            "content": (
                "You are an investigative analyst assistant. Answer using only the provided documents. "
                "Return a concise, direct answer with short paragraphs or bullets. "
                "Start with the main conclusion in one sentence, then add 2-4 evidence bullets with document numbers. "
                "If the documents do not support a confident answer, say that clearly."
            ),
        },
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}",
        },
    ]

    try:
        response = client.chat.completions.create(
            model=current_app.config["DEFAULT_LLM_MODEL"],
            messages=messages,
            max_tokens=500,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        return f"{_fallback_rag_response(question, context_docs)}\n\n(LLM error: {exc})"


def _fallback_timeseries_summary(trend_data: dict[str, int], granularity: str) -> str:
    if not trend_data:
        return "No data available for summary."

    values = list(trend_data.values())
    dates = list(trend_data.keys())
    total = sum(values)
    avg = total / len(values) if values else 0

    peak_idx = values.index(max(values))
    low_idx = values.index(min(values))

    if len(values) >= 2:
        first_half = sum(values[: len(values) // 2])
        second_half = sum(values[len(values) // 2 :])
        trend = "upward" if second_half > first_half else "downward"
    else:
        trend = "flat"

    return (
        f"Statistical summary (LLM unavailable): total={total}, average={avg:.1f} per {granularity}, "
        f"peak={values[peak_idx]} on {dates[peak_idx]}, min={values[low_idx]} on {dates[low_idx]}, "
        f"overall trend={trend}."
    )


def _fallback_followup_queries(results: list[str]) -> list[str]:
    words: list[str] = []
    for text in results[:5]:
        for word in str(text).split():
            clean = word.strip(".,!?@#()[]{}\"'").lower()
            if len(clean) > 4:
                words.append(clean)

    if len(words) >= 4:
        return [f"More about {words[0]} and {words[1]}", f"Impact of {words[2]} on {words[3]}"]
    return ["Related trends", "Key influencers in this topic"]


def _fallback_rag_response(question: str, context_docs: list[str]) -> str:
    lines = [
        "Retrieved context only (LLM unavailable).",
        f"Question: {question}",
    ]
    for i, doc in enumerate(context_docs[:3], 1):
        snippet = doc if len(doc) <= 300 else f"{doc[:300]}..."
        lines.append(f"Doc {i}: {snippet}")
    return "\n\n".join(lines)
