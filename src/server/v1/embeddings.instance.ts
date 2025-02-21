import { z } from "zod";
import { AsyncLock } from "../common/AsyncLock";
import { v4 as uuidv4 } from "uuid";
import { EMBEDDINGS_SCHEMA } from "./embeddings.schema";
import { LlamaEmbeddingContext, LlamaModel } from "node-llama-cpp";
import { model_zoo } from "../service/ModelZoo";
import { GgufModel } from "../service/GgufModel";

interface EmbedDocument {
  type: "text" | "image-base64" | "image-url";
  content: string;
}

/**
 * /v1/embeddings request instance
 */
export class Embeddings {
  static locker = new AsyncLock();

  readonly id = uuidv4();
  readonly created = Date.now();
  readonly signal = new AbortController();

  context: Promise<{
    documents: EmbedDocument[];
    model: GgufModel;
    llm_model: LlamaModel;
    context: LlamaEmbeddingContext;
  }>;

  constructor(readonly body: z.infer<typeof EMBEDDINGS_SCHEMA>) {
    this.context = this.build_context();
  }

  async [Symbol.asyncDispose]() {
    const { context } = await this.context;
    await context.dispose();
    this.signal.abort();
  }

  protected async build_context() {
    const { model: model_name } = this.body;

    const model = model_zoo.get_model(model_name);
    await model_zoo.prepare_load(model);

    const llm_model = await model.load_model();
    const context = await llm_model.createEmbeddingContext({
      createSignal: this.signal.signal,
    });

    const documents = await this.parse_input_to_documents();

    return {
      documents,
      llm_model,
      model,
      context,
    };
  }

  protected async parse_input_to_documents() {
    let { input } = this.body;
    const documents = [] as EmbedDocument[];

    if (!Array.isArray(input)) {
      input = [input];
    }
    for (const item of input) {
      if (typeof item === "string") {
        documents.push({
          type: "text",
          content: item,
        });
        continue;
      }
      documents.push(item);
    }

    return documents;
  }

  public async request() {
    const { documents, context } = await this.context;

    if (documents.some((x) => x.type !== "text")) {
      // 暂时不支持非 text embed
      throw new Error(`Embedding type ${documents[0].type} is not supported.`);
    }

    const embeddings = await Promise.all(
      documents.map(async (doc) => {
        const embedding = await context.getEmbeddingFor(doc.content);
        return {
          embedding,
          type: doc.type,
          content: doc.content,
        };
      })
    );

    return embeddings;
  }

  public async getUsage() {
    const { documents, model } = await this.context;
    let prompt_tokens = 0;
    for (const doc of documents) {
      if (doc.type === "text") {
        prompt_tokens += (await model.encode(doc.content)).length;
      }
    }
    return {
      prompt_tokens,
      total_tokens: prompt_tokens,
    };
  }
}
