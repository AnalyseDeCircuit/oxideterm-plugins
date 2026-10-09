import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { checkIssue, evaluateIssue, INCOMPLETE_LABEL, EXEMPT_LABEL } from "./issue-quality.mjs";

const bugBody = `### Plugin name or ID / 插件名称或 ID
VNC
### Plugin version / 插件版本
0.1.0
### OxideTerm version / 应用版本
2.2.2
### OS version and architecture / 系统版本与架构
Windows 11 x64
### Related environment and configuration / 相关环境与配置
TigerVNC 1.14, password authentication, direct connection to port 5900.
### Steps to reproduce / 复现步骤
1. Open OxideTerm and install VNC.
2. Create a VNC connection with password authentication.
3. Connect to the server.
### Expected and actual behavior / 预期与实际结果
Expected the desktop to appear. Actual: VNC session closed.
### Checklist / 提交前确认
- [x] I searched existing issues. / 我已搜索已有 Issue。
- [x] I provided the installed versions and written reproduction steps. / 我已填写已安装版本和文字复现步骤。
- [x] I removed passwords, private keys, tokens and other secrets. / 我已删除密码、私钥、令牌及其他敏感信息。
`;

const featureBody = `### Existing or proposed plugin / 涉及的插件或拟新增插件
VNC
### Problem or use case / 问题或使用场景
The username field appears mandatory even for password-only authentication.
### Desired behavior / 期望行为
Explain that the username is optional for password-only authentication.
### Checklist / 提交前确认
- [x] I searched existing issues and plugin documentation. / 我已搜索已有 Issue 和插件文档。
- [x] I described a concrete use case and desired behavior. / 我已说明具体使用场景和期望行为。
`;

const submissionBody = `### Request type / 申请类型
Metadata-only update / 仅更新展示信息
### Plugin ID / 插件 ID
com.example.preview
### Display name / 展示名称
Example Preview
### Marketplace description / 市场描述
Preview example files.
### Author or organization / 作者或组织
Example
### Source repository / 源码仓库
https://github.com/example/preview
### License / 许可证
MIT
### Submitted version / 提交版本
1.0.0
### Supported OxideTerm range / 宿主兼容范围
>=2.2.2
### Packages, targets, sizes, and SHA-256 / 安装包、目标、大小和 SHA-256
Package data is unchanged.
### Requested capabilities / 申请的能力
None
### Changes in this request / 本次变化
Correct the description.
### Tested platforms / 已测试平台
Windows 11 x64: opened an example file.
### Declarations / 声明
- [x] The plugin ID is stable and matches plugin.json. / 插件 ID 稳定且与 plugin.json 一致。
- [x] For package changes, the release assets are immutable and the submitted digests match them. / 如包含安装包变化，发布资产不可变且提交的摘要与资产一致。
- [x] I am authorized to distribute the plugin and its bundled dependencies. / 我有权分发该插件及其捆绑依赖。
- [x] The package and catalog text do not contain credentials or other secrets. / 安装包和目录文案不包含凭据或其他秘密。
`;

function replaceSection(body, heading, answer) {
  const prefix = `### ${heading}\n`;
  const start = body.indexOf(prefix) + prefix.length;
  const next = body.indexOf("\n### ", start);
  return body.slice(0, start) + answer + body.slice(next < 0 ? body.length : next);
}

test("complete forms and unlabeled API reports are accepted without release-version lookup", () => {
  for (const [title, body] of [["[Bug] VNC fails", bugBody], ["VNC fails", bugBody], ["[Feature] Username help", featureBody], ["[Plugin] Metadata update", submissionBody]]) {
    assert.deepEqual(evaluateIssue({ title, body }), [], title);
  }
  for (const version of ["v2.2.2", "2.3.0-beta.1", "2.3.0-local.1", "cargo run (commit abc123)"]) {
    assert.deepEqual(evaluateIssue({ title: "VNC fails", body: bugBody.replace("\n2.2.2\n", `\n${version}\n`) }), [], version);
  }
  assert.deepEqual(evaluateIssue({ title: "VNC fails", body: replaceSection(bugBody, "Related environment and configuration / 相关环境与配置", "不适用") }), []);
});

