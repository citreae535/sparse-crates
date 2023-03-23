import { readFile } from 'fs/promises';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import fetch from 'node-fetch';
import type { AbortError, FetchError, RequestInit } from 'node-fetch';
import semver from 'semver';

import type { Registry } from './config.js';
import log from './log.js';

interface VersionsCache {
  versions: semver.SemVer[];
  callbackId: NodeJS.Timeout;
}

class CrateVersionsCache {
  private cache: Map<string, VersionsCache>;
  private expiration: number;

  constructor() {
    this.cache = new Map();
    // 1 hour
    this.expiration = 3600000;
  }

  set = (key: string, versions: semver.SemVer[]) => {
    const cache = this.cache.get(key);
    if (cache !== undefined) {
      clearTimeout(cache.callbackId);
    }
    this.cache.set(key, {
      versions,
      callbackId: setTimeout(() => this.cache.delete(key), this.expiration),
    });
  };

  get = (key: string) => {
    return this.cache.get(key)?.versions;
  };
}

const crateVersionsCache = new CrateVersionsCache();

type LocalSource = 'local registry' | 'cache';
type Source = 'registry' | LocalSource;

export async function fetchVersions(
  name: string,
  registry: Registry,
  useCache: boolean,
): Promise<semver.SemVer[] | Error> {
  let versions = crateVersionsCache.get(name);
  if (versions === undefined) {
    if (useCache && registry.cache !== undefined) {
      const v = await fetchLocal(
        name,
        resolveCacheDir(registry.cache),
        'cache',
      );
      if (!(v instanceof Error)) {
        crateVersionsCache.set(name, v);
        versions = v;
      }
    }
    if (versions === undefined) {
      let v: semver.SemVer[] | Error;
      if (registry.index.protocol === 'file') {
        v = await fetchLocal(
          name,
          fileURLToPath(registry.index),
          'local registry',
        );
      } else {
        v = await fetchRemote(name, registry.index);
      }
      if (!(v instanceof Error)) {
        crateVersionsCache.set(name, v);
      }
      return v;
    }
  }
  return versions;
}

const httpAgent = new http.Agent({
  maxSockets: 6,
});

const httpsAgent = new https.Agent({
  maxSockets: 6,
});

async function fetchRemote(
  name: string,
  registry: URL,
): Promise<semver.SemVer[] | Error> {
  const url = new URL(
    path.posix.join(registry.pathname, resolveIndexPath(name)),
    registry,
  );
  log.info(`${name} - fetching versions from registry: ${url}`);
  const response = await safeFetch(
    url,
    {
      agent: (url) => {
        if (url.protocol === 'https:') {
          return httpsAgent;
        } else {
          return httpAgent;
        }
      },
      headers: {
        'User-Agent':
          'VSCode.SparseCrates (https://marketplace.visualstudio.com/items?itemName=citreae535.sparse_crates)',
      },
    },
    30000,
  );
  if (response instanceof Error) {
    const e = response;
    let message: string;
    if (e.name === 'AbortError') {
      message = 'connection to registry timeout';
    } else {
      message = `registry fetch error: ${e.message}`;
    }
    log.error(`${name} - ${message}`);
    return new Error(message);
  } else if (response.ok) {
    return parseIndex(name, response.buffer, 'registry');
  } else {
    let message: string;
    if (
      response.status === 404 ||
      response.status === 410 ||
      response.status === 451
    ) {
      // https://doc.rust-lang.org/cargo/reference/registry-index.html#nonexistent-crates
      message = `crate not found in registry: HTTP ${response.status}`;
    } else {
      message = `unexpected response code: HTTP ${response.status}`;
    }
    log.error(`${name} - ${message}`);
    return new Error(message);
  }
}

async function fetchLocal(
  name: string,
  dir: string,
  source: LocalSource,
): Promise<semver.SemVer[] | Error> {
  const p = path.resolve(dir, resolveIndexPath(name));
  log.info(`${name} - fetching versions from ${source}: ${p}`);
  const buffer = await safeReadFile(p);
  if (buffer instanceof Error) {
    const e = buffer;
    let message: string;
    if (e?.code === 'ENOENT') {
      message = `crate not found in ${source}`;
    } else {
      message = `${source} read error: ${e}`;
    }
    log.error(`${name} - ${message}`);
    return new Error(message);
  } else {
    return parseIndex(name, buffer, source);
  }
}

