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

## Resources used

- https://dfederm.com/creating-a-blog-using-github-pages/
- https://github.com/jekyll/minima
- https://github.com/jsanz/gh-pages-minima-starter
- https://blog.slowb.ro/dark-theme-for-minima-jekyll/
- https://github.com/derekkedziora/jekyll-demo
- https://www.fabriziomusacchio.com/blog/2021-08-16-emojis_for_Jekyll/

## Ideas

- Categories page
- Migrate the Sass skins from `@import` to `@use`
