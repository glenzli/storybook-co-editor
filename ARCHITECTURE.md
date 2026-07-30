# Architecture

The code tree is the project index. New behavior belongs to the narrowest stable
owner below; application roots compose owners and do not absorb their policies.

## Owners

- `app/src/project/`: TypeScript project data contract, migration, recent-project
  persistence, and history.
- `app/src/story/`: Story script language and its parsing and validation policy.
- `app/src/editor/`: Editor-specific collection projection and asynchronous
  receive lifecycles.
- `app/src/print/`: Print imposition and print-specific layout policy.
- `app/src/utils/`: Legacy owner location. It is ratcheted and cannot accept new
  production files. Move a complete responsibility out when changing it.
- `app/src-tauri/src/project_model.rs`: Native project serialization contract.
- `app/src-tauri/src/project_storage.rs`: The only owner of `project.json`.
- `app/src-tauri/src/project_archive.rs`: `.scproj` extraction and atomic writing.
- `app/src-tauri/src/project_manager.rs`: Active project session commands.
- `app/src-tauri/src/receiver.rs`: Local extension protocol, receive batches,
  image ingestion, trash operations, and receiver events.
- `app/src-tauri/src/lib.rs`: Tauri composition and command registration only.
- `extension/src/`: Browser-side extraction and receiver client.

`fixtures/project-v2.json` is the cross-language serialization contract. Format
changes must update both the TypeScript migration test and Rust round-trip test.
Metadata additions remain schema v2 while they are optional and backward
compatible.

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
