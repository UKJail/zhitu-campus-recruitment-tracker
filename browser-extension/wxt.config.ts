import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "职途填表助手",
    description: "在北森、Moka 和普通网申页面中安全地填写已确认的本地简历资料。",
    permissions: ["activeTab", "scripting", "storage", "unlimitedStorage", "sidePanel"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    minimum_chrome_version: "116",
    action: { default_title: "打开职途填表助手" },
  },
});
