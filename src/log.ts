import { window } from 'vscode';

const outputChannel = window.createOutputChannel('Sparse Crates', 'log');

function info(msg: string) {
  outputChannel.appendLine(`${new Date().toISOString()} [info] ${msg}`);
}

function warn(msg: string) {
  outputChannel.appendLine(`${new Date().toISOString()} [warn] ${msg}`);
}

function error(msg: string) {
  outputChannel.appendLine(`${new Date().toISOString()} [error] ${msg}`);
}

export default {
  info,
  warn,
  error,
};
