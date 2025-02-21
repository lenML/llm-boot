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
    - [ ] vram manager: auto offload
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


# LICENSE
AGPL-3.0 license
