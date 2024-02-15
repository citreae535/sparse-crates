import {
  window,
  commands,
  workspace,
  type ExtensionContext,
  type TextEditor,
} from 'vscode';

import { decorate } from './decorate.js';
import { loadRegistries } from './config.js';
import log from './log.js';

const decoratedEditors: TextEditor[] = [];

export async function activate(context: ExtensionContext) {
  log.info('Sparse Crates activated');

  let disposable = commands.registerCommand(
    'sparse-crates.updateRepositories',
    updateRepositories,
  );

  context.subscriptions.push(disposable);

  await loadRegistries();

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

async function updateRepositories() {
  await loadRegistries();
  window.showInformationMessage('Cargo repository list updated');
}
