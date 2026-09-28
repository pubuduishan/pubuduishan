import { readFile, writeFile } from "node:fs/promises";

const OWNER = process.env.GITHUB_REPOSITORY_OWNER || "pubuduishan";
const DEVTO_USER = process.env.DEVTO_USER || "pubuduishan";
const REPO_LIMIT = Number(process.env.REPO_LIMIT || 6);
const POST_LIMIT = Number(process.env.POST_LIMIT || 4);
const TOKEN = process.env.GITHUB_TOKEN;
const README = "README.md";

const baseHeaders = {
  Accept: "application/json",
  "User-Agent": "profile-readme-updater",
};

// ---------- helpers ----------

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

function replaceSection(readme, name, content, { required = false } = {}) {
  const start = `<!--${name}:START-->`;
  const end = `<!--${name}:END-->`;
  const startIdx = readme.indexOf(start);
  const endIdx = readme.indexOf(end);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    if (required) throw new Error(`Markers for ${name} not found in ${README}`);
    console.log(`Skipping ${name}: markers not found.`);
    return readme;
  }

  return (
    readme.slice(0, startIdx + start.length) +
    "\n" +
    content +
    "\n" +
    readme.slice(endIdx)
  );
}

// ---------- recent repositories (GitHub API) ----------

async function fetchRepos() {
  const url =
    `https://api.github.com/users/${OWNER}/repos` +
    `?type=owner&sort=pushed&direction=desc&per_page=50`;

  const res = await fetch(url, {
    headers: {
      ...baseHeaders,
      Accept: "application/vnd.github+json",
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
        r.name.toLowerCase() !== OWNER.toLowerCase() // hide the profile repo
    )
    .slice(0, REPO_LIMIT);
}

function buildRepoTable(repos) {
  if (repos.length === 0) return "_No public repositories to show yet._";

  const rows = repos.map((r) => {
    const name = `[**${r.name}**](${r.html_url})`;
    const desc = clean(r.description) || "No description yet";
    return `| ${name} | ${desc} | ${r.language || ""} | ${r.stargazers_count} | ${formatDate(r.pushed_at)} |`;
  });

  return [
    "| Repository | Description | Language | Stars | Updated |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

// ---------- latest writing (dev.to API) ----------

async function fetchPosts() {
  try {
    const res = await fetch(
      `https://dev.to/api/articles?username=${DEVTO_USER}&per_page=${POST_LIMIT}`,
      { headers: baseHeaders }
    );
    if (!res.ok) {
      console.log(`dev.to responded ${res.status}, leaving posts unchanged.`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.log(`Could not reach dev.to (${err.message}), leaving posts unchanged.`);
    return null;
  }
}

function buildPostList(posts) {
  if (posts.length === 0) return "_New articles are on the way._";

  return posts
    .map(
      (p) =>
        `- [${clean(p.title)}](${p.url}) <sub>${formatDate(p.published_at)}</sub>`
    )
    .join("\n");
}

// ---------- main ----------

async function main() {
  const original = await readFile(README, "utf8");
  let next = original;

  const repos = await fetchRepos();
  next = replaceSection(next, "RECENT_REPOS", buildRepoTable(repos), {
    required: true,
  });

  const posts = await fetchPosts();
  if (posts !== null) {
    next = replaceSection(next, "LATEST_POSTS", buildPostList(posts));
  }

  if (next === original) {
    console.log("README already up to date.");
    return;
  }

  await writeFile(README, next);
  console.log("README updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
