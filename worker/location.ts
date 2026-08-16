const cityAliases: Array<[string, RegExp]> = [
  ["香港", /(?:hong\s*kong(?:\s*sar)?|hongkong|香港)/i],
  ["北京", /(?:beijing|peking|北京)/i],
  ["上海", /(?:shanghai|上海)/i],
  ["深圳", /(?:shenzhen|深圳)/i],
  ["广州", /(?:guangzhou|canton|广州)/i],
  ["杭州", /(?:hangzhou|杭州)/i],
  ["南京", /(?:nanjing|南京)/i],
  ["苏州", /(?:suzhou|苏州)/i],
  ["成都", /(?:chengdu|成都)/i],
  ["重庆", /(?:chongqing|重庆)/i],
  ["武汉", /(?:wuhan|武汉)/i],
  ["西安", /(?:xi['’\s-]?an|xian|西安)/i],
  ["天津", /(?:tianjin|天津)/i],
  ["青岛", /(?:qingdao|tsingtao|青岛)/i],
  ["大连", /(?:dalian|大连)/i],
  ["厦门", /(?:xiamen|厦门)/i],
  ["福州", /(?:fuzhou|福州)/i],
  ["济南", /(?:jinan|济南)/i],
  ["长沙", /(?:changsha|长沙)/i],
  ["郑州", /(?:zhengzhou|郑州)/i],
  ["合肥", /(?:hefei|合肥)/i],
  ["宁波", /(?:ningbo|宁波)/i],
  ["无锡", /(?:wuxi|无锡)/i],
  ["佛山", /(?:foshan|佛山)/i],
  ["东莞", /(?:dongguan|东莞)/i],
  ["珠海", /(?:zhuhai|珠海)/i],
  ["海口", /(?:haikou|海口)/i],
  ["三亚", /(?:sanya|三亚)/i],
  ["昆明", /(?:kunming|昆明)/i],
  ["南宁", /(?:nanning|南宁)/i],
  ["贵阳", /(?:guiyang|贵阳)/i],
  ["沈阳", /(?:shenyang|沈阳)/i],
  ["长春", /(?:changchun|长春)/i],
  ["哈尔滨", /(?:harbin|哈尔滨)/i],
  ["石家庄", /(?:shijiazhuang|石家庄)/i],
  ["太原", /(?:taiyuan|太原)/i],
  ["南昌", /(?:nanchang|南昌)/i],
  ["乌鲁木齐", /(?:urumqi|wulumuqi|乌鲁木齐)/i],
  ["呼和浩特", /(?:hohhot|huhehaote|呼和浩特)/i],
  ["兰州", /(?:lanzhou|兰州)/i],
  ["西宁", /(?:xining|西宁)/i],
  ["银川", /(?:yinchuan|银川)/i],
  ["拉萨", /(?:lhasa|拉萨)/i],
  ["澳门", /(?:macao|macau|澳门)/i],
];

const provinceAliases: Array<[string, RegExp]> = [
  ["广东", /(?:guangdong|广东)/i], ["广西", /(?:guangxi|广西)/i],
  ["云南", /(?:yunnan|云南)/i], ["贵州", /(?:guizhou|贵州)/i],
  ["海南", /(?:hainan|海南)/i], ["浙江", /(?:zhejiang|浙江)/i],
  ["江苏", /(?:jiangsu|江苏)/i], ["福建", /(?:fujian|福建)/i],
  ["山东", /(?:shandong|山东)/i], ["四川", /(?:sichuan|四川)/i],
  ["湖北", /(?:hubei|湖北)/i], ["湖南", /(?:hunan|湖南)/i],
  ["河南", /(?:henan|河南)/i], ["河北", /(?:hebei|河北)/i],
  ["安徽", /(?:anhui|安徽)/i], ["陕西", /(?:shaanxi|陕西)/i],
];

export function normalizeLocationToChinese(value: string) {
  const input = value.replace(/&nbsp;/gi, " ").trim();
  if (!input) return "";
  const matches: Array<{ name: string; index: number }> = [];
  for (const [name, pattern] of cityAliases) {
    const match = input.match(pattern);
    if (match?.index != null) matches.push({ name, index: match.index });
  }
  if (matches.length === 0) {
    for (const [name, pattern] of provinceAliases) {
      const match = input.match(pattern);
      if (match?.index != null) matches.push({ name, index: match.index });
    }
  }
  const remote = input.match(/\b(?:remote|work\s*from\s*home)\b|远程/i);
  if (remote?.index != null) matches.push({ name: "远程", index: remote.index });
  if (matches.length === 0 && /(?:mainland\s*china|china|中国大陆|中国)/i.test(input)) matches.push({ name: "中国", index: 0 });
  if (matches.length === 0 && /(?:nationwide|全国)/i.test(input)) matches.push({ name: "全国", index: 0 });
  return [...new Set(matches.sort((a, b) => a.index - b.index).map((item) => item.name))].join("、");
}

export function isMainlandOrHongKongLocation(value: string) {
  const normalized = normalizeLocationToChinese(value);
  return Boolean(normalized && normalized !== "澳门");
}
