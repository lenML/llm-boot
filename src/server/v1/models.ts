import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { model_zoo } from "../service/ModelZoo";
import { z } from "zod";

const RESPONSE_SCHEMA = z.object({
  object: z.string(),
  data: z.array(
    z.object({
      object: z.string(),
      id: z.string(),
      created: z.number(),
      owned_by: z.string(),
      name: z.string().optional(),
    })
  ),
});

// 路由插件
const listModelsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/v1/models",
    schema: { response: { 200: RESPONSE_SCHEMA } },
    handler: async (_req, res) => {
      await model_zoo.ready;
      const data = [] as any[];
      for (const gguf of model_zoo.ggufs) {
        try {
          const model = await gguf;
          data.push({
            // The object type, which is always "model".
            object: "model",
            // The model identifier, which can be referenced in the API endpoints.
            id: model.model_id,
            // The Unix timestamp (in seconds) when the model was created.
            created: model._file_info.ctimeMs / 1000,
            // The organization that owns the model.
            owned_by: "llm-boot",

            // extra
            name: (await model._model_info)?.file_info.metadata.general.name,
          });
        } catch (error) {
          // pass
          // NOTE: 如果模型加载失败，可能导致 error
        }
      }
      const response = {
        object: "list",
        data,
      };
      res.send(response);
    },
  });
};

export default listModelsRoute;
