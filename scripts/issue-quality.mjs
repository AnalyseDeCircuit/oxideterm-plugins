import fs from "node:fs";
import { parse } from "yaml";

const templateDirectory = new URL("../.github/ISSUE_TEMPLATE/", import.meta.url);
const forms = fs.readdirSync(templateDirectory)
  .filter(name => name.endsWith(".yml") && name !== "config.yml")
  .map(name => parse(fs.readFileSync(new URL(name, templateDirectory), "utf8")));

export const INCOMPLETE_LABEL = "lack of useful information";
export const EXEMPT_LABEL = "quality-check-exempt";
const COMMENT_MARKER = "<!-- oxideterm-plugins-issue-quality:v1 -->";
const BOT_LOGIN = "github-actions[bot]";
const TRUSTED_AUTHORS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MAINTAINER_PERMISSIONS = new Set(["admin", "maintain", "write", "triage"]);

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sectionsIn(body) {
  const sections = new Map();
  let heading = null;
  let fence = null;
  for (const line of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker) {
      fence = marker[1];
    } else {
      const match = line.match(/^###\s+(.+?)\s*$/);
      if (match) {
        heading = normalize(match[1]);
        if (!sections.has(heading)) sections.set(heading, "");
        continue;
      }
    }
    if (heading) sections.set(heading, `${sections.get(heading)}\n${line}`);
  }
  return sections;
}

function writtenText(value) {
  return value.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^\n]*?\)/g, "")
    .replace(/!\[[^\]]*\](?:\[[^\]]*\])?/g, "")
    .replace(/^ {0,3}\[[^\]]+\]:\s+.*$/gm, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function checkedItems(value) {
  const checked = [];
  let current = null;
  let fence = null;
  for (const line of value.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      current = null;
      continue;
    }
    const match = line.match(/^ {0,3}[-*] \[([ xX])\]\s+(.+)$/);
    if (match) {
      current = match[1].toLowerCase() === "x" ? [match[2]] : null;
      if (current) checked.push(current);
    } else if (!line.trim() || /^\s*(?:>|[-*] |#{1,6} )/.test(line)) {
      current = null;
    } else if (current) {
      current.push(line.trim());
    }
  }
  return new Set(checked.map(parts => normalize(parts.join(" "))));
}

export function evaluateIssue(issue) {
  const sections = sectionsIn(issue.body || "");
  const byTitle = forms.find(form => normalize(issue.title || "").startsWith(normalize(form.title)));
  const candidates = forms.map(form => ({
    form,
    matches: form.body.filter(field => field.attributes?.label && sections.has(normalize(field.attributes.label))).length,
  })).sort((a, b) => b.matches - a.matches);
  const form = byTitle || (candidates[0]?.matches > 0 ? candidates[0].form : null);
  if (!form) return ["Use a bug, feature or plugin-submission form. / 请使用故障、功能建议或插件收录表单。"];

  const findings = [];
  for (const field of form.body) {
    const label = field.attributes?.label;
    if (!label) continue;
    const answer = sections.get(normalize(label)) || "";
    if (field.type === "checkboxes") {
      const checked = checkedItems(answer);
      for (const option of field.attributes.options) {
        if (option.required && !checked.has(normalize(option.label))) {
          findings.push(`Confirm: ${option.label} / 请勾选此确认项。`);
        }
      }
    } else if (field.validations?.required) {
      const text = normalize(writtenText(answer)).replace(/^_+|_+$/g, "");
      const allowsNotApplicable = field.id === "environment" || field.id === "permissions";
      const missing = !text || /^(?:no response|unknown|不知道|待填写|请输入|\.\.\.|…)$/i.test(text)
        || (!allowsNotApplicable && /^(?:n\/?a|not applicable|none|null|无|没有|不适用)$/i.test(text));
      const stepsWithoutText = field.id === "reproduction"
        && !writtenText(answer).replace(/https?:\/\/\S+/g, "").replace(/[\p{P}\p{S}\s]/gu, "");
      if (missing || stepsWithoutText) findings.push(`Complete: ${label} / 请用文字完整填写此项。`);
      else if (field.type === "dropdown" && !field.attributes.options.some(option => normalize(option) === text)) {
        findings.push(`Choose an available option: ${label} / 请使用表单中的选项。`);
      }
    }
  }
  const requestType = sections.get(normalize("Request type / 申请类型"));
  if (form.title === "[Plugin] " && requestType && normalize(requestType) !== normalize("Metadata-only update / 仅更新展示信息")) {
    const release = sections.get(normalize("Immutable release page / 不可变发布页面"));
    if (!writtenText(release || "") || /^_?(?:no response|n\/?a|not applicable|不适用)_?$/i.test((release || "").trim())) {
      findings.push("Complete: Immutable release page / 不可变发布页面。首次收录或版本更新需要发布页面。");
    }
  }
  return findings;
}

