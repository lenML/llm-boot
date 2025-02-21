import { z } from "zod";

export const COMPLETION_SCHEMA = z.object({
  model: z.string(),
  prompt: z.union([z.string(), z.array(z.string())]),
  best_of: z.number().nullable().optional().default(1),
  echo: z.boolean().nullable().optional().default(false),
  frequency_penalty: z
    .number()
    .min(-2.0)
    .max(2.0)
    .nullable()
    .optional()
    .default(0),
  logit_bias: z.record(z.number()).nullable().optional(),
  logprobs: z.number().int().max(5).nullable().optional(),
  max_tokens: z.number().nullable().optional().default(16),
  n: z.number().int().nullable().optional().default(1),
  presence_penalty: z
    .number()
    .min(-2.0)
    .max(2.0)
    .nullable()
    .optional()
    .default(0),
  seed: z.number().int().nullable().optional(),
  stop: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  stream: z.boolean().nullable().optional().default(false),
  stream_options: z.record(z.any()).nullable().optional(),
  suffix: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional().default(1),
  top_p: z.number().min(0).max(1).nullable().optional().default(1),
  user: z.string().nullable().optional(),
});

export const COMPLETION_SCHEMA_RESPONSE = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      text: z.string(),
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
