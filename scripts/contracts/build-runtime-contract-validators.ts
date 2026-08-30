import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const schemaPath = path.join(
  repositoryRoot,
  "packages/runtime-contracts/src/world-runtime-bootstrap-v1.schema.json",
);
const outputPath = path.join(
  repositoryRoot,
  "packages/runtime-contracts/src/world-runtime-bootstrap-validator.generated.mjs",
);

async function generatedSource(): Promise<string> {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    code: { esm: true, lines: true, source: true },
  });
  const validate = ajv.compile(schema);
  const source = standaloneCode(ajv, validate)
    .replace(
      /^const (\w+) = require\("([^"]+)"\)\.default;$/gm,
      (_match, binding: string, moduleSpecifier: string) => {
        const esmModuleSpecifier = moduleSpecifier.endsWith(".js")
          ? moduleSpecifier
          : `${moduleSpecifier}.js`;
        const moduleBinding = `${binding}Module`;
        return [
          `import ${moduleBinding} from "${esmModuleSpecifier}";`,
          `const ${binding} = typeof ${moduleBinding} === "function" ? ${moduleBinding} : ${moduleBinding}.default;`,
        ].join("\n");
      },
    )
    .trimEnd();
  if (/\brequire\s*\(/u.test(source)) {
    throw new Error(
      "WORLDKIT_RUNTIME_CONTRACT_VALIDATOR_COMMONJS_RUNTIME_DEPENDENCY",
    );
  }
  return `${source}\n`;
}

async function main(): Promise<void> {
  const expected = await generatedSource();
  if (process.argv.includes("--write")) {
    await writeFile(outputPath, expected);
    return;
  }
  const actual = await readFile(outputPath, "utf8").catch(() => "");
  if (actual !== expected) {
    throw new Error(
      "WORLDKIT_RUNTIME_CONTRACT_VALIDATOR_STALE: run pnpm generate:runtime-contract-validators",
    );
  }
}

await main();
