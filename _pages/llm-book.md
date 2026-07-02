---
layout: book
permalink: /llm-book/
title: LLM Notes
nav: true
nav_order: 6
description: Haowu's working knowledge on LLM
---

A growing collection of notes on large language models — architecture, training, alignment, and scaling.

{% assign chapters = site.llm_notes | sort: 'order' %}
{% for chapter in chapters %}
{{ forloop.index }}. [{{ chapter.title }}]({{ chapter.url | relative_url }})
{% endfor %}
