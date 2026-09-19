# hxyfront-62010 潜水气瓶 · 水压检验与拒充复核台

源提示词编号：5

由「潜水气瓶充填记录」扩展而成的水压检验与拒充复核台。工作人员登记气瓶水压检验单，系统按统一规则判定合格 / 拒充、调度充填队列并保留单瓶全生命周期履历。

## 业务规则

- 每只气瓶只能有一条有效检验单；新单登记后旧单立即转为留档失效（superseded）。
- 检验单须登记：检验日期、水压值、残余变形率、检验员。
- 合格阈值：水压值 ≥ 公称工作压力 × 5/3；残余变形率 ≤ 10%；检验员不得缺失。
  任一不满足 → 拒充，已有在队充填计划一律作废并留档。
- 合格检验单先进入「待复检审批」；审批人不得缺失且必须与检验员不同，审批后才恢复排队。
- 气瓶信息更正（编号 / 容积 / 材质 / 工作压力）后，旧检验单与排队资格立即失效，
  在队计划作废留档，一切按新记录重算（revision 机制）。
- 已审批检验单有效期 1 年，过期不可排队。
- 已签收的充填是历史事实，不因新的拒充 / 信息更正而改动。

## 架构（规则 / 存储 / 界面分离）

```
src/
├── rules/                 # 规则层：纯 TypeScript，不依赖 React / localStorage
│   ├── types.ts           # 领域模型
│   ├── constants.ts       # 阈值与日期工具（5/3 系数、10%、有效期 1 年）
│   ├── engine.ts          # 纯函数引擎：登记检验 / 拒充 / 审批 / 更正 / 入队 / 签收
│   └── engine.check.ts    # 引擎不变量验证（32 项断言，不入页面产物）
├── storage/               # 存储层：localStorage 持久化与种子数据
│   ├── storage.ts
│   └── seed.ts            # 种子数据全部经引擎写入
├── hooks/
│   └── useStationStore.ts # 单一状态源，落盘 + storage 事件同步（刷新/多标签一致）
└── components/            # 界面层：只读规则层计算结果，不自行判定
    ├── CylinderRoster.tsx # 气瓶名册（统一展示资格重算结果）
    ├── TestStation.tsx    # 检验登记 / 复检审批 / 信息更正
    ├── FillQueue.tsx      # 待充填队列、混合气比例提示、签收
    ├── RejectionPanel.tsx # 拒充记录 + 作废留档计划 + 闭环状态
    └── HistoryPanel.tsx   # 单瓶履历时间线
```

队列、拒充记录、单瓶履历均由同一份 `AppState` 经纯选择器重算，刷新后从 localStorage 恢复，视图间保持一致。

## 本地运行

```bash
npm install
npm run dev
```

开发端口：62010

## 引擎不变量验证

```bash
npx esbuild src/rules/engine.check.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/engine-check.mjs && node /tmp/engine-check.mjs
```
