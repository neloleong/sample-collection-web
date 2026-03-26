"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageActionButtons from "../components/PageActionButtons";

type RegionCategory = {
  id: number;
  region_name_zh: string;
  sort_order: number;
  is_non_mainland: boolean;
};

type DailyEntryRow = {
  id?: number;
  region_id: number;
  quantity: number;
};

function getLocalTodayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function DailyEntryPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalTodayString());
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const totalQty = useMemo(() => {
    return regions.reduce((sum, region) => {
      const raw = quantities[region.id] ?? "";
      const value = raw === "" ? 0 : Number(raw);
      return sum + (Number.isNaN(value) ? 0 : value);
    }, 0);
  }, [regions, quantities]);

  const nonMainlandQty = useMemo(() => {
    return regions
      .filter((region) => region.is_non_mainland)
      .reduce((sum, region) => {
        const raw = quantities[region.id] ?? "";
        const value = raw === "" ? 0 : Number(raw);
        return sum + (Number.isNaN(value) ? 0 : value);
      }, 0);
  }, [regions, quantities]);

  const buildEmptyQuantities = (regionList: RegionCategory[]) => {
    const initial: Record<number, string> = {};
    regionList.forEach((region) => {
      initial[region.id] = "";
    });
    return initial;
  };

  const loadDailyEntries = async (
    currentUserId: string,
    currentDate: string,
    regionList: RegionCategory[]
  ) => {
    const { data, error } = await supabase
      .from("daily_entries")
      .select("region_id, quantity")
      .eq("user_id", currentUserId)
      .eq("entry_date", currentDate);

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextQuantities = buildEmptyQuantities(regionList);

    ((data ?? []) as DailyEntryRow[]).forEach((row) => {
      nextQuantities[row.region_id] = String(row.quantity);
    });

    setQuantities(nextQuantities);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      setDisplayName(profileData?.display_name ?? user.email ?? "User");

      const { data: regionData, error: regionError } = await supabase
        .from("region_categories")
        .select("id, region_name_zh, sort_order, is_non_mainland")
        .order("sort_order", { ascending: true });

      if (regionError) {
        setMessage(regionError.message);
        setLoading(false);
        return;
      }

      const regionList = (regionData ?? []) as RegionCategory[];
      setRegions(regionList);
      setQuantities(buildEmptyQuantities(regionList));

      await loadDailyEntries(user.id, selectedDate, regionList);

      setLoading(false);
    };

    void init();
  }, [router]);

  useEffect(() => {
    const reloadByDate = async () => {
      if (!userId || regions.length === 0) return;
      await loadDailyEntries(userId, selectedDate, regions);
    };

    void reloadByDate();
  }, [userId, selectedDate, regions]);

  const handleQuantityChange = (regionId: number, value: string) => {
    if (value === "") {
      setQuantities((prev) => ({ ...prev, [regionId]: "" }));
      return;
    }

    const numericValue = Number(value);

    if (Number.isNaN(numericValue) || numericValue < 0) {
      return;
    }

    setQuantities((prev) => ({ ...prev, [regionId]: value }));
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    setMessage("");

    const positivePayload = regions
      .map((region) => {
        const raw = quantities[region.id] ?? "";
        const qty = raw === "" ? 0 : Math.max(0, Number(raw) || 0);

        return {
          user_id: userId,
          entry_date: selectedDate,
          region_id: region.id,
          quantity: qty,
          note: null,
        };
      })
      .filter((row) => row.quantity > 0);

    const zeroRegionIds = regions
      .filter((region) => {
        const raw = quantities[region.id] ?? "";
        const qty = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
        return qty === 0;
      })
      .map((region) => region.id);

    if (positivePayload.length > 0) {
      const { error: upsertError } = await supabase
        .from("daily_entries")
        .upsert(positivePayload, { onConflict: "user_id,entry_date,region_id" });

      if (upsertError) {
        setMessage(upsertError.message);
        setSaving(false);
        return;
      }
    }

    if (zeroRegionIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("daily_entries")
        .delete()
        .eq("user_id", userId)
        .eq("entry_date", selectedDate)
        .in("region_id", zeroRegionIds);

      if (deleteError) {
        setMessage(deleteError.message);
        setSaving(false);
        return;
      }
    }

    await loadDailyEntries(userId, selectedDate, regions);
    setMessage("已成功儲存每日填報。");
    setSaving(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          載入中...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        
          <div>
            <h1 className="text-2xl font-bold text-slate-900">每日填報</h1>
            <p className="mt-1 text-sm text-slate-600">使用者：{displayName}</p>
            <p className="mt-1 text-sm text-slate-500">請填寫指定日期各地區完成份數</p>
          </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <PageActionButtons />
        </div>  

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                填報日期
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">當日總份數</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{totalQty}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">當日非內地份數</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {nonMainlandQty}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">地區類別填報</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {regions.map((region) => (
              <div
                key={region.id}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div>
                  <p className="text-sm text-slate-500">序號 {region.sort_order}</p>
                  <h3 className="mt-1 font-semibold text-slate-900">
                    {region.region_name_zh}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {region.is_non_mainland ? "非內地類別" : "內地類別"}
                  </p>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    今日完成份數
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="請輸入份數"
                    value={quantities[region.id] ?? ""}
                    onChange={(e) =>
                      handleQuantityChange(region.id, e.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {message ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          ) : null}

          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "儲存中..." : "儲存今日填報"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}