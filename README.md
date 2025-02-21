# llm-boot
Running local LLMs is as simple as breathing.

# Roadmap
- [ ] openai compatible api
  - [x] Basic features
    - [x] `/v1/completions`
    - [x] `/v1/chat/completions`
    - [x] `/v1/embedding`
    - [x] `/v1/models`
  - [ ] Advanced features
    - [ ] logprobs
    - [ ] fake multi-model (base on whisper/florence onnx model)
    - [ ] prompt cache
    - [ ] vram manager: auto offload / vram limit / cpu limit
- [ ] Packaged to bin file
- [ ] evaluator
  - [ ] Special API provided for model evaluation

# Running

## from executable release
WIP

## from source
```
pnpm install
pnpm dev
```

# Configure
运行程序需要在执行目录下创建一个配置文件 `boot.config.json`

```json
{
  "server": {
    "port": 4567
  },
  "no_docs": false,
  "model_dirs": ["~/llm_models","~/ggufs"]
}
```

# LICENSE
AGPL-3.0 license