test("reports reject missing fields, placeholder answers and images instead of reproduction steps", () => {
  for (const answer of ["", "_No response_", "不知道", "![screen](https://example.com/image.png)", '<img src="https://example.com/image.png">', "![screen][capture]\n[capture]: https://example.com/image.png", "https://example.com/video"]) {
    assert.deepEqual(evaluateIssue({ title: "[Bug] VNC fails", body: replaceSection(bugBody, "Steps to reproduce / 复现步骤", answer) }), ["Complete: Steps to reproduce / 复现步骤 / 请用文字完整填写此项。"], answer);
  }
  assert.deepEqual(evaluateIssue({ title: "VNC fails", body: "<img src='https://example.com/screenshot'>" }), ["Use a bug, feature or plugin-submission form. / 请使用故障、功能建议或插件收录表单。"]);
  assert.deepEqual(evaluateIssue({ title: "[Bug] VNC fails", body: replaceSection(bugBody, "Plugin version / 插件版本", "_No response_") }), ["Complete: Plugin version / 插件版本 / 请用文字完整填写此项。"]);
  assert.deepEqual(evaluateIssue({ title: "VNC fails", body: `<!--\n${bugBody}\n-->` }), ["Use a bug, feature or plugin-submission form. / 请使用故障、功能建议或插件收录表单。"]);
});

test("required declarations must be checked outside code fences and HTML comments", () => {
  const item = "I searched existing issues. / 我已搜索已有 Issue。";
  const expected = [`Confirm: ${item} / 请勾选此确认项。`];
  for (const replacement of [`- [ ] ${item}`, `- [x] An unrelated declaration.`, `\`\`\`\n- [x] ${item}\n\`\`\``, `<!--\n- [x] ${item}\n-->`, `> - [x] ${item}`]) {
    assert.deepEqual(evaluateIssue({ title: "[Bug] VNC fails", body: bugBody.replace(`- [x] ${item}`, replacement) }), expected);
  }
  assert.deepEqual(evaluateIssue({ title: "[Bug] VNC fails", body: bugBody.replace(`- [x] ${item}`, "- [X] I searched existing issues. /\n  我已搜索已有 Issue。") }), []);
});

test("plugin submissions require declarations and a release for package changes", () => {
  const packageUpdate = submissionBody.replace("Metadata-only update / 仅更新展示信息", "Version update / 版本更新");
  assert.deepEqual(evaluateIssue({ title: "[Plugin] Update", body: packageUpdate }), ["Complete: Immutable release page / 不可变发布页面。首次收录或版本更新需要发布页面。"]);
  assert.deepEqual(evaluateIssue({ title: "[Plugin] Update", body: `${packageUpdate}\n### Immutable release page / 不可变发布页面\nhttps://github.com/example/preview/releases/tag/v1.0.0` }), []);
  assert.deepEqual(evaluateIssue({ title: "[Plugin] Update", body: submissionBody.replace("- [x] I am authorized", "- [ ] I am authorized") }), ["Confirm: I am authorized to distribute the plugin and its bundled dependencies. / 我有权分发该插件及其捆绑依赖。 / 请勾选此确认项。"]);
});

// The fake service records GitHub writes; report evaluation remains production code.
function service(body = "Only a screenshot") {
  const issue = { number: 7, title: "[Bug] VNC fails", body, state: "open", labels: [], author_association: "NONE", updated_at: "2026-10-09T00:00:00Z" };
  const comments = [];
  const timeline = [];
  const writes = [];
  const context = { repo: { owner: "AnalyseDeCircuit", repo: "oxideterm-plugins" }, actor: "reporter", payload: { issue: { number: 7 }, action: "edited", sender: { type: "User" } } };
  const github = {
    paginate: async (method, args) => method(args),
    rest: {
      issues: {
        get: async () => ({ data: structuredClone(issue) }),
        listComments: async () => structuredClone(comments),
        listEventsForTimeline: async () => structuredClone(timeline),
        addLabels: async ({ labels }) => { writes.push(["addLabels", labels]); issue.labels.push(...labels); },
        removeLabel: async ({ name }) => { writes.push(["removeLabel", name]); issue.labels = issue.labels.filter(label => label !== name); },
        createComment: async ({ body }) => { writes.push(["createComment"]); comments.push({ id: 1, body, user: { login: "github-actions[bot]" }, created_at: "2026-10-09T00:00:01Z" }); },
        updateComment: async ({ body }) => { writes.push(["updateComment"]); comments[0].body = body; },
        update: async ({ state, state_reason }) => {
          writes.push(["update", state, state_reason]);
          issue.state = state;
          issue.state_reason = state_reason;
          if (state === "closed") timeline.push({ event: "closed", actor: { login: "github-actions[bot]" }, created_at: "2026-10-09T00:00:02Z" });
        },
      },
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: "triage" } }) },
    },
  };
  return { issue, comments, timeline, writes, context, github, run: () => checkIssue({ github, context, core: { info() {} } }) };
}