export async function checkIssue({ github, context, core }) {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const request = { ...repo, issue_number: context.payload.issue.number };
  // Event payloads can be stale while an earlier run is still changing the issue.
  const issue = (await github.rest.issues.get(request)).data;
  const labels = new Set(issue.labels.map(label => typeof label === "string" ? label : label.name));
  const comments = await github.paginate(github.rest.issues.listComments, { ...request, per_page: 100 });
  const comment = comments.find(item => item.user?.login === BOT_LOGIN && item.body?.includes(COMMENT_MARKER));
  const timeline = await github.paginate(github.rest.issues.listEventsForTimeline, { ...request, per_page: 100 });
  const lastClosure = timeline.filter(event => event.event === "closed").at(-1);
  const gateOwnsClosure = Boolean(comment && lastClosure?.actor?.login === BOT_LOGIN
    && lastClosure.created_at >= comment.created_at);
  const latest = (await github.rest.issues.get(request)).data;
  if (latest.updated_at !== issue.updated_at) {
    core.info("Issue changed during inspection; its newer event will recheck it.");
    return;
  }

  async function addLabel(name) {
    if (!labels.has(name)) {
      await github.rest.issues.addLabels({ ...request, labels: [name] });
      labels.add(name);
    }
  }
  async function removeIncomplete() {
    if (labels.has(INCOMPLETE_LABEL)) {
      await github.rest.issues.removeLabel({ ...request, name: INCOMPLETE_LABEL });
      labels.delete(INCOMPLETE_LABEL);
    }
  }
  async function saveComment(text) {
    const body = `${COMMENT_MARKER}\n${text}`;
    if (comment) {
      if (comment.body !== body) await github.rest.issues.updateComment({ ...repo, comment_id: comment.id, body });
    } else {
      await github.rest.issues.createComment({ ...request, body });
    }
  }

  let maintainerReopen = false;
  if (context.payload.action === "reopened" && context.payload.sender?.type !== "Bot") {
    let permission = context.actor === context.repo.owner ? "admin" : null;
    if (!permission) {
      permission = (await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: context.actor })).data.permission;
    }
    maintainerReopen = MAINTAINER_PERMISSIONS.has(permission);
  }
  if (maintainerReopen) await addLabel(EXEMPT_LABEL);
  if (labels.has(EXEMPT_LABEL) || TRUSTED_AUTHORS.has(issue.author_association)) {
    await removeIncomplete();
    if (comment) await saveComment("Automated checks are exempted by the maintainer or author role. / 维护者决定或作者身份已免除此报告的自动检查。");
    core.info("Issue is exempt from format enforcement.");
    return;
  }
  // A manually closed report is outside this workflow's recovery ownership.
  if (issue.state === "closed" && !gateOwnsClosure) return;
  const findings = evaluateIssue(issue);
  if (findings.length) {
    await addLabel(INCOMPLETE_LABEL);
    await saveComment([
      "## Missing report information / 报告信息不完整",
      "This issue is closed until required information is provided. / 此 Issue 因缺少必要信息而暂时关闭。",
      "",
      ...findings.map(finding => `- ${finding}`),
      "",
      "Edit this issue using a repository form. When all missing items are resolved, an issue closed by this check will reopen automatically. / 请按仓库表单编辑当前 Issue。补全所有缺项后，由本检查关闭的 Issue 会自动重新打开。",
      "Do not include passwords, private keys or tokens. / 不要提供密码、私钥或令牌。",
    ].join("\n"));
    if (issue.state === "open") {
      await github.rest.issues.update({ ...request, state: "closed", state_reason: "not_planned" });
    }
    return;
  }
  if (comment && (labels.has(INCOMPLETE_LABEL) || gateOwnsClosure)) {
    await removeIncomplete();
    if (issue.state === "closed" && gateOwnsClosure) {
      await github.rest.issues.update({ ...request, state: "open" });
    }
    await saveComment("Required report information is complete. / 必填信息已补全。\nAn issue closed by this check has been reopened. / 由本检查关闭的 Issue 已重新打开。");
  }
}
