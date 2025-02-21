import {
  LlamaModel,
  Tokenizer,
  ChatWrapper,
  GgufFileInfo,
  LlamaModelTokens,
  resolveChatWrapper,
  GeneralChatWrapper,
  Token,
  ChatHistoryItem,
  LlamaContext,
  LlamaChatSession,
  LlamaContextSequence,
  LlamaCompletion,
} from "node-llama-cpp";
import fs from "fs";
import { PDisposable } from "../common/PDisposable";
import { LlamaCpp } from "./llama";
import { AsyncLock } from "../common/AsyncLock";

export class GgufModel extends PDisposable {
  _model_info: Promise<{
    tokenizer_model: LlamaModel;
    tokenizer: Tokenizer;
    chat_wrapper: ChatWrapper;
    file_info: GgufFileInfo;
    filename?: string;
    tokens: LlamaModelTokens;
    size: number;
    flash_att_supported: boolean;
    train_context_size: number;
    embedding_vector_size: number;
    vocabulary_type: string;
  } | null>;
  _file_info: fs.Stats;

  _model: null | Promise<LlamaModel | null> = null;
  _context: null | Promise<LlamaContext | null> = null;
  _sequence: null | Promise<LlamaContextSequence> = null;
  _chat_session: null | Promise<LlamaChatSession> = null;
  _completion: null | Promise<LlamaCompletion> = null;

  /**
   * NOTE: 暂时只支持串行单 sequence 因为不太理解 node-llama-cpp 里面的并行是如何实现的
   */
  _sequence_lock = new AsyncLock();

  constructor(readonly modelPath: string, readonly model_id: string) {
    super();
    this._model_info = this.load_model_info();
    this._file_info = fs.statSync(modelPath);

    this.onDisposed(async () => {
      console.log(`[model_zoo]dispose: ${modelPath}`);
      await this.unload_model();
      await this.unload_tokenizer();
    });
  }

  protected async load_model_info() {
    console.log(`[gguf]loading model info: ${this.modelPath}`);
    const { modelPath } = this;
    const llama = await LlamaCpp.getLlama();
    let model: LlamaModel | null = null;
    try {
      model = await llama.loadModel({
        modelPath,
        // load to cpu
        gpuLayers: 0,
        vocabOnly: true,
      });
      const chatWrapper =
        resolveChatWrapper({
          bosString: model.tokens.bosString,
          filename: model.filename,
          fileInfo: model.fileInfo,
          tokenizer: model.tokenizer,
        }) ?? new GeneralChatWrapper();
      return {
        tokenizer_model: model,
        tokenizer: model.tokenizer,
        chat_wrapper: chatWrapper,
        file_info: model.fileInfo,
        filename: model.filename,
        tokens: model.tokens,
        size: model.size,
        flash_att_supported: model.flashAttentionSupported,
        train_context_size: model.trainContextSize,
        embedding_vector_size: model.embeddingVectorSize,
        vocabulary_type: model.vocabularyType,
      };
    } catch (error) {
      console.error("[gguf]load model info error", error);
      if (model) {
        await model.dispose();
      }
      return null;
    }
  }

  async unload_tokenizer() {
    await (await this._model_info)?.tokenizer_model.dispose();
  }

  async load_model() {
    if (!this._model) {
      this._model = this._load_model();
    }
    const model = await this._model;
    if (!model) {
      throw new Error(`[gguf]model ${this.modelPath} load failed`);
    }
    return model;
  }

  protected async _load_model() {
    console.log(`[gguf]loading model: ${this.modelPath}`);
    const { modelPath } = this;
    const llama = await LlamaCpp.getLlama();
    let model: LlamaModel | null = null;
    try {
      model = await llama.loadModel({
        modelPath,
        defaultContextFlashAttention: true,
        gpuLayers: "auto",
      });
      return model;
    } catch (error) {
      console.error("[gguf]load model error", error);
      if (model) {
        await model.dispose();
      }
      return null;
    }
  }

  async get_context(createSignal: AbortSignal) {
    if (!this._context) {
      this._context = this._create_context(createSignal);
    }
    const context = await this._context;
    if (context === null) {
      throw new Error(`[gguf]context ${this.modelPath} load failed`);
    }
    return context;
  }

  protected async _create_context(createSignal: AbortSignal) {
    console.log(`[gguf]creating context: ${this.modelPath}`);
    const llm_model = await this.load_model();
    const context = await llm_model.createContext({
      createSignal,
    });

    return context;
  }

  async get_chat_session(createSignal: AbortSignal) {
    if (!this._chat_session) {
      this._chat_session = this._create_chat_session(createSignal);
    }
    return this._chat_session;
  }

  protected async _create_chat_session(createSignal: AbortSignal) {
    console.log(`[gguf]creating chat session: ${this.modelPath}`);
    const contextSequence = await this.get_sequence(createSignal);
    const session = new LlamaChatSession({
      contextSequence,
      forceAddSystemPrompt: true,
      autoDisposeSequence: false,
    });
    return session;
  }

  async get_completion(createSignal: AbortSignal) {
    if (!this._completion) {
      this._completion = this._create_completion(createSignal);
    }
    return this._completion;
  }

  protected async _create_completion(createSignal: AbortSignal) {
    const contextSequence = await this.get_sequence(createSignal);
    const completion = new LlamaCompletion({
      contextSequence,
      autoDisposeSequence: false,
    });
    return completion;
  }

  async get_sequence(createSignal: AbortSignal) {
    if (!this._sequence) {
      this._sequence = this._create_sequence(createSignal);
    }
    return this._sequence;
  }

  protected async _create_sequence(createSignal: AbortSignal) {
    const context = await this.get_context(createSignal);
    const sequence = context.getSequence();
    return sequence;
  }

  async unload_model() {
    await (await this._model)?.dispose();
    await (await this._context)?.dispose();
    await (await this._chat_session)?.dispose();
    this._chat_session = null;
    this._model = null;
    this._context = null;
  }

  protected async assert_model_info() {
    const model_info = await this._model_info;
    if (!model_info) {
      throw new Error(`[gguf]model ${this.modelPath} not loaded`);
    }
    return model_info;
  }

  async encode(
    text: string,
    {
      specialTokens,
      options,
    }: { specialTokens?: boolean; options?: "trimLeadingSpace" } = {}
  ) {
    const { tokenizer } = await this.assert_model_info();
    return tokenizer(text, specialTokens, options);
  }

  async decode(
    tokens: Token[],
    {
      specialTokens,
      lastTokens,
    }: { specialTokens?: boolean; lastTokens?: readonly Token[] } = {}
  ) {
    const { tokenizer } = await this.assert_model_info();
    return tokenizer.detokenize(tokens, specialTokens, lastTokens);
  }

  async chat_template(
    messages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[]
  ) {
    const { chat_wrapper } = await this.assert_model_info();
    const chatHistory: ChatHistoryItem[] = messages.map((x) => {
      const { role, content } = x;
      switch (role) {
        case "assistant": {
          return {
            type: "model",
            response: [content],
          };
        }
        case "user":
        case "system":
          return {
            type: role,
            text: content,
          };
      }
    });
    return chat_wrapper.generateContextState({
      chatHistory,
    }).contextText;
  }
}
