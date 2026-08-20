/**
 * POST JSON с явным методом через XHR (fetch в WebView иногда уходит как GET → 405).
 */
export function postJsonXhr(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; data: unknown; responseText: string; url: string; method: "POST" }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === "content-type") continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.onload = () => {
      let data: unknown = {};
      const responseText = String(xhr.responseText || "");
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }
      resolve({ status: xhr.status, data, responseText, url, method: "POST" });
    };
    xhr.onerror = () => reject(new Error(`Network error: POST ${url}`));
    xhr.ontimeout = () => reject(new Error(`Timeout: POST ${url}`));
    xhr.timeout = 120_000;
    xhr.send(body);
  });
}
