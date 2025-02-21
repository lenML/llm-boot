import { XMLBuilder } from "fast-xml-parser";

const builder = new XMLBuilder({
  ignoreAttributes: false,
});

export type VisionImage = {
  buff: Buffer;
  filename?: string;
};

export type VisionOutput = Record<string, any>;

/**
 * 输入图片输出图片描述
 */
export class VisionModel {
  async predict_image(image: VisionImage): Promise<VisionOutput> {
    throw new Error("Not implemented");
  }

  async predict(image: VisionImage): Promise<string> {
    const output = await this.predict_image(image);
    const xml_content = builder.build({
      image: {
        ...output,
        "@_filename": image.filename,
      },
    });
    return xml_content;
  }
}
