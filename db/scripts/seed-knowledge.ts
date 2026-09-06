// M5 知识种子：8 个分类 × 4 段重叠月龄窗 = 32 篇 PUBLISHED。
// 不写诊断结论。窗口按天闭区间，0–12 个月每一天每个分类至少一篇。
// 幂等：按 key 派生稳定 id，重复执行覆盖同 id 行。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const CATEGORIES = [
  'FOOD',
  'SLEEP',
  'TEETHING',
  'MOTOR',
  'LANGUAGE',
  'COGNITION',
  'PARENTING',
  'SAFETY',
] as const;

type KnowledgeCategory = (typeof CATEGORIES)[number];

// 重叠窗：5 个月 15 天约 165 天，落在 90–209。
const AGE_BANDS = {
  newborn: { minAgeDays: 0, maxAgeDays: 119 },
  early: { minAgeDays: 90, maxAgeDays: 209 },
  complementary: { minAgeDays: 180, maxAgeDays: 299 },
  later: { minAgeDays: 270, maxAgeDays: 400 },
} as const;

type SeedArticle = {
  key: string;
  title: string;
  summary: string;
  body: string;
  category: KnowledgeCategory;
  minAgeDays: number;
  maxAgeDays: number;
  sourceName: string;
  sourceUrl: string | null;
  priority: number;
};

const REVIEWED_AT = Date.UTC(2026, 8, 6);
const WHO_IYCF =
  'https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding';
const WHO_MOTOR =
  'https://www.who.int/tools/child-growth-standards/standards/motor-development-milestones';
const WHO_NURTURING =
  'https://www.who.int/teams/maternal-newborn-child-adolescent-health-and-ageing/child-health/nurturing-care';

