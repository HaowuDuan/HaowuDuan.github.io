---
layout: book
permalink: /llm-book/
title: LLM Notes
nav: false
book_title: LLM Notes
book_collection: llm_notes
book_index: /llm-book/
description: Haowu's working knowledge on LLM
---

A growing collection of notes on large language models — architecture, training, alignment, and scaling.

{% assign chapters = site.llm_notes | sort: 'order' %}
{% for chapter in chapters %}
{{ forloop.index }}. [{{ chapter.title }}]({{ chapter.url | relative_url }})
{% endfor %}
