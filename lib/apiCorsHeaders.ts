/** Общие CORS-заголовки: Edge middleware + serverless api/_lib/cors.ts */
export const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Request-Id, X-Login, X-Password",
  "Access-Control-Max-Age": "86400",
};
