const isLocalDev =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const API_BASE = isLocalDev ? import.meta.env.VITE_API_BASE || "/api" : "/api";

async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawText);
    } catch {
      return { error: "Invalid JSON response from server", raw: rawText };
    }
  }

  return { error: rawText || "Request failed" };
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}
