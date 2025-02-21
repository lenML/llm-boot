import { VisionImage, VisionModel, VisionOutput } from "../VisionModel";
import { Florence2Model, FlorenceTask } from "./florence2";

export class Florence2Vision extends VisionModel {
  model: Florence2Model;
  constructor(model: Florence2Model) {
    super();
    this.model = model;
  }

  protected async object_detection(image: VisionImage) {
    const result = (await this.model.annotate(
      image.buff,
      FlorenceTask.object_detection
    )) as {
      labels: string[];
      bboxes: [number, number, number, number][];
    };
    return result.labels.map((label, i) => ({
      "@_label": label,
      "@_bbox": result.bboxes[i].map((v) => Math.floor(v)).join(","),
    }));
  }

  async predict_image(image: VisionImage): Promise<VisionOutput> {
    const ret = {
      caption: await this.model.annotate(
        image.buff,
        FlorenceTask.more_detailed_caption
      ),
      // ocr: await this.model.annotate(image.buff, FlorenceTask.ocr),
      object: await this.object_detection(image),
    };
    return ret;
  }
}
