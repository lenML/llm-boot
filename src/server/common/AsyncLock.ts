export class AsyncLock implements AsyncDisposable, Disposable {
  private locked: boolean = false;
  private waiting: Array<() => void> = [];

  wait() {
    return new Promise<void>((r1) => this.waiting.push(r1));
  }

  async acquire(): Promise<AsyncLock> {
    if (this.locked) {
      await this.wait();
    } else {
      this.locked = true;
    }
    return this;
  }

  release(): void {
    if (this.waiting.length > 0) {
      const nextResolve = this.waiting.shift();
      nextResolve!();
    } else {
      this.locked = false;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.release();
  }

  [Symbol.dispose]() {
    this.release();
  }
}
