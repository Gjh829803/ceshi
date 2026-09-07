import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

// Compile the existing Authoring schemas during development, never in the
// Hosted browser. Node and browser consumers use these same generated functions.
const root = path.resolve(import.meta.dirname, "../../packages/authoring/src");
const ajv = new Ajv2020({
  allErrors: true, strict: true, validateFormats: true,
  code: { esm: true, lines: true, source: true },
});
const formats = {
  "worldkit-resource-ref": /^(?:worldkit|package|asset):\/\/[a-z0-9][a-z0-9./_-]*(?:@[1-9][0-9]*)?$/,
  "subject-definition-ref": /^(?:worldkit|package):\/\/subject-definition\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/,
  "capability-ref": /^worldkit:\/\/capability\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/,
  "physics-body-profile-ref": /^worldkit:\/\/physics-body-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/,
  "locomotion-profile-ref": /^worldkit:\/\/locomotion-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/,
  "collider-derivation-profile-ref": /^worldkit:\/\/collider-derivation-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/,
  "package-prototype-ref": /^package:\/\/prototype\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/,
};
for (const [name, pattern] of Object.entries(formats)) ajv.addFormat(name, pattern);
for (const name of ["subject-definition-v1.schema.json", "subject-design-v1.schema.json"]) {
  ajv.addSchema(JSON.parse(await readFile(path.join(root, name), "utf8")));
}
const source = standaloneCode(ajv, {
  validateSubjectDefinitionV1: "worldkit://schema/subject-definition@1",
  validateSubjectDesign: "worldkit://schema/subject-design@1",
}).replace(/^const (\w+) = require\("([^"]+)"\)\.default;$/gm,
  (_match, binding: string, moduleSpecifier: string) => {
    const specifier = moduleSpecifier.endsWith(".js") ? moduleSpecifier : `${moduleSpecifier}.js`;
    return `import ${binding}Module from "${specifier}";\nconst ${binding} = typeof ${binding}Module === "function" ? ${binding}Module : ${binding}Module.default;`;
  });
if (/\brequire\s*\(|\bnew Function\s*\(|\beval\s*\(/u.test(source)) {
  throw new Error("AUTHORING_SUBJECT_VALIDATOR_BROWSER_DEPENDENCY_INVALID");
}
const expected = `${source.trimEnd()}\n`;
const outputPath = path.join(root, "subject-validators.generated.mjs");
if (process.argv.includes("--write")) await writeFile(outputPath, expected);
else if (await readFile(outputPath, "utf8").catch(() => "") !== expected) {
  throw new Error("AUTHORING_SUBJECT_VALIDATOR_STALE: run pnpm generate:subject-validators");
}
