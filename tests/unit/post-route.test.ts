import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type RouteModule = typeof import("../../src/app/api/v1/[...path]/route");
type RuntimeModule = typeof import("../../src/lib/store/runtime");

function createRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

async function loadModules(): Promise<{ route: RouteModule; runtime: RuntimeModule }> {
  const runtime = await import("../../src/lib/store/runtime");
  const route = await import("../../src/app/api/v1/[...path]/route");
  return { route, runtime };
}

async function createGithubLinkedHuman(runtime: RuntimeModule, index: number) {
  const store = await runtime.getRuntimeStore();
  const started = store.startHumanEmailVerification(`post-${index}@example.org`, `post_user_${index}`);
  const verified = store.verifyHumanEmailCode(started.human.email, started.verification.code);
  if ("error" in verified) throw new Error(verified.error);
  const linked = store.linkHumanGithub(verified.human.id, `post-gh-${index}`, `post_gh_${index}`);
  if ("error" in linked) throw new Error(linked.error);
  return { human: verified.human, session: verified.session };
}

describe("post routes", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.ALLOW_UNSIGNED_DEV = "true";
    const runtime = await import("../../src/lib/store/runtime");
    await runtime.clearRuntimeStateForTests();
  });

  it("creates and lists comments under a community post", async () => {
    const { route, runtime } = await loadModules();
    const { human, session } = await createGithubLinkedHuman(runtime, 1);
    const store = await runtime.getRuntimeStore();
    const post = store.createCommunityPost({
      authorHumanId: human.id,
      title: "Commentable Post",
      bodyMarkdown: "This post body is long enough to represent a published community post for comment route testing."
    });

    const createRes = await route.POST(createRequest(`http://localhost:3000/api/v1/posts/${post.id}/comments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `clawreview_human_session=${session.token}`
      },
      body: JSON.stringify({ body_markdown: "Good point.\n\n- one\n- two" })
    }));
    const createBody = await createRes.json();

    expect(createRes.status).toBe(201);
    expect(createBody.comment.bodyMarkdown).toContain("- one");
    expect(createBody.authorHuman.username).toBe("post_user_1");

    const listRes = await route.GET(createRequest(`http://localhost:3000/api/v1/posts/${post.id}/comments`));
    const listBody = await listRes.json();

    expect(listRes.status).toBe(200);
    expect(listBody.comments).toHaveLength(1);
    expect(listBody.comments[0].comment.id).toBe(createBody.comment.id);
    expect(listBody.comments[0].authorHuman.username).toBe("post_user_1");
  });

  it("requires an authenticated human session to comment on posts", async () => {
    const { route, runtime } = await loadModules();
    const { human } = await createGithubLinkedHuman(runtime, 2);
    const store = await runtime.getRuntimeStore();
    const post = store.createCommunityPost({
      authorHumanId: human.id,
      title: "Protected Comment Post",
      bodyMarkdown: "This post body is long enough to represent a published community post for auth testing."
    });

    const res = await route.POST(createRequest(`http://localhost:3000/api/v1/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body_markdown: "Unauthenticated comment" })
    }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error_code).toBe("UNAUTHORIZED");
  });
});
