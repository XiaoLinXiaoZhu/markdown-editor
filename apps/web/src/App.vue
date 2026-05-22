<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createEditor } from '@xlxz/markdown-editor';
import type { EditorInstance, EditorBackend } from '@xlxz/markdown-editor';
import demoDoc from './demo-doc.md?raw';

const editorContainer = ref<HTMLElement>();
const status = ref<{ text: string; state: 'loading' | 'ok' | 'err' }>({
  text: 'Loading Obsidian engine...',
  state: 'loading',
});
const callbackLog = ref('');
const currentTheme = ref<'dark' | 'light'>('dark');

let editor: EditorInstance | null = null;
let suggestCleanup: (() => void) | null = null;
let callbackTimer: ReturnType<typeof setTimeout> | null = null;

function checkRuntime(): boolean {
  const w = window as any;
  const missing: string[] = [];
  if (!w.__cm6) missing.push('__cm6');
  if (!w.__stateFields) missing.push('__stateFields');
  if (!w.__closeBrackets) missing.push('__closeBrackets');
  if (!w.__compartments) missing.push('__compartments');
  if (missing.length > 0) {
    console.warn('[boot] Obsidian runtime not ready, missing:', missing.join(', '));
    return false;
  }
  console.log('[boot] Obsidian runtime ready:', Object.keys(w.__cm6).join(', '));
  return true;
}

function setCallbackLog(msg: string) {
  if (callbackTimer) clearTimeout(callbackTimer);
  callbackLog.value = msg;
  callbackTimer = setTimeout(() => {
    callbackLog.value = '';
    callbackTimer = null;
  }, 3000);
}

function switchTheme(theme: 'dark' | 'light') {
  if (!editor) return;
  editor.setTheme(theme);
  currentTheme.value = theme;
}

function tryMount(attempt: number = 0) {
  if (!editorContainer.value) {
    status.value = { text: 'Container not found', state: 'err' };
    return;
  }

  if (!checkRuntime()) {
    if (attempt < 50) {
      status.value = { text: `Waiting for Obsidian runtime... (${attempt + 1}/50)`, state: 'loading' };
      setTimeout(() => tryMount(attempt + 1), 100);
    } else {
      status.value = { text: 'Obsidian runtime failed to load after 5s', state: 'err' };
    }
    return;
  }

  try {
    const mockBackend: EditorBackend = {
      async saveAttachment(name: string, data: ArrayBuffer) {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        console.log('[mock] attachment saved:', name, url);
        return url;
      },
    };

    editor = createEditor(editorContainer.value, {
      doc: demoDoc,
      filePath: 'demo.md',
      theme: 'dark',
      onChange(doc: string) {
        console.log(`[demo] doc changed, length=${doc.length}`);
        setCallbackLog('onChange: ' + doc.length + ' chars');
      },
      onSave(doc: string) {
        console.log('[demo] save requested, length=', doc.length);
        setCallbackLog('onSave: ' + doc.length + ' chars');
      },
      onLinkClick(linktext: string) {
        console.log('[demo] link clicked:', linktext);
        setCallbackLog('onLinkClick: ' + linktext);
      },
    }, mockBackend);

    status.value = { text: 'Live preview active', state: 'ok' };

    // Expose for E2E testing
    (window as any).__editorInstance = editor;
    (window as any).__editorView = editor.view;

    // Register mock [[ suggest
    suggestCleanup = editor.registerSuggest({
      trigger: /\[\[([^\]]*)$/,
      getSuggestions(query: string) {
        const notes = [
          { label: 'Getting Started', insertText: 'Getting Started' },
          { label: 'Project Roadmap', insertText: 'Project Roadmap' },
          { label: 'API Reference', insertText: 'API Reference' },
          { label: 'Changelog', insertText: 'Changelog' },
          { label: 'FAQ', insertText: 'FAQ' },
        ];
        if (!query) return notes;
        const q = query.toLowerCase();
        return notes.filter(n => n.label.toLowerCase().includes(q));
      },
      suffix: ']]',
    });
  } catch (e: any) {
    console.error('Editor creation error:', e);
    status.value = { text: e.message, state: 'err' };
  }
}

onMounted(() => {
  tryMount();
});
</script>

<template>
  <div id="toolbar">
    <span class="title">@xlxz/markdown-editor</span>

    <div class="btn-group">
      <button
        :class="{ active: currentTheme === 'light' }"
        @click="switchTheme('light')"
        title="亮色主题"
      >Light</button>
      <button
        :class="{ active: currentTheme === 'dark' }"
        @click="switchTheme('dark')"
        title="暗色主题"
      >Dark</button>
    </div>

    <span class="status" :class="status.state">{{ status.text }}</span>
    <span class="callback-log">{{ callbackLog }}</span>
  </div>
  <div class="view-content">
    <div
      ref="editorContainer"
      class="markdown-source-view mod-cm6 is-live-preview is-readable-line-width"
    />
  </div>
</template>

<style>
:root {
  --font-interface: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-text: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-monospace: "Maple Mono NF CN", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
#app {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
body {
  display: flex;
  flex-direction: column;
}

#toolbar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--background-modifier-border, #454545);
  font-size: 13px;
  color: var(--text-muted, #999);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--background-secondary, #1e1e1e);
}
#toolbar .title {
  font-weight: 600;
  color: var(--text-normal, #ddd);
}
#toolbar .status { margin-left: auto; }
#toolbar .status.ok { color: var(--text-success, #4caf50); }
#toolbar .status.err { color: var(--text-error, #f44336); }
#toolbar .callback-log {
  font-size: 12px;
  color: var(--text-accent, #7f6df2);
  margin-left: 8px;
}

.btn-group {
  display: flex;
  gap: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--background-modifier-border, #454545);
}
.btn-group button {
  padding: 3px 10px;
  border: none;
  background: var(--background-primary, #1e1e1e);
  color: var(--text-muted, #999);
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-interface);
  transition: all 0.15s;
}
.btn-group button:not(:last-child) {
  border-right: 1px solid var(--background-modifier-border, #454545);
}
.btn-group button:hover {
  background: var(--background-modifier-hover, #2a2a2a);
  color: var(--text-normal, #ddd);
}
.btn-group button.active {
  background: var(--interactive-accent, #7f6df2);
  color: #fff;
}

.view-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}
.view-content > .markdown-source-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.theme-dark .markdown-source-view.mod-cm6 .cm-line.HyperMD-codeblock {
  background-color: #1a1a2e;
}
</style>
