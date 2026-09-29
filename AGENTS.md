# dev.arie.bovenberg.net

Personal programming blog: Jekyll, deployed to GitHub Pages by `.github/workflows/deploy.yml`. Text is the hero; the terminal-era styling (prompt line, block cursor, bracketed nav, mono chrome around serif body text) is seasoning.

## Hard rules

- **Tokens are the single source of truth.** `_sass/tokens.css` holds every colour, type size, font stack and layout width. Add a token rather than hard-coding a value. Light ("bone") is the default; dark overrides it via `prefers-color-scheme`. There is no theme toggle.
- **JavaScript only as tiny progressive enhancement.** Each script is ≤ 1 KB minified, has no dependencies, loads with `defer`, and is included only on pages that use it. Every page is fully usable with JS disabled. The only script is `assets/js/toc.js`, which marks the current section in the TOC. Ask before adding another.
  - **Exception: GoatCounter.** `_includes/goatcounter.html` loads GoatCounter's `count.js` (third-party, ~3.4 KB compressed) in production builds only, to count page views. It sets no cookies; a `<noscript>` pixel counts views without JS.
- **Dependencies:** ask before adding anything to the `Gemfile` or the `plugins:` list.
- **Accessibility:** WCAG AA contrast for all text on its actual background, including syntax colours and CSS-generated text (`::before`/`::after`, `::marker`). Re-check any new colour pair. Keep the skip link, visible focus, `aria-current` on the active nav item, and heading levels without skips.
  - **Exception:** the `[ ]` status mark is a quiet grey at 3:1. Marks are `role="img"` with spoken names, so non-text contrast applies.
- **Performance budget:** a post page stays < 100 KB transferred (HTML + CSS + fonts + JS), with no layout shift from font loading or images (give every `<img>` `width` and `height`).
- **URLs are stable.** Before and after a change that affects routing, diff the list of paths in the built `_site/`. Ask before removing a URL.
- Ask before deleting content or editing a post's body.

## Fonts

- IBM Plex Mono (400, 600) and IBM Plex Serif (400, 400 italic, 600), self-hosted as subset woff2 in `assets/fonts/`. `script/subset-fonts` rebuilds them; add characters to its `UNICODES` list. Plex has no geometric shapes (▶, ✗, ●): those come from system fonts.
- `_sass/fonts.scss` pairs each face with a metric-matched Georgia/Menlo/Consolas fallback so the swap moves nothing. Recompute the overrides if a face changes.
- Preload only Serif 400.

## Writing posts

- Front matter: `title` and `description` may contain inline Markdown (use backticks for `__init__`-style names); `tags:` is a list, and each tag's list-page dot hue comes from `_data/colors.yml` (unmapped tags get a muted dot; keep ≤ 6 hues).
- The first paragraph is the lede. `h2`/`h3` only; no `h4`.
- **Code blocks:** fence with the language. A filename bar appears only when you add `{: data-title="example.py"}` on the line after the fence. Rouge has no `pycon` lexer: fence a REPL session as ```` ```console?lang=python&prompt=>>>,... ````.
- **Tables** are wrapped automatically into scrollable slabs. Status cells use `{% include mark.html s="yes|partly|no" %}` (renders `[x]` / `[~]` / `[ ]`).
- **Table of contents** is opt-in: `{% include toc.html %}`, or `numbered=true` for a post with numbered sections. Mark `h2`s that shouldn't appear with `{: .no_toc}`. Override the grep line with front matter `toc_cmd`.
- **Numbered sections** are opt-in: wrap them in `<div class="numbered" markdown="1"> … </div>` to get `01`, `02`… before each `h2`. kramdown can't set an id that starts with a digit, so an old anchor like `#1-foo` is kept with an empty `<div id="1-foo"></div>` above the heading.

## Other content

- Talks: `_data/talks.yml`. Projects: `_data/projects.yml` (curated; `status` is `active` or `archived`). Adding one is one YAML block.
- List pages (home, talks, projects) share `_includes/entry.html`. Colour on list pages is limited to the dots.

## Checking a change

Run `bundle exec jekyll serve` and look at the affected pages in light and dark, at 1280px and 390px. The page must never scroll sideways at 390px.
