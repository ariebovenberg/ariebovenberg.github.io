---
layout: post
title:  "Should you still use empty __init__.py files?"
date:   2024-10-07
---

If you've ever googled the question
"Why do Python packages have empty ``__init__.py`` files?",
you could get the idea that they're required to mark a directory as a Python package.
This is a common misconception—they've been optional since Python 3.3!
Why then, do most Python projects still have them?

## What are these files again?

`__init__.py` files are used to mark directories as Python packages.
For example, a file structure like this:

```
my_package/
    __init__.py
    some_module.py
```

will allow you to run:

```python
import my_package.some_module
# or
from my_package import some_module
```

What you might not know is that in modern Python,
you can omit the `__init__.py` file
and still be able to run the same import!
So why not get rid of these files altogether?

## The benefits of being explicit

Imagine the following codebase without any `__init__.py` files:

```
services/
    component_a/
        one.py
    component_b/
        child/
            two.py
        three.py
    scripts/
        my_script.py
```

Encountering this structure, you might wonder
which of these directories are meant to be packages,
and which are just directories that happen to contain Python files.

This matters in non-obvious ways.
Take the "services" directory for example. Are you meant to...

1. import `services.component_a.one`?
2. or `component_a.one` with "services" as the working directory?

The problem is: only one of these will actually work,
because the package internals likely assume one or the other.
For example, if `one.py` contains:

```python
import component_b.three
```

then only option 2 will work.

Adding the proper `__init__.py`  files
takes away the guesswork and makes the structure clear:

```
services/
    component_a/
        __init__.py
        one.py
    component_b/
        __init__.py
        child/
            __init__.py
            two.py
        three.py
    scripts/
        my_script.py
```

Now, it's immediately clear that `component_a` and `component_b` are packages,
and `services` is just a directory.
It also makes clear that "scripts" isn't a package at all, and `my_script.py`
isn't something you should be importing.
`__init__.py` files help developers understand the structure of your codebase.

## Tooling needs to understand your package structure too

You might think: *"I'm not convinced. I know my codebase well enough.
And besides, I document how to import my packages in the README."*

What you may forget is that it's not just humans that need
to understand the package structure.
Tools like `mypy` and `ruff` also need to understand what is a package and what isn't,
in order to work correctly.
What makes it extra tricky is that you may not notice problems
at first, but they can crop up later as your codebase grows.
Fixing these issues can be a real headache, especially if you're
not aware of the intricacies of Python's import system.
By omitting `__init__.py` files,
you may be putting a maintenance timebomb in your codebase.

## What about implicit namespace packages?

When omitting `__init__.py` files,
you're actually creating what's called an ["implicit namespace package"](https://peps.python.org/pep-0420/).
This has some benefits, like allowing you to split a package across multiple directories.
If you use namespace packages for this purpose,
you're probably aware of the trade-offs,
and you've likely already struggled with issues of tooling compatibility
and developer confusion.

For this reason, implicit namespace packages are rare.
So long as you don't need the advanced features of implicit namespace packages,
you should stick to using `__init__.py` files.

## Recommendations

You should use `__init__.py` files to make it clear which directories are packages and which aren't.
This isn't only helpful for other developers, it's often necesssary for tools like
`mypy` to work correctly.

You can enforce the use of `__init__.py` files in your codebase
[using `ruff`](https://docs.astral.sh/ruff/rules/implicit-namespace-package/)
or a [flake8 plugin](https://pypi.org/project/flake8-no-pep420/).
