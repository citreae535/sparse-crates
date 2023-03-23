import path from 'path';

import semver from 'semver';
import { parseTOML, ParseError } from 'toml-eslint-parser';
import type { TOMLProgram, TOMLTable } from 'toml-eslint-parser/lib/ast/ast.js';
import {
  type DecorationOptions,
  MarkdownString,
  type TextEditor,
  window,
} from 'vscode';

import { getRegistry, getUseCargoCache } from './config.js';
import { fetchVersions } from './fetch.js';
import log from './log.js';
import { parseCargoDependencies } from './parse.js';

const DECORATION_TYPE = window.createTextEditorDecorationType({
  after: {
    margin: '2em',
  },
});

export async function decorate(editor: TextEditor) {
  const fileName = editor.document.fileName;
  log.info(`${fileName} - decorating file`);
  const scope = editor.document.uri;
  const start = Date.now();
  const toml = safeParseToml(editor.document.getText());
  if (toml instanceof ParseError) {
    const { index, lineNumber: line, column, message } = toml;
    log.error(
      `${fileName} - parse error: index ${index}, line ${line}, column ${column}, ${message}`,
    );
  } else {
    const dependencies = parseCargoDependencies(
      toml.body[0].body.filter((v): v is TOMLTable => v.type === 'TOMLTable'),
    );
    const options = await Promise.all(
      dependencies.map(async (d): Promise<DecorationOptions> => {
        const registry = getRegistry(d.registry, scope);
        const docs = registry instanceof Error ? undefined : registry.docs;
        let versionsResult: semver.SemVer[] | Error;
        if (registry instanceof Error) {
          log.error(`${d.name} - ${registry.message}`);
          versionsResult = registry;
        } else {
          versionsResult = await fetchVersions(
            d.name,
            registry,
            getUseCargoCache(scope),
          );
        }
        const { hoverMessage, contentText } = decorateDependency(
          d.name,
          d.version,
          versionsResult,
          docs,
        );
        return {
          range: editor.document.lineAt(d.line).range,
          hoverMessage,
          renderOptions: {
            after: {
              contentText,
            },
          },
        };
      }),
    );
    editor.setDecorations(DECORATION_TYPE, options);
    log.info(
      `${fileName} - file decorated in ${
        Math.round((Date.now() - start) / 10) / 100
      } seconds`,
    );
  }
}

const SYMBOL_UP_TO_DATE = '✅';
// TODO: parse Cargo.lock
//const SYMBOL_OLD_LOCKED = '⛔';
const SYMBOL_UPGRADABLE = '❌';
const SYMBOL_ERROR = '❗❗❗';

function decorateDependency(
  name: string,
  version: semver.Range,
  versionsResult: semver.SemVer[] | Error,
  docs: URL | undefined,
): { hoverMessage: MarkdownString; contentText: string } {
  if (versionsResult instanceof Error) {
    return {
      hoverMessage: new MarkdownString(versionsResult.message),
      contentText: SYMBOL_ERROR,
    };
  } else {
    versionsResult.sort(semver.compareBuild).reverse();
    const resolved = semver.maxSatisfying(versionsResult, version);
    const latestStable = versionsResult.find((v) => v.prerelease.length === 0);
    const latest = versionsResult[0];
    let contentText;
    if (resolved === null) {
      contentText = SYMBOL_ERROR;
    } else {
      if (resolved.compare(latest) === -1) {
        // resolved < latest
        if (
          latestStable === undefined ||
          latestStable.compare(resolved) === -1
        ) {
          // latestStable < resolved (prerelease) < latest
          contentText = `${SYMBOL_UPGRADABLE} ${latest}`;
        } else if (resolved.compare(latestStable) === 0) {
          contentText = SYMBOL_UP_TO_DATE;
        } else {
          contentText = `${SYMBOL_UPGRADABLE} ${latestStable}`;
        }
      } else {
        contentText = SYMBOL_UP_TO_DATE;
      }
    }
    return {
      hoverMessage: getHoverMessage(resolved, latestStable, latest, name, docs),
      contentText,
    };
  }
}

function getHoverMessage(
  resolved: semver.SemVer | null,
  latestStable: semver.SemVer | undefined,
  latest: semver.SemVer,
  // TODO: parse Cargo.lock
  //locked: semver.SemVer | undefined,
  name: string,
  docs: URL | undefined,
): MarkdownString {
  const s = new MarkdownString();
  s.appendMarkdown(`- **Resolved**: ${getLink(resolved, name, docs)}\n\n`);
  s.appendMarkdown(
    `- **Latest Stable**: ${getLink(latestStable, name, docs)}\n\n`,
  );
  s.appendMarkdown(`- **Latest**: ${getLink(latest, name, docs)}\n\n`);
  // TODO: parse Cargo.lock
  //`**Locked version**: ${getVersionMarkdown(locked, name, docs)}\n\n`
  s.appendMarkdown('- **Locked**: feature not implemented\n\n');
  return s;
}

function getLink(
  v: semver.SemVer | null | undefined,
  name: string,
  docs: URL | undefined,
): string {
  if (v === null) {
    return `no versions of the crate ${name} satisfy the given requirement`;
  } else if (v === undefined) {
    return 'not available';
  } else if (docs === undefined) {
    return v.format();
  } else {
    return `[${v}](${new URL(
      path.posix.join(docs.pathname, name, v.format()),
      docs,
    )})`;
  }
}

function safeParseToml(text: string): TOMLProgram | ParseError {
  try {
    return parseTOML(text);
  } catch (err) {
    return err as ParseError;
  }
}
