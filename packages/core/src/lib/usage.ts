import { supabase } from "./supabaseClient";
import { createActivityReporter, type UsageDevice } from "./usageShape";

export interface UsageRow extends UsageDevice {
  user_id: string;
  email: string | null;
  nickname: string;
  device_id: string;
  first_seen_at: string;
  last_active_at: string;
  total_count: number;
}

export async function isUsageAdministrator(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_usage_administrator");
  return !error && data === true;
}

export async function listUsageActivity(search = "", offset = 0): Promise<UsageRow[]> {
  const { data, error } = await supabase.rpc("list_usage_activity", {
    p_search: search,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function usageReporter(device: UsageDevice, randomUUID: () => string) {
  let deviceId: string | undefined;
  return createActivityReporter(async () => {
    // Keep the installation identifier even if storage is temporarily unavailable.
    if (!deviceId) {
      try {
        deviceId = localStorage.getItem("napp:usage-device") ?? undefined;
      } catch {
        /* Private storage. */
      }
      if (
        !deviceId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)
      ) {
        deviceId = randomUUID();
        try {
          localStorage.setItem("napp:usage-device", deviceId);
        } catch {
          /* Keep it in memory. */
        }
      }
    }
    await supabase.rpc("record_usage_activity", {
      p_device_id: deviceId,
      p_client: device.client,
      p_device: device.device,
      p_os: device.os,
      p_browser: device.browser,
    });
  });
}
