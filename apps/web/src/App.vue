<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createEditor } from 'xlxz-markdown-editor';
import type { EditorInstance } from 'xlxz-markdown-editor';
import demoDoc from './demo-doc.md?raw';

const editorContainer = ref<HTMLElement>();
const status = ref<{ text: string; state: 'loading' | 'ok' | 'err' }>({
  text: 'Loading Obsidian engine...',
  state: 'loading',
});

let editor: EditorInstance | null = null;

onMounted(() => {
  if (!editorContainer.value) return;

  try {
    editor = createEditor(editorContainer.value, {
      doc: demoDoc,
      filePath: 'demo.md',
      theme: 'dark',
      onChange(doc: string) {
        console.log(`[demo] doc changed, length=${doc.length}`);
      },
      onSave(doc: string) {
        console.log('[demo] save requested, length=', doc.length);
      },
    });

    status.value = { text: 'Live preview active', state: 'ok' };
  } catch (e: any) {
    console.error('Editor creation error:', e);
    status.value = { text: e.message, state: 'err' };
  }
});
</script>

<template>
  <div id="toolbar">
    <span>xlxz-markdown-editor</span>
    <span class="status" :class="status.state">{{ status.text }}</span>
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
#toolbar .status { margin-left: auto; }
#toolbar .status.ok { color: var(--text-success, #4caf50); }
#toolbar .status.err { color: var(--text-error, #f44336); }

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
</style>
