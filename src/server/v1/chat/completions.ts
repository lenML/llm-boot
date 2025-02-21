import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { SSEBlob } from "src/server/common/SSEBlob";
import {
  CHAT_COMPLETION_SCHEMA,
  CHAT_COMPLETION_SCHEMA_RESPONSE,
} from "./completions.schema";
import { ChatCompletion } from "./completions.instance";

const chatCompletionsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/v1/chat/completions",
    schema: {
      body: CHAT_COMPLETION_SCHEMA,
      response: {
        200: CHAT_COMPLETION_SCHEMA_RESPONSE,
      },
    },
    handler: async (req, reply) => {
      await using _l1 = await ChatCompletion.locker.acquire();
      await using chat_cmpl = new ChatCompletion(req.body);

      if (req.body.stream) {
        const blob = new SSEBlob(reply);
        try {
          await chat_cmpl.request((chunk, final) => {
            if (req.socket.closed) {
              chat_cmpl.signal.abort();
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
        const response = await chat_cmpl.request();
        return response;
      }
    },
  });
};

export default chatCompletionsRoute;
