import { FastifyReply } from "fastify";

export class SSEBlob {
  is_done = false;

  constructor(readonly reply: FastifyReply) {
    this.write_headers();
  }

  protected write_headers() {
    this.reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // TODO: full CORS
      "Access-Control-Allow-Origin": "*",
      "Transfer-Encoding": "chunked",
    });
  }

  assert_not_done() {
    if (this.is_done) {
      throw new Error("Already done");
    }
  }

  write(chunk: string) {
    this.assert_not_done();
    this.reply.raw.write("data: " + chunk + "\n\n");
  }

  done() {
    this.assert_not_done();
    this.write("[DONE]");
    this.abort();
  }

  abort() {
    this.assert_not_done();
    this.is_done = true;
    this.reply.raw.end();
  }
}
