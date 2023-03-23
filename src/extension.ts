import {
  window,
  workspace,
  type ExtensionContext,
  type TextEditor,
} from 'vscode';

import { decorate } from './decorate.js';
import log from './log.js';

const decoratedEditors: TextEditor[] = [];

export function activate(context: ExtensionContext) {
  log.info('Sparse Crates activated');
  context.subscriptions.push(
    // Decorate files when they are first opened.
    window.onDidChangeVisibleTextEditors((editors) => {
      decoratedEditors.splice(
        0,
        decoratedEditors.length,
        ...editors.filter((editor) => {
          if (editor.document.fileName.endsWith('Cargo.toml')) {
            if (!decoratedEditors.includes(editor)) {
              decorate(editor);
            }
            return true;
          } else {
            return false;
          }
        }),
      );
    }),
    // Decorate files when their changes are saved.
    workspace.onDidSaveTextDocument(async (document) => {
      if (document.fileName.endsWith('Cargo.toml')) {
        const editor = window.visibleTextEditors.find(
          (e) => e.document === document,
        );
        if (editor !== undefined) {
          decorate(editor);
        }
      }
    }),
  );
}

export function deactivate() {}
