import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "staff";

function normalizeRole(role: unknown): Role {
  const r = String(role ?? "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const displayName = String(body.display_name ?? "").trim();
    const employeeCode = String(body.employee_code ?? "").trim();
    const role = normalizeRole(body.role);

    if (!email || !password || !displayName || !employeeCode) {
      return NextResponse.json(
        { error: "請完整填寫 email、password、display_name、employee_code。" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密碼至少需要 6 個字元。" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "缺少 Supabase 環境變數。" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "未授權。" },
        { status: 401 }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    });

    const {
      data: { user: requester },
      error: requesterError,
    } = await userClient.auth.getUser(jwt);

    if (requesterError || !requester) {
      return NextResponse.json(
        { error: "目前登入狀態無效。" },
        { status: 401 }
      );
    }

    const { data: requesterProfile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", requester.id)
      .single();

    if (profileError || !requesterProfile) {
      return NextResponse.json(
        { error: "無法驗證管理員身份。" },
        { status: 403 }
      );
    }

    if (normalizeRole(requesterProfile.role) !== "admin") {
      return NextResponse.json(
        { error: "只有 admin 可以新增帳號。" },
        { status: 403 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("employee_code", employeeCode)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: "employee_code 已存在，請使用其他員工編號。" },
        { status: 409 }
      );
    }

    const { data: createdUser, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          employee_code: employeeCode,
          role,
        },
      });

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message ?? "建立 auth user 失敗。" },
        { status: 400 }
      );
    }

    const newUserId = createdUser.user.id;

    const { error: upsertError } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          display_name: displayName,
          employee_code: employeeCode,
          role,
        },
        { onConflict: "id" }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: `auth 已建立，但 profiles 寫入失敗：${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "帳號建立成功。",
      user: {
        id: newUserId,
        email,
        display_name: displayName,
        employee_code: employeeCode,
        role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "建立帳號時發生未知錯誤。",
      },
      { status: 500 }
    );
  }
}