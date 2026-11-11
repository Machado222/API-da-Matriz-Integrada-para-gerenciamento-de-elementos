
import { proxyToBackend } from "../lib/proxy.js";

export default async function handler(req, res) {
    return proxyToBackend(req, res);
}
