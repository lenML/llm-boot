import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  EMBEDDINGS_SCHEMA,
  EMBEDDINGS_SCHEMA_RESPONSE,
} from "./embeddings.schema";
import { Embeddings } from "./embeddings.instance";

const embeddingsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/v1/embeddings",
    schema: {
      body: EMBEDDINGS_SCHEMA,
      response: { 200: EMBEDDINGS_SCHEMA_RESPONSE },
    },
    handler: async (req, reply) => {
      await using _l1 = await Embeddings.locker.acquire();
      await using embed = new Embeddings(req.body)

      const embeddings = await embed.request();
      const response = {
        object: "list",
        data: embeddings.map((emb, index) => {
          return {
            index,
            object: "embedding",
            embedding: emb.embedding.vector as number[],
          };
        }),
        model: req.body.model,
        usage: await embed.getUsage(),
      };

      reply.send(response);
    },
  });
};

export default embeddingsRoute;
