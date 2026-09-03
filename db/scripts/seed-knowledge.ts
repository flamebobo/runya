// M5 知识种子：插入 12 篇 PUBLISHED 知识。
// 知识内容是平台内容（admin 在 M12 管理来源），种子只服务开发与联调。
// 幂等：按 id 固定写入，重复执行覆盖同 id 行。
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

// 固定前缀 + 可读后缀，保证重复执行幂等且测试可引用。
const SEED_IDS = [
  'knowledge-food-intro',
  'knowledge-food-texture',
  'knowledge-sleep-rhythm',
  'knowledge-sleep-night',
  'knowledge-teething-comfort',
  'knowledge-motor-rolling',
  'knowledge-motor-crawl',
  'knowledge-language-babbling',
  'knowledge-cognition-object',
  'knowledge-parenting-play',
  'knowledge-safety-home',
  'knowledge-safety-water',
] as const;

type SeedArticle = {
  key: (typeof SEED_IDS)[number];
  title: string;
  summary: string;
  body: string;
  category: string;
  minAgeDays: number | null;
  maxAgeDays: number | null;
  sourceName: string;
  sourceUrl: string | null;
  priority: number;
};

const REVIEWED_AT = Date.UTC(2026, 7, 20);

const ARTICLES: SeedArticle[] = [
  {
    key: 'knowledge-food-intro',
    title: '第一口辅食，从一勺开始',
    summary: '满 6 个月左右可以尝试引入辅食，从强化铁的米粉开始，一次只加一种。',
    body: '世界卫生组织建议满 6 个月（约 180 天）左右引入辅食，同时继续母乳或配方奶喂养。\n\n第一口辅食推荐强化铁的婴儿米粉：取一小勺，调成稀糊状，选宝宝状态好的时候尝试。第一次吃多少并不重要，重点是让宝宝熟悉勺子和新的味道。\n\n引入新食物后观察 2–3 天，留意有没有皮疹、呕吐或腹泻。一次只加一种新食物，出现不适时更容易找到原因。\n\n如果宝宝把食物顶出来，不代表不喜欢，可能只是还不会闭嘴吞咽，过几天再试试就好。',
    category: 'FOOD',
    minAgeDays: 150,
    maxAgeDays: 240,
    sourceName: '世界卫生组织婴幼儿喂养建议',
    sourceUrl: 'https://www.who.int/health-topics/infant-feeding',
    priority: 90,
  },
  {
    key: 'knowledge-food-texture',
    title: '辅食质地，跟着咀嚼能力走',
    summary: '从稀糊到碎末再到小块，质地的升级比数量更重要。',
    body: '辅食不是一直吃泥。随着宝宝学会吞咽和咀嚼，质地应该逐步升级：\n\n6–7 个月：细腻的稀糊；\n8–9 个月：稍稠的碎末状，可以开始给软烂的手指食物；\n10–12 个月：小块状，鼓励宝宝自己抓着吃。\n\n质地升级能锻炼咀嚼肌和口腔协调，也是语言发育的基础之一。一直吃过于细腻的泥，反而可能让宝宝更抗拒颗粒感。\n\n每次升级质地时保持耐心，宝宝吐出来是练习的一部分，不是失败。',
    category: 'FOOD',
    minAgeDays: 210,
    maxAgeDays: 400,
    sourceName: '中国营养学会妇幼营养分会',
    sourceUrl: null,
    priority: 70,
  },
  {
    key: 'knowledge-sleep-rhythm',
    title: '白天小睡的节奏，可以慢慢观察出来',
    summary: '3–6 个月的宝宝白天通常有 3 次左右小睡，观察困意信号比卡时间更有效。',
    body: '每个宝宝的睡眠节奏都不一样，与其对照标准时间表，不如观察自己的宝宝：\n\n揉眼睛、打哈欠、目光发呆、烦躁不安，这些都是困意信号。抓住信号安排小睡，入睡会顺利很多。\n\n3–6 个月的宝宝白天通常有 3–4 次小睡，每次 30 分钟到 2 小时不等。白天小睡总时长在 3–5 小时之间都属正常。\n\n固定一套简短的小睡程序（拉窗帘、抱一抱、哼首歌）能帮助宝宝把「要睡觉了」和这些动作联系起来。节奏是慢慢长出来的，不用急。',
    category: 'SLEEP',
    minAgeDays: 90,
    maxAgeDays: 210,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 85,
  },
  {
    key: 'knowledge-sleep-night',
    title: '夜醒是正常的，接觉是可以练习的',
    summary: '半夜醒来本身不是问题，宝宝只是在练习把睡眠周期连接起来。',
    body: '成人的睡眠周期约 90 分钟，婴儿只有 40–50 分钟。周期之间短暂醒来，是睡眠结构的自然组成部分，不代表「睡不好」。\n\n夜醒时先等几秒，很多宝宝会自己哼唧两声又睡回去。如果宝宝真的醒了，用最平静的方式回应：不开大灯、不逗玩、声音轻。宝宝慢慢会学到「夜里是睡觉的时间」。\n\n6 个月以后，多数宝宝在生理和情感上具备睡更久的能力，但个体差异很大。夜醒次数的减少不是一条直线，出牙、生病、大运动发展期都可能反复。',
    category: 'SLEEP',
    minAgeDays: 120,
    maxAgeDays: 300,
    sourceName: '国际儿童睡眠医学会科普材料',
    sourceUrl: null,
    priority: 80,
  },
  {
    key: 'knowledge-teething-comfort',
    title: '出牙期的不舒服，可以这样陪',
    summary: '牙龈肿胀会让宝宝烦躁爱咬东西，冷感和按压是最简单有效的安抚。',
    body: '多数宝宝在 6–10 个月之间冒出第一颗牙。出牙前牙龈可能红肿、鼓包，宝宝会流口水增多、爱咬东西、偶尔低烧样烦躁。\n\n可以尝试的安抚方式：\n\n· 把干净的咬胶放冰箱冷藏（不要冷冻）；\n· 用干净的手指或湿纱布轻轻按压牙龈；\n· 冷藏过的湿毛巾让宝宝啃咬。\n\n出牙不会引起真正的高烧。如果体温超过 38.5℃、精神差或持续哭闹，请就医评估，那更可能是别的原因。',
    category: 'TEETHING',
    minAgeDays: 150,
    maxAgeDays: 420,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 75,
  },
  {
    key: 'knowledge-motor-rolling',
    title: '翻身是身体在探索的第一步',
    summary: '多数宝宝在 3–6 个月学会翻身，多趴是帮助而非训练。',
    body: '翻身需要的不是「训练」，而是日常的趴玩时间。清醒时让宝宝趴着，从几十秒开始慢慢延长，颈部、背部和手臂的力量就是在抬头和蹬腿里一点点攒出来的。\n\n多数宝宝在 3–6 个月之间完成第一次翻身，先会从趴到仰，或从仰到趴，方向因人而异。\n\n学会翻身后要特别注意安全：换尿布不能离开人，小床上的宝宝翻身时床围和松软物品要清走。\n\n如果 7 个月还完全没有翻身的迹象，或两侧身体明显不对称，儿保时和医生聊一聊。',
    category: 'MOTOR',
    minAgeDays: 90,
    maxAgeDays: 240,
    sourceName: '世界卫生组织运动发育里程碑',
    sourceUrl: 'https://www.who.int/tools/child-growth-standards/standards/motor-development-milestones',
    priority: 82,
  },
  {
    key: 'knowledge-motor-crawl',
    title: '爬行的方式有很多种，爬着爬着就走了',
    summary: '手膝爬、匍匐爬、蹭着爬都算爬，不爬直接走的孩子也不少见。',
    body: '8–10 个月是爬行的高峰期，但爬的样子五花八门：手膝爬、匍匐爬、屁股蹭着挪、甚至倒着爬，都算数。也有相当一部分宝宝跳过爬行直接扶站学走，这同样在正常范围内。\n\n想鼓励爬行，最有效的做法是：白天多给宝宝光脚或穿防滑袜趴在地上，把感兴趣的玩具放在差一点才够到的地方。\n\n地板时间比任何教具都有用。如果宝宝 12 个月仍完全不会自主移动（爬、滚、挪都算），建议儿保时请医生评估。',
    category: 'MOTOR',
    minAgeDays: 210,
    maxAgeDays: 420,
    sourceName: '世界卫生组织运动发育里程碑',
    sourceUrl: 'https://www.who.int/tools/child-growth-standards/standards/motor-development-milestones',
    priority: 78,
  },
  {
    key: 'knowledge-language-babbling',
    title: '咿咿呀呀，是说话前的练习曲',
    summary: '4–7 个月宝宝开始发出连串元音和辅音，回应他就是最好的语言课。',
    body: '宝宝在 4–7 个月左右开始「咿呀学语」，发出 ba-ba、ma-ma 这样的连串音节。这不是巧合的称呼，而是口腔和听觉在反复练习。\n\n最好的语言刺激非常朴素：多和宝宝说话，说你正在做的事。「妈妈现在给你换尿布」「这是你小小的脚」，让语言和生活场景连在一起。\n\n宝宝发声时停顿一两秒再回应，像聊天一样一来一回，这能帮宝宝理解「交流」的节奏。\n\n如果宝宝 9 个月还很少发声、对名字没有反应，儿保时值得提一句。',
    category: 'LANGUAGE',
    minAgeDays: 120,
    maxAgeDays: 300,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 76,
  },
  {
    key: 'knowledge-cognition-object',
    title: '东西藏起来了，宝宝为什么还在找',
    summary: '8 个月前后，宝宝开始明白东西看不见了也依然存在。',
    body: '「客体永存」是认知发展的重要一步：宝宝开始明白，玩具被布盖住了，并没有从这个世界上消失。多数宝宝在 6–9 个月之间逐步建立这个概念。\n\n在家可以玩的游戏：把小玩具用手帕盖住，夸张地问「去哪儿了」，再掀开说「在这里」。宝宝找到的那一刻，你会看到真正的惊喜。\n\n这个阶段的宝宝也开始喜欢重复：反复扔东西、反复按按钮。重复是他们验证规律的方式，不是调皮。把易碎品收高一点，给宝宝一篮可以随便扔的软物，各得其所。',
    category: 'COGNITION',
    minAgeDays: 180,
    maxAgeDays: 360,
    sourceName: '皮亚杰认知发展理论科普',
    sourceUrl: null,
    priority: 70,
  },
  {
    key: 'knowledge-parenting-play',
    title: '最好的早教，是你和宝宝的日常',
    summary: '不需要昂贵的早教课，唱歌、聊天、看树叶就是高质量的互动。',
    body: '0–1 岁的宝宝最需要的学习素材，是和亲近的人之间来来回回的互动：你做一个表情，他模仿；你哼一句歌，他手舞足蹈。\n\n高质量的陪伴可以很具体：\n\n· 换尿布时指着五官说名称；\n· 散步时抱起来摸一摸树叶，描述「凉凉的」「滑滑的」；\n· 洗澡时玩舀水倒水。\n\n研究反复验证：对婴儿发展帮助最大的，是回应式互动——跟着宝宝的目光和声音走，而不是照着教案走。放松下来，你已经做得很好。',
    category: 'PARENTING',
    minAgeDays: 60,
    maxAgeDays: 450,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: 'https:// nurture-care-framework.unicef.org',
    priority: 65,
  },
  {
    key: 'knowledge-safety-home',
    title: '会翻身会爬之后，家里要重新看一遍',
    summary: '从宝宝视角趴到地上看一圈，危险比想象中低得多也近得多。',
    body: '宝宝学会翻身或爬行后，家里的安全清单要更新一遍。最有效的办法是趴下来，用宝宝的视角看房间：\n\n· 插座装保护盖，电线收好；\n· 桌角、柜角加防撞条；\n· 药品、清洁剂、纽扣电池放到宝宝够不到的柜子里；\n· 抽屉柜、书架固定在墙上，防止倾倒；\n· 小于 3.5 厘米的物件收走（能穿过卫生纸卷芯的都可能卡喉）。\n\n防撞条和插座盖是兜底，成人的视线才是第一道防线。看护永远是主动的。',
    category: 'SAFETY',
    minAgeDays: 120,
    maxAgeDays: 540,
    sourceName: '全球儿童安全组织家庭排查清单',
    sourceUrl: null,
    priority: 88,
  },
  {
    key: 'knowledge-safety-water',
    title: '洗澡时，一秒都不能移开视线',
    summary: '婴幼儿溺水可能无声且极快，洗澡全程必须一臂之内有人看护。',
    body: '只需要几厘米深的水，婴幼儿就可能发生溺水，而且往往是无声的——不会有想象中的扑腾和呼救。\n\n洗澡安全只有一条核心规则：全程一臂之内有人看着。电话、门铃、取毛巾，都先抱起宝宝再离开。\n\n澡盆里不需要多放水，5–8 厘米足够。水温用手肘或水温计确认，37–38℃ 为宜。洗完先把水放掉，空澡盆对学步期的宝宝同样是危险品。\n\n家里有水桶、水盆的，用完立即倒扣放好。',
    category: 'SAFETY',
    minAgeDays: 0,
    maxAgeDays: 540,
    sourceName: '世界卫生组织儿童伤害预防报告',
    sourceUrl: null,
    priority: 92,
  },
];

