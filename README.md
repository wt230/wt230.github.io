# Wang Water Group website

Static site built with [Astro](https://astro.build). Content lives in
three data files; templates read from them, so adding a paper or a
student means editing text, not code.

## Running it

```bash
npm install
npm run dev      # preview — open via the PORTS tab, not localhost
npm run build    # writes to dist/
```

## Where the content is

| File | Holds |
|---|---|
| `src/data/site.yml` | Tagline, group description, research themes, openings, facilities, contact |
| `src/data/people.yml` | Current members, alumni, co-supervisors |
| `src/data/publications.bib` | All papers |

### Adding a paper

Paste a BibTeX entry into `publications.bib` with three extra fields:

```bibtex
keywords = {hrsc, aop},     % first value = primary theme; decides which
                            % section it appears under on /publications
role     = {corresponding}, % first | co-first | corresponding | contributing
venue    = {um-era}         % internal only, never rendered
```

Valid `keywords` values are the keys of `THEMES` in `src/lib/bib.js`.
The build **fails deliberately** if a paper's primary theme is missing
from the list in `publications.astro` — that guards against papers
silently vanishing.

### Adding a person

Add an entry under `current:` in `people.yml`. Move them to `alumni:`
when they finish and fill in `placement:` — that field is what
prospective students look for hardest.

### Photos

- **People**: drop a square crop in `public/images/people/` and set
  `photo: /images/people/name.jpg`. No file, no problem — the card falls
  back to initials, so anyone who declines leaves no visible gap.
- **Hero slides**: `src/assets/hero/`, listed in `HeroSlides.astro`.
- **Facilities**: `src/assets/facilities/`, named in `site.yml`.

Anything under `src/assets/` is resized and converted to webp at build
time. Anything in `public/` is shipped **exactly as it is** — a 7 MB
phone photo there is a 7 MB download for every visitor.

### TODO markers

Any field whose value starts with `TODO` is omitted from the rendered
page rather than printed, so the site is safe to publish with gaps.
Search for `TODO` to find what is outstanding.

### YAML gotchas

Two spaces to indent, never tabs. Quote any value containing a colon —
`tagline: "Micropollutants: Treatment and Chemistry"` breaks the build
unquoted.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on
every push to `main`. Settings → Pages → Source must be **GitHub
Actions**.

## Design notes

Palette derives from methylene blue fading as hydroxyl radicals consume
it — `--mb-900` concentrated, `--mb-100` nearly quenched. The fading
rule above each section heading is that gradient. All colours come from
the tokens at the top of `src/styles/global.css`.

Type: Bricolage Grotesque for display, Newsreader for body, IBM Plex
Mono for data and labels. Self-hosted via Fontsource, so the site makes
no third-party requests.
