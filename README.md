# My site (under construction)

## Development

On MacOS:

```bash
brew install rbenv  # follow additional installation instructions
rbenv init
curl -fsSL https://github.com/rbenv/rbenv-installer/raw/main/bin/rbenv-doctor | bash
rbenv install 3.0.3

# restart the shell

# in the repo
rbenv local 3.0.3

gem install bundler jekyll
```

### Updating

```bash
bundle update github-pages
```

## Resources

- https://dfederm.com/creating-a-blog-using-github-pages/
- https://github.com/jekyll/minima
- https://github.com/jsanz/gh-pages-minima-starter
- https://blog.slowb.ro/dark-theme-for-minima-jekyll/
- https://github.com/derekkedziora/jekyll-demo

## Ideas

- Categories page
- Automatic dark mode
- jekyll remote theme
