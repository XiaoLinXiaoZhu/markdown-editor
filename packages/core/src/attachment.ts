/**
 * 附件处理：粘贴图片 / 拖拽文件 / HTML 粘贴转 Markdown
 *
 * 通过 CM6 domEventHandlers 注册 drop/dragover/dragleave/paste 事件。
 */
import type { EditorBackend } from './types.js';

export function setupAttachmentHandler(
  view: any,
  editorEl: HTMLElement,
  backend: Required<EditorBackend>,
) {
  const cm6 = (window as any).__cm6;
  const { EditorView, StateEffect } = cm6;

  view.dispatch({
    effects: StateEffect.appendConfig.of(
      EditorView.domEventHandlers({
        dragover(e: DragEvent) {
          e.preventDefault();
          editorEl.classList.add('is-drop-target');
        },
        dragleave(_e: DragEvent) {
          editorEl.classList.remove('is-drop-target');
        },
        async drop(e: DragEvent) {
          editorEl.classList.remove('is-drop-target');
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          e.preventDefault();
          for (const file of Array.from(files)) {
            const buf = await file.arrayBuffer();
            const savedPath = await backend.saveAttachment(file.name, buf);
            if (savedPath) {
              const insert = file.type.startsWith('image/')
                ? '![' + savedPath + '](' + savedPath + ')'
                : '[[' + savedPath + ']]';
              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length },
                userEvent: 'input.drop',
              });
            }
          }
        },
        paste(e: ClipboardEvent) {
          const items = e.clipboardData?.items;
          if (items) {
            for (const item of Array.from(items)) {
              if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (!blob) return;
                blob.arrayBuffer().then(async (buf) => {
                  const name = 'paste-' + Date.now() + '.' + (blob.type.split('/')[1] || 'png');
                  const savedPath = await backend.saveAttachment(name, buf);
                  if (savedPath) {
                    const insert = '![' + savedPath + '](' + savedPath + ')';
                    const { from, to } = view.state.selection.main;
                    view.dispatch({
                      changes: { from, to, insert },
                      selection: { anchor: from + insert.length },
                      userEvent: 'input.paste',
                    });
                  }
                });
                return;
              }
            }
          }

          // HTML paste → Markdown
          const html = e.clipboardData?.getData('text/html');
          if (!html) return;
          if (!(window as any).TurndownService) return;
          try {
            const td = new (window as any).TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            const md = td.turndown(html);
            if (!md || !md.trim()) return;
            e.preventDefault();
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: md },
              selection: { anchor: from + md.length },
              userEvent: 'input.paste',
            });
          } catch (err) {
            console.warn('Paste conversion failed:', err);
          }
        },
      })
    ),
  });
}
