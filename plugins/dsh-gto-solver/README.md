# dsh-gto-solver

Tree-out DSH Cordis plugin for the local GTO Solver API. It is intentionally
kept outside `engines/dsh` and exposed through `ctx.tools` and `ctx.jobs`.

Tools:

- `gto_get_state`
- `gto_set_spot`
- `gto_start_solve`
- `gto_get_solve_status`
- `gto_query_strategy`

`gto_start_solve` is the only tool that asks for approval. The pre-execute gate
checks the revision, configured budget, active-job limit, and then emits an
approval request through the DSH tools pipeline. Approved work starts a DSH
background job and returns its DSH job id. The plugin stores the GTO job id
inside that job so status and strategy queries can resolve it.

The plugin reads the GTO discovery file, performs the WebSocket JSON-RPC
handshake, reconnects on transport loss, and calls `state.get` after reconnect
to recover current Solver state. The discovery token is never logged or stored
in job output.

Run the dependency-free protocol/policy tests with:

```bash
node --experimental-strip-types --test tests/*.test.ts
```

The full plugin relies on the DSH packages listed as peer dependencies and is
installed into an `acp` profile by the host application.
