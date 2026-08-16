import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { buildSite } from "./src/build.js";

const projectRoot = import.meta.dirname;
const devOutput = path.join(projectRoot, ".dev");

await buildSite({ outputDirectory: devOutput, minify: false });

function staticSiteReload(): Plugin {
  let rebuilding = false;
  let rebuildQueued = false;
  let timer: NodeJS.Timeout | undefined;

  async function rebuild(server: ViteDevServer): Promise<void> {
    if (rebuilding) {
      rebuildQueued = true;
      return;
    }

    rebuilding = true;
    try {
      await buildSite({ outputDirectory: devOutput, minify: false });
      server.ws.send({ type: "full-reload" });
    } catch (error) {
      server.config.logger.error(
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
    } finally {
      rebuilding = false;
      if (rebuildQueued) {
        rebuildQueued = false;
        await rebuild(server);
      }
    }
  }

  return {
    name: "static-site-reload",
    configureServer(server) {
      const watchedDirectories = [
        path.join(projectRoot, "template"),
        path.join(projectRoot, "articles"),
      ];
      server.watcher.add(watchedDirectories);
      server.watcher.on("all", (_event, changedPath) => {
        if (!watchedDirectories.some((directory) => changedPath.startsWith(directory))) {
          return;
        }

        clearTimeout(timer);
        timer = setTimeout(() => void rebuild(server), 50);
      });
    },
  };
}

export default defineConfig({
  root: devOutput,
  publicDir: false,
  plugins: [staticSiteReload()],
  build: {
    outDir: path.join(projectRoot, "build"),
  },
  server: {
    open: true,
  },
});
