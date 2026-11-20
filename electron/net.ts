// Every web request Lumen makes gets a deadline.
//
// Node's fetch waits forever by default. A store or art site that accepts the connection and then
// says nothing would leave a scan, an artwork run or the deals page hanging with a spinner that
// never stops, and the one-at-a-time guards (`enriching`, `scanInFlight`) would stay shut with it.
// Patching the global here covers every module in one place; a caller that passes its own
// `signal` keeps it.
const real = globalThis.fetch;

export const NET_TIMEOUT_MS = 30000;

globalThis.fetch = ((input: any, init: any = {}) =>
  real(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(NET_TIMEOUT_MS) })) as typeof fetch;
