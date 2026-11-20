import { describe, expect, it } from "vitest";
import {
  bylineMatch, classifyTopic, cleanTitle, extractArticle, extractListing, listingPageUrl, looksLikeArticle, normalizeUrl,
} from "@/lib/scrape";

const AC = "https://www.androidcentral.com/author/sanuj-bhatia";
const AP = "https://www.androidpolice.com/author/sanuj-bhatia/";
const AA = "https://www.androidauthority.com/author/sanujbhatia/";
const SG = "https://www.soundguys.com/author/sanujbhatia/";

describe("urls", () => {
  it("normalizes", () => {
    expect(normalizeUrl("/phones/x-y-z-w?utm=1#c", AC)).toBe("https://www.androidcentral.com/phones/x-y-z-w");
    expect(normalizeUrl("javascript:void(0)", AC)).toBeNull();
  });
  it("builds archive page urls", () => {
    expect(listingPageUrl(AC, "future", 3)).toBe("https://www.androidcentral.com/author/sanuj-bhatia/page/3");
    expect(listingPageUrl(AP, "valnet", 2)).toBe("https://www.androidpolice.com/author/sanuj-bhatia/page/2/");
    expect(listingPageUrl(AP, "valnet", 1)).toBe(AP);
  });
  it("recognises article urls per site family", () => {
    expect(looksLikeArticle("https://www.androidcentral.com/phones/google-pixel/unofficial-port-for-pixel-11-rambler", "future", AC)).toBe(true);
    expect(looksLikeArticle("https://www.androidcentral.com/phones/google-pixel", "future", AC)).toBe(false);
    expect(looksLikeArticle("https://www.androidcentral.com/author/someone-else-here-now", "future", AC)).toBe(false);
    expect(looksLikeArticle("https://www.androidpolice.com/google-android-xr-glasses-have-me-ready-to-switch/", "valnet", AP)).toBe(true);
    expect(looksLikeArticle("https://www.androidpolice.com/android-phones/", "valnet", AP)).toBe(false);
    expect(looksLikeArticle("https://www.soundguys.com/sennheiser-momentum-true-wireless-5-changed-my-mind-165982/", "aa", SG)).toBe(true);
    expect(looksLikeArticle("https://www.androidauthority.com/reviews/", "aa", AA)).toBe(false);
    expect(looksLikeArticle("https://www.techradar.com/phones/x-y-z-w", "future", AC)).toBe(false);
  });
});

describe("extractListing", () => {
  it("prefers Future's listing markup over sidebars", () => {
    const html = `
      <div class="listingResults">
        <div class="listingResult"><a class="article-link" href="https://www.androidcentral.com/phones/google-pixel/google-pixel-9-refurbushed-starts-sales-usa">x</a></div>
        <div class="listingResult"><a class="article-link" href="/wearables/this-trick-brings-back-google-assistant">y</a></div>
      </div>
      <aside><a href="https://www.androidcentral.com/phones/someone-elses-big-news-story-today">z</a></aside>`;
    expect(extractListing(html, AC, "future", AC)).toEqual([
      "https://www.androidcentral.com/phones/google-pixel/google-pixel-9-refurbushed-starts-sales-usa",
      "https://www.androidcentral.com/wearables/this-trick-brings-back-google-assistant",
    ]);
  });
  it("falls back to all links for Valnet", () => {
    const html = `<nav><a href="/android-phones/">Phones</a><a href="/author/sanuj-bhatia/page/2/">2</a></nav>
      <h5 class="whatever"><a href="/motorola-razr-flex-leak-details-unannounced-qualcomm-chipset/">a</a></h5>
      <a href="https://www.androidpolice.com/one-phone-number-two-android-phones/#threads">b</a>`;
    expect(extractListing(html, AP, "valnet", AP)).toEqual([
      "https://www.androidpolice.com/motorola-razr-flex-leak-details-unannounced-qualcomm-chipset/",
      "https://www.androidpolice.com/one-phone-number-two-android-phones/",
    ]);
  });
  it("reads URLs from JSON blobs on JS-rendered pages", () => {
    const html = `<div id="root"></div><script>window.__DATA__={"posts":[{"url":"https:\\/\\/www.androidauthority.com\\/pixel-11-pro-modem-test-3612345\\/"},{"link":"https://www.androidauthority.com/galaxy-s26-tips-3609999/"}]}</script>`;
    expect(extractListing(html, AA, "aa", AA).sort()).toEqual([
      "https://www.androidauthority.com/galaxy-s26-tips-3609999/",
      "https://www.androidauthority.com/pixel-11-pro-modem-test-3612345/",
    ]);
  });
});

