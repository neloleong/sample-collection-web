import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "staff" | "part_time";

type MonthlyRuleRow = {
  region_id: number;
  quota: number | null;
};

type DailyEntryRow = {
  region_id: number;
  quantity: number | null;
};

function getMonthBounds(dateString: string) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    throw new Error("Invalid date");
  }

  const year = base.getFullYear();
  const month = base.getMonth();

  const start = new Date(year, month, 1);
  const next = new Date(year, month + 1, 1);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    monthStart: format(start),
    nextMonthStart: format(next),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const date = request.nextUrl.searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.role) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const allowedRoles: Role[] = ["admin", "staff", "part_time"];
    if (!allowedRoles.includes(profile.role as Role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { monthStart, nextMonthStart } = getMonthBounds(date);

    const [rulesResult, entriesResult] = await Promise.all([
      adminClient
        .from("monthly_region_rules")
        .select("region_id, quota")
        .eq("rule_month", monthStart),

      adminClient
        .from("daily_entries")
        .select("region_id, quantity")
        .gte("entry_date", monthStart)
        .lt("entry_date", nextMonthStart),
    ]);

    if (rulesResult.error) {
      return NextResponse.json(
        { error: rulesResult.error.message },
        { status: 500 }
      );
    }

    if (entriesResult.error) {
      return NextResponse.json(
        { error: entriesResult.error.message },
        { status: 500 }
      );
    }

    const quotaByRegion: Record<number, number> = {};
    const totalsByRegion: Record<number, number> = {};

    ((rulesResult.data ?? []) as MonthlyRuleRow[]).forEach((row) => {
      quotaByRegion[row.region_id] = Number(row.quota ?? 0);
    });

    ((entriesResult.data ?? []) as DailyEntryRow[]).forEach((row) => {
      totalsByRegion[row.region_id] =
        (totalsByRegion[row.region_id] ?? 0) + Number(row.quantity ?? 0);
    });

    return NextResponse.json({
      monthStart,
      nextMonthStart,
      quotaByRegion,
      totalsByRegion,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load month region totals",
      },
      { status: 500 }
    );
  }
}