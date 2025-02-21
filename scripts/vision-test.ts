import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { setGlobalDispatcher, ProxyAgent } from "undici";

import {
  Florence2Model,
  FlorenceTask,
} from "../src/multimodal/vision/florence2";
import { Florence2Vision } from "../src/multimodal/vision/florence2.vision";

if (process.env.HTTPS_PROXY) {
  if (!process.env.NO_PROXY) {
    process.env.NO_PROXY = ["localhost", "127.0.0.1", "0.0.0.0"].join(",");
  }
  const dispatcher = new ProxyAgent({
    uri: new URL(process.env.HTTPS_PROXY).toString(),
  });
  setGlobalDispatcher(dispatcher);
}

// 主函数示例
async function main() {
  const model = await Florence2Model.create_default();
  const vision = new Florence2Vision(model);

  // 标注图片
  const annotation1 = await vision.predict({
    buff: fs.readFileSync("./photo1.jpg"),
    filename: "photo1.jpg",
  });
  console.log("Annotation for photo 1:", annotation1);
  const annotation2 = await vision.predict({
    buff: fs.readFileSync("./photo2.jpg"),
    filename: "photo2.jpg",
  });
  console.log("Annotation for photo 2:", annotation2);

  // {
  //   const result = await model.annotate(
  //     "./photo2.jpg",
  //     FlorenceTask.object_detection
  //   );
  //   console.log(result);
  // }
  // {
  //   const result = await model.annotate(
  //     "./photo2.jpg",
  //     FlorenceTask.dense_region_caption
  //   );
  //   console.log(result);
  // }
}

main();
