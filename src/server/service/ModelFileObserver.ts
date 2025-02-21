import fs from "fs";
import path from "path";
import { EventEmitter } from "eventemitter3";
import { PDisposable } from "../common/PDisposable";

// 定义事件类型
interface ModelFileObserverEvents {
  add: (filePath: string) => void;
  delete: (filePath: string) => void;
  change: (modelList: string[]) => void;
  rename: (oldFilePath: string, newFilePath: string) => void;
}

export class ModelFileObserver extends PDisposable {
  public readonly dirPath: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private readonly targetExtension = ".gguf";
  private modelList: Set<string> = new Set();
  public events = new EventEmitter<ModelFileObserverEvents>();

  /**
   * 监听指定文件夹(包括子文件夹)下的所有 .gguf 文件的变动
   *
   * @param dirPath - The path of the directory to observe. This path is resolved to an absolute path.
   */
  constructor(dirPath: string) {
    super();

    this.dirPath = path.resolve(dirPath);
    if (!fs.existsSync(this.dirPath)) {
      throw new Error(`Directory does not exist: ${this.dirPath}`);
    }
    if (!fs.statSync(this.dirPath).isDirectory()) {
      throw new Error(`Path is not a directory: ${this.dirPath}`);
    }

    this.onDisposed(() => {
      this.stopWatching();
    });
  }

  /**
   * 获取当前的模型文件列表
   */
  getModelList(): string[] {
    return Array.from(this.modelList).sort();
  }

  /**
   * 开始监听文件夹及其子文件夹
   */
  async startWatching(): Promise<void> {
    if (this.watchers.size > 0) {
      console.warn("Already watching directories.");
      return;
    }

    try {
      // 初始扫描所有文件
      await this.initialScan(this.dirPath);
      // 开始监听变化
      await this.watchDirectory(this.dirPath);
    } catch (error) {
      console.error("Failed to start watching:", error);
      this.stopWatching();
    }
  }

  /**
   * 初始扫描目录下的所有文件
   */
  private async initialScan(dirPath: string): Promise<void> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.initialScan(fullPath);
      } else if (entry.isFile() && this.isTargetFile(entry.name)) {
        this.modelList.add(fullPath);
      }
    }

    this.emitModelListChange();
  }

  /**
   * 停止所有监听
   */
  stopWatching(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.modelList.clear();
  }

  /**
   * 判断文件是否为目标文件类型
   */
  private isTargetFile(filename: string): boolean {
    return path.extname(filename).toLowerCase() === this.targetExtension;
  }

  /**
   * 监听指定目录
   */
  private async watchDirectory(dirPath: string): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    // 设置目录监听器
    const watcher = fs.watch(
      dirPath,
      { persistent: true },
      (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.join(dirPath, filename);
        this.handleFileEvent(eventType, fullPath);
      }
    );

    this.watchers.set(dirPath, watcher);

    // 递归监听所有子目录
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdirPath = path.join(dirPath, entry.name);
        await this.watchDirectory(subdirPath);
      }
    }
  }

  /**
   * 更新模型列表并发送变更事件
   */
  private emitModelListChange(): void {
    this.events.emit("change", this.getModelList());
  }

  /**
   * 处理文件事件
   */
  private async handleFileEvent(
    eventType: fs.WatchEventType,
    fullPath: string
  ): Promise<void> {
    // 如果不是目标文件类型且不是目录，则忽略
    if (!this.isTargetFile(fullPath) && !this.isDirectory(fullPath)) {
      return;
    }

    try {
      switch (eventType) {
        case "rename": {
          const exists = await this.fileExists(fullPath);

          if (!exists) {
            // 文件被删除
            if (this.isTargetFile(fullPath)) {
              this.modelList.delete(fullPath);
              this.events.emit("delete", fullPath);
              this.emitModelListChange();
            }
          } else {
            const stats = await fs.promises.stat(fullPath);

            if (stats.isDirectory()) {
              // 新目录被创建，开始监听
              await this.watchDirectory(fullPath);
            } else if (this.isTargetFile(fullPath)) {
              // 新文件被创建
              this.modelList.add(fullPath);
              this.events.emit("add", fullPath);
              this.emitModelListChange();
            }
          }
          break;
        }
        case "change": {
          if (this.isTargetFile(fullPath)) {
            // 对于文件内容变化，只需要发送 change 事件
            this.emitModelListChange();
          }
          break;
        }
      }
    } catch (error) {
      console.error("Error handling file event:", error);
    }
  }

  /**
   * 检查路径是否为目录
   */
  private isDirectory(filepath: string): boolean {
    try {
      return fs.statSync(filepath).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.promises.access(filepath);
      return true;
    } catch {
      return false;
    }
  }
}
