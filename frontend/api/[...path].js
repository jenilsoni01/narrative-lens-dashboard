export default async function handler(req, res) {
  try {
    const backendBase = process.env.VITE_API_BASE;

    if (!backendBase) {
      return res.status(500).json({
        error: "VITE_API_BASE is not configured",
      });
    }

    if (!/^https?:\/\//i.test(backendBase)) {
      return res.status(500).json({
        error: "VITE_API_BASE must be an absolute backend URL (e.g. http://100.48.72.181)",
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

    const headers = {};
    const contentType = req.headers["content-type"];
    const authorization = req.headers.authorization;
    if (contentType) {
      headers["content-type"] = contentType;
    }
    if (authorization) {
      headers.authorization = authorization;
    }

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
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) {
      res.setHeader("content-type", upstreamContentType);
    }
    return res.status(upstream.status).send(responseText);
  } catch (error) {
    return res.status(502).json({
      error: "Proxy request failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}