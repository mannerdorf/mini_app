import { describe, expect, it } from "vitest";
import { markdownToSafeHtml } from "./markdownToSafeHtml";

describe("markdownToSafeHtml", () => {
  it("escapes HTML and formats basics", () => {
    const html = markdownToSafeHtml("# Title\n\nHello **world** and <script>\n\n- one\n- two");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("allows safe http(s) links", () => {
    const html = markdownToSafeHtml("[site](https://haulz.space/blog)");
    expect(html).toContain('href="https://haulz.space/blog"');
    expect(html).toContain("rel=\"noopener noreferrer\"");
  });
});
