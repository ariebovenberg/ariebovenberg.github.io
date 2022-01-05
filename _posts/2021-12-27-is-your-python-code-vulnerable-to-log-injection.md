---
layout: post
title:  "Is your Python code vulnerable to log injection?"
date:   2021-12-27
---

Following the news on log4j lately,
you may wonder if Python's logging library is safe.
After all, there is a potential for injection attacks where string formatting
meets user input.
Thankfully, Python's logging isn't vulnerable to remote code execution.
Nonetheless it is still important to be careful with untrusted data.
This article will describe some common pitfalls,
and how the popular practice of logging f-strings could — in certain situations — leave you vulnerable to other types of attacks.

## The basics of logging

Where does formatting meet user input exactly?
Let's start with a basic logging setup.

```python
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
```

Logging a message:

```python
logger.info("hello world")
```

Which prints:

```log
INFO:__main__:hello world
```

Let's see the string formatting[^1] in action:

```python
context = {'user': 'bob', 'msg': 'hello everybody'}
logger.info("user '%(user)s' commented: '%(msg)s'.", context)
```

This outputs the following:

```log
INFO:__main__:user 'bob' commented: 'hello everybody'.
```

## Simple injection

If you don't sanitize your inputs,
you may be vulnerable to [log injection](https://owasp.org/www-community/attacks/Log_Injection).
Consider the following message:

```python
"hello'.\nINFO:__main__:user 'alice' commented: 'I like pineapple pizza"
```

If logged with the previous template, this results in:

```
INFO:__main__:user 'bob' commented: 'hello'.
INFO:__main__:user 'alice' commented: 'I like pineapple pizza'.
```

As you can see, an attacker can not only corrupt logs, but also incriminate others.

### Mitigation

We can mitigate this particular attack by [escaping newline characters](https://github.com/darrenpmeyer/logging-formatter-anticrlf).
But, beware that there are plenty of other [evil unicode control characters](https://www.python.org/dev/peps/pep-0672/)
which can mess up your logs.
The safest solution is to simply not log untrusted text.
If you need to store it for an audit trail, use a database.
Alternatively, [structured logging](https://www.structlog.org/en/stable/)
can prevent newline-based attacks.

## Double formatting trouble

There's another interesting vulnerability which is particular to Python.
Because the old `%`-style formatting used by `logging` is often considered ugly,
many people prefer to use f-strings:

```python
logger.info(f"user '{user}' commented: '{msg}'.")
```

Admittedly this _looks_ nicer, but it won't stop `logging`
from trying to format the resulting string itself.
So if the `msg` is...

```python
"%(foo)s"
```

...we are left with this after the f-string evaluates:

```python
logger.info("user 'bob' commented: '%(foo)s'.")
```

So what does `logging` do? Does it try to look up `foo` and crash?
Thankfully not. In the depths of the `logging` source code we find:

```python
if self.args:
    msg = msg % self.args
```

No arguments, no formatting. Makes sense.
But once there is an argument, things get interesting. Consider this:

```python
logger.info(f"user '%(user)s' commented: '{msg}'.", context)
```

Of course, nobody is likely to mix formatting styles at first.
But it is plausible that either:
- Someone would add the `msg` parameter to an existing log statement in this way;
- When refactoring to an f-string, someone forgot to remove the `context` argument;
- That log messages are passed through a user-defined function or logging filter
  which adds a `context` argument.

In this case we get an error like this:

```log
--- Logging error ---
[...snip...]
KeyError: 'foo'
Call stack:
  File "example.py", line 29, in <module>
    logger.info(f"user '%(user)s' commented: '{msg}'.", context)
Message: "user '%(user)s' commented: '%(foo)s'."
Arguments: {'user': 'bob'}
```

Annoying to have in the logs? Yes. Dangerous? Not..._yet_.
But by formatting an external string into our log message
(which in turn gets formatted again by `logging`)
we open the door to [string formatting attacks](https://owasp.org/www-community/attacks/Format_string_attack).
Thankfully, Python is a lot less vulnerable than C,
but there are still ways to abuse it.

### Padding a ton

One such case is abusing [padding syntax](https://pyformat.info/#string_pad_align).
Consider this message:

```python
"%(user)999999999s"
```

This will pad the `user` with almost a gigabyte of whitespace.
Not only will this slow your log statement down to a crawl,
it could also clog up your logging infrastructure.

Why is this a problem? Attackers being able to crash your server is bad enough.
If they cripple your logging, you wouldn't even know what hit you.

### Leaky logs

Another potential risk is leaking sensitive information.
In our example, if the `context` contains a `"secret"` key,
an attacker could leak them into the logs with the following message:

```python
"%(secret)s"
```

This is particularly dangerous when combined with the padding vulnerability,
as the attacker could use timing to sniff out which keys are present.

On the flip side, we can be thankful that Python's `%`-style formatting syntax is so limited.
If logging used the new braces-style, an attacker wouldn't even need
sensitive data to be present in `context`, by [using a message like](https://lucumr.pocoo.org/2016/12/29/careful-with-str-format/):

```python
"{0.__init__.__globals__['SECRET']}"
```

You might wonder what the big deal is if secrets land in the logs
— it's not in the open, right?
The problem is that logs are usually a lot easier for an attacker to access
than a credential store.
Because of this, CWE ranks _"Insertion of Sensitive Information into Log File"_ as number 39
on their list of [most dangerous software weaknesses](https://cwe.mitre.org/top25/archive/2021/2021_cwe_top25.html).

### Mitigation

To eliminate these risks, you should _always_ let `logging` handle string formatting.
Don't format log messages yourself with f-strings or otherwise [^2].
Thankfully, there is a [flake8 plugin](https://github.com/globality-corp/flake8-logging-format)
that can check this for you.
Also, once [PEP675](https://www.python.org/dev/peps/pep-0675) is implemented,
you could perhaps use a typechecker to check only literal strings are passed to the logger.

## Recommendations

1. *Don't log untrusted text*. Python's logging library doesn't protect you from
   newlines or other unicode characters which allow
   attackers to mess up — or even forge — logs.
2. *Don't format logs yourself (with f-strings or otherwise)*.
   In certain situations this could leave you vulnerable to
   denial-of-service attacks or even sensitive data exposure.

A full sample of the code used can be found
[here](https://gist.github.com/ariebovenberg/dfd849ddc7a0dc7428a22b5b8a468134),
so you can experiment for yourself.

You can discuss this post on [reddit](https://www.reddit.com/r/Python/comments/rqaysb/is_your_python_code_vulnerable_to_log_injection/).

### Update 2022-01-04

I've since created [an issue on the Python bug tracker](https://bugs.python.org/issue46200)
to document security risks in the logging docs,
and perhaps even to create a more secure `logger` API.

### Thanks

To [Daan Debie](https://daan.fyi) for reviewing this post!

[^1]: This may be less well-known, but `logging` supports named formatting
      when a dictionary is passed as an argument.
      This is different from the `extra=` parameter!
      You can see for yourself how this works
      with the `%` operator:
      `"hello %(name)" % {"name": "bob"}` and `"hello %s" % "bob"`.
      In this post I'll be focussing on vulnerabilities when using
      the dictionary approach.

[^2]: Using logging's built-in formatting is also
      [often better for performance, among other reasons](https://dev.to/izabelakowal/what-is-the-best-string-formatting-technique-for-logging-in-python-d1d).
