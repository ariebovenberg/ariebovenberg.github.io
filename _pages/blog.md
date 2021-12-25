---
permalink: /blog
description: "All of the posts"
layout: default
title: Blog
---

# Archive

<ul>
  {% for post in site.posts %}
    <li>
      <a href="{{ post.url }}">{{ post.title }}</a>
    </li>
  {% endfor %}
</ul>

