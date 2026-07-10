/**
 * Google Keep Clone — application logic
 *
 * Architecture:
 *   - `store`  : persistence layer (localStorage)
 *   - `state`  : in-memory app state (notes array + current view/search)
 *   - `render` : rebuild grids, headings, and empty state from `state`
 *   - Event handlers mutate `state`, then call `commit()` to persist and re-render.
 *
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string} color - hex background, or "" for the default surface color
 * @property {boolean} pinned
 * @property {boolean} archived
 * @property {number} updatedAt - last-modified timestamp (epoch ms)
 */
"use strict";

/* 
   Constants & persistence
    */

const STORAGE_KEY = "keep-clone-notes";
const THEME_KEY = "keep-clone-theme";

/** Palette of note background colors ("" = default surface color). */
const COLORS = [
  { name: "Default", value: "" },
  { name: "Coral", value: "#faafa8" },
  { name: "Peach", value: "#f39f76" },
  { name: "Sand", value: "#fff8b8" },
  { name: "Mint", value: "#e2f6d3" },
  { name: "Sage", value: "#b4ddd3" },
  { name: "Fog", value: "#d4e4ed" },
  { name: "Blossom", value: "#f6e2dd" },
];

const store = {
  /** @returns {Note[]} saved notes, or [] if none / corrupted */
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },
  /** @param {Note[]} notes */
  save(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  },
};

/* 
   State
    */

const state = {
  notes: store.load(),
  view: "notes",       // "notes" | "archive"
  search: "",          // title/body filter scoped to the active view
  editingId: null,     // id of the note open in the edit modal
  lastDeleted: null,   // { note, index } snapshot used by the Undo toast
};

/* 
   DOM references
    */

const $ = (id) => document.getElementById(id);

const el = {
  sidebar: $("sidebar"),
  sidebarToggle: $("sidebar-toggle"),
  themeToggle: $("theme-toggle"),
  searchInput: $("search-input"),
  searchClear: $("search-clear"),
  navItems: document.querySelectorAll(".nav-item"),

  composer: $("composer"),
  composerTitle: $("composer-title"),
  composerBody: $("composer-body"),
  composerActions: $("composer-actions"),
  composerColors: $("composer-colors"),
  composerClose: $("composer-close"),
  composerWrapper: $("composer-wrapper"),

  viewTitle: $("view-title"),
  pinnedSection: $("pinned-section"),
  pinnedGrid: $("pinned-grid"),
  othersLabel: $("others-label"),
  notesGrid: $("notes-grid"),
  emptyState: $("empty-state"),
  emptyIcon: $("empty-icon"),
  emptyText: $("empty-text"),

  editModal: $("edit-modal"),
  editTitle: $("edit-title"),
  editBody: $("edit-body"),
  editColors: $("edit-colors"),
  editSave: $("edit-save"),
  editTimestamp: $("edit-timestamp"),

  toast: $("toast"),
  toastMessage: $("toast-message"),
  toastAction: $("toast-action"),

  noteTemplate: $("note-template"),
};

/** Color currently selected in the composer. */
let composerColor = "";

/* 
   Note helpers
    */

/** @returns {Note} */
function createNote(title, body, color) {
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    title: title.trim(),
    body: body.trim(),
    color: color || "",
    pinned: false,
    archived: false,
    updatedAt: Date.now(),
  };
}

/** @param {string} id @returns {Note|undefined} */
function findNote(id) {
  return state.notes.find((n) => n.id === id);
}

/** Persist state and re-render — call after every mutation. */
function commit() {
  store.save(state.notes);
  render();
}

/* 
   Rendering
    */

