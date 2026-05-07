// Gala marketing rich-text editor.
//
// Mounts a TipTap editor onto a target div with a simple toolbar.
// Used by the marketing tab in public/admin/index.html. The admin page is
// a hand-rolled HTML file (not part of the sponsor portal SPA) so this
// module is built separately by vite.admin.config.js into
//   public/admin/assets/editor-[hash].js
// and exposed on window.GalaEditor.
//
// Public surface:
//
//   window.GalaEditor.mount(targetDiv, initialHtml, onChange) -> instance
//   instance.getHtml()  -> current HTML string
//   instance.setHtml(s) -> replace document
//   instance.destroy()  -> teardown DOM + listeners
//
// onChange is called on every edit with the latest HTML, debounced 300ms.

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

// ── Toolbar definitions ─────────────────────────────────────────────────────

const TOOLBAR_BUTTONS = [
  { label: 'B',     title: 'Bold (⌘B)',         cmd: 'toggleBold',          isActive: 'bold',          style: 'font-weight:700;' },
  { label: 'I',     title: 'Italic (⌘I)',       cmd: 'toggleItalic',        isActive: 'italic',        style: 'font-style:italic;' },
  { label: 'U',     title: 'Underline (⌘U)',    cmd: 'toggleUnderline',     isActive: 'underline',     style: 'text-decoration:underline;' },
  { label: '|', divider: true },
  { label: 'H2',    title: 'Heading',           cmd: 'toggleHeading',       cmdArgs: { level: 2 }, isActive: 'heading', isActiveArgs: { level: 2 } },
  { label: 'H3',    title: 'Subheading',        cmd: 'toggleHeading',       cmdArgs: { level: 3 }, isActive: 'heading', isActiveArgs: { level: 3 } },
  { label: '¶',     title: 'Paragraph',         cmd: 'setParagraph' },
  { label: '|', divider: true },
  { label: '• List', title: 'Bulleted list',    cmd: 'toggleBulletList',    isActive: 'bulletList' },
  { label: '1. List',title: 'Numbered list',    cmd: 'toggleOrderedList',   isActive: 'orderedList' },
  { label: '"',     title: 'Quote',             cmd: 'toggleBlockquote',    isActive: 'blockquote' },
  { label: '|', divider: true },
  { label: '🔗',    title: 'Link',              cmd: '_link' },             // custom — opens prompt
  { label: '✕',     title: 'Clear formatting',  cmd: '_clearFormatting' },
  { label: '|', divider: true },
  { label: '↶',     title: 'Undo',              cmd: 'undo' },
  { label: '↷',     title: 'Redo',              cmd: 'redo' },
  { label: '|', divider: true },
  { label: '<>',    title: 'View HTML source',  cmd: '_toggleSource' },
];

// ── Style strings (no external CSS file — kept self-contained) ──────────────

const TOOLBAR_STYLE = `
  display:flex; flex-wrap:wrap; gap:2px; padding:6px 8px;
  background:#f8fafc; border:1px solid var(--border, #e2e8f0);
  border-radius:8px 8px 0 0; align-items:center;
`.replace(/\s+/g, ' ').trim();

const BUTTON_STYLE = `
  background:#fff; border:1px solid #e2e8f0; padding:4px 9px;
  font-size:12px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
  border-radius:5px; cursor:pointer; min-width:24px;
  color:#0b1b3c; line-height:1.4;
`.replace(/\s+/g, ' ').trim();

const BUTTON_ACTIVE = 'background:#0b1b3c; color:#fff; border-color:#0b1b3c;';
const DIVIDER_STYLE = 'width:1px; height:18px; background:#cbd5e1; margin:0 4px;';

const EDITOR_AREA_STYLE = `
  border:1px solid var(--border, #e2e8f0); border-top:none;
  border-radius:0 0 8px 8px; padding:14px 16px; min-height:300px;
  background:#fff; color:#1e293b;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
  font-size:15px; line-height:1.6;
  max-height:600px; overflow-y:auto;
`.replace(/\s+/g, ' ').trim();

