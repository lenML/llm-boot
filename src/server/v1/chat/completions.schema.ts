import { z } from "zod";

export const CHAT_COMPLETION_SCHEMA = z.object({
  model: z.string().describe("ID of the model to use."),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.union([
          z.string(),
          z.array(
            z.union([
              z.object({
                type: z.literal("text"),
                text: z.string(),
              }),
              z.object({
                type: z.literal("image_url"),
                image_url: z.object({
                  url: z.string(),
                }),
              }),
              z.object({
                type: z.literal("audio"),
                input_audio: z.object({
                  data: z.string(),
                  format: z.string(),
                }),
              }),
            ])
          ),
        ]),
      })
    )
    .describe("A list of messages comprising the conversation so far."),
  store: z.boolean().nullable().optional().default(false),
  metadata: z.record(z.string()).nullable().optional(),
  frequency_penalty: z.number().min(-2.0).max(2.0).nullable().optional(),
  logit_bias: z.record(z.number()).nullable().optional(),
  logprobs: z.boolean().nullable().optional(),
  top_logprobs: z.number().int().min(0).max(20).nullable().optional(),
  max_tokens: z.number().nullable().optional(),
  max_completion_tokens: z.number().nullable().optional(),
  n: z.number().int().nullable().optional().default(1),
  modalities: z.array(z.string()).nullable().optional(),
  prediction: z.record(z.any()).nullable().optional(),
  audio: z.record(z.any()).nullable().optional(),
  presence_penalty: z.number().min(-2.0).max(2.0).nullable().optional(),
  response_format: z.record(z.any()).nullable().optional(),
  seed: z.number().int().nullable().optional(),
  service_tier: z.enum(["auto", "default"]).nullable().optional(),
  stop: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  stream: z.boolean().nullable().optional().default(false),
  stream_options: z.record(z.any()).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional().default(1),
  top_p: z.number().min(0).max(1).nullable().optional().default(1),
  tools: z
    .array(
      z.object({
        type: z.string(),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.any()),
        }),
      })
    )
    .optional(),
  tool_choice: z
    .union([
      z.string(),
      z.object({
        type: z.string(),
        function: z.object({ name: z.string() }),
      }),
    ])
    .nullable()
    .optional(),
  parallel_tool_calls: z.boolean().nullable().optional().default(true),
  user: z.string().optional(),
});

export const CHAT_COMPLETION_SCHEMA_RESPONSE = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      message: z.object({
        role: z.string(),
        content: z.string(),
        refusal: z.string().nullable(),
      }),
      logprobs: z.null(),
      finish_reason: z.string(),
    })
  ),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});
