import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "staff";

function normalizeRole(role: unknown): Role {
  const r = String(role ?? "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

function formatEmployeeCode(role: Role, n: number) {
  if (role === "admin") {
    return `A${String(n).padStart(3, "0")}`;
  }
  return `EMIT-QR${String(n).padStart(2, "0")}`;
}

function parseEmployeeNumber(code: string, role: Role): number | null {
  if (role === "admin") {
    const match = code.match(/^A(\d+)$/i);
    return match ? Number(match[1]) : null;
  }

  const match = code.match(/^EMIT-QR(\d+)$/i);
  return match ? Number(match[1]) : null;
}

async function getNextEmployeeCode(
  supabaseAdmin: any,
  role: Role
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("employee_code");

  if (error) {
    throw new Error(`讀取現有員工編號失敗：${error.message}`);
  }

  const maxNo = (data ?? []).reduce((max: number, row: any) => {
    const code = String(row.employee_code ?? "").trim();
    const n = parseEmployeeNumber(code, role);
    return n && n > max ? n : max;
  }, 0);

  return formatEmployeeCode(role, maxNo + 1);
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "缺少 Supabase 環境變數。" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "This endpoint requires a valid Bearer token" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const body = await req.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const displayName = String(body.display_name ?? "").trim();
    let employeeCode = String(body.employee_code ?? "").trim();
    const role = normalizeRole(body.role);

    if (!email || !password || !displayName) {
      return NextResponse.json(
        { error: "請完整填寫 Email、密碼及顯示名稱。" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密碼至少需要 6 個字元。" },
        { status: 400 }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user: requester },
      error: requesterError,
    } = await userClient.auth.getUser(token);

    if (requesterError || !requester) {
      return NextResponse.json(
        { error: "無法驗證目前登入身份。" },
        { status: 401 }
      );
    }

    const { data: requesterProfile, error: requesterProfileError } =
      await userClient
        .from("profiles")
        .select("role")
        .eq("id", requester.id)
        .single();

    if (requesterProfileError || !requesterProfile) {
      return NextResponse.json(
        { error: "找不到目前登入者的 profiles 資料。" },
        { status: 403 }
      );
    }

    if (normalizeRole(requesterProfile.role) !== "admin") {
      return NextResponse.json(
        { error: "只有 admin 可以新增帳號。" },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (!employeeCode) {
      employeeCode = await getNextEmployeeCode(supabaseAdmin, role);
    }

    const { data: existingEmployee } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("employee_code", employeeCode)
      .maybeSingle();

    if (existingEmployee) {
      return NextResponse.json(
        { error: "員工編號已存在，請使用其他員工編號。" },
        { status: 400 }
      );
    }

    const { data: createdUserData, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          employee_code: employeeCode,
          role,
        },
      });

    if (createUserError || !createdUserData.user) {
      const message =
        createUserError?.message?.includes("already been registered")
          ? "此 Email 已存在，請使用其他 Email。"
          : createUserError?.message ?? "建立帳號失敗。";

      return NextResponse.json({ error: message }, { status: 400 });
    }

    const newUser = createdUserData.user;

    const { error: profileUpsertError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: newUser.id,
          display_name: displayName,
          employee_code: employeeCode,
          role,
        },
        { onConflict: "id" }
      );

    if (profileUpsertError) {
      return NextResponse.json(
        {
          error: `auth 建立成功，但 profiles 同步失敗：${profileUpsertError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "帳號建立成功。",
      user: {
        id: newUser.id,
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