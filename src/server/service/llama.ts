import { getLlama as _getLlama, Llama } from "node-llama-cpp";

export namespace LlamaCpp {
  export const instance = _getLlama({
    build: "never",
  });
  export function getLlama() {
    return instance;
  }
}
