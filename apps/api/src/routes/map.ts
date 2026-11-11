// Map tiles for a node's information popup (AGENTS_TO_DO.md 2026-10-20,
// X1): fetched from the configured tile server (config.services
// .mapTilesUrl - OpenStreetMap by default) by the API, kept in a bounded
// in-memory cache, served to the UI - the browser never calls the tile
// server (its usage policy: an identifying User-Agent, no bulk loading, the
// attribution shown - GET /map/attribution).

import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ZOOM = 19;

// least recently used first - a Map keeps insertion order
const cache = new Map<string, { type: string; data: Buffer }>();

export async function mapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/map/attribution", async () => ({ attribution: config.services.mapTilesAttribution }));

  app.get<{ Params: { z: string; x: string; y: string } }>("/map/tiles/:z/:x/:y", async (request, reply) => {
    const z = Number(request.params.z);
    const x = Number(request.params.x);
    const y = Number(request.params.y.replace(/\.png$/, ""));
    const n = 2 ** z;
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > MAX_ZOOM || x < 0 || y < 0 || x >= n || y >= n)
      return reply.code(400).send({ error: "bad tile" });
    const key = `${z}/${x}/${y}`;
    let tile = cache.get(key);
    if (tile) {
      cache.delete(key);
      cache.set(key, tile);
    } else {
      const url = config.services.mapTilesUrl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": config.services.mapTilesUserAgent }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      } catch (err) {
        request.log.warn({ err, url }, "map tile fetch failed");
        return reply.code(502).send({ error: "the tile server is not reachable" });
      }
      if (!res.ok) return reply.code(502).send({ error: `the tile server answered ${res.status}` });
      tile = { type: res.headers.get("content-type") ?? "image/png", data: Buffer.from(await res.arrayBuffer()) };
      cache.set(key, tile);
      while (cache.size > config.services.mapTilesCacheSize) cache.delete(cache.keys().next().value!);
    }
    return reply.header("Cache-Control", "private, max-age=86400").type(tile.type).send(tile.data);
  });
}
