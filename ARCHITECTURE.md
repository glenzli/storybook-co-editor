# Architecture

The code tree is the project index. New behavior belongs to the narrowest stable
owner below; application roots compose owners and do not absorb their policies.

## Owners

- `app/src/project/`: TypeScript project data contract, migration, recent-project
  persistence, history, and externally-originated update propagation.
- `app/src/text-design/`: Reproducible composite text treatments, adaptive wash
  contours, bounded local candidate search and per-page application.
- `app/src/story/`: Story script language and its parsing and validation policy.
- `app/src/publication/`: Versioned web publication schema, frozen text layout,
  and `.scpub` export lifecycle.
- `app/src/editor/`: Editor-specific collection projection and asynchronous
  receive lifecycles.
- `app/src/components/right-sidebar/`: Cohesive right-sidebar interaction
  regions, including script editing and Codex proposal review.
- `app/src/components/ai/`: Editor AI preference, client connection controls,
  shared Codex model selection, and review-first proposal dialogs.
- `app/src/print/`: Print imposition and print-specific layout policy.
- `app/src/utils/`: Legacy owner location. It is ratcheted and cannot accept new
  production files. Move a complete responsibility out when changing it.
- `app/src-tauri/src/project_model.rs`: Native project serialization contract.
- `app/src-tauri/src/project_storage.rs`: The only owner of `project.json`.
- `app/src-tauri/src/project_archive.rs`: `.scproj` extraction and atomic writing.
- `app/src-tauri/src/publication_archive.rs`: `.scpub` validation, digest checks,
  safe archive paths, and atomic writing.
- `app/src-tauri/src/project_manager.rs`: Active project session commands.
- `app/src-tauri/src/project_operations.rs`: Serialized project reads and
  revision-checked external mutations shared by MCP and the frontend.
- `app/src-tauri/src/receiver.rs`: Local extension protocol, receive batches,
  image ingestion, trash operations, and receiver events.
- `app/src-tauri/src/mcp_server.rs`: Authenticated loopback MCP transport,
  access-token generation and rotation lifecycle, resources, and project tools.
- `app/src-tauri/src/codex_mcp_config.rs`: Confirmed installation of the local
  Storybook MCP registration into the user's Codex configuration.
- `app/src-tauri/src/codex_app_server.rs`: Codex App Server process and JSON-RPC
  session lifecycle shared by local Codex features.
- `app/src-tauri/src/codex_text_design.rs`: Cancellable, bounded visual review of
  rendered candidates through Codex, with isolated temporary inputs and no project writes.
- `app/src-tauri/src/codex_polish.rs`: Structured story-polish and translation
  proposals, including publication-field localization policy.
- `app/src-tauri/src/codex_image_edit.rs`: Isolated source-image preparation,
  Codex image-generation lifecycle, candidate validation, and confirmation-only
  page creation or image replacement.
- `app/src-tauri/src/lib.rs`: Tauri composition and command registration only.
- `extension/src/`: Browser-side extraction and receiver client.

`fixtures/project-v2.json` is the legacy project compatibility contract. Current
project schemas use dated `YYYYMMDD.NN` strings; format changes must update the
TypeScript migration test and Rust serialization test. MCP and Codex operations
do not change the project schema. Codex image candidates remain outside `.scproj`
until the user confirms replacement.

`fixtures/publication-20260906.01/` is the cross-language web publication
contract. Its manifest digest and packaged WebP digest are checked by TypeScript
and Rust.

## Growth Rules

Before adding substantial behavior, describe the current owner in one sentence.
Keep a cohesive extension in that owner. Give a new lifecycle, policy, protocol,
or independently changing UI region its own responsibility-named owner.

Do not split by line count. Keep tightly coupled render stages and native protocol
lifecycles together. Avoid forwarding-only files and generic names such as
`helpers`, `common`, `misc`, or new `utils`.

When moving a responsibility, move its state, invariants, failure policy, and
focused tests together. Preserve project JSON, Tauri command names, local HTTP
routes, event payloads, page ordering, and PDF behavior.

## Automated Checks

Run all maintained checks:

```sh
./scripts/check.sh
```

`node scripts/check-architecture.mjs` enforces semantic ownership and the exact
legacy `utils/` baseline. When a legacy utility is moved, remove its old path from
`architecture-baseline.json`; never replace it with a new allowance.
