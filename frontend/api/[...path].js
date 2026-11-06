const API_BASE_URL = "https://mustang-api-five.vercel.app";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.API_ACCESS_KEY;

    if (!apiKey) {
      return res.status(500).json({
        erro: "Chave de acesso da API não configurada."
      });
    }

    const incomingUrl = new URL(
      req.url,
      "https://mustang-site.vercel.app"
    );

    const pathname = incomingUrl.pathname.startsWith("/api/")
      ? incomingUrl.pathname
      : `/api${incomingUrl.pathname}`;

    const targetUrl = new URL(
      `${pathname}${incomingUrl.search}`,
      API_BASE_URL
    );

    const headers = new Headers({
      "x-api-key": apiKey,
      "accept": req.headers.accept || "application/json"
    });

    if (req.headers["content-type"]) {
      headers.set("content-type", req.headers["content-type"]);
    }

    let body;

    if (!["GET", "HEAD"].includes(req.method)) {
      if (req.body !== undefined) {
        body = Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body);
      }
    }

    const apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      cache: "no-store"
    });

    const responseBody = Buffer.from(
      await apiResponse.arrayBuffer()
    );

    res.statusCode = apiResponse.status;
    res.setHeader("cache-control", "no-store");

    const contentType = apiResponse.headers.get("content-type");

    if (contentType) {
      res.setHeader("content-type", contentType);
    }

    return res.end(responseBody);

  } catch (error) {
    console.error("Erro no proxy Mustang:", error);

    return res.status(502).json({
      erro: "Não foi possível estabelecer comunicação com a API."
    });
  }
}