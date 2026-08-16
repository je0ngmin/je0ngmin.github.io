import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { minify as minifyHtml } from "html-minifier-terser";
import { transform as minifyCss } from "lightningcss";
import { marked } from "marked";
import nunjucks from "nunjucks";
import { parse as parseYaml } from "yaml";

const projectRoot = process.cwd();
const templateDirectory = path.join(projectRoot, "template");
const articlesDirectory = path.join(projectRoot, "articles");
const siteUrl = "https://je0ngmin.github.io";
const koreanTimeZone = "Asia/Seoul";

interface ArticleMetadata {
  title: string;
  released_at: string | Date;
  description: string;
  keywords?: string[];
}

interface Article extends ArticleMetadata {
  url: string;
  releasedAt: Date;
  content: string;
}

function parseKoreanDateTime(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }

  // 시간대가 생략된 값도 YAML에서 한국 시간으로 작성된 것으로 간주한다.
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
  const normalized = hasTimeZone
    ? value
    : `${value.trim().replace(" ", "T")}+09:00`;
  return new Date(normalized);
}

function toKoreanIsoString(date: Date): string {
  const koreanDate = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  return koreanDate.toISOString().replace("Z", "+09:00");
}

function formatKoreanDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: koreanTimeZone,
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export interface BuildOptions {
  outputDirectory?: string;
  minify?: boolean;
}

function assertMetadata(value: unknown, source: string): asserts value is ArticleMetadata {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: metadata가 객체가 아닙니다.`);
  }

  const metadata = value as Record<string, unknown>;
  for (const field of ["title", "description"] as const) {
    if (typeof metadata[field] !== "string" || metadata[field].length === 0) {
      throw new Error(`${source}: ${field} 값이 필요합니다.`);
    }
  }
  if (!(typeof metadata.released_at === "string" || metadata.released_at instanceof Date)) {
    throw new Error(`${source}: released_at 값이 필요합니다.`);
  }
  if (metadata.keywords !== undefined && !Array.isArray(metadata.keywords)) {
    throw new Error(`${source}: keywords는 문자열 배열이어야 합니다.`);
  }
}

async function loadArticles(): Promise<Article[]> {
  const entries = await readdir(articlesDirectory, { withFileTypes: true });
  const articleDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name !== ".obsidian")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const articles = await Promise.all(
    articleDirectories.map(async (entry): Promise<Article> => {
      const directory = path.join(articlesDirectory, entry.name);
      const metadataPath = path.join(directory, "metadata.yaml");
      const metadata = parseYaml(await readFile(metadataPath, "utf8")) as unknown;
      assertMetadata(metadata, metadataPath);

      const releasedAt = parseKoreanDateTime(metadata.released_at);
      if (Number.isNaN(releasedAt.getTime())) {
        throw new Error(`${metadataPath}: released_at 날짜 형식이 올바르지 않습니다.`);
      }

      return {
        ...metadata,
        keywords: metadata.keywords ?? [],
        url: entry.name,
        releasedAt,
        content: await readFile(path.join(directory, "content.md"), "utf8"),
      };
    }),
  );

  return articles.sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime());
}

async function optimizeHtml(html: string): Promise<string> {
  return minifyHtml(html, {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: false,
    minifyCSS: true,
    minifyJS: true,
    processConditionalComments: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeRedundantAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true,
  });
}

async function writeText(
  outputPath: string,
  contents: string,
  shouldMinify: boolean,
): Promise<void> {
  const extension = path.extname(outputPath);
  let output = contents;

  if (shouldMinify && extension === ".html") {
    output = await optimizeHtml(contents);
  } else if (shouldMinify && extension === ".css") {
    output = minifyCss({
      filename: outputPath,
      code: Buffer.from(contents),
      minify: true,
    }).code.toString();
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
}

async function copyStaticFiles(outputDirectory: string, shouldMinify: boolean): Promise<void> {
  const entries = await readdir(templateDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (["base.html", "index.html", "article.html", "main.dart"].includes(entry.name)) {
        return;
      }

      const source = path.join(templateDirectory, entry.name);
      const destination = path.join(outputDirectory, entry.name);
      if (entry.isDirectory()) {
        await cp(source, destination, { recursive: true });
      } else if (entry.name.endsWith(".css")) {
        await writeText(destination, await readFile(source, "utf8"), shouldMinify);
      } else {
        await cp(source, destination);
      }
    }),
  );
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]!);
}

export async function buildSite(options: BuildOptions = {}): Promise<void> {
  const outputDirectory = options.outputDirectory ?? path.join(projectRoot, "build");
  const shouldMinify = options.minify ?? true;

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const environment = nunjucks.configure(templateDirectory, {
    autoescape: true,
    noCache: true,
  });
  const articles = await loadArticles();

  await copyStaticFiles(outputDirectory, shouldMinify);

  const indexHtml = environment.render("index.html", {
    articles: articles.map(({ title, url, description }) => ({ title, url, description })),
  });
  await writeText(path.join(outputDirectory, "index.html"), indexHtml, shouldMinify);

  await Promise.all(
    articles.map(async (article) => {
      const html = environment.render("article.html", {
        title: article.title,
        description: article.description,
        released_at: toKoreanIsoString(article.releasedAt),
        released_at_display: formatKoreanDateTime(article.releasedAt),
        keywords: article.keywords?.join(", "),
        content: new nunjucks.runtime.SafeString(await marked.parse(article.content)),
        url: article.url,
      });
      await writeText(path.join(outputDirectory, `${article.url}.html`), html, shouldMinify);
    }),
  );

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `<url><loc>${siteUrl}</loc><priority>1.0</priority></url>`,
    ...articles.map(
      (article) =>
        `<url><loc>${siteUrl}/${escapeXml(article.url)}</loc><lastmod>${toKoreanIsoString(article.releasedAt)}</lastmod></url>`,
    ),
    "</urlset>",
  ].join(shouldMinify ? "" : "\n");
  await writeFile(path.join(outputDirectory, "sitemap.xml"), sitemap);

  console.log(
    `${shouldMinify ? "프로덕션" : "개발"} 빌드 완료: ${path.relative(projectRoot, outputDirectory)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