const ARTICLES: SeedArticle[] = [
  {
    key: 'knowledge-food-milk',
    title: '这一阶段，奶就是正餐',
    summary: '约 6 个月前，母乳或配方奶已能提供所需水分和营养，不必额外喂水或辅食。',
    body: '世界卫生组织建议，满 6 个月前以母乳或配方奶作为主要营养来源。奶里已经含有水分，天气炎热时优先按需喂奶，而不是先加水。\n\n溢奶很常见：吃完轻轻拍背、吃完侧躺或竖抱一会儿即可。如果喷射、带绿色胆汁、体重不增，儿保时告诉医生，让专业的人判断。\n\n配方奶按罐上的刻度冲调，不额外加糖、米粉或蜂蜜。这一阶段的任务不是“加餐”，而是让宝宝吃饱、被接住。',
    category: 'FOOD',
    ...AGE_BANDS.newborn,
    sourceName: '世界卫生组织婴幼儿喂养事实综述',
    sourceUrl: WHO_IYCF,
    priority: 88,
  },
  {
    key: 'knowledge-food-ready',
    title: '辅食可以准备了，但不必抢跑',
    summary: '满 6 个月左右再引入辅食。会坐、对食物有兴趣，是准备好的信号，不是比赛。',
    body: '世界卫生组织建议约满 6 个月引入辅食，同时继续母乳或配方奶。提前加固体食物并不能让宝宝睡得更好，也不是“越早越聪明”。\n\n可以观察这些准备信号：头部较稳、靠坐时能挺住一会儿、把勺子顶出来的动作变少、看到别人吃饭会盯着看。信号可以提醒你开始准备，真正开吃仍以月龄为主。\n\n家里提前备好小勺、围兜和强化铁的婴儿米粉即可。第一次吃多少不重要，熟悉勺子和新味道才重要。',
    category: 'FOOD',
    ...AGE_BANDS.early,
    sourceName: '世界卫生组织婴幼儿喂养事实综述',
    sourceUrl: WHO_IYCF,
    priority: 86,
  },
  {
    key: 'knowledge-food-intro',
    title: '第一口辅食，从一勺开始',
    summary: '满 6 个月左右可以尝试引入辅食，从强化铁的米粉开始，一次只加一种。',
    body: '世界卫生组织建议满 6 个月左右引入辅食，同时继续母乳或配方奶。第一口推荐强化铁的婴儿米粉：取一小勺，调成稀糊，选宝宝状态好的时候尝试。\n\n引入新食物后观察 2–3 天，留意皮疹、呕吐或腹泻。一次只加一种新食物，出现不适时更容易找到原因。这是观察，不是给宝宝贴过敏标签。\n\n把食物顶出来，常常只是还不会闭嘴吞咽。过几天再试就好。奶仍然是主食，辅食是练习。',
    category: 'FOOD',
    ...AGE_BANDS.complementary,
    sourceName: '世界卫生组织婴幼儿喂养事实综述',
    sourceUrl: WHO_IYCF,
    priority: 92,
  },
  {
    key: 'knowledge-food-texture',
    title: '辅食质地，跟着咀嚼能力走',
    summary: '从稀糊到碎末再到小块，质地升级比硬加数量更重要。满 12 个月前不要给蜂蜜。',
    body: '辅食不必一直吃泥。随着吞咽和咀嚼进步，质地可以慢慢变：6–7 个月细腻稀糊；8–9 个月稍稠碎末和软的手指食物；接近 1 岁可以是小块、鼓励自己抓着吃。\n\n质地升级能锻炼口腔协调，也和日后说话有关。一直吃过细的泥，有的宝宝会更抗拒颗粒。吐出来是练习，不是失败。\n\n满 12 个月前不要给蜂蜜，避免婴儿肉毒杆菌风险。整颗葡萄、坚果、爆米花、黏稠糖块等容易卡住气道的食物先收起来。鲜牛奶不要当作这一年的主要奶类。',
    category: 'FOOD',
    ...AGE_BANDS.later,
    sourceName: '中国营养学会婴幼儿喂养指南',
    sourceUrl: null,
    priority: 90,
  },
  {
    key: 'knowledge-sleep-newborn',
    title: '仰睡、硬床垫，是最稳妥的睡姿',
    summary: '仰躺睡在平坦坚硬的小床上，床上不放枕头、毛绒和松软盖被。',
    body: '新生儿大部分时间都在睡，一次睡多久因人而异。更需要记住的是睡眠环境：每次放下都让宝宝仰躺，床垫平坦坚硬，不放枕头、靠垫、毛绒玩具和松软盖被。\n\n和大人分床同房可以，不要把宝宝放在沙发、枕头堆或成人被子里睡。过热、口鼻被挡住，都比“睡姿不好看”更需要避免。\n\n清醒窗口很短，常常吃完不久又困。困了就睡，不必按成人作息训练。摇晃宝宝不是安抚方式。',
    category: 'SLEEP',
    ...AGE_BANDS.newborn,
    sourceName: '美国儿科学会安全睡眠建议',
    sourceUrl: null,
    priority: 90,
  },
  {
    key: 'knowledge-sleep-rhythm',
    title: '白天小睡的节奏，可以慢慢观察出来',
    summary: '3–6 个月白天常有几次小睡。观察困意信号，比对照标准时间表更有用。',
    body: '每个宝宝的睡眠节奏都不一样。与其对着表格卡点，不如看自己的宝宝：揉眼睛、打哈欠、目光发呆、突然烦躁，都是困意信号。抓住信号安排小睡，入睡会顺利很多。\n\n这个阶段白天常见 3 次左右小睡，每次几十分钟到两小时都有。总时长差很多也正常，不必和别人家比。\n\n固定一套很短的小睡程序，比如拉窗帘、抱一抱、哼两句，能帮宝宝把“要睡觉了”和这些动作连起来。节奏是长出来的，不用催。',
    category: 'SLEEP',
    ...AGE_BANDS.early,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 90,
  },
  {
    key: 'knowledge-sleep-night',
    title: '夜醒是正常的，接觉是可以练习的',
    summary: '半夜醒来本身不是问题，宝宝只是在把一段段睡眠连起来。',
    body: '成人的睡眠周期大约 90 分钟，婴儿更短。周期之间短暂醒来，是睡眠结构的一部分，不代表“睡不好”。\n\n夜醒时可以先等几秒，很多宝宝哼两声又睡回去。真的醒了，用最平静的方式回应：不开大灯、不逗玩、声音轻。宝宝会慢慢把夜里和睡觉连在一起。\n\n6 个月以后，不少宝宝生理上能睡更久，但个体差异很大。出牙、生病、刚学会翻身，夜醒都可能回来。这不是你带失败了。',
    category: 'SLEEP',
    ...AGE_BANDS.complementary,
    sourceName: '国际儿童睡眠医学会科普材料',
    sourceUrl: null,
    priority: 86,
  },
  {
    key: 'knowledge-sleep-routine',
    title: '晚上的仪式，比催睡更有用',
    summary: '接近 1 岁，简短固定的睡前流程能帮宝宝预期“接下来是睡觉”。',
    body: '这个阶段白天小睡可能从三次慢慢变成两次。不必强行砍掉一觉，观察宝宝是主动延长清醒，还是下午已经困到哭。\n\n晚上用同一套短仪式：洗澡或擦洗、换睡衣、关主灯、说一句固定的话。仪式是预期，不是训练服从。\n\n有的宝宝在 8–10 个月会突然更难入睡，常常和学习爬、站、分离焦虑叠在一起。白天多陪一会儿，夜里仍保持安静回应即可。不要用睡眠时长给家庭打分。',
    category: 'SLEEP',
    ...AGE_BANDS.later,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 82,
  },
  {
    key: 'knowledge-teething-early',
    title: '爱流口水，还不等于要长牙',
    summary: '头几个月流口水、爱咬拳头，多半是口腔感觉在发育，不一定是出牙。',
    body: '唾液分泌增加、喜欢把手放进嘴里，在 3–4 个月很常见。这是口腔和手眼协调在练习，不能用来判断第一颗牙哪天长出来。\n\n多数宝宝第一颗牙在 6–10 个月左右萌出，也有更早或更晚的，都在常见范围。不必每天掰开嘴检查。\n\n这个阶段不要用含糖饼干“磨牙”，也不要买声称能催牙的零食。需要咬一咬时，给清洁的固齿器就够了。',
    category: 'TEETHING',
    ...AGE_BANDS.newborn,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 60,
  },
  {
    key: 'knowledge-teething-signs',
    title: '出牙前，牙龈可能又红又想咬',
    summary: '牙龈肿胀会让宝宝烦躁、爱咬东西。冷感和轻柔按压通常就够。',
    body: '出牙前牙龈可能发红、鼓包，宝宝流口水更多、爱咬、睡眠容易碎。这些是不舒服，不是性格变了。\n\n可以做的：把干净咬胶放进冰箱冷藏（不要冻硬）；用洗净的手指或湿纱布轻轻按牙龈。冷冻过硬的物品可能伤到牙龈。\n\n出牙一般不会引起真正的高热。如果体温明显升高、精神差、持续很难安慰，请就医评估，不要把所有不适都算在牙齿上。',
    category: 'TEETHING',
    ...AGE_BANDS.early,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 70,
  },
  {
    key: 'knowledge-teething-comfort',
    title: '出牙期的不舒服，可以这样陪',
    summary: '多数宝宝在 6–10 个月冒出第一颗牙。冷感和按压是最简单的安抚。',
    body: '多数宝宝在 6–10 个月之间长出第一颗牙，下门牙常见会先来。出牙顺序因人而异，不必按图对照焦虑。\n\n安抚仍然简单：冷藏咬胶、湿纱布轻按、多抱一抱。避免含麻醉成分的出牙凝胶自行涂抹，也不要把出牙项链长期留在脖子上。\n\n出牙不是高热的解释。超过 38.5℃、精神差或持续哭闹，请就医，让医生看是不是别的原因。',
    category: 'TEETHING',
    ...AGE_BANDS.complementary,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 84,
  },
  {
    key: 'knowledge-teething-care',
    title: '第一颗牙长出来，可以开始轻轻擦',
    summary: '牙齿萌出后，用干净湿纱布或乳牙刷轻擦，不必上牙膏催。',
    body: '第一颗牙出现后，每天用干净湿纱布或软毛乳牙刷轻轻擦一擦牙面，重点是熟悉动作，不是用力刷白。还没有牙齿时，也可以擦擦牙龈，让宝宝习惯口腔被碰。\n\n含氟牙膏的用量和起始时间，跟儿保医生确认即可。不要让宝宝含着奶瓶睡觉，牙齿长时间泡在奶里容易损伤。\n\n有的宝宝这几个月会连着长好几颗，烦躁和夜醒可能反复。安抚方式和出牙初期一样，耐心比新工具更重要。',
    category: 'TEETHING',
    ...AGE_BANDS.later,
    sourceName: '美国儿科学会口腔健康建议',
    sourceUrl: null,
    priority: 78,
  },
  {
    key: 'knowledge-motor-tummy',
    title: '清醒时趴一会儿，是在攒力气',
    summary: '有人看护的趴玩，能帮助颈部和上肢慢慢变有力。从几十秒开始即可。',
    body: '趴不是训练课。宝宝清醒、有人看着的时候，从趴几十秒开始，慢慢延长。抬头、蹬腿、用手撑，都是在为日后翻身做准备。\n\n宝宝不喜欢趴很常见：可以躺下陪着、用脸吸引，或把小镜子放在面前。哭了就抱起来，改天再试，不要按着宝宝坚持。\n\n睡眠时仍仰躺。趴只发生在清醒且有人看护时。如果两侧动作差很多，或几个月后完全没有抬头迹象，儿保时提一句。',
    category: 'MOTOR',
    ...AGE_BANDS.newborn,
    sourceName: '世界卫生组织运动发育里程碑',
    sourceUrl: WHO_MOTOR,
    priority: 84,
  },
  {
    key: 'knowledge-motor-rolling',
    title: '翻身是身体在探索的第一步',
    summary: '多数宝宝在 4–6 个月学会翻身。多趴是帮助，不是催熟。',
    body: '翻身需要的不是课程，而是日常趴玩。颈部、背部和手臂的力量，是在抬头和蹬腿里一点点攒出来的。\n\n多数宝宝在 4–6 个月完成第一次翻身，有的先趴到仰，有的先仰到趴。方向因人而异。\n\n学会翻身后，换尿布不能离开人；小床上的松软物品要清走。如果 7 个月仍完全没有翻身迹象，或身体两侧明显不对称，儿保时和医生聊一聊。',
    category: 'MOTOR',
    ...AGE_BANDS.early,
    sourceName: '世界卫生组织运动发育里程碑',
    sourceUrl: WHO_MOTOR,
    priority: 88,
  },
  {
    key: 'knowledge-motor-sitting',
    title: '坐稳是自己长出来的，不要用枕头围住',
    summary: '大约 6–8 个月，很多宝宝能坐得更稳。靠一堆枕头“练坐”并不更安全。',
    body: '独坐需要头控、核心和平衡一起到位。可以让宝宝在你两腿之间坐着玩，或坐在坚固的地面上，手放在旁边保护。\n\n用一圈枕头把宝宝围住练坐，看起来稳，摔进去却可能埋住口鼻。与其围住，不如降低高度、陪在旁边。\n\n有的宝宝先坐后爬，有的先爬后坐。这不是进度表。学步带和学步车都不能替代地板上的自由活动。',
    category: 'MOTOR',
    ...AGE_BANDS.complementary,
    sourceName: '世界卫生组织运动发育里程碑',
    sourceUrl: WHO_MOTOR,
    priority: 82,
  },
  {
    key: 'knowledge-motor-crawl',
    title: '爬的方式有很多种，爬着爬着就走了',
    summary: '手膝爬、匍匐爬、蹭着爬都算。不爬直接走的孩子也不少见。',
    body: '8–10 个月常是移动变多的阶段：手膝爬、匍匐爬、屁股蹭、甚至倒着爬，都算数。也有宝宝几乎不爬，直接扶站学走，同样常见。\n\n想鼓励移动，白天多给光脚或防滑袜的地板时间，把玩具放在差一点才够到的地方。地板比教具有用。\n\n学步车不能让宝宝更早走稳，还增加伤害风险。如果 12 个月仍完全不会自己移动（爬、滚、挪都算），儿保时请医生看一看。',
    category: 'MOTOR',
    ...AGE_BANDS.later,
    sourceName: '世界卫生组织运动发育里程碑',
    sourceUrl: WHO_MOTOR,
    priority: 84,
  },
  {
    key: 'knowledge-language-cooing',
    title: '你说话，就是最好的语言课',
    summary: '咕咕声和对视，是说话前的第一轮练习。回应他，比播放早教音频更重要。',
    body: '出生后几个月，宝宝会从哭声里长出咕咕声、元音和眼神交流。你看着他、用平常的话说正在做的事，就是语言输入。\n\n“妈妈现在给你换尿布”“这是你的小脚”，让词和生活连在一起。宝宝发声时停一两秒再回应，像聊天一样来回。\n\n不必追求识字卡片。电视和长视频不能代替面对面的声音。如果几乎没有发声、对很大的声音也没反应，儿保时提一句。',
    category: 'LANGUAGE',
    ...AGE_BANDS.newborn,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 76,
  },
  {
    key: 'knowledge-language-babbling',
    title: '咿咿呀呀，是说话前的练习曲',
    summary: '大约 4–7 个月开始出现连串音节。回应他，就是最好的语言课。',
    body: '宝宝大约在 4–7 个月开始咿呀学语，发出 ba-ba、ma-ma 这样的音节。这往往还不是在叫人，而是口腔和听觉在反复练习。\n\n最好的刺激仍然朴素：多说话，说你正在做的事。宝宝发声时停顿再回应，帮他理解交流有来有回。\n\n如果 9 个月还很少发声、叫名字几乎没有反应，儿保时值得提一句。这是提醒观察，不是下结论。',
    category: 'LANGUAGE',
    ...AGE_BANDS.early,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 80,
  },
  {
    key: 'knowledge-language-names',
    title: '叫名字会转头，是听懂的开始',
    summary: '大约 6–9 个月，很多宝宝开始对名字和简单手势有反应。',
    body: '这个阶段理解通常比表达走得更快。叫名字会看过来、你挥手他也可能挥，都是语言理解在长。\n\n可以一边做动作一边说短句：“抱抱”“再见”“给妈妈”。手势不是偷懒，是把意思变得看得见。\n\n继续少用背景电视。如果宝宝对名字完全没有反应、很少看向说话的人，把这些观察带到儿保，让医生一起看。',
    category: 'LANGUAGE',
    ...AGE_BANDS.complementary,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 78,
  },
  {
    key: 'knowledge-language-words',
    title: '第一个词出现以前，理解已经很多了',
    summary: '接近 1 岁，有的宝宝会说一两个词，有的还在用手势。理解多于开口很常见。',
    body: '大约 1 岁前后，有的宝宝会稳定说出“妈妈”“爸爸”或一个很想要的词；有的更愿意指、拉、挥手。开口早晚跨度很大，不能用邻居家的词数衡量。\n\n你可以用他的声音和手势当对话：他指杯子，你说“要水”，再把水递过去。重复真实生活里的词，比背儿歌目录有用。\n\n如果 12 个月时完全没有有意义的声音或手势交流，儿保时告诉医生。需要的是评估，不是责备。',
    category: 'LANGUAGE',
    ...AGE_BANDS.later,
    sourceName: '美国儿科学会育儿百科',
    sourceUrl: null,
    priority: 80,
  },
  {
    key: 'knowledge-cognition-gaze',
    title: '他在看你，就是在认识这个世界',
    summary: '追视人脸、黑白对比和慢慢移动的东西，是头几个月的认知功课。',
    body: '新生儿最爱看的是人脸，尤其是眼睛和嘴的距离。你靠近、慢慢移动，让他追视，已经是在练习注意。\n\n高对比的简单形状对这个阶段更友善，不必摆一堆闪灯玩具。醒着的时候抱起来看看窗外，也比屏幕有用。\n\n认知此刻藏在日常里：吃奶被接住、哭了有人来。稳定的回应，比任何早教方案都更像学习。',
    category: 'COGNITION',
    ...AGE_BANDS.newborn,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 72,
  },
  {
    key: 'knowledge-cognition-cause',
    title: '踢一下会动，他就发现世界被他影响了',
    summary: '大约 3–6 个月，宝宝开始把动作和结果连起来。重复是在验证，不是调皮。',
    body: '拍打会响的玩具、踢会动的挂件，宝宝在学：我做一件事，外面会有变化。这种因果感是认知的台阶。\n\n给他能安全抓握、拍打的东西即可。你也可以玩“躲猫猫”的很慢版本：用手挡脸再拿开，让惊喜短而清楚。\n\n重复同一件事许多遍，是在确认规律。把易碎品收高，留下可以随便探索的几样就好。',
    category: 'COGNITION',
    ...AGE_BANDS.early,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 74,
  },
  {
    key: 'knowledge-cognition-object',
    title: '东西藏起来了，宝宝为什么还在找',
    summary: '大约 6–9 个月，宝宝开始明白看不见的东西也可能还在。',
    body: '“客体永存”是认知的一步：玩具被布盖住，并不等于消失。多数宝宝在 6–9 个月慢慢建立这个概念。\n\n在家可以把小玩具用手帕盖住，问“去哪儿了”，再掀开说“在这里”。找到的那一刻，你会看到真正的惊喜。\n\n这个阶段也爱重复扔东西。重复是在验证规律。给一篮软物让他扔，比禁止一切更省力。',
    category: 'COGNITION',
    ...AGE_BANDS.complementary,
    sourceName: '皮亚杰认知发展理论科普',
    sourceUrl: null,
    priority: 76,
  },
  {
    key: 'knowledge-cognition-imitate',
    title: '他开始学你，是在把世界印进身体里',
    summary: '接近 1 岁，模仿拍手、再见和简单指令会变多。',
    body: '这个阶段宝宝更会看你怎么做：你拍手，他也可能拍；你说“给妈妈”，他可能把东西递过来。模仿是学习，不是表演。\n\n指令保持很短：“过来”“坐下”“给”。做对了用平静的话确认，不必鼓掌到夸张。\n\n藏玩具、叠两块积木、把东西放进容器，都是在练手和脑子的配合。玩法重复没有关系，熟练本身就是进展。',
    category: 'COGNITION',
    ...AGE_BANDS.later,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 74,
  },
  {
    key: 'knowledge-parenting-respond',
    title: '哭了你来，不会把宝宝惯坏',
    summary: '头几个月被稳定接住，宝宝学到的是安全，不是操控。',
    body: '小婴儿只有哭这一种大声音。你过去抱、喂、换、说话，他学到的是：不舒服会被看见。这是回应式照料，不是奖励哭闹。\n\n没有人能每次都立刻赶到。你尽力了，再补上一次温柔的接触，也算接住。允许自己把宝宝放下、喝口水，再回来。\n\n不要比较谁家宝宝更“乖”。乖常常只是这一刻刚好被满足，或刚好困了。',
    category: 'PARENTING',
    ...AGE_BANDS.newborn,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 80,
  },
  {
    key: 'knowledge-parenting-play',
    title: '最好的早教，是你和宝宝的日常',
    summary: '不需要昂贵课程。唱歌、聊天、摸树叶，就是高质量互动。',
    body: '一岁以内最需要的，是和亲近的人来回互动：你做一个表情，他模仿；你哼一句，他手舞足蹈。\n\n高质量陪伴可以很具体：换尿布时指五官；散步时摸摸树叶，说“凉凉的”；洗澡时舀水倒水。\n\n对婴儿帮助最大的是回应式互动——跟着他的目光和声音走，而不是照着教案走。放松下来，你已经做得很好。',
    category: 'PARENTING',
    ...AGE_BANDS.early,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 76,
  },
  {
    key: 'knowledge-parenting-separation',
    title: '你离开时他哭，常常是更黏你了',
    summary: '大约 6–9 个月，认生和分离焦虑可能出现。这是依恋在变清楚。',
    body: '宝宝开始更清楚谁是“自己人”。你走开、陌生人靠近，他哭，常常是认知进步，不是你把他养娇了。\n\n离开前告诉他你要去哪里、会回来，用固定的短句告别，不要偷偷消失。回来时也用同一句话，让预期能被验证。\n\n白天多给一段不被打断的陪伴，比堆玩具更能把安全感补上。允许他有自己的节奏，也允许你请人帮忙。',
    category: 'PARENTING',
    ...AGE_BANDS.complementary,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 72,
  },
  {
    key: 'knowledge-parenting-limits',
    title: '开始说不，也可以说得很轻',
    summary: '接近 1 岁，宝宝会去摸不该摸的东西。挡住和改道，比责骂有效。',
    body: '会爬会走之后，探索欲和危险会同时变大。用短句说“不行”，同时把人抱开或换成可以玩的东西，比讲道理更清楚。\n\n同一条边界要重复很多遍。宝宝不是在挑衅家庭权威，他是在确认规则是否还在。\n\n不要用吓唬、比较或收回爱来换听话。你要的是安全，不是服从表演。累了就换人上场，这也是家庭协作。',
    category: 'PARENTING',
    ...AGE_BANDS.later,
    sourceName: '联合国儿童基金会养育照护框架',
    sourceUrl: WHO_NURTURING,
    priority: 70,
  },
  {
    key: 'knowledge-safety-water',
    title: '洗澡时，一秒都不能移开视线',
    summary: '几厘米深的水也可能发生溺水，而且往往没有大声呼救。',
    body: '婴幼儿溺水可能发生在很浅的水里，而且常常是安静的。洗澡时的核心规则只有一条：全程一臂之内有人看着。\n\n电话、门铃、取毛巾，都先抱起宝宝再离开。澡盆里 5–8 厘米水通常就够。水温用手肘或水温计确认，大约 37–38℃。洗完把水放掉，空盆对日后学步同样危险。\n\n水桶、水盆用完倒扣。永远不要把宝宝单独留在有水的房间。',
    category: 'SAFETY',
    ...AGE_BANDS.newborn,
    sourceName: '世界卫生组织儿童伤害预防报告',
    sourceUrl: null,
    priority: 94,
  },
  {
    key: 'knowledge-safety-roll',
    title: '会翻身以后，沙发和枕头都要重新看',
    summary: '翻身让坠落和捂住口鼻的风险一起出现。高度和松软物都要收。',
    body: '会翻身后，换尿布台、沙发、大床都不再是可以转身去拿纸巾的地方。能摔下去的高度，就假设他会翻过去。\n\n睡眠环境继续保持空、平、仰躺。枕头、靠垫、松软盖被会在宝宝翻过身时挡住呼吸。\n\n婴儿背带和汽车安全座椅按说明使用，不要放在高处的座椅里无人看管。一次也别留。',
    category: 'SAFETY',
    ...AGE_BANDS.early,
    sourceName: '全球儿童安全组织家庭排查清单',
    sourceUrl: null,
    priority: 84,
  },
  {
    key: 'knowledge-safety-home',
    title: '会坐会爬之后，家里要重新看一遍',
    summary: '从宝宝视角趴到地上看一圈，危险往往更近。',
    body: '宝宝学会坐稳或爬行后，安全清单要更新。最有效的办法是趴下来，用他的眼睛看房间：\n\n插座加保护盖，电线收好；桌角柜角；药品、清洁剂、纽扣电池放到够不着的地方；抽屉柜和书架固定在墙上；小于约 3.5 厘米、能穿过卫生纸卷芯的物件收走。\n\n防撞条是兜底，成人的视线才是第一道防线。看护是主动的，不是装完防护就结束。',
    category: 'SAFETY',
    ...AGE_BANDS.complementary,
    sourceName: '全球儿童安全组织家庭排查清单',
    sourceUrl: null,
    priority: 90,
  },
  {
    key: 'knowledge-safety-choke',
    title: '会抓会走以后，最怕一口吞下去',
    summary: '纽扣电池、整颗葡萄和圆形硬食物，是这个阶段最需要提前收走的。',
    body: '宝宝会把能抓住的东西送进嘴里。纽扣电池、磁力片、硬币、整颗葡萄、坚果、爆米花、黏稠糖块，都可能造成气道或食道伤害。\n\n吃饭时坐着吃、有人看着，不要边走边塞。葡萄和圆形食物要切到足够小。地上的药丸和大人零食及时清走。\n\n学步期跌倒不可避免，能做的是收走锐角、固定家具、不用学步车。受伤后的判断交给医生，家里先把能预见到的入口封上。',
    category: 'SAFETY',
    ...AGE_BANDS.later,
    sourceName: '全球儿童安全组织家庭排查清单',
    sourceUrl: null,
    priority: 88,
  },
];

