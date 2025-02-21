import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  COMPLETION_SCHEMA,
  COMPLETION_SCHEMA_RESPONSE,
} from "./completions.schema";
import { Completion } from "./completions.instance";
import { SSEBlob } from "../common/SSEBlob";

const completionsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/v1/completions",
    schema: {
      body: COMPLETION_SCHEMA,
      response: { 200: COMPLETION_SCHEMA_RESPONSE },
    },
    handler: async (req, reply) => {
      await using _l1 = await Completion.locker.acquire();
      await using cmpl = new Completion(req.body);

      if (req.body.stream) {
        const blob = new SSEBlob(reply);
        try {
          await cmpl.request((chunk, final) => {
            if (req.socket.closed) {
              cmpl.signal.abort();
              return;
            }
            blob.write(JSON.stringify(chunk));
          });
        } catch (err) {
          console.error(err);
        } finally {
          blob.done();
        }
      } else {
        const response = await cmpl.request();
        return response;
      }
    },
  });
};

export default completionsRoute;
