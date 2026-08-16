import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const templatesRoot = path.join(repositoryRoot, "templates");
const templateDirectoryByType = new Map([
  ["manifest", "manifest-plugin"],
  ["process", "process-plugin"],
  ["wasm", "wasm-plugin"],
]);
const pluginIdPattern = /^[a-z0-9][a-z0-9.-]*$/;

const usage = `Usage:
  node scripts/create-plugin.mjs <target-directory> \\
    --type <manifest|process|wasm> \\
    --id <reverse-domain-id> \\
    --name <display-name> \\
    --author <author-name>

Example:
  node scripts/create-plugin.mjs ../my-plugin \\
    --type process \\
    --id com.example.my-plugin \\
    --name "My Plugin" \\
    --author "Your Name"
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(usage);
  process.exit(0);
}

const { targetArgument, options } = parseArguments(process.argv.slice(2));
const pluginId = requireOption(options, "id");
const pluginName = requireOption(options, "name");
const pluginAuthor = requireOption(options, "author");
const pluginType = options.get("type") ?? "process";

if (!targetArgument) {
  fail("A target directory is required.");
}
if (!pluginIdPattern.test(pluginId)) {
  fail("Plugin id must use lowercase reverse-domain characters.");
}
const templateDirectoryName = templateDirectoryByType.get(pluginType);
if (!templateDirectoryName) {
  fail(`Unsupported plugin type: ${pluginType}`);
}

const targetDirectory = path.resolve(targetArgument);
if (fs.existsSync(targetDirectory)) {
  fail(`Target already exists: ${targetDirectory}`);
}
const targetWithinTemplates = path.relative(templatesRoot, targetDirectory);
if (!targetWithinTemplates.startsWith("..") && !path.isAbsolute(targetWithinTemplates)) {
  fail("Target directory cannot be created inside the templates directory.");
}

// Copy the distributable template without carrying local build artifacts.
const sourceTemplateDirectory = path.join(templatesRoot, templateDirectoryName);
const generatedSourcePaths = [
  path.join(sourceTemplateDirectory, "dist"),
  path.join(sourceTemplateDirectory, "plugin.wasm"),
  path.join(sourceTemplateDirectory, "target"),
];
fs.cpSync(sourceTemplateDirectory, targetDirectory, {
  recursive: true,
  filter(sourcePath) {
    return !generatedSourcePaths.some((generatedPath) =>
      sourcePath === generatedPath || sourcePath.startsWith(`${generatedPath}${path.sep}`));
  },
});

const manifestPath = path.join(targetDirectory, "plugin.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.id = pluginId;
manifest.name = pluginName;
manifest.description = `${pluginName} for OxideTerm.`;
manifest.author = pluginAuthor;
if (manifest.contributes?.tabs?.[0]) {
  manifest.contributes.tabs[0].title = pluginName;
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(`Created ${pluginName} (${pluginType}) in ${targetDirectory}\n\n`);
process.stdout.write("Next steps:\n");
process.stdout.write(`  cd ${JSON.stringify(targetDirectory)}\n`);
process.stdout.write("  npm run check\n");
process.stdout.write("  Read README.md or README.en.md before packaging.\n");

function parseArguments(argumentsList) {
  let targetArgument = null;
  const options = new Map();

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) {
      if (targetArgument !== null) {
        fail(`Unexpected positional argument: ${argument}`);
      }
      targetArgument = argument;
      continue;
    }

    const optionName = argument.slice(2);
    if (!["type", "id", "name", "author"].includes(optionName)) {
      fail(`Unknown option: ${argument}`);
    }
    const optionValue = argumentsList[index + 1];
    if (!optionValue || optionValue.startsWith("--")) {
      fail(`Missing value for ${argument}`);
    }
    options.set(optionName, optionValue.trim());
    index += 1;
  }

  return { targetArgument, options };
}

function requireOption(options, optionName) {
  const value = options.get(optionName);
  if (!value) {
    fail(`Missing required option: --${optionName}`);
  }
  return value;
}

function fail(message) {
  process.stderr.write(`${message}\n\n${usage}`);
  process.exit(1);
}