// Inline content styles — applied via a <style> block scoped to the editor
const CONTENT_CSS = `
  .gala-editor-content :focus { outline:none; }
  .gala-editor-content p { margin:0 0 12px; }
  .gala-editor-content h2 { font-size:18px; font-weight:700; color:#0b1b3c; margin:18px 0 10px; }
  .gala-editor-content h3 { font-size:16px; font-weight:700; color:#0b1b3c; margin:14px 0 8px; }
  .gala-editor-content ul, .gala-editor-content ol { margin:0 0 12px; padding-left:24px; }
  .gala-editor-content li { margin:0 0 4px; }
  .gala-editor-content blockquote { border-left:3px solid #cbd5e1; padding-left:14px; margin:12px 0; color:#475569; }
  .gala-editor-content a { color:#c8102e; text-decoration:underline; }
  .gala-editor-content strong { font-weight:700; color:#0b1b3c; }
  .gala-editor-content em { font-style:italic; }
  .gala-editor-content p.is-editor-empty:first-child::before {
    color:#94a3b8; content:attr(data-placeholder); float:left; height:0; pointer-events:none;
  }
  .gala-editor-source {
    width:100%; min-height:300px; max-height:600px;
    border:1px solid var(--border, #e2e8f0); border-top:none;
    border-radius:0 0 8px 8px; padding:12px 14px;
    font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;
    font-size:13px; line-height:1.5; color:#1e293b;
    background:#f8fafc; resize:vertical;
  }
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  const s = document.createElement('style');
  s.id = 'gala-editor-styles';
  s.textContent = CONTENT_CSS;
  document.head.appendChild(s);
  stylesInjected = true;
}

// ── Public mount() function ─────────────────────────────────────────────────

function mount(targetDiv, initialHtml, onChange) {
  ensureStyles();
  if (!targetDiv) throw new Error('GalaEditor.mount: targetDiv required');

  // Build chrome
  targetDiv.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; flex-direction:column;';

  const toolbar = document.createElement('div');
  toolbar.setAttribute('style', TOOLBAR_STYLE);

  const editorHost = document.createElement('div');
  editorHost.className = 'gala-editor-content';
  editorHost.setAttribute('style', EDITOR_AREA_STYLE);

  const sourceTextarea = document.createElement('textarea');
  sourceTextarea.className = 'gala-editor-source';
  sourceTextarea.style.display = 'none';

  wrap.appendChild(toolbar);
  wrap.appendChild(editorHost);
  wrap.appendChild(sourceTextarea);
  targetDiv.appendChild(wrap);

  // Build editor
  const editor = new Editor({
    element: editorHost,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: 'Type your message…',
      }),
    ],
    content: initialHtml || '',
    autofocus: false,
    onUpdate: () => {
      if (typeof onChange === 'function') {
        debounced(onChange, editor.getHTML());
      }
    },
  });

  let sourceMode = false;

  // Build toolbar buttons
  const buttonNodes = [];
  TOOLBAR_BUTTONS.forEach((b) => {
    if (b.divider) {
      const d = document.createElement('span');
      d.setAttribute('style', DIVIDER_STYLE);
      toolbar.appendChild(d);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = b.title;
    btn.textContent = b.label;
    btn.setAttribute('style', BUTTON_STYLE + (b.style || ''));
    btn.dataset.cmd = b.cmd;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (sourceMode && b.cmd !== '_toggleSource') return;
      runCommand(editor, b, () => {
        sourceMode = !sourceMode;
        toggleSourceMode(sourceMode, editor, editorHost, sourceTextarea, buttonNodes);
      });
    });
    toolbar.appendChild(btn);
    buttonNodes.push({ btn, def: b });
  });

  // Reflect active marks/nodes in the toolbar
  const updateActive = () => {
    if (sourceMode) return;
    buttonNodes.forEach(({ btn, def }) => {
      if (!def.isActive) return;
      const args = def.isActiveArgs || {};
      const active = editor.isActive(def.isActive, args);
      const baseStyle = BUTTON_STYLE + (def.style || '');
      btn.setAttribute('style', active ? baseStyle + BUTTON_ACTIVE : baseStyle);
    });
  };
  editor.on('selectionUpdate', updateActive);
  editor.on('transaction', updateActive);
  updateActive();

  return {
    getHtml: () => sourceMode ? sourceTextarea.value : editor.getHTML(),
    setHtml: (html) => {
      editor.commands.setContent(html || '', false);
      sourceTextarea.value = html || '';
    },
    destroy: () => {
      editor.destroy();
      targetDiv.innerHTML = '';
    },
    getEditor: () => editor,
  };
}

function runCommand(editor, b, toggleSource) {
  if (b.cmd === '_link') {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL (leave empty to remove):', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    return;
  }
  if (b.cmd === '_clearFormatting') {
    editor.chain().focus().clearNodes().unsetAllMarks().run();
    return;
  }
  if (b.cmd === '_toggleSource') {
    toggleSource();
    return;
  }
  // Standard chain command
  const chain = editor.chain().focus();
  if (b.cmdArgs) {
    chain[b.cmd](b.cmdArgs).run();
  } else {
    chain[b.cmd]().run();
  }
}

function toggleSourceMode(toSource, editor, editorHost, textarea, buttonNodes) {
  if (toSource) {
    textarea.value = editor.getHTML();
    editorHost.style.display = 'none';
    textarea.style.display = '';
    // Disable everything except the source toggle
    buttonNodes.forEach(({ btn, def }) => {
      btn.disabled = def.cmd !== '_toggleSource';
      btn.style.opacity = def.cmd === '_toggleSource' ? '1' : '0.4';
    });
  } else {
    editor.commands.setContent(textarea.value, false);
    editorHost.style.display = '';
    textarea.style.display = 'none';
    buttonNodes.forEach(({ btn }) => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}

// 300ms trailing debounce
let debounceTimer = null;
function debounced(fn, value) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fn(value), 300);
}

// ── Expose on window for the admin page's plain-HTML script ────────────────

window.GalaEditor = { mount };
