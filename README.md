# Sparse Crates

**Sparse Crates**, an extension helping Rust developers spot outdated dependencies in `Cargo.toml` manifest files.

This is a fork of the extension [**crates**](https://github.com/serayuzgur/crates) by [Seray Uzgur](https://github.com/serayuzgur) with significant changes and rewrites.

![Sparse Crates in Action](https://github.com/citreae535/sparse-crates/raw/main/sparse_crates_in_action.png)

## New Features

- Cargo's new [sparse protocol](https://rust-lang.github.io/rfcs/2789-sparse-index.html)
- Remote and local crates.io mirrors (HTTP/HTTPS/file URLs)
- Alternate registries (HTTP/HTTPS/file URLs)
- Package rename
- Detailed logs in VSCode output channel

## Planned Features and TODO

- Status bar items and notifications
- Parse and show dependency versions from Cargo.lock
- Units tests

## Configurations

- `sparse-crates.useCargoCache`: If true, Cargo's index cache is searched first before the registries. Cache must be stored in the sparse format.

- `sparse-crates.cratesIoIndex`: The index URL of the default crates.io registry. Change this value only if you use a remote or local mirror of crates.io. The index must use the sparse protocol. Use a file URL if the mirror is on disk.

- `sparse-crates.cratesIoCache`: The index cache directory of the default crates.io registry. Change this value only if you use a remote or local mirror of crates.io. You can find the directories at CARGO_HOME/registry/index.

- `sparse-crates.registries`: An array of alternate registries. Each item is an object with two required and two optional properties.
```json
{
    "name": "(Required) The name of the registry. The name of the registry. It must be the same as your dependencies' \"registry\" key.",
    "index": "(Required) The index URL of the registry. The index must use the sparse protocol. Use a file URL if the registry is on disk.",
    "cache": "(Optional) Cargo's index cache directory of the registry. You can find the directories at CARGO_HOME/registry/index. Cache is not searched for the registry if this property is not given.",
    "docs": "(Optional) The docs URL of the registry, if one exists. The link to the docs of a specific version of a crate is obtained by `${docs}${name}/${version}`. This is only used when rendering hover messages on the decorators."
}
```

## Thanks

- [Seray Uzgur](https://github.com/serayuzgur), the original author of [**crates**](https://github.com/serayuzgur/crates)