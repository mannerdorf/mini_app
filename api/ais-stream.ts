import type { VercelRequest, VercelResponse } from "@vercel/node";
import WebSocket from "ws";
import { initRequestContext, logError } from "./_lib/observability.js";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

type BoundingBox = [[number, number], [number, number]];

function parseBbox(query: string | string[] | undefined): BoundingBox[] | null {
  if (!query) return null;
  const raw = Array.isArray(query) ? query[0] : query;
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const boxes = parsed as BoundingBox[];
    for (const box of boxes) {
      if (!Array.isArray(box) || box.length !== 2) return null;
      const [a, b] = box;
      if (!Array.isArray(a) || a.length !== 2 || !Array.isArray(b) || b.length !== 2) return null;
      if (typeof a[0] !== "number" || typeof a[1] !== "number" || typeof b[0] !== "number" || typeof b[1] !== "number")
        return null;
    }
    return boxes;
  } catch {
    return null;
  }
}

/**
 * GET /api/ais-stream
 * Query: bbox (JSON array of [[lat,lon],[lat,lon]] boxes), messageTypes (comma-separated)
 * Streams AIS vessel data via Server-Sent Events. Requires AISSTREAM_API_KEY in env.
 * API keys: https://aisstream.io/apikeys (create after sign-in at authenticate)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "ais_stream");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const apiKey = process.env.AISSTREAM_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "AISSTREAM_API_KEY not configured. Get key at https://aisstream.io/apikeys",
      request_id: ctx.requestId,
    });
  }

  const bbox = parseBbox(req.query.bbox);
  const bboxParam: BoundingBox[] =
    bbox && bbox.length > 0
      ? bbox
      : [[[55.0, 19.5], [55.2, 20.0]], [[54.6, 20.0], [54.9, 20.6]]]; // Baltic / Kaliningrad area

  const messageTypesRaw = req.query.messageTypes;
  const messageTypes: string[] =
    typeof messageTypesRaw === "string"
      ? messageTypesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : ["PositionReport", "ShipStaticData"];

  const mmsiRaw = req.query.mmsi;
  const mmsiList: string[] =
    typeof mmsiRaw === "string"
      ? mmsiRaw.split(",").map((s) => s.trim()).filter((s) => /^\d{9}$/.test(s))
      : [];

  const bboxParamFinal = mmsiList.length > 0
    ? [[[-90, -180], [90, 180]]] as BoundingBox[]
    : bboxParam;

  const subscriptionPayload: Record<string, unknown> = {
    APIKey: apiKey,
    BoundingBoxes: bboxParamFinal,
    FilterMessageTypes: messageTypes,
  };
  if (mmsiList.length > 0 && mmsiList.length <= 50) {
    subscriptionPayload.FiltersShipMMSI = mmsiList;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    try {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    } catch {
      /* ignore write errors */
    }
  };

  sendEvent("meta", { request_id: ctx.requestId, bbox: bboxParamFinal, messageTypes, mmsi: mmsiList });


  return new Promise<void>((resolve) => {
    let ws: WebSocket | null = null;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      try {
        res.end();
      } catch {
        /* ignore */
      }
      resolve();
    };

    req.on("close", cleanup);
    req.on("abort", cleanup);

    try {
      ws = new WebSocket(AISSTREAM_URL);

      const timeout = setTimeout(() => {
        sendEvent("info", { message: "Stream timeout (60s). Reconnect to continue." });
        cleanup();
      }, 58000);

      ws.on("open", () => {
        ws!.send(JSON.stringify(subscriptionPayload));
      });

      ws.on("message", (raw: WebSocket.Data) => {
        try {
          const text = typeof raw === "string" ? raw : raw.toString();
          const msg = JSON.parse(text);
          if (msg?.MessageType || msg?.Metadata) {
            sendEvent("ais", msg);
          } else if (msg?.error) {
            sendEvent("error", msg);
          }
        } catch {
          sendEvent("raw", String(raw));
        }
      });

      ws.on("error", (err) => {
        logError(ctx, "ais_websocket_error", err);
        sendEvent("error", { error: err?.message || "WebSocket error" });
        clearTimeout(timeout);
        cleanup();
      });

      ws.on("close", () => {
        clearTimeout(timeout);
        cleanup();
      });
    } catch (err) {
      logError(ctx, "ais_websocket_connect_failed", err);
      sendEvent("error", { error: (err as Error)?.message || "Connection failed" });
      cleanup();
    }
  });
}

export const config = { maxDuration: 60 };
