export type ApiRequestParts = {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
};

export type ApiSnippetLanguage = "curl" | "http" | "javascript-fetch" | "python-requests" | "csharp-httpclient";

const SNIPPET_LANGUAGES: { id: ApiSnippetLanguage; label: string }[] = [
    { id: "curl", label: "cURL" },
    { id: "http", label: "HTTP" },
    { id: "javascript-fetch", label: "JavaScript — Fetch" },
    { id: "python-requests", label: "Python — Requests" },
    { id: "csharp-httpclient", label: "C# — HttpClient" },
];

export function apiSnippetLanguageOptions(): { id: ApiSnippetLanguage; label: string }[] {
    return SNIPPET_LANGUAGES;
}

function escapeShellSingleQuotes(value: string): string {
    return value.replace(/'/g, "'\\''");
}

function escapeJsSingleQuoted(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapePythonSingleQuoted(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeCSharpString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseBodyJson(body: string | undefined): unknown | null {
    const raw = body?.trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function formatPythonValue(value: unknown, indent = 0): string {
    const pad = "    ".repeat(indent);
    const padIn = "    ".repeat(indent + 1);
    if (value === null) return "None";
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
    if (typeof value === "string") return `'${escapePythonSingleQuoted(value)}'`;
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        return `[\n${value.map((v) => `${padIn}${formatPythonValue(v, indent + 1)}`).join(",\n")},\n${pad}]`;
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return "{}";
        return `{\n${entries.map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${formatPythonValue(v, indent + 1)}`).join(",\n")},\n${pad}}`;
    }
    return `'${escapePythonSingleQuoted(String(value))}'`;
}

function buildCurlSnippet(parts: ApiRequestParts, method: string, headerEntries: [string, string][]): string {
    const lines = [`curl --request ${method} \\`, `  --url '${escapeShellSingleQuotes(parts.url)}' \\`];
    for (const [key, value] of headerEntries) {
        lines.push(`  --header '${escapeShellSingleQuotes(`${key}: ${value}`)}' \\`);
    }
    if (parts.body && parts.body.trim()) {
        lines.push(`  --data '${escapeShellSingleQuotes(parts.body.trim())}'`);
    } else {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "");
    }
    return lines.join("\n");
}

function buildHttpSnippet(parts: ApiRequestParts, method: string, headerEntries: [string, string][]): string {
    let urlObj: URL;
    try {
        urlObj = new URL(parts.url);
    } catch {
        return `${method} ${parts.url} HTTP/1.1`;
    }

    const pathWithQuery = `${urlObj.pathname}${urlObj.search}`;
    const lines = [`${method} ${pathWithQuery} HTTP/1.1`, `Host: ${urlObj.host}`];
    for (const [key, value] of headerEntries) {
        if (key.toLowerCase() === "host") continue;
        lines.push(`${key}: ${value}`);
    }
    if (parts.body && parts.body.trim()) {
        lines.push("", parts.body.trim());
    }
    return lines.join("\n");
}

function buildJavaScriptFetchSnippet(parts: ApiRequestParts, method: string, headerEntries: [string, string][]): string {
    const headerLines = headerEntries.map(([k, v]) => `    '${escapeJsSingleQuoted(k)}': '${escapeJsSingleQuoted(v)}',`).join("\n");
    const bodyLine = parts.body?.trim() ? `  body: '${escapeJsSingleQuoted(parts.body.trim())}',\n` : "";

    return `const response = await fetch('${escapeJsSingleQuoted(parts.url)}', {
  method: '${method}',
  headers: {
${headerLines}
  },
${bodyLine}});
const data = await response.json();
console.log(data);`;
}

function buildPythonRequestsSnippet(parts: ApiRequestParts, method: string, headerEntries: [string, string][]): string {
    const headerLines = headerEntries.map(([k, v]) => `    '${escapePythonSingleQuoted(k)}': '${escapePythonSingleQuoted(v)}',`).join("\n");
    const bodyParsed = parseBodyJson(parts.body);
    const args: string[] = [`    '${method}'`, `    '${escapePythonSingleQuoted(parts.url)}'`, `    headers={\n${headerLines}\n    }`];
    if (bodyParsed != null) {
        args.push(`    json=${formatPythonValue(bodyParsed, 1)}`);
    } else if (parts.body?.trim()) {
        args.push(`    data='${escapePythonSingleQuoted(parts.body.trim())}'`);
    }

    return `import requests

response = requests.request(
${args.join(",\n")},
)
response.raise_for_status()
print(response.json())`;
}

function csharpHttpMethod(method: string): string {
    const m = method.toUpperCase();
    if (m === "GET") return "Get";
    if (m === "POST") return "Post";
    if (m === "PUT") return "Put";
    if (m === "PATCH") return "Patch";
    if (m === "DELETE") return "Delete";
    if (m === "HEAD") return "Head";
    if (m === "OPTIONS") return "Options";
    return "Post";
}

function buildCSharpHttpClientSnippet(parts: ApiRequestParts, method: string, headerEntries: [string, string][]): string {
    const headerLines = headerEntries
        .filter(([k]) => k.toLowerCase() !== "content-type" || !parts.body?.trim())
        .map(([k, v]) => `request.Headers.TryAddWithoutValidation("${escapeCSharpString(k)}", "${escapeCSharpString(v)}");`)
        .join("\n");

    const hasBody = Boolean(parts.body?.trim());
    const contentBlock = hasBody
        ? `\nvar content = new StringContent("${escapeCSharpString(parts.body!.trim())}", Encoding.UTF8, "application/json");\nrequest.Content = content;\n`
        : "";

    return `using System.Net.Http;
using System.Text;

using var client = new HttpClient();
using var request = new HttpRequestMessage(HttpMethod.${csharpHttpMethod(method)}, "${escapeCSharpString(parts.url)}");
${headerLines}${contentBlock}
using var response = await client.SendAsync(request);
response.EnsureSuccessStatusCode();
var body = await response.Content.ReadAsStringAsync();
Console.WriteLine(body);`;
}

export function buildApiRequestSnippet(parts: ApiRequestParts, language: ApiSnippetLanguage): string {
    const method = parts.method.toUpperCase();
    const headerEntries = Object.entries(parts.headers).filter(([k]) => k.trim()) as [string, string][];

    switch (language) {
        case "curl":
            return buildCurlSnippet(parts, method, headerEntries);
        case "http":
            return buildHttpSnippet(parts, method, headerEntries);
        case "javascript-fetch":
            return buildJavaScriptFetchSnippet(parts, method, headerEntries);
        case "python-requests":
            return buildPythonRequestsSnippet(parts, method, headerEntries);
        case "csharp-httpclient":
            return buildCSharpHttpClientSnippet(parts, method, headerEntries);
        default:
            return buildCurlSnippet(parts, method, headerEntries);
    }
}
