# My programming blog

A [Jekyll](https://jekyllrb.com) site deployed to GitHub Pages by
[a GitHub Actions workflow](.github/workflows/deploy.yml).

## Development

On MacOS, with the Ruby from `~/dotfiles` already on `$PATH`
(`sudo port install ruby40 && sudo port select --set ruby ruby40`, or
`brew install ruby`):

```bash
ruby -v          # 4.0.x, not the 2.6 in /usr/bin
bundle install   # gems land in vendor/bundle, ignored by git
```

### Useful commands

```bash
bundle exec jekyll serve --livereload  # http://localhost:4000
bundle update                          # bump gems within Gemfile constraints
bundle outdated                        # what could be bumped further
rm -rf _site .jekyll-cache             # clear generated site
```

## Where things live

- `_posts/`: the posts. `_data/talks.yml` and `_data/projects.yml` feed the
  talks and projects pages.
- `_sass/tokens.css`: every colour, type size and layout width, for both the
  light and the dark theme.
- `assets/fonts/`: IBM Plex, subset and self-hosted.
  `script/subset-fonts` rebuilds the files (needs `curl` and `uv`).
- `AGENTS.md`: the conventions to keep when changing the site.

## Ideas

- Categories page
