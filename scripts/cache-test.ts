import { getLlama, LlamaChatSession } from "node-llama-cpp";

async function main() {
  console.time("model loading...");
  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath:
      "D:/llm_models/LenML/gemma-2-2b-it-abliterated/gemma-2-2b-it-abliterated-Q6_K.gguf",
  });
  console.timeEnd("model loading...");
  const context = await model.createContext({});
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: "You are a helpful assistant.",
    forceAddSystemPrompt: true,
  });

  const options = { temperature: 0 };
  await session.prompt("请详细解释什么是llama?", options);
  await session.prompt("不够详细，并且请使用中文", options);
  const chatHistory = session.getChatHistory();
  // console.log(chatHistory);

  const q2 = "回复：测试成功";
  for (let idx = 0; idx < 3; idx++) {
    session.setChatHistory(chatHistory);

    console.time(`Prompt ${idx + 1}`);
    const a2 = await session.prompt(q2, options);
    console.timeEnd(`Prompt ${idx + 1}`);
    // console.log("AI: " + a2);
  }
}

main();