async function main() {
  const databasePath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'runew.db');
  const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });

  try {
    const now = Date.now();
    // 平台内容没有真实 user 归属，引用一个哨兵 system user，
    // 不存在则创建，保证外键约束成立。
    await client.execute({
      sql: `INSERT INTO users (id, nickname, status, locale, created_at, updated_at)
            VALUES ('01JSYSTEM00000000000000000A', '润芽编辑部', 'ACTIVE', 'zh-CN', ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [now, now],
    });

    for (const article of ARTICLES) {
      // id 由 key 派生成合法 Crockford Base32（字母全部大写，数字与字母混合不足 26 位需补齐）。
      // 直接用固定 ULID 映射，保证 id 稳定幂等。
      const id = stableId(article.key);
      await client.execute({
        sql: `INSERT INTO knowledge (
                id, title, summary, body, category, min_age_days, max_age_days,
                source_name, source_url, reviewed_at, content_version, priority,
                status, published_at, created_by, created_at, updated_by, updated_at, version
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PUBLISHED', ?, ?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                body = excluded.body,
                category = excluded.category,
                min_age_days = excluded.min_age_days,
                max_age_days = excluded.max_age_days,
                source_name = excluded.source_name,
                source_url = excluded.source_url,
                reviewed_at = excluded.reviewed_at,
                priority = excluded.priority,
                status = excluded.status,
                published_at = excluded.published_at,
                updated_at = excluded.updated_at`,
        args: [
          id,
          article.title,
          article.summary,
          article.body,
          article.category,
          article.minAgeDays,
          article.maxAgeDays,
          article.sourceName,
          article.sourceUrl,
          REVIEWED_AT,
          article.priority,
          now,
          '01JSYSTEM00000000000000000A',
          now,
          '01JSYSTEM00000000000000000A',
          now,
        ],
      });
    }
    console.log(`Seeded ${ARTICLES.length} knowledge articles into ${databasePath}`);
  } finally {
    client.close();
  }
}

// key → 稳定合法 ULID（Crockford Base32，26 位）。用 key 的稳定哈希填充，
// 首字符限定 0-7 保证可被 contracts 校验接受。
function stableId(key: string): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  let out = '0';
  let value = hash;
  while (out.length < 26) {
    out += alphabet[value % 32];
    value = Math.floor(value / 32) + out.length * 7919;
    if (value < 32) value = (hash + out.length * 104729) % 2147483647;
  }
  return out.slice(0, 26);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
