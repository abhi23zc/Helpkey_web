import "server-only";

import { createHash } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";
import { getUserByUid } from "@/lib/auth/users";
import { apiContext, type ApiAuthMode } from "@/lib/api/context";
import { cacheKey, withRedis } from "@/lib/redis";
import type { AppUser } from "@/types/auth";

export const SESSION_COOKIE_NAME = "helpkey_session";
export const SESSION_EXPIRES_IN = 1000 * 60 * 60 * 24 * 5;
const SESSION_CACHE_SECONDS = 60;

const cookieDigest = (cookie: string) => createHash("sha256").update(cookie).digest("hex");
const sessionKey = (digest: string) => cacheKey("session", digest);
const userSessionsKey = (uid: string) => cacheKey("user-sessions", uid);

async function cacheSession(cookie: string, user: AppUser) {
  const digest = cookieDigest(cookie);
  await withRedis(async (redis) => {
    const pipeline = redis.pipeline();
    pipeline.set(sessionKey(digest), JSON.stringify(user), "EX", SESSION_CACHE_SECONDS);
    pipeline.sadd(userSessionsKey(user.uid), digest);
    pipeline.expire(userSessionsKey(user.uid), SESSION_EXPIRES_IN / 1000);
    await pipeline.exec();
  });
}

export async function invalidateUserSessions(uid: string) {
  await withRedis(async (redis) => {
    const indexKey = userSessionsKey(uid);
    const digests = await redis.smembers(indexKey);
    if (digests.length) await redis.del(...digests.map(sessionKey));
    await redis.del(indexKey);
  });
}

async function invalidateCookie(cookie: string) {
  const digest = cookieDigest(cookie);
  const cached = await withRedis((redis) => redis.get(sessionKey(digest)));
  await withRedis(async (redis) => {
    await redis.del(sessionKey(digest));
    if (cached) {
      const user = JSON.parse(cached) as AppUser;
      await redis.srem(userSessionsKey(user.uid), digest);
    }
  });
}

export async function setSessionCookie(idToken: string) {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_IN,
  });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_EXPIRES_IN / 1000,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) await invalidateCookie(cookie);
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function resolveAuthenticatedUser(mode: Exclude<ApiAuthMode, "public">): Promise<AppUser | null> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    if (mode === "read") {
      const cached = await withRedis((redis) => redis.get(sessionKey(cookieDigest(sessionCookie))));
      if (cached) {
        const user = JSON.parse(cached) as AppUser;
        if (user.isActive && user.accountStatus === "active") return user;
      }
    }
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, mode === "strict");
    const user = await getUserByUid(decoded.uid);

    if (!user?.isActive) {
      return null;
    }

    await cacheSession(sessionCookie, user);
    return user;
  } catch {
    await invalidateCookie(sessionCookie);
    return null;
  }
}

const readAuthenticatedUser = cache(() => resolveAuthenticatedUser("read"));
const strictAuthenticatedUser = cache(() => resolveAuthenticatedUser("strict"));

export async function getAuthenticatedUser(mode: Exclude<ApiAuthMode, "public"> = "read") {
  const contextual = apiContext.actor();
  if (contextual) return contextual;
  return mode === "strict" ? strictAuthenticatedUser() : readAuthenticatedUser();
}

export async function requireAuthenticatedUser(mode: Exclude<ApiAuthMode, "public"> = "read") {
  const user = await getAuthenticatedUser(mode);

  if (!user) {
    redirect("/");
  }

  return user;
}
