import { ModelFileObserver } from "./ModelFileObserver";
import { configJson } from "../config";
import { GgufModel } from "./GgufModel";
import path from "path";
import { NvidiaSMI } from "@quik-fe/node-nvidia-smi";
import { PDisposable } from "../common/PDisposable";

/**
 * server 实例
 *
 * 1. 监听和读取指定目录中的 gguf 文件信息
 * 2. 调用模型
 * 3. 调用 embedding2
 * 4. gpu 管理，卸载加载
 * 5.
 */
export class ModelZoo extends PDisposable {
  observers: ModelFileObserver[];
  ggufs: GgufModel[] = [];

  readonly ready: Promise<void>;

  constructor() {
    super();

    this.observers = configJson.model_dirs.map(
      (dir) => new ModelFileObserver(dir)
    );

    this.ready = this._ready();
    // this.ready = Promise.resolve();
  }

  private async _ready() {
    for (const obs of this.observers) {
      this.connect(obs);
      obs.events.on("change", (model_list) => {
        this.onModelFileChange(model_list, obs.dirPath);
      });
      await obs.startWatching();
    }
  }

  protected async onModelFileChange(model_list: string[], dirname) {
    for (const filepath of model_list) {
      const is_had = this.ggufs.some((x) => x.modelPath === filepath);
      if (is_had) continue;
      // add
      const model_id = path.relative(dirname, filepath).replace(/\\/g, "/");
      try {
        const gguf = new GgufModel(filepath, model_id);
        this.ggufs.push(gguf);
      } catch (error) {
        console.error("[model_zoo]load model error", error);
      }
    }
    // remove
    for (const gguf of this.ggufs) {
      const is_had = model_list.some((x) => x === gguf.modelPath);
      if (is_had) continue;
      try {
        await gguf.dispose();
      } catch (error) {
        console.error("[model_zoo]dispose model error", error);
      }
      this.ggufs = this.ggufs.filter((x) => x.modelPath !== gguf.modelPath);
    }
  }

  get_model(id: string) {
    const model = this.ggufs.find((x) => x.model_id === id);
    if (!model) {
      throw new Error(`[model_zoo]model ${id} not found`);
    }
    return model;
  }

  // 释放所有加载中的模型
  async free() {
    // NOTE: 这里可能会存在失败？我们目前直接无视
    await Promise.allSettled(this.ggufs.map((x) => x.unload_model()));
  }

  // 环境预处理，根据需要加载的模型，自动判断是否需要卸载已经加载的模型
  async prepare_load(target_model: GgufModel) {
    if (target_model._model !== null) {
      // 已经加载 不需要判断和处理
      return;
    }
    // NOTE: 模型文件大小约等于显存占用空间
    const model_file_size = target_model._file_info.size;
    const usage = await NvidiaSMI.Utils.getMemoryUsage();
    if (!usage) {
      // 无法获取gpu信息 所以释放所有加载中的模型
      console.warn(
        `[model_zoo]cant get gpu info, release all memory to load model ${target_model.model_id}`
      );
      await this.free();
      return;
    }
    // TODO: 目前的代码在每次需要加载模型时都进行显存检查，这可能不够高效。 可以考虑实现一个 LRU（Least Recently Used） 或其他缓存策略来管理已加载的模型，避免频繁的加载和卸载
    if (usage.total < model_file_size) {
      throw new Error(
        `[model_zoo]not enough memory to load model ${target_model.model_id}`
      );
    }
    if (usage.free < model_file_size) {
      console.log(
        `[model_zoo]release memory to load model ${target_model.model_id}`
      );
      await this.free();
    }
  }
}

export const model_zoo = new ModelZoo();

model_zoo.ready.then(async () => {
  console.log(`[model_zoo]ready: ${model_zoo.ggufs.length} models`);
  // const model0 = model_zoo.ggufs[0];
  // console.log(
  //   await model0.chat_template([
  //     {
  //       role: "system",
  //       content: "You are a helpful assistant.",
  //     },
  //     {
  //       role: "user",
  //       content: "你好",
  //     },
  //   ])
  // );
});
