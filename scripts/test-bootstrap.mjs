import os from "node:os";
import { registerHooks } from "node:module";

// `server-only` intentionally throws outside a React Server Component build.
// Tests exercise server services directly, so resolve only that marker to an
// empty module while preserving the production boundary.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: new URL("../node_modules/server-only/empty.js", import.meta.url).href,
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    username: process.env.USERNAME || "restropilot-test",
    uid: -1,
    gid: -1,
    shell: null,
    homedir: process.cwd(),
  });
}
