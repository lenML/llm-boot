import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  Florence2Processor,
  Florence2PreTrainedModel,
  PreTrainedTokenizer,
} from "@huggingface/transformers";
import { DataType } from "@huggingface/transformers/types/utils/dtypes";

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { fromBuffer } from "file-type-cjs";
import { DeviceType } from "@huggingface/transformers/types/utils/devices";

export async function load_florence2({
  model_id = "onnx-community/Florence-2-large-ft",
  cache_dir = path.join(process.cwd(), "models"),
  dtype,
  device = "cpu",
}: {
  model_id?:
    | "onnx-community/Florence-2-large-ft"
    | "onnx-community/Florence-2-base-ft";
  cache_dir?: string;
  dtype?: {
    embed_tokens?: DataType;
    vision_encoder?: DataType;
    encoder_model?: DataType;
    decoder_model_merged?: DataType;
  };
  device?: DeviceType;
} = {}) {
  const model = (await Florence2ForConditionalGeneration.from_pretrained(
    model_id,
    {
      dtype: {
        embed_tokens: "fp16",
        vision_encoder: "fp16",
        encoder_model: "q4",
        decoder_model_merged: "q4",
        ...dtype,
      },
      device,
      cache_dir: cache_dir,
    }
  )) as Florence2PreTrainedModel;

  const processor = (await AutoProcessor.from_pretrained(
    model_id,
    {}
  )) as Florence2Processor;
  const tokenizer = await AutoTokenizer.from_pretrained(model_id);

  return { model, processor, tokenizer };
}

export enum FlorenceTask {
  caption = "<CAPTION>",
  detailed_caption = "<DETAILED_CAPTION>",
  more_detailed_caption = "<MORE_DETAILED_CAPTION>",
  caption_to_phrase_grounding = "<CAPTION_TO_PHRASE_GROUNDING>",
  object_detection = "<OD>",
  dense_region_caption = "<DENSE_REGION_CAPTION>",
  region_proposal = "<REGION_PROPOSAL>",
  ocr = "<OCR>",
  ocr_with_region = "<OCR_WITH_REGION>",
}

export class Florence2Model {
  static async create_default() {
    const { model, processor, tokenizer } = await load_florence2();
    return new Florence2Model({ model, processor, tokenizer });
  }

  private model: Florence2PreTrainedModel;
  private processor: Florence2Processor;
  private tokenizer: PreTrainedTokenizer;

  constructor(resources: {
    model: Florence2PreTrainedModel;
    processor: Florence2Processor;
    tokenizer: PreTrainedTokenizer;
  }) {
    this.model = resources.model;
    this.processor = resources.processor;
    this.tokenizer = resources.tokenizer;
  }

  // 标注图片
  async annotate(
    imageOrPath: string | Buffer,
    task: FlorenceTask = FlorenceTask.more_detailed_caption
    // TODO: 类型
  ): Promise<any> {
    // 处理图像输入
    const image_data = Buffer.isBuffer(imageOrPath)
      ? imageOrPath
      : fs.readFileSync(imageOrPath);
    const mime = await fromBuffer(image_data.buffer);
    const image = await RawImage.fromBlob(
      new Blob([image_data], { type: mime })
    );
    const visionInputs: {
      pixel_values: any; // Tensor
      original_sizes: [number, number][];
      reshaped_input_sizes: [number, number][];
    } = await this.processor(image);

    // 构造文本输入
    const prompts = this.processor.construct_prompts(task);
    const textInputs = this.tokenizer(prompts);

    // 生成文本
    const generatedIds = (await this.model.generate({
      ...textInputs,
      ...visionInputs,
      max_new_tokens: 256,
    })) as number[][];

    // 解码生成的文本
    const generatedText = this.tokenizer.batch_decode(generatedIds, {
      skip_special_tokens: false,
    })[0];

    const input_size = visionInputs.original_sizes[0];

    // 后处理文本
    const result = this.processor.post_process_generation(
      generatedText,
      task,
      input_size
    );

    const output = result[task] ?? result[Object.keys(result)[0]];
    return output;
  }
}
