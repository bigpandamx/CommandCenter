import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeedItems } from "../src/rssAdapter.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample Regulatory Feed</title>
    <item>
      <title>Agency Publishes Final Rule on AI Risk Disclosures</title>
      <link>https://example.gov/rules/2026-001</link>
      <guid>urn:example-gov:2026-001</guid>
      <description><![CDATA[The agency today published a <b>final rule</b> requiring disclosure of AI-related risks.]]></description>
      <pubDate>Mon, 20 Jul 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Proposed Amendment &amp; Public Comment Period Opens</title>
      <link>https://example.gov/rules/2026-002</link>
      <guid>urn:example-gov:2026-002</guid>
      <description>Comments due by end of quarter.</description>
      <pubDate>Tue, 21 Jul 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const SAMPLE_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample Atom Regulatory Feed</title>
  <entry>
    <title>New Guidance on Model Transparency</title>
    <link href="https://example.eu/guidance/2026-14" rel="alternate"/>
    <id>tag:example.eu,2026:guidance/14</id>
    <summary>Guidance on transparency requirements for high-risk AI systems.</summary>
    <updated>2026-07-19T10:30:00Z</updated>
  </entry>
</feed>`;

test("parseFeedItems extracts RSS items with title, link, guid, description, and pubDate", () => {
  const items = parseFeedItems(SAMPLE_RSS);
  assert.equal(items.length, 2);

  assert.equal(items[0]?.title, "Agency Publishes Final Rule on AI Risk Disclosures");
  assert.equal(items[0]?.url, "https://example.gov/rules/2026-001");
  assert.equal(items[0]?.externalId, "urn:example-gov:2026-001");
  assert.equal(
    items[0]?.summary,
    "The agency today published a <b>final rule</b> requiring disclosure of AI-related risks.",
  );
  assert.equal(items[0]?.publishedAt?.toISOString(), new Date("Mon, 20 Jul 2026 09:00:00 GMT").toISOString());
});

test("parseFeedItems decodes XML entities in non-CDATA content", () => {
  const items = parseFeedItems(SAMPLE_RSS);
  assert.equal(items[1]?.title, "Proposed Amendment & Public Comment Period Opens");
});

test("parseFeedItems extracts Atom entries using the link href attribute, not tag content", () => {
  const items = parseFeedItems(SAMPLE_ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "New Guidance on Model Transparency");
  assert.equal(items[0]?.url, "https://example.eu/guidance/2026-14");
  assert.equal(items[0]?.externalId, "tag:example.eu,2026:guidance/14");
  assert.equal(items[0]?.publishedAt?.toISOString(), new Date("2026-07-19T10:30:00Z").toISOString());
});

test("parseFeedItems returns an empty array for a feed with no items", () => {
  const empty = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
  assert.deepEqual(parseFeedItems(empty), []);
});

test("parseFeedItems skips an item missing a required field (title) rather than throwing", () => {
  const malformed = `<rss><channel>
    <item><link>https://example.gov/x</link><guid>x</guid></item>
    <item><title>Valid Item</title><link>https://example.gov/y</link><guid>y</guid></item>
  </channel></rss>`;
  const items = parseFeedItems(malformed);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "Valid Item");
});

test("parseFeedItems falls back to link as externalId when guid is absent", () => {
  const noGuid = `<rss><channel>
    <item><title>No Guid Here</title><link>https://example.gov/no-guid</link></item>
  </channel></rss>`;
  const items = parseFeedItems(noGuid);
  assert.equal(items[0]?.externalId, "https://example.gov/no-guid");
});

test("parseFeedItems extracts content:encoded distinctly from description in RSS", () => {
  const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title>Rule With Full Text</title>
      <link>https://example.gov/rules/2026-010</link>
      <guid>urn:example-gov:2026-010</guid>
      <description>Short summary of the rule.</description>
      <content:encoded><![CDATA[<p>The full text of the rule goes here, much longer than the summary.</p>]]></content:encoded>
      <pubDate>Mon, 20 Jul 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
  const items = parseFeedItems(xml);
  assert.equal(items[0]?.summary, "Short summary of the rule.");
  assert.equal(items[0]?.content, "<p>The full text of the rule goes here, much longer than the summary.</p>");
});

test("parseFeedItems leaves content null for RSS items with no content:encoded tag", () => {
  const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Plain Item</title>
      <link>https://example.gov/rules/2026-011</link>
      <guid>urn:example-gov:2026-011</guid>
      <description>Just a description, no full text.</description>
      <pubDate>Mon, 20 Jul 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
  const items = parseFeedItems(xml);
  assert.equal(items[0]?.content, null, "must not be backfilled from description");
});

test("parseFeedItems extracts summary and content as distinct fields in Atom when both are present", () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom Entry With Both</title>
    <link href="https://example.gov/atom/2026-020"/>
    <id>urn:example-gov:atom-2026-020</id>
    <summary>Short summary text.</summary>
    <content>Much longer full content text.</content>
    <updated>2026-07-20T09:00:00Z</updated>
  </entry>
</feed>`;
  const items = parseFeedItems(xml);
  assert.equal(items[0]?.summary, "Short summary text.");
  assert.equal(items[0]?.content, "Much longer full content text.");
});

test("parseFeedItems falls back to content as summary in Atom when there's no separate summary tag -- preserves the original single-field behavior", () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Content-Only Entry</title>
    <link href="https://example.gov/atom/2026-021"/>
    <id>urn:example-gov:atom-2026-021</id>
    <content>Only content, no summary tag at all.</content>
    <updated>2026-07-20T09:00:00Z</updated>
  </entry>
</feed>`;
  const items = parseFeedItems(xml);
  assert.equal(items[0]?.summary, "Only content, no summary tag at all.");
  assert.equal(items[0]?.content, "Only content, no summary tag at all.");
});
