import { z } from "zod";
import { model_zoo } from "src/server/service/ModelZoo";
import {
  ChatHistoryItem,
  LlamaChat,
  LLamaChatPromptOptions,
  LlamaChatSession,
  LlamaContext,
  LlamaModel,
} from "node-llama-cpp";
import { v4 as uuidv4 } from "uuid";
import { LlamaCpp } from "src/server/service/llama";
import { AsyncLock } from "src/server/common/AsyncLock";
import { GgufModel } from "src/server/service/GgufModel";
import { CHAT_COMPLETION_SCHEMA } from "./completions.schema";

type ChatCompletionBody = z.infer<typeof CHAT_COMPLETION_SCHEMA>;
type BodyMessageType = ChatCompletionBody["messages"][number];

type TextOnlyMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class ChatCompletion {
  static locker = new AsyncLock();

  readonly id = uuidv4();
  readonly created = Date.now();
  readonly chat: LlamaChat;
  readonly signal = new AbortController();

  // 因为 llamacpp 无法支持多模态模型，所以所有 message 都将转换为 text
  messages = [] as TextOnlyMessage[];

  context: Promise<{
    prompt: string;
    model: GgufModel;
    llm_model: LlamaModel;
    session: LlamaChatSession;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    options: LLamaChatPromptOptions<any>;
  }>;

  constructor(readonly body: ChatCompletionBody) {
    this.context = this.build_context();
  }

  async [Symbol.asyncDispose]() {
    const { model } = await this.context;
    model._sequence_lock.release();
    this.signal.abort();
  }

  protected async create_grammar_from_body() {
    const { response_format } = this.body;
    if (!response_format) return null;
    const llama = await LlamaCpp.getLlama();
    const { type, json_schema } = response_format;
    if (type === "json_object") {
      return llama.createGrammarForJsonSchema({
        type: "object",
        additionalProperties: true,
      });
    }
    if (type === "json_schema" && json_schema?.schema) {
      return llama.createGrammarForJsonSchema(json_schema.schema);
    }
    return null;
  }

  protected async annotate_image(image_url: string) {
    // TODO
    return `<image>a photo.</image>`;
  }

  protected async speech_recognition(input_audio: {
    data: string;
    format: string;
  }) {
    const { format } = input_audio;
    // TODO
    return `<audio format="${format}">An audio without speech recognition</audio>`;
  }

  /**
   * 将 message 完全转为 text
   */
  protected async message_to_text(message?: BodyMessageType) {
    if (!message) return "";
    const parts =
      typeof message.content === "string"
        ? [
            {
              type: "text" as const,
              text: message.content,
            },
          ]
        : message.content;
    let content = "";
    for (const part of parts) {
      switch (part.type) {
        case "audio": {
          content += "\n" + (await this.speech_recognition(part.input_audio));
          break;
        }
        case "text": {
          content += part.text;
          break;
        }
        case "image_url": {
          content += "\n" + (await this.annotate_image(part.image_url.url));
          break;
        }
      }
    }
    return content;
  }

  protected async parse_chat_history(messages: BodyMessageType[]) {
    const history = [] as ChatHistoryItem[];
    for (const message of messages) {
      switch (message.role) {
        case "user": {
          history.push({
            type: "user",
            text: await this.message_to_text(message),
          });
          break;
        }
        case "system": {
          history.push({
            type: "system",
            text: await this.message_to_text(message),
          });
          break;
        }
        case "assistant": {
          history.push({
            type: "model",
            response: [await this.message_to_text(message)],
          });
          break;
        }
      }
    }
    return history;
  }

  protected async build_context() {
    const {
      model: model_name,
      messages: input_messages,
      temperature,
      max_tokens = this.body.max_completion_tokens,
      top_p,
      stop,
      frequency_penalty,
      presence_penalty,
    } = this.body;

    const last_message = input_messages.pop();
    if (!last_message) {
      throw new Error("The conversation must have at least one message.");
    }
    const prompt = await this.message_to_text(last_message);

    if (last_message?.role !== "user") {
      throw new Error("The last message must be a user message.");
    }
    const chat_history = await this.parse_chat_history(input_messages);

    const model = model_zoo.get_model(model_name);
    await model._sequence_lock.acquire();
    await model_zoo.prepare_load(model);

    const llm_model = await model.load_model();
    const session = await model.get_chat_session(this.signal.signal);
    session.setChatHistory(chat_history);

    let customStopTriggers: any = stop ?? undefined;
    if (!Array.isArray(customStopTriggers) && customStopTriggers) {
      customStopTriggers = [customStopTriggers] as any;
    }
    const grammar = await this.create_grammar_from_body();

    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const chat_template = await model.chat_template(
      await Promise.all(
        input_messages.map(async (x) => ({
          role: x.role,
          content: (await this.message_to_text(x)) || "",
        }))
      )
    );
    usage.prompt_tokens = chat_template.tokenize(llm_model.tokenizer).length;

    return {
      prompt,
      usage,
      model,
      llm_model,
      session,
      options: {
        temperature: temperature ?? undefined,
        maxTokens: max_tokens ?? undefined,
        topP: top_p ?? undefined,
        customStopTriggers,
        grammar: grammar ?? undefined,
        repeatPenalty: {
          frequencyPenalty: frequency_penalty ?? undefined,
          presencePenalty: presence_penalty ?? undefined,
        },
      } satisfies LLamaChatPromptOptions<any>,
    };
  }

  protected async build_stream_chunk(
    message: string,
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
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: message,
          },
          finish_reason,
        },
      ],
      model,
      created,
      usage: stream_options?.include_usage
        ? {
            ...usage,
          }
        : undefined,
    };
  }

  protected async build_response_object(content: string, stopReason: string) {
    const { usage } = await this.context;
    const {
      id,
      body: { model },
      created,
    } = this;
    return {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
            refusal: null,
          },
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
      final?: Awaited<ReturnType<LlamaChatSession["promptWithMeta"]>>
    ) => any
  ) {
    const { prompt, usage, options, session, model } = await this.context;
    const response = await session.promptWithMeta(prompt, {
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
      await this.build_stream_chunk("", response.stopReason),
      response
    );
    return await this.build_response_object(
      response.responseText,
      response.stopReason
    );
  }
}
