import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, display_name, employee_code, role } = body;

    // 1. 建立 auth user
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (userError) throw userError;

    const userId = userData.user.id;

    // 2. 插入 profiles
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        display_name,
        employee_code,
        role,
      });

    if (profileError) throw profileError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}