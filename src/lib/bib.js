import fs from "node:fs";
import path from "node:path";

const BIB_PATH = path.resolve("./src/data/publications.bib");

/**
 * Minimal BibTeX reader. Handles the subset this project uses:
 * @type{key, field = {value}, ...} with % line comments.
 */
function parseBib(raw) {
  const entries = [];
  const withoutComments = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("%"))
    .join("\n");

  const entryRe = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
  let match;

  while ((match = entryRe.exec(withoutComments)) !== null) {
    const [, type, key, body] = match;
    const fields = {};
    const fieldRe = /(\w+)\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let f;
    while ((f = fieldRe.exec(body)) !== null) {
      fields[f[1].toLowerCase()] = f[2].replace(/\s+/g, " ").trim();
    }
    entries.push({ type, key, ...fields });
  }
  return entries;
}

/** Strip BibTeX brace-protection and escapes for display. */
function clean(str = "") {
  return str.replace(/[{}]/g, "").replace(/\\&/g, "&").replace(/--/g, "\u2013");
}

/** "Wang, C. and Chen, T." -> ["Wang, C.", "Chen, T."] */
function splitAuthors(str = "") {
  return str.split(" and ").map((a) => a.trim()).filter(Boolean);
}

const raw = fs.readFileSync(BIB_PATH, "utf8");
const parsed = parseBib(raw);

/**
 * A resolvable link for every entry. A DOI is preferred; without one we
 * fall back to a Google Scholar search on the exact title, which lands
 * the reader on the right paper without risking a wrong identifier.
 */
function linkFor(doi, title) {
  if (doi) return `https://doi.org/${doi}`;
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(
    `"${clean(title)}"`
  )}`;
}

const shape = (e) => ({
  key: e.key,
  type: e.type,
  title: clean(e.title),
  authors: splitAuthors(e.author),
  journal: clean(e.journal || ""),
  year: Number(e.year),
  volume: e.volume,
  number: e.number ? clean(e.number) : null,
  pages: clean(e.pages || ""),
  doi: e.doi || null,
  link: linkFor(e.doi, e.title || ""),
  note: e.note ? clean(e.note) : null,
  language: e.language || null,
  role: e.role || "contributing",
  venue: e.venue || null,
  themes: (e.keywords || "").split(",").map((k) => k.trim()).filter(Boolean),
});

/** Patents are listed separately; they are not journal articles. */
export const patents = parsed
  .filter((e) => e.type === "patent")
  .map(shape)
  .sort((a, b) => b.year - a.year);

export const publications = parsed
  .filter((e) => e.type !== "patent")
  .map(shape)
  .map((p) => ({ ...p, primary: p.themes[0] ?? "collab" }))
  .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));

/** Theme slugs -> the label shown to readers. */
export const THEMES = {
  hrsc: "Radical scavenging capacity",
  aop: "Advanced oxidation",
  dbp: "Disinfection byproducts",
  monitoring: "Water quality monitoring",
  "uv-photochem": "UV photochemistry",
  defluorination: "Defluorination",
  ospw: "Oil sands process water",
  collab: "Collaborative",
};

/** Every paper carrying the tag — used on the Research pages, where
 *  overlap between themes is informative rather than repetitive. */
export function byTheme(slug) {
  return publications.filter((p) => p.themes.includes(slug));
}

/** Papers whose *first* tag is this theme. Partitions the corpus, so
 *  the Publications page lists each paper exactly once. */
export function byPrimaryTheme(slug) {
  return publications.filter((p) => p.primary === slug);
}

export function byYear(list = publications) {
  const groups = new Map();
  for (const pub of list) {
    if (!groups.has(pub.year)) groups.set(pub.year, []);
    groups.get(pub.year).push(pub);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]);
}

/** Articles and patents together, newest first, for the Publications page. */
export const allWorks = [...publications, ...patents].sort(
  (a, b) => b.year - a.year || a.title.localeCompare(b.title)
);

export const stats = {
  total: publications.length,
  firstYear: Math.min(...publications.map((p) => p.year)),
  latestYear: Math.max(...publications.map((p) => p.year)),
};
