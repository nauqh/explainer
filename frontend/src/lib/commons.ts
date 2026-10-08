/**
 * A topical picture for a lesson's opener, found on Wikimedia Commons: free to reuse, and every file carries its
 * licence and author, which the page shows. No key needed, and the API answers browsers directly (origin=*).
 */

export type TopicImage = {
  src: string;
  width: number;
  height: number;
  /** The file's title, cleaned for use as alt text and a caption. */
  title: string;
  /** The file's page on Commons: credit links here. */
  page: string;
  license: string;
  artist: string;
};

type Page = {
  index: number;
  title: string;
  imageinfo?: {
    mime: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    descriptionurl: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
};

const API = "https://commons.wikimedia.org/w/api.php";

/** "File:Encoder self-attention, block diagram.png" -> "Encoder self-attention, block diagram". */
export const cleanTitle = (title: string) => title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replaceAll("_", " ");

const plain = (html = "") => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/**
 * The first search hit that is a diagram and is about the concept. Commons ranks loosely ("attention" alone finds
 * a song cover, "temperature machine learning" a photo of Mars), so a hit must be a drawing or a chart (SVG or
 * PNG, not a photo) and its title must name every word of the concept. No match means no picture: an empty pane
 * is better than a wrong one.
 */
export function pick(pages: Page[], concept: string): TopicImage | null {
  const words = concept.toLowerCase().split(/[\s-]+/).filter(Boolean);
  for (const p of [...pages].sort((a, b) => a.index - b.index)) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl || !/^image\/(svg\+xml|png)$/.test(info.mime)) continue;
    const title = cleanTitle(p.title);
    const t = title.toLowerCase();
    if (!words.every((w) => t.includes(w))) continue;
    return {
      src: info.thumburl,
      width: info.thumbwidth ?? 900,
      height: info.thumbheight ?? 600,
      title,
      page: info.descriptionurl,
      license: plain(info.extmetadata?.LicenseShortName?.value) || "see file page",
      artist: plain(info.extmetadata?.Artist?.value) || "Unknown author",
    };
  }
  return null;
}

const cache = new Map<string, Promise<TopicImage | null>>();

/** One search per concept per page load; failures resolve to null, since the picture is never essential. */
export function findTopicImage(concept: string): Promise<TopicImage | null> {
  const hit = cache.get(concept);
  if (hit) return hit;
  const params = new URLSearchParams({
    action: "query", format: "json", origin: "*",
    generator: "search", gsrnamespace: "6", gsrlimit: "12",
    gsrsearch: `${concept.replaceAll("-", " ")} machine learning filetype:bitmap|drawing`,
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "960",
    iiextmetadatafilter: "LicenseShortName|Artist",
  });
  const found = fetch(`${API}?${params}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { query?: { pages?: Record<string, Page> } } | null) => pick(Object.values(j?.query?.pages ?? {}), concept))
    .catch(() => null);
  cache.set(concept, found);
  return found;
}
