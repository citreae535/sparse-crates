import semver from 'semver';
import type {
  TOMLBare,
  TOMLContentNode,
  TOMLKeyValue,
  TOMLQuoted,
  TOMLStringValue,
  TOMLTable,
} from 'toml-eslint-parser/lib/ast';

/**
 * A Cargo dependency specification
 */
export interface Dependency {
  /** The crate name of the dependency on the registry.
   * It normally equals the name of the dependency unless explicitly given by the "package" key.
   *
   * https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#renaming-dependencies-in-cargotoml
   */
  name: string;
  /** The compatible version range of the dependency. */
  version: semver.Range;
  /** The name of the registry, if explicitly given. */
  registry?: string;
  /** The line number of the dependency's version requirement. Decorators are added at the end of this line. 0-based. */
  line: number;
}

/**
 * Parses `Cargo.toml` tables and returns all dependencies that have valid semver requirements.
 */
export function parseCargoDependencies(body: TOMLTable[]): Dependency[] {
  return body
    .flatMap((node) => {
      const keys = node.key.keys.map(getKeyString);
      if (keys.length === 1 && isDependencyKey(keys[0])) {
        // [dependencies]
        // tokio = "1"
        // clap = { version = "4" }
        return parseMultipleDependencies(node.body);
      } else if (keys.length === 2) {
        if (isDependencyKey(keys[0])) {
          // [dependencies.tokio]
          return parseSingleDependency(keys[1], node.body);
        } else if (keys[0] === 'workspace' && isDependencyKey(keys[1])) {
          // [workspace.dependencies]
          // tokio = "1"
          // clap = { version = "4" }
          return parseMultipleDependencies(node.body);
        } else {
          return;
        }
      } else if (keys.length === 3) {
        if (keys[0] === 'workspace' && isDependencyKey(keys[1])) {
          // [workspace.dependencies.tokio]
          return parseSingleDependency(keys[2], node.body);
        } else if (keys[0] === 'target' && isDependencyKey(keys[2])) {
          // [target.whatever.dependencies]
          // tokio = "1"
          // clap = { version = "4" }
          return parseMultipleDependencies(node.body);
        } else {
          return;
        }
      } else if (
        keys.length === 4 &&
        keys[0] === 'target' &&
        isDependencyKey(keys[2])
      ) {
        // [target.whatever.dependencies.tokio]
        return parseSingleDependency(keys[3], node.body);
      } else {
        return;
      }
    })
    .filter((d): d is Dependency => d !== undefined);
}

/** Parses the body of a Cargo dependency table that represents a single dependency
 * with a valid semver requirement.
 * ## Example Inline Table
 * ```toml
 * clap = { version = "4" }
 * ```
 * ## Example Table
 * ```toml
 * [dependencies.tokio]
 * version = "1"
 * ```
 */
function parseSingleDependency(
  name: string,
  body: TOMLKeyValue[],
): Dependency | undefined {
  let line: number | undefined;
  let version: semver.Range | undefined;
  let registry: string | undefined;
  body.forEach((node) => {
    if (node.key.keys.length === 1) {
      const key = getKeyString(node.key.keys[0]);
      const value = node.value;
      if (key === 'version' && isTOMLStringValue(value)) {
        const v = parseVersionRange(value.value);
        if (v !== undefined) {
          version = v;
          // TOML parser lines are 1-based, but VSCode lines are 0-based
          line = node.loc.end.line - 1;
        }
      } else if (key === 'package' && isTOMLStringValue(value)) {
        name = value.value;
      } else if (key === 'registry' && isTOMLStringValue(value)) {
        registry = value.value;
      }
    }
  });
  if (version !== undefined && line !== undefined) {
    return {
      name,
      version,
      line,
      registry,
    };
  } else {
    return;
  }
}

/** Parses the body of a Cargo dependency table that contains multiple dependencies.
 * ## An Example Table
 * ```toml
 * [dependencies]
 * clap = { version = "4" }
 * "tokio" = "1"
 * ```
 */
function parseMultipleDependencies(body: TOMLKeyValue[]): Dependency[] {
  return body
    .map((node): Dependency | undefined => {
      const key = getKeyString(node.key.keys[0]);
      const value = node.value;
      if (isTOMLStringValue(value)) {
        // crate_name = "version"
        const version = parseVersionRange(value.value);
        if (version !== undefined) {
          return {
            name: key,
            version,
            // TOML parser lines are 1-based, but VSCode lines are 0-based
            line: node.loc.end.line - 1,
            registry: undefined,
          };
        } else {
          return;
        }
      } else if (value.type === 'TOMLInlineTable') {
        // crate_name = { version = "version" ... }
        return parseSingleDependency(key, value.body);
      } else {
        return;
      }
    })
    .filter((d): d is Dependency => d !== undefined);
}

/** Parses Cargo's semver requirement */
function parseVersionRange(s: string): semver.Range | undefined {
  try {
    // Cargo uses comma to separated multiple "and" requirements, but semver uses whitespace
    return new semver.Range(
      s
        .split(',')
        .map((s) => s.trim())
        .map(plainVersionCompatibilityFix)
        .join(' '),
    );
  } catch {
    return;
  }
}

/** When plain version requirements are given, Cargo resolves them as if they are caret requirements.
 * However, Node semver resolves them as if they are equality comparisons. This function tries to fix
 * the incompatibility by adding a leading "^" to a version requirement string if it begins with a digit.
 *
 * | version |      Cargo       |      semver      |
 * | ------- | ---------------- | ---------------- |
 * | 1.2.3   | >=1.2.3 <2.0.0-0 | =1.2.3           |
 * | 2.0     | >=2.0.0 <3.0.0-0 | >=2.0.0 <2.1.0-0 |
 * | 3       | >=3.0.0 <4.0.0-0 | >=3.0.0 <4.0.0-0 |
 * | 0       | >=0.0.0 <1.0.0-0 | >=0.0.0 <1.0.0-0 |
 * | 0.2     | >=0.2.0 <0.3.0-0 | >=0.2.0 <0.3.0-0 |
 * | 0.3.4   | >=0.3.4 <0.4.0-0 | =0.3.4           |
 */
function plainVersionCompatibilityFix(s: string): string {
  if (Number.isNaN(parseInt(s.charAt(0)))) {
    return s;
  } else {
    return `^${s}`;
  }
}

function isTOMLStringValue(v: TOMLContentNode): v is TOMLStringValue {
  return v.type === 'TOMLValue' && v.kind === 'string';
}

/** Returns the name of the TOML bare or quoted key */
function getKeyString(key: TOMLBare | TOMLQuoted): string {
  if (key.type === 'TOMLBare') {
    return key.name;
  } else {
    return key.value;
  }
}

/** Returns whether the TOML bare or quoted key name indicates the presence of a Cargo dependency table */
function isDependencyKey(name: string): boolean {
  return (
    name === 'dependencies' ||
    name === 'dev-dependencies' ||
    name === 'build-dependencies'
  );
}
