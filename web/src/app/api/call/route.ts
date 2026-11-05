import { createHash, randomUUID } from "node:crypto";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Starts a browser call: returns a short-lived LiveKit token for a brand-new
// room, with the Bangla agent dispatched into it when the room is created.

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "bytevoice-bd";
const MAX_PER_HOUR = Number(process.env.RATE_LIMIT_PER_IP_PER_HOUR ?? 20);

function ipHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT}:${ip}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret, NEXT_PUBLIC_LIVEKIT_URL: url } = process.env;
  if (!key || !secret || !url) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // Rate limit per visitor, stored in Postgres so it holds across serverless instances.
  const hash = ipHash(req);
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from web_call_attempts
    where ip_hash = ${hash} and created_at > now() - interval '1 hour'`;
  if (n >= MAX_PER_HOUR) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const room = `web-${randomUUID()}`;
  await sql`insert into web_call_attempts (ip_hash, room) values (${hash}, ${room})`;

  const token = new AccessToken(key, secret, { identity: `visitor-${randomUUID()}`, ttl: "10m" });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  // Dispatch happens when the room is first created, so every call gets a fresh room.
  token.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })] });

  return NextResponse.json({ token: await token.toJwt(), url, room });
}
