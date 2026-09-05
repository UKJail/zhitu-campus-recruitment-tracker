import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function deleteUserFiles(admin: AdminClient, userId: string) {
  const bucket = admin.storage.from("resumes");
  const folders = [userId];
  const paths: string[] = [];
  // Enumerate before removal so pagination does not skip objects.
  while (folders.length) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(folder, {
        limit: 100, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) throw new Error("无法读取用户文件，请稍后重试");
      for (const item of data) {
        if (!item.name || item.name === "." || item.name === ".." || /[/\\]/.test(item.name)) {
          throw new Error("用户文件路径异常，已停止删除");
        }
        const path = `${folder}/${item.name}`;
        if (item.id) paths.push(path);
        else folders.push(path);
      }
      if (data.length < 100) break;
    }
  }
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await bucket.remove(paths.slice(offset, offset + 100));
    if (error) throw new Error("文件清理未完成，账号尚未删除，请重试；部分文件可能已清理");
  }
}
