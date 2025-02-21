import { z } from "zod";
import { model_zoo } from "src/server/service/ModelZoo";
import {
  LlamaChat,
  LlamaCompletion,
  LlamaCompletionGenerationOptions,
  LlamaCompletionResponse,
  LlamaModel,
} from "node-llama-cpp";
import { v4 as uuidv4 } from "uuid";
import { AsyncLock } from "src/server/common/AsyncLock";
import { GgufModel } from "src/server/service/GgufModel";
import { COMPLETION_SCHEMA } from "./completions.schema";

type ChatCompletionBody = z.infer<typeof COMPLETION_SCHEMA>;

type TextOnlyMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class Completion {
  static locker = new AsyncLock();

  readonly id = uuidv4();
  readonly created = Date.now();
  readonly signal = new AbortController();
  readonly chat: LlamaChat;

  // 因为 llamacpp 无法支持多模态模型，所以所有 message 都将转换为 text
  messages = [] as TextOnlyMessage[];

  context: Promise<{
    prompt: string[];
    model: GgufModel;
    llm_model: LlamaModel;
    completion: LlamaCompletion;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    options: LlamaCompletionGenerationOptions;
  }>;

  constructor(readonly body: ChatCompletionBody) {
    this.context = this.build_context();
  }

  async [Symbol.asyncDispose]() {
    const { model } = await this.context;
    model._sequence_lock.release();
    this.signal.abort();
  }

  protected async build_context() {
    const {
      model: model_name,
      temperature,
      prompt,
      max_tokens,
      top_p,
      stop,
      frequency_penalty,
      presence_penalty,
    } = this.body;

    const request_arr = Array.isArray(prompt) ? prompt : [prompt];
    const sequence_len = request_arr.length;

    const model = model_zoo.get_model(model_name);
    await model._sequence_lock.acquire();
    await model_zoo.prepare_load(model);

    const llm_model = await model.load_model();
    const completion = await model.get_completion(this.signal.signal);

    let customStopTriggers: any = stop ?? undefined;
    if (!Array.isArray(customStopTriggers) && customStopTriggers) {
      customStopTriggers = [customStopTriggers] as any;
    }

    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    usage.prompt_tokens = (await model.encode(request_arr.join("\n"))).length;

    return {
      prompt: request_arr,
      usage,
      model,
      llm_model,
      completion,
      options: {
        temperature: temperature ?? undefined,
        maxTokens: max_tokens ?? undefined,
        topP: top_p ?? undefined,
        customStopTriggers,
        repeatPenalty: {
          frequencyPenalty: frequency_penalty ?? undefined,
          presencePenalty: presence_penalty ?? undefined,
        },
      } satisfies LlamaCompletionGenerationOptions,
    };
  }

  protected async build_stream_chunk(
    response: string,
    finish_reason = null as null | string
  ) {
    const { usage } = await this.context;
    const {
      id,
      body: { model, stream_options },
      created,
    } = this;
    return {
      id,
      object: "text.completion.chunk",
      model,
      created,
      choices: [
        {
          index: 0,
          text: response,
          finish_reason,
        },
      ],
      usage: stream_options?.include_usage
        ? {
            ...usage,
          }
        : undefined,
    };
  }

  protected async build_response_object(response: string, stopReason: string) {
    const { usage } = await this.context;
    const {
      id,
      body: { model },
      created,
    } = this;
    return {
      id,
      object: "text.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          text: response,
          logprobs: null,
          finish_reason: stopReason,
        },
      ],
      usage,
      // system_fingerprint: "fp_6b68a8204b",
    };
  }

  public async request(
    on_chunk?: (
      chunk: object,
      final?: Awaited<ReturnType<LlamaCompletion["generateCompletionWithMeta"]>>
    ) => any
  ) {
    const { prompt, usage, options, completion, model } = await this.context;

    if (prompt.length > 1) {
      if (this.body.stream) {
        // 如果是多个 prompt 不支持使用 流式(streaming)
        throw new Error(
          "Streaming mode with multiple prompts is not supported."
        );
      }
      return this.request_batching();
    }
    const prompt0 = prompt[0];
    const response = await completion.generateCompletionWithMeta(prompt0, {
      ...options,
      signal: this.signal.signal,
      onTextChunk: async (text) => {
        usage.completion_tokens += (await model.encode(text)).length;
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;

        if (on_chunk) {
          const chunk = await this.build_stream_chunk(text);
          on_chunk(chunk);
        }
      },
    });
    // NOTE: DONE chunk
    on_chunk?.(
      await this.build_stream_chunk("", response.metadata.stopReason),
      response
    );
    return await this.build_response_object(
      response.response,
      response.metadata.stopReason
    );
  }

  protected async build_responses_object(responses: LlamaCompletionResponse[]) {
    const { usage } = await this.context;
    const {
      id,
      body: { model },
      created,
    } = this;
    return {
      id,
      object: "text.completion",
      created,
      model,
      choices: [
        ...responses.map((resp) => {
          return {
            index: 0,
            text: resp.response,
            // TODO: 这个东西 node-llama-cpp 不支持
            logprobs: null,
            finish_reason: resp.metadata.stopReason,
          };
        }),
      ],
      usage,
      // system_fingerprint: "fp_6b68a8204b",
    };
  }

  protected async request_batching() {
    const { prompt, usage, options, completion, model } = await this.context;
    if (prompt.length <= 1) {
      throw new Error(`Batching prompt must have more than one prompt.`);
    }
    const responses = await Promise.all(
      prompt.map(async (message) => {
        const response = await completion.generateCompletionWithMeta(message, {
          ...options,
          signal: this.signal.signal,
          onTextChunk: async (text) => {
            usage.completion_tokens += (await model.encode(text)).length;
            usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;

            // console.log("[chunk]", text);
          },
        });
        return response;
      })
    );

    return this.build_responses_object(responses);
  }
}