/** Notes for the active view (notes or archive), filtered by search, newest first. */
function visibleNotes() {
  const q = state.search.toLowerCase();
  return state.notes
    .filter((n) => n.archived === (state.view === "archive"))
    .filter(
      (n) =>
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function render() {
  const notes = visibleNotes();
  const pinned = notes.filter((n) => n.pinned && !n.archived); // defensive: archived notes are unpinned on archive
  const others = notes.filter((n) => !pinned.includes(n));

  // View heading and section labels
  el.viewTitle.textContent = state.search
    ? `Results for “${state.search}”`
    : state.view === "archive"
    ? "Archive"
    : "Notes";

  // Pinned section is hidden when empty (archive view never has pinned notes)
  el.pinnedSection.classList.toggle("hidden", pinned.length === 0);
  el.othersLabel.classList.toggle(
    "hidden",
    pinned.length === 0 || others.length === 0
  );

  el.pinnedGrid.replaceChildren(...pinned.map(renderCard));
  el.notesGrid.replaceChildren(...others.map(renderCard));

  // Empty state
  const isEmpty = notes.length === 0;
  el.emptyState.classList.toggle("hidden", !isEmpty);
  if (isEmpty) {
    if (state.search) {
      el.emptyIcon.textContent = "🔍";
      el.emptyText.textContent = "No matching notes";
    } else if (state.view === "archive") {
      el.emptyIcon.textContent = "🗄️";
      el.emptyText.textContent = "Your archived notes appear here";
    } else {
      el.emptyIcon.textContent = "💡";
      el.emptyText.textContent = "Notes you add appear here";
    }
  }

  // Hide the composer in the archive view
  el.composerWrapper.classList.toggle("hidden", state.view === "archive");
}

/** @param {Note} note @returns {HTMLElement} cloned card from the <template> */
function renderCard(note) {
  const card = el.noteTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.id = note.id;
  card.classList.toggle("pinned", note.pinned);

  if (note.color) {
    card.style.background = note.color;
    card.dataset.colored = "true";
  }

  const title = card.querySelector(".note-title");
  const body = card.querySelector(".note-body");
  title.textContent = note.title;
  body.textContent = note.body;
  title.classList.toggle("hidden", !note.title);
  body.classList.toggle("hidden", !note.body);

  // Archived cards: relabel archive as "Unarchive" and remove the pin control
  const archiveBtn = card.querySelector('[data-action="archive"]');
  if (note.archived) {
    archiveBtn.dataset.tooltip = "Unarchive";
    archiveBtn.setAttribute("aria-label", "Unarchive note");
    card.querySelector(".note-pin").remove();
  } else {
    const pinBtn = card.querySelector(".note-pin");
    pinBtn.dataset.tooltip = note.pinned ? "Unpin note" : "Pin note";
  }

  return card;
}

/**
 * Renders color swatches into `container` and wires click-to-select.
 * @param {HTMLElement} container
 * @param {string} selected - currently selected color value
 * @param {(value: string) => void} onPick
 */
function renderColorPicker(container, selected, onPick) {
  container.replaceChildren(
    ...COLORS.map(({ name, value }) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-swatch";
      swatch.dataset.tooltip = name;
      swatch.setAttribute("aria-label", name);
      swatch.style.background = value || "var(--surface)";
      swatch.classList.toggle("selected", value === selected);
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        onPick(value);
      });
      return swatch;
    })
  );
}

/* 
   Composer (create notes)
    */

/** Reveal title, color picker, and action buttons when the composer is focused. */
function expandComposer() {
  el.composerTitle.classList.remove("hidden");
  el.composerActions.classList.remove("hidden");
  const pick = (value) => {
    composerColor = value;
    el.composer.style.background = value || "";
    renderColorPicker(el.composerColors, value, pick);
  };
  renderColorPicker(el.composerColors, composerColor, pick);
}

/** Reset and hide the expanded composer without creating a note. */
function collapseComposer() {
  el.composerTitle.classList.add("hidden");
  el.composerActions.classList.add("hidden");
  el.composerTitle.value = "";
  el.composerBody.value = "";
  el.composerBody.style.height = "";
  el.composer.style.background = "";
  composerColor = "";
}

function submitComposer() {
  const title = el.composerTitle.value;
  const body = el.composerBody.value;
  if (!title.trim() && !body.trim()) {
    collapseComposer();
    return;
  }
  state.notes.push(createNote(title, body, composerColor));
  collapseComposer();
  commit();
  showToast("Note added");
}

/* 
   Note actions (pin / color / archive / delete / edit)
    */

function togglePin(id) {
  const note = findNote(id);
  note.pinned = !note.pinned;
  note.updatedAt = Date.now();
  commit();
}

function toggleArchive(id) {
  const note = findNote(id);
  note.archived = !note.archived;
  note.pinned = false; // archived notes are never pinned
  note.updatedAt = Date.now();
  commit();
  showToast(note.archived ? "Note archived" : "Note unarchived", () => {
    note.archived = !note.archived; // undo does not restore the previous pin state
    commit();
  });
}

function deleteNote(id) {
  const index = state.notes.findIndex((n) => n.id === id);
  state.lastDeleted = { note: state.notes[index], index };
  state.notes.splice(index, 1);
  commit();
  showToast("Note deleted", () => {
    state.notes.splice(state.lastDeleted.index, 0, state.lastDeleted.note);
    state.lastDeleted = null;
    commit();
  });
}

function setNoteColor(id, value) {
  const note = findNote(id);
  note.color = value;
  note.updatedAt = Date.now();
  commit();
}

/** Toggle the per-card color picker; close any other open menus first. */
function openColorMenu(card, note) {
  const menu = card.querySelector(".note-color-menu");
  const isOpen = !menu.classList.contains("hidden");
  closeAllColorMenus();
  if (isOpen) return; // color button was clicked while menu was open → close only
  renderColorPicker(menu, note.color, (value) => setNoteColor(note.id, value));
  menu.classList.remove("hidden");
}

function closeAllColorMenus() {
  document
    .querySelectorAll(".note-color-menu:not(.hidden)")
    .forEach((m) => m.classList.add("hidden"));
}

/* 
   Edit modal
    */

/** Open the edit modal for a note; color changes commit immediately. */
function openEditModal(id) {
  const note = findNote(id);
  state.editingId = id;

  el.editTitle.value = note.title;
  el.editBody.value = note.body;
  el.editTimestamp.textContent = `Edited ${formatDate(note.updatedAt)}`;
  applyModalColor(note.color);
  const pick = (value) => {
    setNoteColor(id, value);
    applyModalColor(value);
    renderColorPicker(el.editColors, value, pick);
  };
  renderColorPicker(el.editColors, note.color, pick);

  el.editModal.classList.remove("hidden");
  el.editBody.focus();
}

