import { Clock3, Download, Puzzle } from "lucide-react";
import { pluginDownloadUrl } from "@/lib/plugin-release";
import "./plugin-page.css";

export function PluginPage({ downloadUrl }: { downloadUrl?: string | null }) {
  const href = pluginDownloadUrl(downloadUrl);
  return <section className="page-stack plugin-page" aria-labelledby="plugin-page-title">
    <header className="plugin-page-heading">
      <p className="eyebrow">浏览器工具</p>
      <h2 id="plugin-page-title">填表插件</h2>
    </header>
    <section className="panel plugin-download-card" aria-labelledby="plugin-product-title">
      <div className="plugin-product-icon" aria-hidden="true"><Puzzle size={38} strokeWidth={1.6} /></div>
      <div className="plugin-product-copy">
        <h3 id="plugin-product-title">职途网申助手</h3>
        <p>简历解析、个人资料管理与网申表单填写。</p>
        {!href && <small>插件发布后，将在这里开放下载。</small>}
      </div>
      <div className="plugin-download-action">
        {href
          ? <a className="primary-button plugin-download-link" href={href} target="_blank" rel="noopener noreferrer"><Download size={18} />下载插件</a>
          : <span className="plugin-coming-soon" role="status"><Clock3 size={16} />即将上线</span>}
      </div>
    </section>
  </section>;
}
