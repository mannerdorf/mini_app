import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.AUDIT_URL || "http://127.0.0.1:4173/";
const OUTPUT_DIR = path.resolve("audit-output");

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function severityByType(type, viewportName) {
  if (type === "horizontal-overflow" || type === "out-of-viewport") return "high";
  if (type === "text-clipping") return "medium";
  if (type === "small-tap-target") return viewportName === "desktop" ? "low" : "medium";
  return "low";
}

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
await ensureDir(OUTPUT_DIR);

const report = {
  url: BASE_URL,
  createdAt: new Date().toISOString(),
  viewports: [],
};

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // Scroll once to trigger lazy sections/components.
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 250));
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 350));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 150));
  });

  const checks = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const toSelector = (el) => {
      if (el.id) return `#${el.id}`;
      const bits = [];
      let cur = el;
      let depth = 0;
      while (cur && cur.nodeType === 1 && depth < 4) {
        const tag = cur.tagName.toLowerCase();
        const cls = (cur.className || "")
          .toString()
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(".");
        bits.unshift(cls ? `${tag}.${cls}` : tag);
        cur = cur.parentElement;
        depth += 1;
      }
      return bits.join(" > ");
    };

    const issues = [];
    const viewportW = window.innerWidth;

    const overflowDiff = document.documentElement.scrollWidth - viewportW;
    if (overflowDiff > 1) {
      issues.push({
        type: "horizontal-overflow",
        message: `Document wider than viewport by ${Math.round(overflowDiff)}px`,
        details: {
          scrollWidth: document.documentElement.scrollWidth,
          viewportW,
        },
      });
    }

    const all = Array.from(document.querySelectorAll("body *"));
    const out = [];
    const clipped = [];
    const smallTapTargets = [];

    for (const el of all) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      if (rect.right > viewportW + 1 || rect.left < -1) {
        out.push({
          selector: toSelector(el),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }

      const isTextish = /^(P|SPAN|H1|H2|H3|H4|H5|H6|A|BUTTON|LABEL|DIV)$/.test(el.tagName);
      if (isTextish && el.scrollWidth > el.clientWidth + 1) {
        const potentiallyClipped =
          style.overflowX !== "visible" ||
          style.textOverflow === "ellipsis" ||
          style.whiteSpace === "nowrap";
        if (potentiallyClipped && (el.textContent || "").trim().length > 0) {
          clipped.push({
            selector: toSelector(el),
            text: (el.textContent || "").trim().slice(0, 80),
            clientWidth: Math.round(el.clientWidth),
            scrollWidth: Math.round(el.scrollWidth),
          });
        }
      }

      const interactive = el.matches(
        'a[href], button, input, select, textarea, [role="button"], [onclick], [tabindex]'
      );
      if (interactive) {
        const w = rect.width;
        const h = rect.height;
        if (w < 44 || h < 44) {
          smallTapTargets.push({
            selector: toSelector(el),
            width: Math.round(w),
            height: Math.round(h),
          });
        }
      }
    }

    for (const x of out.slice(0, 12)) {
      issues.push({
        type: "out-of-viewport",
        message: `Element partly outside viewport: ${x.selector}`,
        details: x,
      });
    }

    for (const x of clipped.slice(0, 12)) {
      issues.push({
        type: "text-clipping",
        message: `Possible clipped text in ${x.selector}`,
        details: x,
      });
    }

    for (const x of smallTapTargets.slice(0, 18)) {
      issues.push({
        type: "small-tap-target",
        message: `Interactive element under 44x44 in ${x.selector}`,
        details: x,
      });
    }

    return {
      title: document.title,
      location: window.location.href,
      issueCount: issues.length,
      issues,
    };
  });

  const screenshotPath = path.join(OUTPUT_DIR, `${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const grouped = checks.issues.map((issue) => ({
    ...issue,
    severity: severityByType(issue.type, viewport.name),
  }));

  report.viewports.push({
    viewport,
    pageTitle: checks.title,
    location: checks.location,
    issueCount: grouped.length,
    issues: grouped,
    screenshotPath,
  });

  await context.close();
}

await browser.close();

const reportPath = path.join(OUTPUT_DIR, "responsive-report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(`Responsive report saved: ${reportPath}`);
