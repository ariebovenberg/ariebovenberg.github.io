# My programming blog

## Development

On MacOS:

```bash
brew install rbenv  # follow additional installation instructions
rbenv init
curl -fsSL https://github.com/rbenv/rbenv-installer/raw/main/bin/rbenv-doctor | bash
rbenv install 3.1.3

# restart the shell

# in the repo
rbenv local 3.1.3

gem install bundler jekyll

bundle install
```

### Useful commands

```bash
bundle update
bundle exec jekyll serve
```


## Resources used

- https://dfederm.com/creating-a-blog-using-github-pages/
- https://github.com/jekyll/minima
- https://github.com/jsanz/gh-pages-minima-starter
- https://blog.slowb.ro/dark-theme-for-minima-jekyll/
- https://github.com/derekkedziora/jekyll-demo

## Ideas

- Categories page
- jekyll remote theme
