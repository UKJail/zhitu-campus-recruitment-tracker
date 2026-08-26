import type { AutofillProfileV1, Education, Experience, Project } from "../types/profile";
import { createId } from "../types/profile";

type Props = {
  profile: AutofillProfileV1;
  onChange: (profile: AutofillProfileV1) => void;
};

function Field({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder = "" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field field--wide">
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} rows={3} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="editor-section">
      <header><h3>{title}</h3><p>{note}</p></header>
      {children}
    </section>
  );
}

export function ProfileEditor({ profile, onChange }: Props) {
  const updatePersonal = (key: keyof AutofillProfileV1["personal"], value: string) => {
    onChange({ ...profile, personal: { ...profile.personal, [key]: value } });
  };
  const updateContact = (key: keyof AutofillProfileV1["contact"], value: string) => {
    onChange({ ...profile, contact: { ...profile.contact, [key]: value } });
  };
  const updateEducation = (index: number, patch: Partial<Education>) => {
    onChange({ ...profile, education: profile.education.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };
  const updateExperience = (index: number, patch: Partial<Experience>) => {
    onChange({ ...profile, experiences: profile.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };
  const updateProject = (index: number, patch: Partial<Project>) => {
    onChange({ ...profile, projects: profile.projects.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  return (
    <div className="profile-editor">
      <Section title="基本资料" note="只填真实、可以在面试中直接解释的信息。">
        <div className="field-grid">
          <Field label="模板名称" value={profile.name} onChange={(name) => onChange({ ...profile, name })} />
          <label className="field"><span>模板语言</span><select value={profile.language} onChange={(event) => onChange({ ...profile, language: event.target.value as AutofillProfileV1["language"] })}><option value="zh-CN">简体中文</option><option value="zh-HK">繁体中文</option><option value="en">English</option></select></label>
          <Field label="姓名" value={profile.personal.fullName} onChange={(value) => updatePersonal("fullName", value)} />
          <Field label="姓氏" value={profile.personal.familyName} onChange={(value) => updatePersonal("familyName", value)} />
          <Field label="名字" value={profile.personal.givenName} onChange={(value) => updatePersonal("givenName", value)} />
          <label className="field"><span>性别 · 需复核</span><select value={profile.personal.gender} onChange={(event) => updatePersonal("gender", event.target.value)}><option value="">留空</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option><option value="prefer-not-to-say">不愿透露</option></select></label>
          <Field label="出生日期 · 需复核" type="date" value={profile.personal.birthDate} onChange={(value) => updatePersonal("birthDate", value)} />
          <Field label="政治面貌 · 需复核" value={profile.personal.politicalStatus} onChange={(value) => updatePersonal("politicalStatus", value)} />
          <Field label="国籍 · 需复核" value={profile.personal.nationality} onChange={(value) => updatePersonal("nationality", value)} />
          <Field label="籍贯/生源地 · 需复核" value={profile.personal.nativePlace} onChange={(value) => updatePersonal("nativePlace", value)} placeholder="如：山东省青岛市" />
          <Field label="邮箱" type="email" value={profile.contact.email} onChange={(value) => updateContact("email", value)} />
          <Field label="手机号" value={profile.contact.phone} onChange={(value) => updateContact("phone", value)} />
          <Field label="国家区号" value={profile.contact.countryCode} onChange={(value) => updateContact("countryCode", value)} />
          <Field label="国家" value={profile.contact.country} onChange={(value) => updateContact("country", value)} />
          <Field label="省份" value={profile.contact.province} onChange={(value) => updateContact("province", value)} />
          <Field label="城市" value={profile.contact.city} onChange={(value) => updateContact("city", value)} />
          <Field label="联系地址" value={profile.contact.address} onChange={(value) => updateContact("address", value)} />
          <Field label="邮编" value={profile.contact.postalCode} onChange={(value) => updateContact("postalCode", value)} />
          <Field label="微信号" value={profile.contact.wechat} onChange={(value) => updateContact("wechat", value)} />
          <Field label="LinkedIn" value={profile.links.linkedin} onChange={(linkedin) => onChange({ ...profile, links: { ...profile.links, linkedin } })} />
          <Field label="GitHub" value={profile.links.github} onChange={(github) => onChange({ ...profile, links: { ...profile.links, github } })} />
          <Field label="作品集/个人网站" value={profile.links.portfolio} onChange={(portfolio) => onChange({ ...profile, links: { ...profile.links, portfolio } })} />
          <Textarea label="个人概述" value={profile.personal.summary} onChange={(value) => updatePersonal("summary", value)} placeholder="不写空泛自评，只保留真实背景。" />
        </div>
      </Section>

      <Section title="教育经历" note="插件只填写网页已经存在的经历区块，不会自动点击“新增”。">
        {profile.education.map((item, index) => (
          <article className="repeat-row" key={item.id}>
            <div className="repeat-row__head"><strong>教育 {index + 1}</strong><button className="text-button danger" onClick={() => onChange({ ...profile, education: profile.education.filter((_, itemIndex) => itemIndex !== index) })}>删除</button></div>
            <div className="field-grid">
              <Field label="学校" value={item.school} onChange={(school) => updateEducation(index, { school })} />
              <Field label="学历" value={item.degree} onChange={(degree) => updateEducation(index, { degree })} placeholder="如：本科、硕士研究生" />
              <Field label="学位" value={item.academicDegree} onChange={(academicDegree) => updateEducation(index, { academicDegree })} placeholder="如：学士、硕士" />
              <Field label="学历类型" value={item.educationType} onChange={(educationType) => updateEducation(index, { educationType })} placeholder="如：全日制" />
              <Field label="专业" value={item.field} onChange={(field) => updateEducation(index, { field })} />
              <Field label="入学时间" type="month" value={item.startDate} onChange={(startDate) => updateEducation(index, { startDate })} />
              <Field label="毕业时间" type="month" value={item.endDate} onChange={(endDate) => updateEducation(index, { endDate })} />
              <label className="field"><span>是否海外院校毕业</span><select value={item.overseasSchool} onChange={(event) => updateEducation(index, { overseasSchool: event.target.value as Education["overseasSchool"] })}><option value="">未设置</option><option value="yes">是</option><option value="no">否</option></select></label>
              <Field label="GPA · 需复核" value={item.gpa} onChange={(gpa) => updateEducation(index, { gpa })} />
              <Field label="排名 · 需复核" value={item.ranking} onChange={(ranking) => updateEducation(index, { ranking })} />
              <Textarea label="课程/补充信息" value={item.details.join("\n")} onChange={(value) => updateEducation(index, { details: value.split("\n").filter(Boolean) })} />
            </div>
          </article>
        ))}
        <button className="add-row" onClick={() => onChange({ ...profile, education: [...profile.education, { id: createId("education"), school: "", degree: "", academicDegree: "", educationType: "", field: "", startDate: "", endDate: "", gpa: "", ranking: "", overseasSchool: "", details: [] }] })}>＋ 添加教育经历</button>
      </Section>

      <Section title="实习、工作与校园经历" note="经历类型会被严格保留，不把实习或校园活动包装成正式工作。">
        {profile.experiences.map((item, index) => (
          <article className="repeat-row" key={item.id}>
            <div className="repeat-row__head"><strong>经历 {index + 1}</strong><button className="text-button danger" onClick={() => onChange({ ...profile, experiences: profile.experiences.filter((_, itemIndex) => itemIndex !== index) })}>删除</button></div>
            <div className="field-grid">
              <label className="field"><span>经历类型</span><select value={item.type} onChange={(event) => updateExperience(index, { type: event.target.value as Experience["type"] })}><option value="internship">实习</option><option value="employment">正式工作</option><option value="campus">校园活动/社团</option><option value="research">学术研究</option><option value="volunteer">志愿服务</option></select></label>
              <Field label="组织/公司" value={item.organization} onChange={(organization) => updateExperience(index, { organization })} />
              <Field label="岗位/角色" value={item.role} onChange={(role) => updateExperience(index, { role })} />
              <Field label="地点" value={item.location} onChange={(location) => updateExperience(index, { location })} />
              <Field label="开始时间" type="month" value={item.startDate} onChange={(startDate) => updateExperience(index, { startDate })} />
              <Field label="结束时间" type="month" value={item.endDate} onChange={(endDate) => updateExperience(index, { endDate })} />
              <Textarea label="职责与成果，每行一条" value={item.bullets.join("\n")} onChange={(value) => updateExperience(index, { bullets: value.split("\n").filter(Boolean) })} />
            </div>
          </article>
        ))}
        <button className="add-row" onClick={() => onChange({ ...profile, experiences: [...profile.experiences, { id: createId("experience"), type: "internship", organization: "", role: "", location: "", startDate: "", endDate: "", current: false, bullets: [] }] })}>＋ 添加一段经历</button>
      </Section>

      <Section title="项目经历" note="课程、毕业设计、科研和竞赛项目分别记录。">
        {profile.projects.map((item, index) => (
          <article className="repeat-row" key={item.id}>
            <div className="repeat-row__head"><strong>项目 {index + 1}</strong><button className="text-button danger" onClick={() => onChange({ ...profile, projects: profile.projects.filter((_, itemIndex) => itemIndex !== index) })}>删除</button></div>
            <div className="field-grid">
              <label className="field"><span>项目类型</span><select value={item.type} onChange={(event) => updateProject(index, { type: event.target.value as Project["type"] })}><option value="course">课程项目</option><option value="graduation">毕业设计</option><option value="research">学术研究</option><option value="competition">竞赛项目</option><option value="personal">个人项目</option></select></label>
              <Field label="项目名称" value={item.name} onChange={(name) => updateProject(index, { name })} />
              <Field label="本人角色" value={item.role} onChange={(role) => updateProject(index, { role })} />
              <Field label="开始时间" type="month" value={item.startDate} onChange={(startDate) => updateProject(index, { startDate })} />
              <Field label="结束时间" type="month" value={item.endDate} onChange={(endDate) => updateProject(index, { endDate })} />
              <Field label="项目链接" value={item.link} onChange={(link) => updateProject(index, { link })} />
              <Textarea label="项目描述" value={item.description} onChange={(description) => updateProject(index, { description })} />
              <Textarea label="行动与结果，每行一条" value={item.bullets.join("\n")} onChange={(value) => updateProject(index, { bullets: value.split("\n").filter(Boolean) })} />
            </div>
          </article>
        ))}
        <button className="add-row" onClick={() => onChange({ ...profile, projects: [...profile.projects, { id: createId("project"), type: "course", name: "", role: "", startDate: "", endDate: "", description: "", bullets: [], link: "" }] })}>＋ 添加项目</button>
      </Section>

      <Section title="竞赛、奖项与证书" note="保留颁发方、等级和日期；无法从简历确认的内容请留空。">
        {profile.awards.map((item, index) => (
          <article className="repeat-row" key={item.id}>
            <div className="repeat-row__head"><strong>奖项 {index + 1}</strong><button className="text-button danger" onClick={() => onChange({ ...profile, awards: profile.awards.filter((_, itemIndex) => itemIndex !== index) })}>删除</button></div>
            <div className="field-grid">
              <Field label="奖项/竞赛名称" value={item.name} onChange={(name) => onChange({ ...profile, awards: profile.awards.map((award, itemIndex) => itemIndex === index ? { ...award, name } : award) })} />
              <Field label="等级/名次" value={item.level} onChange={(level) => onChange({ ...profile, awards: profile.awards.map((award, itemIndex) => itemIndex === index ? { ...award, level } : award) })} />
              <Field label="颁发方" value={item.issuer} onChange={(issuer) => onChange({ ...profile, awards: profile.awards.map((award, itemIndex) => itemIndex === index ? { ...award, issuer } : award) })} />
              <Field label="获奖日期" type="month" value={item.date} onChange={(date) => onChange({ ...profile, awards: profile.awards.map((award, itemIndex) => itemIndex === index ? { ...award, date } : award) })} />
              <Textarea label="说明" value={item.description} onChange={(description) => onChange({ ...profile, awards: profile.awards.map((award, itemIndex) => itemIndex === index ? { ...award, description } : award) })} />
            </div>
          </article>
        ))}
        <button className="add-row" onClick={() => onChange({ ...profile, awards: [...profile.awards, { id: createId("award"), name: "", level: "", issuer: "", date: "", description: "" }] })}>＋ 添加奖项/竞赛</button>
        {profile.certificates.map((item, index) => (
          <article className="repeat-row" key={item.id}>
            <div className="repeat-row__head"><strong>证书 {index + 1}</strong><button className="text-button danger" onClick={() => onChange({ ...profile, certificates: profile.certificates.filter((_, itemIndex) => itemIndex !== index) })}>删除</button></div>
            <div className="field-grid">
              <Field label="证书名称" value={item.name} onChange={(name) => onChange({ ...profile, certificates: profile.certificates.map((certificate, itemIndex) => itemIndex === index ? { ...certificate, name } : certificate) })} />
              <Field label="颁发方" value={item.issuer} onChange={(issuer) => onChange({ ...profile, certificates: profile.certificates.map((certificate, itemIndex) => itemIndex === index ? { ...certificate, issuer } : certificate) })} />
              <Field label="取得日期" type="month" value={item.date} onChange={(date) => onChange({ ...profile, certificates: profile.certificates.map((certificate, itemIndex) => itemIndex === index ? { ...certificate, date } : certificate) })} />
              <Field label="证书编号（仅普通资格编号）" value={item.credentialId} onChange={(credentialId) => onChange({ ...profile, certificates: profile.certificates.map((certificate, itemIndex) => itemIndex === index ? { ...certificate, credentialId } : certificate) })} />
            </div>
          </article>
        ))}
        <button className="add-row" onClick={() => onChange({ ...profile, certificates: [...profile.certificates, { id: createId("certificate"), name: "", issuer: "", date: "", credentialId: "" }] })}>＋ 添加证书</button>
      </Section>

      <Section title="技能与语言" note="只写实际使用过的能力，不自动升级成“熟练”或“精通”。">
        <div className="compact-list">
          {profile.skills.map((item, index) => <div className="compact-row" key={item.id}><input aria-label="技能名称" placeholder="技能名称" value={item.name} onChange={(event) => onChange({ ...profile, skills: profile.skills.map((skill, itemIndex) => itemIndex === index ? { ...skill, name: event.target.value } : skill) })} /><input aria-label="技能程度" placeholder="程度（可留空）" value={item.level} onChange={(event) => onChange({ ...profile, skills: profile.skills.map((skill, itemIndex) => itemIndex === index ? { ...skill, level: event.target.value } : skill) })} /><button className="text-button danger" onClick={() => onChange({ ...profile, skills: profile.skills.filter((_, itemIndex) => itemIndex !== index) })}>删</button></div>)}
          <button className="add-row" onClick={() => onChange({ ...profile, skills: [...profile.skills, { id: createId("skill"), name: "", level: "" }] })}>＋ 添加技能</button>
          {profile.languages.map((item, index) => <div className="compact-row" key={item.id}><input aria-label="语言" placeholder="语言" value={item.name} onChange={(event) => onChange({ ...profile, languages: profile.languages.map((language, itemIndex) => itemIndex === index ? { ...language, name: event.target.value } : language) })} /><input aria-label="语言程度" placeholder="水平/证书" value={item.level} onChange={(event) => onChange({ ...profile, languages: profile.languages.map((language, itemIndex) => itemIndex === index ? { ...language, level: event.target.value } : language) })} /><button className="text-button danger" onClick={() => onChange({ ...profile, languages: profile.languages.filter((_, itemIndex) => itemIndex !== index) })}>删</button></div>)}
          <button className="add-row" onClick={() => onChange({ ...profile, languages: [...profile.languages, { id: createId("language"), name: "", level: "", certificates: [] }] })}>＋ 添加语言</button>
        </div>
      </Section>

      <Section title="求职偏好与答案库" note="这些内容经常不在简历里，保存后仍会被标记复核。">
        <div className="field-grid">
          <Field label="目标岗位，用逗号分隔" value={profile.jobPreferences.targetRoles.join("，")} onChange={(value) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, targetRoles: value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) } })} />
          <Field label="意向城市，用逗号分隔" value={profile.jobPreferences.locations.join("，")} onChange={(value) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, locations: value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) } })} />
          <Field label="期望薪资 · 需复核" value={profile.jobPreferences.expectedSalary} onChange={(expectedSalary) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, expectedSalary } })} />
          <Field label="可到岗日期 · 需复核" type="date" value={profile.jobPreferences.availableDate} onChange={(availableDate) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, availableDate } })} />
          <Field label="工作许可 · 需复核" value={profile.jobPreferences.workAuthorization} onChange={(workAuthorization) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, workAuthorization } })} />
          <Field label="签证担保 · 需复核" value={profile.jobPreferences.sponsorship} onChange={(sponsorship) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, sponsorship } })} />
        </div>
        {profile.answerBank.map((item, index) => <div className="answer-row" key={item.id}><Field label="问题原文/关键词" value={item.question} onChange={(question) => onChange({ ...profile, answerBank: profile.answerBank.map((answer, itemIndex) => itemIndex === index ? { ...answer, question } : answer) })} /><Textarea label="已确认答案" value={item.answer} onChange={(answerValue) => onChange({ ...profile, answerBank: profile.answerBank.map((answer, itemIndex) => itemIndex === index ? { ...answer, answer: answerValue } : answer) })} /><button className="text-button danger" onClick={() => onChange({ ...profile, answerBank: profile.answerBank.filter((_, itemIndex) => itemIndex !== index) })}>删除这条答案</button></div>)}
        <button className="add-row" onClick={() => onChange({ ...profile, answerBank: [...profile.answerBank, { id: createId("answer"), question: "", answer: "", reviewRequired: true }] })}>＋ 添加常见问题答案</button>
      </Section>
    </div>
  );
}
