export type ApiRequestParts = {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
};

export type ApiSnippetLanguage = "curl" | "http";

const SNIPPET_LANGUAGES: { id: ApiSnippetLanguage; label: string }[] = [
    { id: "curl", label: "cURL" },
    { id: "http", label: "HTTP" },
];

export function apiSnippetLanguageOptions(): { id: ApiSnippetLanguage; label: string }[] {
    return SNIPPET_LANGUAGES;
}

function escapeShellSingleQuotes(value: string): string {
    return value.replace(/'/g, "'\\''");
}

export function buildApiRequestSnippet(parts: ApiRequestParts, language: ApiSnippetLanguage): string {
    const method = parts.method.toUpperCase();
    const headerEntries = Object.entries(parts.headers).filter(([k]) => k.trim());

    if (language === "curl") {
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