test("workflow closes incomplete reports once and reopens only after real content correction", async () => {
  const s = service(replaceSection(bugBody, "Steps to reproduce / 复现步骤", "_No response_"));
  await s.run();
  assert.deepEqual(s.writes.map(write => write[0]), ["addLabels", "createComment", "update"]);
  assert.equal(s.issue.state, "closed");
  assert.equal(s.issue.state_reason, "not_planned");
  assert.deepEqual(s.issue.labels, [INCOMPLETE_LABEL]);
  assert.match(s.comments[0].body, /Steps to reproduce/);
  s.writes.length = 0;
  await s.run();
  assert.deepEqual(s.writes, []);
  s.issue.body = bugBody;
  await s.run();
  assert.equal(s.issue.state, "open");
  assert.deepEqual(s.issue.labels, []);
  assert.deepEqual(s.writes.map(write => write[0]), ["removeLabel", "update", "updateComment"]);
  assert.match(s.comments[0].body, /Required report information is complete/);
});

test("manual closures are preserved even with an earlier gate comment and label", async () => {
  for (const previousGate of [false, true]) {
    const s = service();
    if (previousGate) await s.run();
    s.issue.state = "closed";
    s.issue.body = bugBody;
    s.timeline.push({ event: "closed", actor: { login: "maintainer" }, created_at: "2026-10-09T00:01:00Z" });
    s.writes.length = 0;
    await s.run();
    assert.equal(s.issue.state, "closed");
    assert.deepEqual(s.writes, []);
  }
});

test("maintainer reopen becomes a durable exemption while reporter reopen is checked", async () => {
  const s = service();
  await s.run();
  s.issue.state = "open";
  s.context.payload.action = "reopened";
  s.context.actor = "maintainer";
  await s.run();
  assert.deepEqual(s.issue.labels, [EXEMPT_LABEL]);
  assert.equal(s.issue.state, "open");
  s.context.payload.action = "edited";
  s.writes.length = 0;
  await s.run();
  assert.deepEqual(s.writes, []);
  const reporter = service();
  reporter.context.payload.action = "reopened";
  reporter.github.rest.repos.getCollaboratorPermissionLevel = async () => ({ data: { permission: "read" } });
  await reporter.run();
  assert.equal(reporter.issue.state, "closed");
  assert.deepEqual(reporter.issue.labels, [INCOMPLETE_LABEL]);
});

test("trusted authors and changed reports are not automatically closed", async () => {
  const trusted = service();
  trusted.issue.author_association = "COLLABORATOR";
  await trusted.run();
  assert.deepEqual(trusted.writes, []);
  const changed = service();
  let reads = 0;
  changed.github.rest.issues.get = async () => ({ data: { ...changed.issue, updated_at: String(reads++) } });
  await changed.run();
  assert.deepEqual(changed.writes, []);
});

test("workflow covers edits and label changes without running contributor code", () => {
  const workflow = parse(fs.readFileSync(new URL("../.github/workflows/issue-quality.yml", import.meta.url), "utf8"));
  assert.deepEqual(workflow.on.issues.types, ["opened", "edited", "reopened", "labeled", "unlabeled"]);
  assert.deepEqual(workflow.permissions, { contents: "read", issues: "write" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  const config = parse(fs.readFileSync(new URL("../.github/ISSUE_TEMPLATE/config.yml", import.meta.url), "utf8"));
  assert.equal(config.blank_issues_enabled, false);
  assert.equal(config.contact_links[0].url, "https://github.com/AnalyseDeCircuit/oxideterm/issues/new/choose");
});
