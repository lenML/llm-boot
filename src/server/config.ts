import fs from "fs";
import { Command } from "commander";
const program = new Command();

const { config } = program
  .name("LLM boot")
  .option("-c, --config [config]", "config file", "boot.config.json")
  .parse(process.argv)
  .opts<{
    config: string;
  }>();

if (!fs.existsSync(config)) {
  console.log("config not found");
  process.exit(1);
}

export const configJson = JSON.parse(fs.readFileSync(config, "utf8")) as {
  server?: {
    port?: number;
  };
  no_docs?: boolean;
  bodyLimit?: number;
  model_dirs: string[];
};
