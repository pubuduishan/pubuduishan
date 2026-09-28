import { readFile, writeFile } from "node:fs/promises";

const OWNER = process.env.GITHUB_REPOSITORY_OWNER || "pubuduishan";
const LIMIT = Number(process.env.REPO_LIMIT || 6);
const TOKEN = process.env.GITHUB_TOKEN;
const README = "README.md";
const START = "<!--RECENT_REPOS:START-->";
const END = "<!--RECENT_REPOS:END-->";

async function fetchRepos() {
  const url =
    `https://api.github.com/users/${OWNER}/repos` +
    `?type=owner&sort=pushed&direction=desc&per_page=50`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "profile-readme-updater",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}: ${await res.text()}`);
  }

  const repos = await res.json();

  return repos
    .filter(
      (r) =>
        !r.fork &&
        !r.archived &&
        !r.private &&
        r.name.toLowerCase() !== OWNER.toLowerCase() // hide the profile repo itself
    )
    .slice(0, LIMIT);
}

function clean(text) {
  return (text || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildTable(repos) {
  if (repos.length === 0) {
    return "_No public repositories to show yet._";
  }

  const rows = repos.map((r) => {
    const name = `[**${r.name}**](${r.html_url})`;
    const desc = clean(r.description) || "No description yet";
    const lang = r.language || "";
    const stars = r.stargazers_count;
    const updated = formatDate(r.pushed_at);
    return `| ${name} | ${desc} | ${lang} | ${stars} | ${updated} |`;
  });

  return [
    "| Repository | Description | Language | Stars | Updated |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

async function main() {
  const repos = await fetchRepos();
  const table = buildTable(repos);

  const readme = await readFile(README, "utf8");
  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers ${START} and ${END} not found in ${README}`);
  }

  const next =
    readme.slice(0, startIdx + START.length) +
    "\n" +
    table +
    "\n" +
    readme.slice(endIdx);

  if (next === readme) {
    console.log("README already up to date.");
    return;
  }

  await writeFile(README, next);
  console.log(`Updated README with ${repos.length} repositories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