describe("extractArticle", () => {
  it("reads Valnet-style meta tags", () => {
    const html = `<head>
      <title>After 2 years with Meta Ray-Bans, Google's Android XR glasses have me ready to switch</title>
      <meta property="og:title" content="After 2 years with Meta Ray-Bans, Google&#039;s Android XR glasses have me ready to switch">
      <meta property="og:description" content="Google's smart glasses have me excited">
      <meta property="og:image" content="https://static0.anpoimages.com/wordpress/wp-content/uploads/wm/2026/11/meta-ray-ban-sanuj-1.jpg?w=1600&amp;h=900&amp;fit=crop">
      <meta property="article:published_time" content="2026-11-18T11:00:10Z">
      <meta property="article:author" content="Sanuj Bhatia">
      <meta property="article:section" content="Smartwatches &amp; Wearables">
      <link rel="canonical" href="https://www.androidpolice.com/google-android-xr-glasses-have-me-ready-to-switch/">
    </head>`;
    const m = extractArticle(html, "https://www.androidpolice.com/google-android-xr-glasses-have-me-ready-to-switch/");
    expect(m.title).toBe("After 2 years with Meta Ray-Bans, Google's Android XR glasses have me ready to switch");
    expect(m.dek).toBe("Google's smart glasses have me excited");
    expect(m.imageUrl).toBe("https://static0.anpoimages.com/wordpress/wp-content/uploads/wm/2026/11/meta-ray-ban-sanuj-1.jpg?w=1600&h=900&fit=crop");
    expect(m.publishedAt?.toISOString()).toBe("2026-11-18T11:00:10.000Z");
    expect(m.section).toBe("Smartwatches & Wearables");
    expect(bylineMatch(m.authors, ["sanuj bhatia"])).toBe("verified");
  });
  it("reads JSON-LD with @graph and author objects", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","name":"x"},
      {"@type":"NewsArticle","headline":"Android 17 could soon fix your phone's Wi-Fi","datePublished":"2026-10-14T10:00:00+00:00",
       "image":[{"@type":"ImageObject","url":"https://cdn.mos.cms.futurecdn.net/abc.jpg"}],
       "author":[{"@type":"Person","name":"Sanuj Bhatia","url":"https://www.androidcentral.com/author/sanuj-bhatia"}],
       "articleSection":["Android OS"]}]}</script>
      <meta property="og:title" content="Android 17 could soon fix your phone's Wi-Fi | Android Central">`;
    const m = extractArticle(html, "https://www.androidcentral.com/apps-software/android-os/x");
    expect(m.title).toBe("Android 17 could soon fix your phone's Wi-Fi");
    expect(m.imageUrl).toBe("https://cdn.mos.cms.futurecdn.net/abc.jpg");
    expect(m.section).toBe("Android OS");
    expect(m.publishedAt?.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    expect(bylineMatch(m.authors, ["sanuj bhatia"])).toBe("verified");
  });
  it("flags other authors and missing bylines", () => {
    expect(bylineMatch(["Jane Doe"], ["sanuj bhatia"])).toBe("other");
    expect(bylineMatch([], ["sanuj bhatia"])).toBe("unknown");
    expect(bylineMatch(["https://www.androidauthority.com/author/sanujbhatia/"], ["sanuj bhatia"])).toBe("verified");
  });
  it("cleans site suffixes from titles", () => {
    expect(cleanTitle("Hands-on with the Huawei MatePad Air (2026) | TechRadar")).toBe("Hands-on with the Huawei MatePad Air (2026)");
    expect(cleanTitle("Pixel 11 vs iPhone 18 - which is better?")).toBe("Pixel 11 vs iPhone 18 - which is better?");
  });
});

describe("classifyTopic", () => {
  it("assigns sensible topics", () => {
    expect(classifyTopic("I've been loyal to AirPods for years, but these Sennheiser earbuds changed my mind")).toBe("Audio");
    expect(classifyTopic("After 2 years with Meta Ray-Bans, Google's Android XR glasses have me ready to switch")).toBe("Wearables");
    expect(classifyTopic("Galaxy S26 Ultra's Privacy Display gets a big upgrade with One UI 9.5")).toBe("Phones");
    expect(classifyTopic("Hands-on with the Huawei MatePad Air (2026)")).toBe("Tablets & PCs");
    expect(classifyTopic("Not ready to give up Google Assistant?", null, "/wearables/this-trick")).toBe("Wearables");
    expect(classifyTopic("Android 17 could soon fix your Wi-Fi problems")).toBe("Software & AI");
    expect(classifyTopic("Something totally unrelated here")).toBe("Other");
  });
});
