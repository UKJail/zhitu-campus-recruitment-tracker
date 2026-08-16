const cityNames = [
  "北京", "上海", "天津", "重庆", "香港", "澳门", "深圳", "广州", "杭州", "南京", "苏州", "成都", "武汉", "西安",
  "长沙", "郑州", "合肥", "济南", "青岛", "宁波", "无锡", "佛山", "东莞", "珠海", "厦门", "福州", "大连", "沈阳",
  "长春", "哈尔滨", "石家庄", "太原", "南昌", "南宁", "昆明", "贵阳", "海口", "三亚", "兰州", "西宁", "银川",
  "乌鲁木齐", "呼和浩特", "温州", "常州", "南通", "徐州", "扬州", "镇江", "泰州", "盐城", "连云港", "嘉兴",
  "绍兴", "金华", "湖州", "台州", "舟山", "泉州", "漳州", "莆田", "龙岩", "烟台", "潍坊", "威海", "临沂",
  "淄博", "济宁", "泰安", "洛阳", "开封", "南阳", "宜昌", "襄阳", "荆州", "株洲", "湘潭", "衡阳", "惠州",
  "中山", "江门", "汕头", "湛江", "肇庆", "桂林", "柳州", "北海", "遵义", "宜宾", "绵阳", "德阳", "乐山",
  "唐山", "保定", "廊坊", "秦皇岛", "邯郸", "包头", "鄂尔多斯", "鞍山", "吉林", "赣州", "芜湖", "安庆",
  "池州", "昆山", "义乌", "拉萨",
] as const;

const provinceNames = [
  "广东", "浙江", "江苏", "山东", "福建", "四川", "湖北", "湖南", "河南", "河北", "安徽", "陕西", "山西", "江西",
  "辽宁", "吉林", "黑龙江", "云南", "贵州", "广西", "海南", "甘肃", "青海", "宁夏", "新疆", "西藏", "内蒙古", "台湾",
] as const;

const englishAliases: Array<[string, RegExp]> = [
  ["香港", /hong\s*kong/i], ["北京", /beijing/i], ["上海", /shanghai/i], ["深圳", /shenzhen/i], ["广州", /guangzhou/i],
  ["杭州", /hangzhou/i], ["南京", /nanjing/i], ["苏州", /suzhou/i], ["成都", /chengdu/i], ["武汉", /wuhan/i],
  ["西安", /xi['’\s-]?an/i], ["天津", /tianjin/i], ["重庆", /chongqing/i], ["青岛", /qingdao/i], ["厦门", /xiamen/i],
  ["大连", /dalian/i], ["长沙", /changsha/i], ["郑州", /zhengzhou/i], ["合肥", /hefei/i], ["宁波", /ningbo/i],
];

export function normalizeOfferstarCities(value: string) {
  const input = value.replace(/&nbsp;/gi, " ").trim();
  if (!input) return ["地点待确认"];
  const matches: Array<{ name: string; index: number }> = [];
  for (const city of cityNames) {
    const index = input.indexOf(city);
    if (index >= 0) matches.push({ name: city, index });
  }
  for (const [name, pattern] of englishAliases) {
    const match = input.match(pattern);
    if (match?.index != null && !matches.some((item) => item.name === name)) matches.push({ name, index: match.index });
  }
  if (matches.length === 0) {
    for (const province of provinceNames) {
      const index = input.indexOf(province);
      if (index >= 0) matches.push({ name: province, index });
    }
  }
  if (/全国|多地|nationwide/i.test(input)) matches.push({ name: "全国", index: input.search(/全国|多地|nationwide/i) });
  if (/海外|overseas|global/i.test(input)) matches.push({ name: "海外", index: input.search(/海外|overseas|global/i) });
  if (/远程|线上|remote|work\s*from\s*home/i.test(input)) matches.push({ name: "远程", index: input.search(/远程|线上|remote|work\s*from\s*home/i) });
  const normalized = [...new Set(matches.sort((a, b) => a.index - b.index).map((item) => item.name))];
  return normalized.length ? normalized : ["地点待确认"];
}
