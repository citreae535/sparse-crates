import { homedir } from "os";
import { promises as fs } from "fs";
import toml from "@iarna/toml";
import path from "path";

import { type ConfigurationScope, workspace } from "vscode";

const CRATES_IO_INDEX = new URL("https://index.crates.io/");
const CRATES_IO_CACHE = "index.crates.io-6f17d22bba15001f";

export interface Registries {
  default: Registry;
  secondary: Registry[];
}

export interface Registry {
  index: URL;
  cache?: string;
  docs?: URL;
  auth?: string;
  name?: string;
  token?: string;
}

let registries: Registries = {
  default: {
    index: getCrateIoIndex(),
    cache: getCrateIoCache(),
    docs: new URL("https://docs.rs/"),
  },
  secondary: [],
};

export function getUseCargoCache(scope: ConfigurationScope): boolean {
  return (
    workspace.getConfiguration("sparse-crates", scope).get("useCargoCache") ??
    true
  );
}

function getuseCargoConfig(): boolean {
  return (
    workspace.getConfiguration("sparse-crates").get("useCargoConfig") ?? false
  );
}

interface CargoRegistryConfig {
  index: string;
}

interface CargoRegistriesConfig {
  [key: string]: CargoRegistryConfig;
}

interface CargoConfig {
  registries?: CargoRegistriesConfig;
  registry?: {
    default?: string;
  };
}

interface CargoRegistryCredentials {
  token: string;
}

interface CargoCredentials {
  registries: {
    [key: string]: CargoRegistryCredentials;
  };
}

async function loadCargoConfig(): Promise<CargoConfig> {
  const cargoConfigPath = path.join(homedir(), ".cargo", "config.toml");
  try {
    const cargoConfigContent = await fs.readFile(cargoConfigPath, "utf-8");
    const parsedConfig = toml.parse(cargoConfigContent);
    return parsedConfig as CargoConfig; // Cast to CargoConfig type
  } catch (error) {
    console.error(`Error reading Cargo config: ${error}`);
    throw error; // Rethrow the error or handle it as appropriate
  }
}

async function loadCargoCredentials(): Promise<CargoCredentials> {
  const cargoCredentialsPath = path.join(
    homedir(),
    ".cargo",
    "credentials.toml",
  );
  try {
    const cargoCredentialsContent = await fs.readFile(
      cargoCredentialsPath,
      "utf-8",
    );
    const parsedCredentials = toml.parse(cargoCredentialsContent);
    return parsedCredentials as unknown as CargoCredentials; // Cast to CargoCredentials type
  } catch (error) {
    console.error(`Error reading Cargo credentials: ${error}`);
    throw error; // Rethrow the error or handle it as appropriate
  }
}

export async function loadRegistries() {
  const useCargoConfig = getuseCargoConfig();
  if (useCargoConfig) {
    const cargoConfig = await loadCargoConfig();
    const cargoCredentials = await loadCargoCredentials();

    if (cargoConfig.registries !== undefined) {
      const defaultRegistry = cargoConfig.registry?.default;
      // loop through cargo config registries and set default and other registries
      Object.entries(cargoConfig.registries).map(([name, config]) => {
        const index = new URL(config.index.replace(/sparse\+/, ""));
        let reg: Registry = {
          index,
          name,
          docs: new URL("https://docs.rs/"),
        };
        // set token if available
        if (cargoCredentials && name) {
          reg.token = cargoCredentials.registries?.[name]?.token;
        }
        if (defaultRegistry !== undefined && name === defaultRegistry) {
          reg.cache = "default-registry-cache-8675309";
          registries.default = reg;
        } else {
          registries.secondary.push(reg);
        }
      });
    }
  }
  const settingsRegistries: Registry[] =
    workspace.getConfiguration("sparse-crates").get("registries") ?? [];

  settingsRegistries.forEach((registry) => {
    const index = new URL(registry.index.href.replace(/sparse\+/, ""));
    let reg: Registry = {
      index,
      docs: registry.docs ?? new URL("https://docs.rs/"),
    };
    registries.secondary.push(reg);
  });
}

export function getRegistries(): Registries {
  return registries;
}

function getCrateIoIndex(): URL {
  try {
    return new URL(
      workspace
        .getConfiguration("sparse-crates")
        .get("cratesIoIndex") as string,
    );
  } catch {
    return CRATES_IO_INDEX;
  }
}

function getCrateIoCache(): string {
  return (
    workspace.getConfiguration("sparse-crates").get("cratesIoCache") ??
    CRATES_IO_CACHE
  );
}