function assertSeedInvariants(articles: SeedArticle[]): void {
  const keys = new Set<string>();
  for (const article of articles) {
    if (keys.has(article.key)) {
      throw new Error(`重复的知识 key：${article.key}`);
    }
    keys.add(article.key);
    if (article.minAgeDays > article.maxAgeDays) {
      throw new Error(`${article.key} 的月龄窗口无效`);
    }
  }

  for (const category of CATEGORIES) {
    const inCategory = articles.filter((article) => article.category === category);
    if (inCategory.length === 0) {
      throw new Error(`分类 ${category} 没有文章`);
    }
    for (let day = 0; day <= 365; day += 1) {
      const hit = inCategory.some(
        (article) => day >= article.minAgeDays && day <= article.maxAgeDays,
      );
      if (!hit) {
        throw new Error(`分类 ${category} 在第 ${day} 天没有可推荐文章`);
      }
    }
  }
}

function resolveDatabasePath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const serverDb = path.join(repoRoot, 'apps/server/data/runew.db');
  const rootDb = path.join(repoRoot, 'data/runew.db');
  // 服务端默认相对 apps/server 的 cwd，开发时真正在用的是这一份。
  if (fs.existsSync(serverDb)) return serverDb;
  return rootDb;
}

async function main() {
  assertSeedInvariants(ARTICLES);

  const databasePath = resolveDatabasePath();
  const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });

  try {
    const now = Date.now();
    await client.execute({
      sql: `INSERT INTO users (id, nickname, status, locale, created_at, updated_at)
            VALUES ('01JSYSTEM00000000000000000A', '润芽编辑部', 'ACTIVE', 'zh-CN', ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [now, now],
    });

    for (const article of ARTICLES) {
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
