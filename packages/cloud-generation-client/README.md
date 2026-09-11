# Cloud generation client

`@worldkit/cloud-generation-client` exports the existing LWDP generation-service
client: configuration, HTTP requests, submission, request-ID lookup, polling,
cancellation and artifact transfer. Creator Cloud and Episode consume the same
transport. Keep uncertain submissions tied to their original request identity.

Run `pnpm --filter @worldkit/cloud-generation-client test` for mocked transport
checks. Tests and installation do not authorize real generation or cancellation.
