---
layout: post
title:  "Finding broken slots in popular Python libraries"
date:   2022-01-03
---

Adding `__slots__` to a class in Python is a great way to reduce memory usage.
But to work properly, all base classes need to implement it.
This is easy to forget and there is nothing warning you that you messed up.
In popular projects, a few of these mistakes have laid undetected — until now!

## Show me!

I built a small tool, [slotscheck](https://github.com/ariebovenberg/slotscheck/),
that scans a package for these mistakes.
My hope is libraries can get a free mini performance boost from fixing their slots.

Here's how to use it:

```bash
$ pip install slotscheck
$ pip install pandas  # or whatever library you'd like to check
$ slotscheck pandas
ERROR: 'SingleArrayManager' has slots but inherits from non-slot class
ERROR: 'Block' has slots but inherits from non-slot class
ERROR: 'NumericBlock' has slots but inherits from non-slot class
ERROR: 'DatetimeLikeBlock' has slots but inherits from non-slot class
ERROR: 'ObjectBlock' has slots but inherits from non-slot class
ERROR: 'CategoricalBlock' has slots but inherits from non-slot class
ERROR: 'BaseArrayManager' has slots but inherits from non-slot class
ERROR: 'BaseBlockManager' has slots but inherits from non-slot class
ERROR: 'SingleBlockManager' has slots but inherits from non-slot class
```


## Fixing slots? What is this about?

Declaring `__slots__` allow you to limit class attributes to a fixed set.
With this information, Python can optimize the layout of the class[^1].
However, to get the full advantages of slots,
all bases of a class also need to have it defined.

Let's look at slots without inheritance:

```python
# checks complete size of objects in memory
from pympler.asizeof import asizeof

class EmptyNoSlots: pass

class EmptyWithSlots: __slots__ = ()

class NoSlots:
    def __init__(self): self.a, self.b = 1, 2

class WithSlots:
    __slots__ = ("a", "b")
    def __init__(self): self.a, self.b = 1, 2

print(asizeof(EmptyNoSlots()))    # 152
print(asizeof(EmptyWithSlots()))  # 32
print(asizeof(NoSlots()))         # 328
print(asizeof(WithSlots()))       # 112 !!!
```

Looks like quite the difference!
So what about inheritance?

```python

class WithSlotsAndProperBaseClass(EmptyWithSlots):
    __slots__ = ("a", "b")
    def __init__(self): self.a, self.b = 1, 2

class NoSlotsAtAll(EmptyNoSlots):
    def __init__(self): self.a, self.b = 1, 2

class WithSlotsAndBadBaseClass(EmptyNoSlots):
    __slots__ = ("a", "b")
    def __init__(self): self.a, self.b = 1, 2

print(asizeof(WithSlotsAndProperBaseClass(1, 2)))  # 112
print(asizeof(NoSlotsAtAll(1, 2)))                 # 328
print(asizeof(WithSlotsAndBadBaseClass(1, 2)))     # 232 !!!
```

As you can see, bad `__slots__` inheritance can really bloat your memory footprint![^2]

## What did I find?

Having built `slotscheck`, I couldn't wait to see what I could find.
I didn't have to look far:
I found some missing slots [in the standard library](https://bugs.python.org/issue46244).

Also, a scan of the [5000 most popular PyPI packages](https://hugovk.github.io/top-pypi-packages/)
showed several of them seem to have some classes with broken slots:

- libcst (144) ([issue opened](https://github.com/Instagram/LibCST/issues/574))
- dpkt (129)
- scapy (85)
- exchangelib (39)
- sqlalchemy (12) ([issue opened](https://github.com/sqlalchemy/sqlalchemy/issues/7527))
- pandas (9) ([issue opened](https://github.com/pandas-dev/pandas/issues/45124))
- trafaret (9)
- acme (9)
- tensorflow_probability (6)
- torch (5)
- srsly (5)
- dynaconf (5)
- falcon (4)
- glom (4)
- aio_pika (4)
- returns (3) ([solved](https://github.com/dry-python/returns/pull/1147))
- parso (3)
- autobahn (3)
- rx (3)
- pika (3)
- aiormq (3)
- boxsdk (3)
- pipenv (3)
- oauthlib (2)
- xmlschema (2)
- aiohttp (2)
- dagster (2)
- peewee (2)
- xlrd (2)
- fiona (2)
- zeroconf (2)
- parsimonious (2)
- wand (2)
- werkzeug (1)
- josepy (1)
- llvmlite (1)
- sphinx (1)
- markupsafe (1)
- tensorflow (1)
- Pathy (1)
- sanic (1)
- mongoengine (1)
- requests_html (1)

(Note that some may be false positives, or out of date since this post.
The list is not exhaustive.)

I was actually surprised how many packages _didn't_ have issues.
This is mostly due to them not having many `__slots__` classes in the first place.
For example, `requests` has 43 classes, none with slots;
`azure` has 2391 classes, only 5 with slots.
I hope tools like `slotscheck` help more libraries adopt slots!

## What now?

The first version of `slotscheck` is available on PyPI.
Include it in your CI pipeline to prevent slots mistakes from appearing again!
Or, contribute to the community by fixing slots in any of the packages listed above.
Check out the GitHub [repo](https://github.com/ariebovenberg/slotscheck/)
to follow further development, and leave a ⭐️ if you like.

[^1]: If you're interested in all the details,
      there is a great explanation [here](https://stackoverflow.com/a/28059785).

[^2]: Of course the exact numbers will change depending on how many attributes
      there are, and their type — among other things.
