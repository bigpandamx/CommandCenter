import type { ComplianceSource, NormalizedComplianceItem } from "./types.js";

/**
 * Minimal RSS 2.0 / Atom item extractor. Deliberately not a full XML
 * parser (no dependency on fast-xml-parser or similar, to keep this
 * package dependency-free like the rest of Platform-Services/Subscriptions and
 * Customer-Connections) -- it works by regex-matching <item>...</item>
 * (RSS) or <entry>...</entry> (Atom) blocks and pulling known child tags
 * out of each. This is a well-worn, if inelegant, technique that holds
 * up fine for well-formed feeds from major publishers, but will NOT
 * handle deeply nested CDATA edge cases, XML namespaces on the item tags
 * themselves, or malformed feeds gracefully -- if a specific government
 * or vendor feed misbehaves against this, that's a real limitation to
 * fix, not a subtle bug to paper over.
 *
 * parseFeedItems() is the tested part (see test/rssAdapter.test.ts,
 * exercised against hand-written sample RSS/Atom text). fetchRssSource()
 * is the untested network edge -- no outbound network in the sandbox
 * this was built in.
 */

function extractTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!match) return null;
  return decodeXmlEntities(stripCdata(match[1] as string)).trim();
}

/** Atom's <link href="..."/> is a self-closing tag with the URL in an attribute, not tag content -- handled separately from extractTag. */
function extractAtomLink(block: string): string | null {
  const match = /<link[^>]*\shref=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  return match ? (match[1] as string) : null;
}

function stripCdata(text: string): string {
  const match = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(text.trim());
  return match ? (match[1] as string) : text;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Extracts items from raw RSS or Atom XML text. Tries RSS <item> blocks
 * first, then Atom <entry> blocks -- a feed is one or the other, never
 * both, so trying both costs nothing when the first finds nothing.
 */
export function parseFeedItems(xml: string): NormalizedComplianceItem[] {
  const rssItems = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  if (rssItems.length > 0) {
    return rssItems
      .map((m) => m[1] as string)
      .map((block): NormalizedComplianceItem | null => {
        const title = extractTag(block, "title");
        const link = extractTag(block, "link");
        const guid = extractTag(block, "guid") ?? link;
        if (!title || !link || !guid) return null;
        return {
          externalId: guid,
          title,
          summary: extractTag(block, "description"),
          // content:encoded is a common RSS 2.0 namespace extension
          // (used by WordPress and many publishers) for full HTML
          // content distinct from the short <description> -- null when
          // a feed doesn't provide it, not backfilled from description.
          content: extractTag(block, "content:encoded"),
          url: link,
          publishedAt: parseDate(extractTag(block, "pubDate")),
        };
      })
      .filter((item): item is NormalizedComplianceItem => item !== null);
  }

  const atomEntries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  return atomEntries
    .map((m) => m[1] as string)
    .map((block): NormalizedComplianceItem | null => {
      const title = extractTag(block, "title");
      const link = extractAtomLink(block);
      const id = extractTag(block, "id") ?? link;
      if (!title || !link || !id) return null;
      const summaryTag = extractTag(block, "summary");
      const contentTag = extractTag(block, "content");
      return {
        externalId: id,
        title,
        // Falls back to <content> when a feed has no separate <summary>
        // -- preserves the original behavior for feeds that only
        // provide one or the other -- while `content` below still
        // captures it distinctly when both are present.
        summary: summaryTag ?? contentTag,
        content: contentTag,
        url: link,
        publishedAt: parseDate(extractTag(block, "updated") ?? extractTag(block, "published")),
      };
    })
    .filter((item): item is NormalizedComplianceItem => item !== null);
}

/** Untested (no network in the build sandbox) -- see the module doc comment. */
export async function fetchRssSource(source: ComplianceSource): Promise<NormalizedComplianceItem[]> {
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${source.url}: HTTP ${response.status}`);
  }
  const xml = await response.text();
  return parseFeedItems(xml);
}
