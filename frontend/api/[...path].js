export default async function handler(req, res) {
  const backendBase = process.env.VITE_API_BASE;

  if (!backendBase) {
    return res.status(500).json({
      error: "VITE_API_BASE is not configured",
    });
  }

  const pathSegments = Array.isArray(req.query.path) ? req.query.path : [];
  const upstreamPath = pathSegments.join("/");
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, String(item));
      }
    } else if (value !== undefined) {
      query.append(key, String(value));
    }
  }

  const base = backendBase.replace(/\/+$/, "");
  const apiBase = /\/api$/i.test(base) ? base : `${base}/api`;
  const target = `${apiBase}/${upstreamPath}${query.toString() ? `?${query.toString()}` : ""}`;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (!headers["content-type"]) {
      headers["content-type"] = "application/json";
    }
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
  });

  const responseText = await upstream.text();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    res.setHeader("content-type", contentType);
  }
  return res.status(upstream.status).send(responseText);
}