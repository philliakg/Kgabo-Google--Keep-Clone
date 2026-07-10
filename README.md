# Google Keep Clone

A simplified clone of Google Keep built with plain **HTML, CSS, and JavaScript** — no frameworks, no build step, no dependencies.

## Features

- **Create notes** with an expanding composer (title + body + color), just like the real Keep
- **Display notes** in a responsive card grid, newest first
- **Archive / unarchive** notes, with a dedicated Archive view in the sidebar
- **Edit notes** in a modal dialog (click any card to open it)
- **Delete notes** with an **Undo** toast/snackbar
- **Pin notes** to keep them at the top in a separate "Pinned" section
- **Color notes** from an 8-color pastel palette (composer, card menu, or edit modal)
- **Search** across titles and bodies from the header search bar (press `/` to focus it)
- **Light / dark theme** toggle (respects your OS preference on first load)
- **Tooltips** on every icon button (pure CSS, no libraries)
- **Persistence** — all notes and the theme choice are saved to `localStorage`
- **Responsive** — collapsible sidebar rail on tablets, bottom navigation bar on phones

## How to run

No build or install step is needed — simply open `index.html` in a browser (double-click it, or drag it into a browser window).

**Deployment:** the project is fully static, so it can be dropped as-is onto GitHub Pages, Netlify, Vercel, or any static host.

## Project structure

```
Google Keep/
├── index.html        # Semantic page structure + <template> for note cards
├── css/
│   └── styles.css    # All styling: design tokens, layout, components, responsive rules
├── js/
│   └── app.js        # All logic: state, localStorage persistence, rendering, events
└── README.md
```

## How the code is organized

`js/app.js` is split into clearly labelled sections:

| Section | Responsibility |
|---|---|
| Constants & persistence | Color palette + `store` (localStorage load/save) |
| State | Single `state` object: notes array, current view, search query |
| Rendering | `render()` rebuilds the grids from state; `renderCard()` clones the HTML `<template>` |
| Composer | Expanding "Take a note…" input; saves on submit or outside click |
| Note actions | Pin, archive, delete (with undo), and color changes |
| Edit modal | Open/close, save-on-dismiss |
| Toast | Snackbar with optional Undo callback |
| Theme | Dark/light mode with `localStorage` + OS preference |
| Event wiring | All listeners in one `bindEvents()`; note cards use event delegation |

Every state mutation goes through `commit()` (persist, then re-render), which keeps the UI and `localStorage` in sync at all times.

## Usage tips

- Click **"Take a note…"** to expand the composer; clicking anywhere outside saves the draft automatically.
- Hover a card to reveal its actions: **pin** (top-right), **color**, **archive**, **delete** (bottom).
- Click a card body to open the **edit modal**; clicking outside the modal or pressing `Escape` saves your changes.
- Deleted a note by accident? Hit **Undo** in the toast within 4 seconds.