/** The cache file version of Cargo 0.69 / Rust 1.68.0.
 * This is Cargo's internal implementation detail.
 * https://docs.rs/cargo/0.69.0/src/cargo/sources/registry/index.rs.html#727
 */
const CURRENT_CACHE_VERSION = 3;
/** The index format version of Cargo 0.69 / Rust 1.68.0.
 * This is Cargo's internal implementation detail.
 * https://docs.rs/cargo/0.69.0/src/cargo/sources/registry/mod.rs.html#262
 */
const INDEX_FORMAT_VERSION = 2;

function parseIndex(
  name: string,
  buffer: Buffer,
  source: Source,
): semver.SemVer[] | Error {
  let lines: string[];
  if (source === 'cache') {
    // The cache format is Cargo's internal implementation detail.
    // https://docs.rs/cargo/0.69.0/src/cargo/sources/registry/index.rs.html#690
    const cacheVersion = buffer.readUInt8(0);
    const indexVersion = buffer.readUint32LE(1);
    if (cacheVersion !== CURRENT_CACHE_VERSION) {
      const message = `unknown cache version found in cache: ${cacheVersion}`;
      log.warn(`${name} - ${message}`);
      return new Error(message);
    } else if (indexVersion !== INDEX_FORMAT_VERSION) {
      const message = `unknown index version found in cache: ${indexVersion}`;
      log.warn(`${name} - ${message}`);
      return new Error(message);
    } else {
      lines = buffer
        .toString('utf8', 5)
        .split('\0')
        .filter((_, i) => i % 2 === 0 && i !== 0);
    }
  } else {
    lines = buffer.toString('utf8').trim().split('\n');
  }
  const versions = lines
    .map((line, i) => {
      const v = parseRelease(line, name);
      if (v instanceof Error) {
        log.warn(`${name} - ${source} index line ${i} - ${v.message}`);
        return;
      } else {
        return v;
      }
    })
    .filter((v): v is semver.SemVer => v !== undefined);
  const len = versions.length;
  if (len === 0) {
    const message = `no version found in ${source}`;
    log.warn(`${name} - ${message}`);
    return new Error(message);
  } else {
    log.info(`${name} - ${len} versions parsed from ${source}`);
    return versions;
  }
}

interface Release {
  name?: string;
  vers?: string;
  yanked?: boolean;
}

function parseRelease(
  s: string,
  name: string,
): semver.SemVer | Error | undefined {
  const r: Release | Error = safeJsonParse(s);
  if (r instanceof Error) {
    return new Error(`invalid JSON: ${r}`);
  } else {
    const version = semver.parse(r.vers);
    if (r.name !== name) {
      return new Error(`crate name does not match: ${r.name}`);
    } else if (version === null) {
      return new Error(`invalid semver: ${r.vers}`);
    } else if (r.yanked === undefined) {
      return new Error(`"yanked" key missing`);
    } else if (!r.yanked) {
      return version;
    } else {
      return;
    }
  }
}

interface HttpResponse {
  ok: boolean;
  status: number;
  buffer: Buffer;
}

async function safeFetch(
  url: URL,
  init: RequestInit,
  timeout: number,
): Promise<HttpResponse | AbortError | FetchError> {
  const controller = new AbortController();
  init.signal = controller.signal;
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, init);
    return {
      ok: r.ok,
      status: r.status,
      buffer: Buffer.from(await r.arrayBuffer()),
    };
  } catch (err) {
    return err as AbortError | FetchError;
  } finally {
    clearTimeout(t);
  }
}

async function safeReadFile(
  path: string,
): Promise<Buffer | NodeJS.ErrnoException> {
  try {
    return await readFile(path);
  } catch (err) {
    return err as NodeJS.ErrnoException;
  }
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch (err) {
    return err as Error;
  }
}

function resolveCacheDir(cacheDir: string): string {
  let cargoHome = process.env.CARGO_HOME;
  if (cargoHome === undefined) {
    cargoHome = path.resolve(os.homedir(), '.cargo');
  }
  return path.resolve(cargoHome, 'registry/index', cacheDir, '.cache');
}

/**
 * https://docs.rs/cargo/latest/cargo/sources/registry/index.html#the-format-of-the-index
 */
function resolveIndexPath(name: string): string {
  switch (name.length) {
    case 0:
      return '';
    case 1:
      return `1/${name}`;
    case 2:
      return `2/${name}`;
    case 3:
      return `3/${name.charAt(0)}/${name}`;
    default:
      return `${name.substring(0, 2)}/${name.substring(2, 4)}/${name}`;
  }
}
