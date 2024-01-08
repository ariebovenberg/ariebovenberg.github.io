---
layout: post
title:  "The curious case of Pydantic and the 1970s timestamps"
date:   2024-01-08
---

When parsing Unix timestamps, Pydantic
guesses whether to interpret them in seconds or milliseconds.
While this is certainly convenient and works most of the time,
it can drastically (and silently) distort timestamps from a few decades ago.

Let's imagine you're dealing with some rocket launch data:

```python
# some timestamps in milliseconds
marsrover = datetime(2020, 7, 30, 11, 50).timestamp() * 1000
pathfinder = datetime(1996, 12, 4, 6, 58).timestamp() * 1000
apollo_13 = datetime(1970, 4, 11, 19, 13).timestamp() * 1000
```

When we use Pydantic to load this data, we notice something strange...

```python
from pydantic import BaseModel

class Mission(BaseModel):
    launch: datetime

Mission(launch=marsrover)   # 2020-07-30 11:50
Mission(launch=pathfinder)  # 1996-12-04 06:58
Mission(launch=apollo_13)   # 2245-11-14 00:40 ???
```

While the first timestamps are parsed correctly, the third is *wildly* different!
How did this happen?

Let's take a closer look at the timestamp values:

```python
print(marsrover)   # 1596102600000
print(pathfinder)  # 849679080000
print(apollo_13)   # 8705580000
```

What jumps out is that the timestamp for Apollo 13 is a lot smaller.
This makes sense as it's closer to the Unix epoch of 1970-1-1, after all.

Pydantic draws a different conclusion:
it's small because...*it probably represents seconds*, not milliseconds.
In other words: at some point in the seventies, it starts interpreting
millisecond timestamps as seconds instead.
At best, you'll get a confusing error about out-of-bounds time data,
but at worst, your data is drastically and silently transformed.

You might think: *who cares? This is such a rare case — and it's often helpful!*

Yes, but:

1. It's not uncommon for large companies to have data from the 70s,
   and milliseconds are frequently used to store timestamps.
2. Working with time is already complex and error-prone.
   We should be critical of adding another edge case.

Thankfully, the Pydantic team is quick to respond, and a
[solution is in the works](https://github.com/pydantic/pydantic/issues/7940).

## The larger lesson here

Libraries have become so good at ingesting our data *automagically*[^1],
that we can forget to do proper software engineering.
With basic research, you can often find out what your data looks
like *before* you ingest it. And if you define an API, *you* dictate the data format!

Unless you're dealing with unconstrained and erratic data,
you most likely already know whether the timestamps you're reading are in seconds or milliseconds.
Don't rely on a library to *guess* it correctly for you!
Yes, it may take slightly more time to code —
but your app will be safer, more predictable, and faster for it.

If you're still unconvinced of the danger of automagical parsing,
look no further than Microsoft Excel.
Who among us hasn't been tripped up by
its [notoriously overeager data inference](https://www.reddit.com/r/excel/comments/jfir5s/stop_automatically_reformatting_my_data_into/)?
Let's not repeat this mistake in Python.
The Zen of Python already warns us:

> In the face of ambiguity, refuse the temptation to guess.

Refuse the temptation of automagical parsing. **Be explicit about data you ingest.**

[^1]:  I'm also looking at you, `pandas.read_csv()`...
