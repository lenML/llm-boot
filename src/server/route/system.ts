import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { LlamaCpp } from "../service/llama";

// 路由插件
const systemStatRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/system",
    handler: async (_req, res) => {
      const llama = await LlamaCpp.getLlama();
      const response = {
        ok: true,
        message: null,
        engine: {
          GpuDeviceNames: await llama.getGpuDeviceNames(),
          SwapState: await llama.getSwapState(),
          VramState: await llama.getVramState(),
          gpu: llama.gpu,
          supportsGpuOffloading: llama.supportsGpuOffloading,
          supportsMmap: llama.supportsMmap,
          gpuSupportsMmap: llama.gpuSupportsMmap,
          supportsMlock: llama.supportsMlock,
          cpuMathCores: llama.cpuMathCores,
          maxThreads: llama.maxThreads,
          logLevel: llama.logLevel,
          buildType: llama.buildType,
          cmakeOptions: llama.cmakeOptions,
          llamaCppRelease: llama.llamaCppRelease,
          systemInfo: llama.systemInfo,
          vramPaddingSize: llama.vramPaddingSize,
        },
      };
      res.send(response);
    },
  });
};

export default systemStatRoute;
