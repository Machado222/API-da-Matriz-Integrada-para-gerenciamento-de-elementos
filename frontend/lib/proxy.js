
const API_BASE_URL = "https://mustang-api-five.vercel.app";

export async function proxyToBackend(req, res) {
    try {
        const apiKey = process.env.API_ACCESS_KEY;

        if (!apiKey) {
            return res.status(500).json({
                erro: "Chave de acesso da API não configurada."
            });
        }

        const incomingUrl = new URL(
            req.url || "/",
            "https://mustang-site-one.vercel.app"
        );

        // Caminho recebido pela regra de encaminhamento da Vercel
        const rawPath = incomingUrl.searchParams.get("path");

        if (!rawPath) {
            return res.status(400).json({
                erro: "Caminho da API não informado."
            });
        }

        const segmentos = rawPath
            .split("/")
            .filter(Boolean);

        const caminhoSeguro = segmentos
            .map(segmento => encodeURIComponent(segmento))
            .join("/");

        const targetUrl = new URL(
            `/api/${caminhoSeguro}`,
            API_BASE_URL
        );

        // Preservar os parâmetros originais da consulta
        for (const [chave, valor] of incomingUrl.searchParams.entries()) {
            if (chave !== "path") {
                targetUrl.searchParams.append(chave, valor);
            }
        }

        const headers = new Headers({
            "x-api-key": apiKey,
            "accept": req.headers.accept || "application/json"
        });

        if (req.headers["content-type"]) {
            headers.set(
                "content-type",
                req.headers["content-type"]
            );
        }

        const method = req.method || "GET";
        let body;

        if (!["GET", "HEAD"].includes(method)) {
            if (req.body !== undefined) {
                body = Buffer.isBuffer(req.body)
                    ? req.body
                    : typeof req.body === "string"
                        ? req.body
                        : JSON.stringify(req.body);
            }
        }

        const apiResponse = await fetch(targetUrl, {
            method,
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
