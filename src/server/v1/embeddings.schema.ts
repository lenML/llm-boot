import { z } from "zod";

export const EMBEDDINGS_SCHEMA = z.object({
  input: z.union([
    z.string(),
    z.array(
      z.union([
        z.string(),
        z.object({
          type: z.enum(["text", "image-base64", "image-url"]),
          content: z.string(),
        }),
      ])
    ),
  ]),
  model: z.string(),
  encoding_format: z.enum(["float", "base64"]).optional().default("float"),
  dimensions: z.number().nullable().optional(),
  user: z.string().nullable().optional(),
});

export const EMBEDDINGS_SCHEMA_RESPONSE = z.object({
  object: z.string(),
  data: z.array(
    z.object({
      index: z.number(),
      object: z.string(),
      embedding: z.array(z.number()),
    })
  ),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    total_tokens: z.number(),
  }),
});
