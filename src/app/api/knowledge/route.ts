import { and, desc, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, parseId, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { knowledgeArticles, users, workspaces } from "@/app/db/schema";

type ArticleInput = {
  title?: unknown;
  content?: unknown;
  category?: unknown;
  tags?: unknown;
};

function parseArticle(input: ArticleInput) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 180) return null;
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 50_000) return null;
  if (input.category !== undefined && (typeof input.category !== "string" || !input.category.trim() || input.category.length > 60)) return null;
  if (input.tags !== undefined && (
    !Array.isArray(input.tags) ||
    input.tags.length > 20 ||
    input.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 40)
  )) return null;
  return {
    title: input.title.trim(),
    content: input.content.trim(),
    category: typeof input.category === "string" ? input.category.trim() : "Procesos",
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map((tag) => (tag as string).trim()))] : [],
  };
}

async function validWorkspace(workspaceId: number) {
  const [workspace] = await getDb().select({ id: workspaces.id }).from(workspaces)
    .where(eq(workspaces.id, workspaceId)).limit(1);
  return Boolean(workspace);
}

export async function GET(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const params = new URL(request.url).searchParams;
    const workspaceId = parseId(params.get("workspaceId") ?? "");
    if (!workspaceId) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    if (!(await validWorkspace(workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const search = params.get("q")?.trim();
    const conditions = [eq(knowledgeArticles.workspaceId, workspaceId)];
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      const matching = or(
        ilike(knowledgeArticles.title, pattern),
        ilike(knowledgeArticles.content, pattern),
        ilike(knowledgeArticles.category, pattern),
      );
      if (matching) conditions.push(matching);
    }
    const articles = await getDb().select({
      id: knowledgeArticles.id,
      workspaceId: knowledgeArticles.workspaceId,
      authorId: knowledgeArticles.authorId,
      authorName: users.name,
      title: knowledgeArticles.title,
      content: knowledgeArticles.content,
      category: knowledgeArticles.category,
      tags: knowledgeArticles.tags,
      createdAt: knowledgeArticles.createdAt,
      updatedAt: knowledgeArticles.updatedAt,
    }).from(knowledgeArticles)
      .leftJoin(users, eq(knowledgeArticles.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(knowledgeArticles.updatedAt), desc(knowledgeArticles.id))
      .limit(100);
    return Response.json({ articles });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Article details are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const workspaceId = parseId(String(input.workspaceId ?? ""));
    if (!workspaceId || !(await validWorkspace(workspaceId))) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    const article = parseArticle(input);
    if (!article) return Response.json({ error: "Provide a valid title, Markdown content, category, and tags." }, { status: 400 });
    const [created] = await getDb().insert(knowledgeArticles)
      .values({ ...article, workspaceId, authorId: user.id })
      .returning();
    await publishWorkspaceEvent(workspaceId, "knowledge:updated", { articleId: created.id });
    revalidatePath("/");
    return Response.json({ article: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Article update is required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const id = parseId(String(input.id ?? ""));
    if (!id) return Response.json({ error: "Choose a valid article." }, { status: 400 });
    const [existing] = await getDb().select().from(knowledgeArticles).where(eq(knowledgeArticles.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Article not found." }, { status: 404 });
    const article = parseArticle(input);
    if (!article) return Response.json({ error: "Provide a valid title, Markdown content, category, and tags." }, { status: 400 });
    const [updated] = await getDb().update(knowledgeArticles)
      .set({ ...article, updatedAt: new Date() })
      .where(eq(knowledgeArticles.id, id))
      .returning();
    await publishWorkspaceEvent(existing.workspaceId, "knowledge:updated", { articleId: updated.id });
    revalidatePath("/");
    return Response.json({ article: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const id = parseId(new URL(request.url).searchParams.get("id") ?? "");
    if (!id) return Response.json({ error: "Choose a valid article." }, { status: 400 });
    const [deleted] = await getDb().delete(knowledgeArticles)
      .where(eq(knowledgeArticles.id, id))
      .returning();
    if (!deleted) return Response.json({ error: "Article not found." }, { status: 404 });
    await publishWorkspaceEvent(deleted.workspaceId, "knowledge:updated", { articleId: deleted.id });
    revalidatePath("/");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
