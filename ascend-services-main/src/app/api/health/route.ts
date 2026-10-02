import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "ok" },
      { status: 200 },
    );
  } catch (err) {
    log({
      level: "error",
      msg: "health_check_db_unreachable",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { status: "degraded", db: "unreachable" },
      { status: 503 },
    );
  }
}
