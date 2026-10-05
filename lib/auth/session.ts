import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";
import { getUserByUid } from "@/lib/auth/users";
import { apiContext, type ApiAuthMode } from "@/lib/api/context";
import { cacheKey, withRedis } from "@/lib/redis";
import { credentialDigest, selectCredential, type Credential } from "@/lib/auth/credential";
import type { AppUser } from "@/types/auth";

export const SESSION_COOKIE_NAME = "helpkey_session";
export const SESSION_EXPIRES_IN = 1000 * 60 * 60 * 24 * 5;
const SESSION_CACHE_SECONDS = 60;

const sessionKey = (digest: string) => cacheKey("session", digest);
const userSessionsKey = (uid: string) => cacheKey("user-sessions", uid);

async function cacheSession(credential: Credential, user: AppUser) {
  const digest = credentialDigest(credential);
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

async function invalidateCredential(credential: Credential) {
  const digest = credentialDigest(credential);
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
  if (cookie) await invalidateCredential({ kind: "cookie", value: cookie });
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Ends the caller's session whichever way it authenticated. A bearer client holds no cookie: dropping the
 * server-side cache entry stops the token being served from cache; the app then discards its tokens.
 */
export async function signOutRequest() {
  const credential = await requestCredential();
  if (credential?.kind === "idToken") await invalidateCredential(credential);
  await clearSessionCookie();
}

async function requestCredential(): Promise<Credential | null> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return selectCredential(headerStore.get("authorization"), cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

async function resolveAuthenticatedUser(mode: Exclude<ApiAuthMode, "public">): Promise<AppUser | null> {
  const credential = await requestCredential();

  if (!credential) {
    return null;
  }

  try {
    if (mode === "read") {
      const cached = await withRedis((redis) => redis.get(sessionKey(credentialDigest(credential))));
      if (cached) {
        const user = JSON.parse(cached) as AppUser;
        if (user.isActive && user.accountStatus === "active") return user;
      }
    }
    // "strict" also checks revocation. Browser cookies and app ID tokens are different JWTs, verified differently.
    const decoded =
      credential.kind === "idToken"
        ? await adminAuth.verifyIdToken(credential.value, mode === "strict")
        : await adminAuth.verifySessionCookie(credential.value, mode === "strict");
    const user = await getUserByUid(decoded.uid);

    if (!user?.isActive) {
      return null;
    }

    await cacheSession(credential, user);
    return user;
  } catch {
    await invalidateCredential(credential);
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
