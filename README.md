# sologsb-1121 森林样地调查记录台（gbforestplot）

面向森林资源调查员的固定样地工作台：为样地建档，逐株记录胸径、树高、枝下高与检尺位置，登记更新幼苗与灌木层，并在复查期与上一期数据逐株比对生长量、计算林分因子。纯前端单页应用，数据全部保存在浏览器本地。

## Docker 一键启动（推荐）

```bash
cp .env.example .env
docker compose up -d --build
```

访问地址：**http://localhost:21821**

停止服务：

```bash
docker compose down
```

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | React 18 + TypeScript |
| UI | Ant Design 5 |
| 构建 | Vite 5 |
| 状态管理 | Zustand |
| 路由 | React Router v6（BrowserRouter） |
| 本地存储 | IndexedDB（Dexie 4），含结构版本号与升级迁移 |
## 本地开发

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc 类型检查 + vite 构建
```

> 生产环境由 nginx 托管 `dist`，`nginx.conf` 已启用 `try_files $uri $uri/ /index.html;` 与 gzip。

## 目录结构

```
sologsb-1121/
├── docker-compose.yml
├── .env.example
├── .env
└── frontend/
    ├── Dockerfile              # 多阶段：node:20-alpine 构建 → nginx:alpine 托管
    ├── nginx.conf
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── public/favicon.svg
    └── src/
        ├── main.tsx
        ├── index.css
        ├── router/index.tsx
        ├── types/{plot,tree,regen,recheck,submission}.ts
        ├── stores/{plot,tree,regen,recheck,submission}Store.ts
        ├── components/common/{PlotCard,TreeTable,GrowthDiffTable,RoundTag}.tsx
        ├── components/review/{SubmissionStatusTag,SubmissionControls,SubmitReviewModal,WithdrawModal,RoundSubmissionBar}.tsx
        ├── hooks/{usePlotFilter,useTreeStats,useRoundReview}.ts
        ├── pages/{PlotList,TreeEntry,RegenView,RecheckView,PlotSummary}.tsx
        └── utils/{db,forestCalc,review,recheck,id}.ts
```

## 页面与路由

| 路由 | 页面 | 消费模型 |
| --- | --- | --- |
| `/plots` | 样地台账：按地点/林型/复查期次/郁闭度区间筛选，显示面积、优势树种、已录样木数与本期交验状态（待交验/需补测/已交验、问题数） | Plot、RoundSubmission |
| `/plots/:id/trees` | 样木录入与清单：径阶分组快速录入、行内改胸径、树种联想、胸径异常提示；已交验期只读 | TreeRecord、RoundSubmission |
| `/plots/:id/regen` | 更新苗与灌木样方记录，按高度级与株数分组合计；已交验期只读 | RegenShrub、RoundSubmission |
| `/plots/:id/recheck` | 复查比对：逐株两期胸径/树高与生长量，行内补写缺测原因，保存比对结果；目标期已交验则只读 | RecheckDiff、TreeRecord、RoundSubmission |
| `/summary/:plotId` | 林分因子汇总：每公顷株数、平均胸径、断面积、郁闭度、更新密度，可导出调查记录文本（含交验状态） | Plot、TreeRecord、RegenShrub、RoundSubmission |

`/` 重定向到 `/plots`，未匹配路由同样兜底到 `/plots`。

## 数据存储说明

- 数据库名 `gbforestplot`，当前结构版本 **v3**（`localStorage['gbforestplot:db-version']` 记录）。
- 五张表：`plots`（样地）、`trees`（样木，按期次分行）、`regens`（更新苗与灌木样方）、`rechecks`（复查逐株比对）、`submissions`（期次交验记录，样地+期次唯一）。
- v1 → v2 迁移：为老样地补 `locked`、`surveyRound`，为老样木补 `round`、`measuredAt`，并新增索引。
- v2 → v3 迁移：新增 `submissions` 表，老样地 `locked=true` 的当前期次转写为「已交验」；复查比对主键规范化为「样地-上期-本期-树号」稳定 id 并去重。
- 容器无状态、不挂载命名卷；清空站点数据即回到初始示范数据。
- 首次打开灌入 2 个示范样地：FP-4102 第 2 期**已交验**（问题清零，含采伐木已写复查原因）；FP-4115 第 2 期**需补测**（1 株负增长、1 条重度啃食，各含交验/撤销留痕）。

## 功能要点

- **径阶归组**：按「6/8/12/16/20/24/28/32+」cm 径阶自动归组，表格内联展示各径阶株数。
- **胸径异常提示**：数值超出 0~200 cm 或与本树种同期均值偏离 >60% 时标黄并给出提示。
- **复查比对**：任选上下两期生成逐株差值表，标记「本期未复测（疑似采伐或倒伏）」与「本期新增进界木」，生长率为负或缺失行高亮，并计算保留木生长率；缺测原因可在行内补写并即时保存。
- **期次交验流程**：
  - 点「提交交验」按四类列出问题——**胸径异常、负增长（胸径/树高）、本期缺测未写原因、重度啃食**。
  - 调查员逐条写处理说明（自动暂存草稿），**问题清零**后「交验通过」才会锁定该期数据；锁定后样木录入、更新层、复查三个录入页**只能查看**（隐藏录入表单、禁用行内编辑与删除）。
  - 补测须先「撤销交验」并**填写补测原因（留痕）**，状态转为**需补测**，录入页恢复编辑，补测后重新交验。
  - 状态机：**待交验 → 已交验 →（撤销）需补测 → 已交验**；台账卡片、页面顶部状态条与汇总页均显示状态及问题数。
- **林分因子**：每公顷株数、平均胸径/树高、断面积与每公顷断面积、冠幅折算郁闭度、更新苗/灌木密度。
- **导出**：复查比对结果写入本地档案库；林分汇总可复制或导出调查记录 txt。
