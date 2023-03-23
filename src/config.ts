import { type ConfigurationScope, workspace } from 'vscode';

const CRATES_IO_INDEX = new URL('https://index.crates.io/');
const CRATES_IO_CACHE = 'index.crates.io-6f17d22bba15001f';

export function getUseCargoCache(scope: ConfigurationScope): boolean {
  return (
    workspace.getConfiguration('sparse-crates', scope).get('useCargoCache') ??
    true
  );
}

export interface Registry {
  index: URL;
  cache?: string;
  docs?: URL;
}

export function getRegistry(
  name: string | undefined,
  scope: ConfigurationScope,
): Registry | Error {
  if (name !== undefined) {
    const registries: {
      name: string;
      index: string;
      cache?: string;
      docs?: string;
    }[] = workspace.getConfiguration('sparse-crates').get('registries') ?? [];
    const registry = registries.find((r) => r.name === name);
    if (registry !== undefined) {
      const index = safeParseUrl(registry.index);
      const cache = registry.cache;
      const docs =
        registry.docs === undefined ? undefined : safeParseUrl(registry.docs);
      if (index instanceof Error) {
        return new Error(
          `registry ${name} - invalid index URL: ${registry.index}`,
        );
      } else if (docs instanceof Error) {
        return new Error(
          `registry ${name} - invalid docs URL: ${registry.docs}`,
        );
      } else {
        return {
          index,
          cache,
          docs,
        };
      }
    } else {
      return new Error(`unknown registry: ${name}`);
    }
  }
  return {
    index: getCrateIoIndex(scope),
    cache: getCrateIoCache(scope),
    docs: new URL('https://docs.rs/'),
  };
}

function getCrateIoIndex(scope: ConfigurationScope): URL {
  try {
    return new URL(
      workspace
        .getConfiguration('sparse-crates', scope)
        .get('cratesIoIndex') as string,
    );
  } catch {
    return CRATES_IO_INDEX;
  }
}

function getCrateIoCache(scope: ConfigurationScope): string {
  return (
    workspace.getConfiguration('sparse-crates', scope).get('cratesIoCache') ??
    CRATES_IO_CACHE
  );
}

function safeParseUrl(s: string): URL | Error {
  try {
    return new URL(s);
  } catch (err) {
    return err as Error;
  }
}
