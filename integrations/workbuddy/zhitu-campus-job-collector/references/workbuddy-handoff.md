# WorkBuddy 交付职途岗位数据

主操作手册：`D:/求职追踪网页/WORKBUDDY_WEEKLY_SYNC_HANDOFF.md`。

执行采集时读取该手册。当前具体岗位只以 OfferStar 全量快照为职途职位库主来源；企业官网只做“企业校招入口”目录。不得读取个人偏好，不得生成 S/A/B、推荐分或匹配分。

最小交付物：

- `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\offerstar-to-zhitu.json`
- `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\offerstar-to-zhitu-report.json`
- `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\offerstar-run-summary.json`
- `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\career-portals.json`
- `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\career-portals-report.md`
- `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\career-portals-run-summary.json`

OfferStar 岗位数组顺序必须保留页面默认顺序；职途会按该顺序展示。岗位展示字段必须尽量覆盖：公司名称、标题、批次、更新时间、招聘岗位、工作地点、行业、招聘类型、截止时间、操作链接。

任何写库操作都不属于 WorkBuddy 本阶段职责。先交付报告和绝对文件路径，等待职途维护者复核与用户确认。
