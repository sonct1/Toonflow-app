import type { Plugin } from "vite";
import { transformSource } from "./transform.ts";

export function i18nPlugin(options: { nodes?: boolean } = {}): Plugin {
  return {
    name: "toonflowI18n",
    enforce: "pre",
    transform(source, id) {
      const path = id.replaceAll("\\", "/");
      const nodeUi = /\/packages\/(?:nodes|nodeShared|nodeScaffold)\//.test(path)
        && (path.endsWith(".vue") || /\/(?:audioSettings|useNode|showNodeError)\.ts$/.test(path));
      if (!/\/(?:apps\/web\/src|packages\/providerWeb)\//.test(path) && !(options.nodes && nodeUi)) return;
      return transformSource(source, path);
    },
  };
}
