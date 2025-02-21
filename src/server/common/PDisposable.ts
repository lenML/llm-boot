import { Disposable } from "@zzkit/disposable";

export class PDisposable extends Disposable {
  constructor() {
    super();

    const cb = this.dispose.bind(this);
    process.on("beforeExit", cb);
    process.on("SIGINT", cb);
    process.on("SIGTERM", cb);
  }
}
