# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Support for Cargo's sparse protocol and sparse cache index.
- Support for crates.io remote and local mirrors.
- Support for alternate registries that use the sparse protocol.
- Support for package renaming.

### Changed

- Bumped minimum VSCode version from 1.45 to 1.72.
- Hover messages on the decorators are simplified.
- Logs are written to VSCode's output channel, and they are more structured and detailed.
- Replaced handwritten TOML parser with `toml-eslint-parser`.
- Replaced handwritten semver parser with `semver`.
- Changed the HTTP client library from unmaintained `request-promise` to `node-fetch`.
- Changed the linter from deprecated `tslint` to `rome`.
- Changed the bundler from `webpack` to `esbuild`.
- Changed the package manager from `npm` to `pnpm`.

### Removed

- Support for Cargo's Git index protocol and cache.
- All actions, commands, and completions. 
- Decorator customizations.
- Unused dependencies and dead code.
- Status bar items are temporarily removed.
- Unit tests are removed for now.