function applyModalColor(value) {
  const modal = el.editModal.querySelector(".modal");
  modal.style.background = value || "";
  modal.dataset.colored = value ? "true" : "false";
}

/**
 * Close the edit modal.
 * @param {boolean} save - when true, persist title/body edits before closing
 */
function closeEditModal(save) {
  if (save && state.editingId) {
    const note = findNote(state.editingId);
    if (note) {
      const title = el.editTitle.value.trim();
      const body = el.editBody.value.trim();
      if (title !== note.title || body !== note.body) {
        note.title = title;
        note.body = body;
        note.updatedAt = Date.now();
      }
      commit();
    }
  }
  state.editingId = null;
  el.editModal.classList.add("hidden");
}

function formatDate(ts) {
  // Locale-aware "Edited …" label shown in the edit modal footer
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* 
   Toast (snackbar with optional Undo)
    */

let toastTimer = null;
let toastUndo = null;

/**
 * Show a snackbar for 4 seconds.
 * @param {string} message
 * @param {(() => void)|null} [onUndo] - optional Undo callback
 */
function showToast(message, onUndo) {
  clearTimeout(toastTimer);
  toastUndo = onUndo || null;
  el.toastMessage.textContent = message;
  el.toastAction.classList.toggle("hidden", !onUndo);
  el.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 4000);
}

/* 
   Theme
    */

/** Apply and persist a theme ("light" or "dark"). */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

/** Restore saved theme, or fall back to the OS color-scheme preference. */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

/* 
   Event wiring
    */

/** Attach all UI event listeners (called once at startup). */
function bindEvents() {
  //  Header 
  el.sidebarToggle.addEventListener("click", () =>
    el.sidebar.classList.toggle("collapsed")
  );

  el.themeToggle.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  el.searchInput.addEventListener("input", () => {
    state.search = el.searchInput.value.trim();
    el.searchClear.classList.toggle("hidden", !state.search);
    render();
  });

  el.searchClear.addEventListener("click", () => {
    el.searchInput.value = "";
    state.search = "";
    el.searchClear.classList.add("hidden");
    render();
  });

  //  Sidebar navigation 
  el.navItems.forEach((item) =>
    item.addEventListener("click", () => {
      el.navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      state.view = item.dataset.view;
      render();
    })
  );

  //  Composer 
  el.composerBody.addEventListener("focus", expandComposer);

  // Auto-grow the textarea as the user types
  el.composerBody.addEventListener("input", () => {
    el.composerBody.style.height = "auto";
    el.composerBody.style.height = `${el.composerBody.scrollHeight}px`;
  });

  el.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    submitComposer();
  });

  el.composerClose.addEventListener("click", collapseComposer);

  // Clicking outside the expanded composer submits it (creates a note, or collapses if empty)
  document.addEventListener("click", (e) => {
    const expanded = !el.composerActions.classList.contains("hidden");
    if (expanded && !el.composer.contains(e.target)) {
      submitComposer();
    }
    // Close open per-note color menus when clicking elsewhere
    if (!e.target.closest(".note-color-menu") && !e.target.closest('[data-action="color"]')) {
      closeAllColorMenus();
    }
  });

  //  Note cards (event delegation on both grids) 
  [el.pinnedGrid, el.notesGrid].forEach((grid) =>
    grid.addEventListener("click", (e) => {
      const card = e.target.closest(".note-card");
      if (!card) return;
      const id = card.dataset.id;
      const actionBtn = e.target.closest("[data-action]");

      if (!actionBtn) {
        openEditModal(id); // card body click opens the edit modal
        return;
      }

      switch (actionBtn.dataset.action) {
        case "pin":
          togglePin(id);
          break;
        case "archive":
          toggleArchive(id);
          break;
        case "delete":
          deleteNote(id);
          break;
        case "color":
          openColorMenu(card, findNote(id));
          break;
      }
    })
  );

  // Keyboard access: Enter opens a focused card
  [el.pinnedGrid, el.notesGrid].forEach((grid) =>
    grid.addEventListener("keydown", (e) => {
      const card = e.target.closest(".note-card");
      if (card && e.key === "Enter" && e.target === card) {
        openEditModal(card.dataset.id);
      }
    })
  );

  //  Edit modal (overlay click, Save, and Escape all save title/body) 
  el.editSave.addEventListener("click", () => closeEditModal(true));
  el.editModal.addEventListener("click", (e) => {
    if (e.target === el.editModal) closeEditModal(true);
  });

  //  Toast 
  el.toastAction.addEventListener("click", () => {
    if (toastUndo) toastUndo();
    toastUndo = null;
    el.toast.classList.add("hidden");
  });

  //  Global keyboard shortcuts 
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.editModal.classList.contains("hidden")) closeEditModal(true);
      closeAllColorMenus();
    }
    // "/" focuses search (unless already typing in a field)
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      el.searchInput.focus();
    }
  });
}

/* 
   Init
    */

initTheme();
bindEvents();
render();
