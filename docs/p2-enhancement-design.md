# P2 三块增强 · 设计与数据可行性确认

> **v2 修订（2026-11-09）**：纳入新增宽表 `ads_sal_sku_online_listing_df`（样例 1000 行，`pt=2026-11-09`）。
> 该表**彻底改变了第 ③ 块的结论**——原判定「六列只有两列可用」作废，现为**六列全部具备**。
> 同时它让第 ② 块的部分质量告警变成**可直接计算**，不再完全依赖 Dataphin 巡检链路。
>
> 状态：**设计稿，未编写任何代码**
> 依据：`schema.prisma`、三个 service 现状、`docs/sample_exports/` 9 张源表实测、`商品映射数据质量巡检_【配置】问题类型配置.xlsx` 全文

---

## 0. 结论总表

| 需求 | v1 判定 | v2 判定 | 一句话 |
|---|---|---|---|
| 商品库 · 生命周期列 | 🟡 | 🟡 可做，需**重新定义** | 「主数据状态」已有；要的是**运营生命周期** |
| 商品库 · 市场筛选 | 🟢 | 🟢 + **有更好的数据源** | 可用 `pd_spu.market_countries`，也可用新表聚合（更实时） |
| 商品库 · 类目级联 | 🟢 | 🟢 只能到 4 级 | L1→L4 零孤儿；**L5 100% 为空** |
| 主数据详情 · 质量告警 | 🔴 | 🟡 **3 类可现算** | `no_mapping` 现成；另 6 类仍需 Dataphin 链路 |
| 全渠道 · 对比矩阵 | 🔴 | 🟢 **六列全具备** | 新表有 `title` / `description_summary` / `main_image_url` / `listing_status`（含 raw）/ `content_item_cnt` / `operator_name` |

**结论**：③ 从「新建数据链路项目」降级为「接一张新表」；④ 从「砍一半指标」变为「全量可做」。

---

## 1. 实测数据基线

### 1.1 抽样局限（必须先看）

`docs/sample_exports/` 里有两批**互不相干**的抽样：

| 批次 | 表 | 时间 | 站点 | 用途 |
|---|---|---|---|---|
| A 批（原 8 张） | `dim_pd_spu_info_df` / `dim_pd_sku_info_df` / `dim_sal_sku_info_df` / `dws_sal_sku_statistics_td_df` / `dwb_scm_stock_channel_df` / `dws_cs_voc_nps_review_df` / `dwb_cs_voc_record_channel_hf` / `dwb_sal_return_sku_df` | 10-27 | CA/DE/US/ES/BE/MX/FR/IT/UK/…（44 个） | product360 现有 8 表同步源 |
| B 批（新增） | `ads_sal_sku_online_listing_df` | **11-09** | CA/DE/BE/AU/**Global**/BR/AE（**7 个，无 US、无 ES**） | 新增宽表 |

**直接后果**：跨批次 join 率**无参考价值**。下面这些数字都是**抽样伪影**，不要用于判断生产覆盖率：

- `ads.spu_code` 239 个 → 命中 `pd_spu` 76%
- `ads.sku_code` 557 个 → 命中 `dim_pd_sku_info_df` **仅 29%**
- `ads.sku_code` 有值但 `pd_sku` 查不到 = **601 行（89%）** ← 明显失真，不可作为 `missing_codes` 的真实比例

**可用的结论**：新表**自身**的字段覆盖率、枚举值域、行粒度、内容完整度分布——这些不依赖 join，是确定的。

### 1.2 商品库（不变）

| 字段 | 源表.列 | 实测 | 结论 |
|---|---|---|---|
| 主数据状态 | `pd_spu.spu_state_desc` | 空值 **0/1303**，5 值：可销售 428 / 已下架 334 / 待上架 317 / 开发中 184 / 已取消 40 | ✅ 干净可用 |
| 主数据状态码 | `pd_spu.spu_state` | 空值 **133/1303（10%）** | ⚠️ 展示用 desc 不用 code |
| 是否新品 | `pd_spu.is_new_spu` | 新品 141 / 老品 741 / 空 **118（9%）** | ✅ 可用 |
| SPU 上架时间 | `pd_spu.listing_time` | 有值 **756/1000（76%）** | ✅ 可用 |
| SKU 状态 | `pd_sku.sku_state_desc` | 空值 0，5 值：未上架 722 / 在销售 704 / 已退市 469 / 清仓中 98 / 已取消 7 | ✅ 干净可用 |
| 渠道上架时间 | `sal_sku_code.sal_listing_time` | 有值 **771/1000（77%）** | ✅ 可用 |
| 首单时间 | `sal_sku_code.first_order_time` | 有值 **197/1000（20%）** | ⚠️ 覆盖低，仅作辅助 |
| 市场（预聚合） | `pd_spu.market_countries` | 抽样仅 **307/1303（23%）** | ⚠️ 抽样失真，生产需复核 |
| 站点原值 | `sal_sku_code.site` | 空值 0，44 个值 | ✅ 可用 |
| 类目 L1–L4 | `pd_spu.category_code_level1..4` | 11 / 52 / 148 / 313 个码，各空 10% | ✅ 可用 |
| 类目 L5 | `category_code_level5` | **100% 为空** | ❌ **必须砍** |

**类目父子关系校验**：L1→L2→L3→L4 **零孤儿**（有 L2 缺 L1：0 个码；L3 缺 L2：0；L4 缺 L3：0）。级联不会出空洞。

### 1.3 新表 `ads_sal_sku_online_listing_df` 基线

**行粒度（实测）**：

```
channel + site + shop_code + msku       → 1000 / 1000 唯一，零重复   ← 主键
channel + site + shop_code + external_id → 962 唯一，28 组重复
msku 单独                                → 987 唯一（13 个跨渠道/店铺重复）
spu_code 单独                            → 240 唯一
```

→ **一行 = 一个店铺下的一个在架 listing**。同一商品跨店铺/跨渠道会有多行（13 个 msku 重复，典型是 `aliexpress` 与 `aliexpress_pop_choice` 同商品两行）。

**字段覆盖率（1000 行）**：

| 类别 | 字段 | 覆盖率 | 说明 |
|---|---|---|---|
| 定位 | `channel` / `site` / `shop_code` / `msku` / `external_id` / `parent_external_id` | 100% | `external_id_type` = `asin`(967) / `item_id`(33) |
| 关联 | `sku_code` / `scm_sku_code` / `spu_code` | **67.4% / 67.4% / 67.3%** | **33% 在线商品无内部编码** ← 真实业务问题，非伪影 |
| **标题** | `title` | **98.5%** | 长度 13–240，中位 125 |
| **描述** | `description_summary` | **51.4%** | 卖点/描述摘要 |
| **主图** | `main_image_url` | **82.9%** | 两域：`m.media-amazon.com`(796) / `ae-pic-a1.aliexpress-media.com`(33) |
| **状态** | `listing_status` | **100%** | 归一值：`offline` 749 / `online` 222 / `deleted` 29 |
| **状态原值** | `listing_status_raw` | **100%** | 5 值：`下架\|正常` 485 / `下架\|发布中` 280 / `上架\|正常` 202 / `AVAILABLE_FOR_SALE` 20 / `NOT_FOR_SALE` 13 |
| **负责人** | `operator_name` | **89.7%** | 56 个去重人名 |
| 价格 | `currency_code` / `list_price` / `sale_price` | 100% / 98.6% / 98.1% | 12 种币种（USD 389 / CAD 199 / EUR 109 / SEK 107 / GBP 65 …） |
| 其他 | `barcode` | 45.8% | |
| 其他 | `rating` | 16.3% | 覆盖率太低，不建议入矩阵 |
| 其他 | `inventory_qty` | 100%，但**968/1000 都是 0** | ❌ 实际不可用 |
| 其他 | `product_link` | 96.6% | 真实商品页（`www.amazon.ca` 515 / `.de` 206 / `.com` 125 …） |
| 溯源 | `src_table` | 100% | `dwb_sal_sku_amazon_df` 967 / `dwb_sal_sku_jijia_listing_df` 33 |

**内容完整度 5 标志（自洽）**：

```
content_item_cnt = has_title + has_main_image + has_description + has_price + has_status
→ 1000/1000 完全一致，零例外
```

| 标志 | 分布 | 语义 |
|---|---|---|
| `has_title` | 1:985 / 0:15 | title 非空 |
| `has_main_image` | 1:829 / 0:171 | main_image_url 非空 |
| `has_description` | 1:514 / 0:486 | description_summary 非空 |
| `has_price` | 1:798 / 0:202 | **price > 0**（不是「非空」，`0.0000` 算缺） |
| `has_status` | **1:1000** | 恒为 1 → 该标志无区分度，建议剔除，改用 4 项制 |

`content_item_cnt` 分布：1:13 / 2:115 / 3:116 / 4:245 / 5:511

**最关键的业务洞察——内容缺口全在离线商品**：

| 状态 | n | 缺标题 | 缺主图 | 缺描述 | 缺价格 |
|---|---|---|---|---|---|
| `online` | 222 | **0** | 2 | 42 | **0** |
| `offline` | 749 | 15 | **160** | **421** | **186** |
| `deleted` | 29 | 0 | 9 | 23 | 16 |

`online` 里 178/222（80%）内容满分 5；`offline` 里 186 行缺价格、421 行缺描述。

→ **「内容完整度低」不是运营偷懒，而是下架商品本就不维护内容。矩阵若混着 offline 展示，完整度列会毫无意义。**
→ **矩阵默认只展示 `listing_status = 'online'`**，或用状态筛选隔离。

**`listing_status` 的脏值问题在这张表里已被解决**：

- v1 发现的 `sal_sku_code.listing_status = '11'`（22 行）是源端数字码泄漏。
- 新表把状态拆成 **`listing_status`（归一 3 值）+ `listing_status_raw`（源端原值）** 两列，`下架|正常`、`AVAILABLE_FOR_SALE` 这类异构写法全部收敛。
- → **新表是状态字段的正确数据源**，`sal_sku_code.listing_status` 应标记为「不用于状态展示」。

**矩阵尺寸（关键，决定布局可行性）**：

```
每个 SPU 的 listing 行数：中位 2，最大 20
  分布 (1,107) (2,49) (3,25) (4,24) (5,8) (6,8) (7,4) (9,3) (10,3) (12,2) (13,2) (18,3) (20,1)

每个 SPU 的「渠道 × 站点」组合数：最大 6
  分布 (1,162) (2,51) (3,18) (4,5) (5,1) (6,2)

每个 SPU 的渠道数：(1,222) (2,13) (3,4)
```

→ v1 用 `sal_sku_code` 算出「最大 40 个渠道×站点单元格」，**新表聚合后最大只有 6**。按渠道做列完全可行。

### 1.4 质量告警（v2 修订）

xlsx 的 9 类巡检原本全部读 `lute_edw.*`（PG 里一张没有）。新表让其中 3 类变成**可直接计算**：

| 问题类型 | 新表能否算 | 依据 | 抽样实测 |
|---|---|---|---|
| `no_mapping` 有线上商品但无映射 | ✅ **能** | `sku_code IS NULL` | 326 行，其中 **`online` 38 行**（正在卖却没映射，最严重） |
| `missing_codes` 映射的 SKU 错误 | 🟡 逻辑能算 | `sku_code` 有值但 `pd_sku` 查不到 | 601 行 / 495 码 —— **抽样伪影，生产需重测** |
| `master_missing_active_role` 缺在职角色 | 🟡 **部分** | `pd_spu` 有 `product_leader_name`/`planner_name`/`gtm_name`，能判「是否配置」，**不能判「是否在职」**（需 `dim_com_employee_df`） | 在售 107 SPU 中：产品负责人缺 0 / 计划人员缺 1 / GTM 缺 0 |
| `operator_diff` 运营归属不一致 | ❌ | 需 `dim_sal_spu_operator_df` | — |
| `dup_pk_mapping` 销售映射主键唯一 | ❌ | 需 `dwd_sal_erp_sale_sku_df` | — |
| `configured_no_product` / `configured_deleted_product` | ❌ | 需 ERP 映射表（问题本身就是「dwb 无商品」） | — |
| `on_sale_sku_no_sale_mapping` 在售 SKU 缺映射 | ❌ | 需 `dwb_sal_sku_erp_df` | — |
| `sales_with_sku_not_on_sale` 有销量但非在售 | 🟡 | `dws_sal_sku_statistics_td_df`（销量）+ `pd_sku.sku_state_desc`，**不需要 xlsx 里的 `dwb_sal_order_sku_df`** | 可算 |
| `missing_codes` 的供应链 SKU 部分 | ❌ | 需 `dwd_scm_product_supply_sku_df` | — |

→ **质量告警从「0 类可算」提升到「4 类可算（3 类完整 + 1 类部分）」**，剩下 5 类仍需 Dataphin 链路。

---

## 2. 商品库（Catalog）设计 —— 不变

### 2.1 生命周期列：需要重新定义

**现状**：商品库**已有**「商品状态」列 + 筛选 + 分布环图（`CatalogPage.tsx:275` / `:166` / `:195`），值域 = `SPU_STATE_LABEL` 的 5 个（开发中 / 待上架 / 可销售 / 已下架 / 已取消）。

真实缺口：这是**主数据流转状态**（审批到哪一步），不是**运营生命周期**（市场生命阶段）。

**设计方案**：新增独立 `lifecycleStage` 字段，与 `spuState` **并列不替代**。

| 阶段 | 判定规则（优先级从上到下） | 依赖 |
|---|---|---|
| `已退市` | `spu_state_desc ∈ {已下架, 已取消}` | `pd_spu.spu_state_desc` |
| `清仓中` | 存在 SKU 且 `sku_state_desc = '清仓中'` | `pd_sku.sku_state_desc` |
| `未上市` | `spu_state_desc ∈ {开发中, 待上架}` 或 `listing_time` 空 | `pd_spu` |
| `新品期` | `is_new_spu = '新品'` 且 `listing_time` 距今 ≤ 90 天 | `is_new_spu` + `listing_time` |
| `成长期` | `first_order_time` 距今 ≤ 180 天 | `first_order_time` |
| `成熟期` | 其余 | 兜底 |
| `未接入` | 上述关键字段全空 | — |

**五态约束**：任一关键字段缺失且无法兜底 → `not_connected`，**不猜**。

**风险**：`first_order_time` 仅 20% 有值 → 「成长期」大面积退化。**建议第一期只上 4 个粗粒度阶段**（`未上市` / `在售` / `清仓中` / `已退市`），细分留第二期。

**改动**：`CatalogListRow` 加 `lifecycleStage` + `Label`；`ProductListQuery` 加 `lifecycle`；`LIST_COLUMNS` 加一个 `CASE WHEN`。**无需新表**。

### 2.2 市场筛选

**现状**：`market_countries` 已返回（`catalog.service.ts:93`），前端已渲染「市场」列（`:292`），**但没有筛选入口**。

**设计方案**：

- DTO 加 `market?: string`（ISO 二字码，`@MaxLength(4)`）
- SQL 加 `AND ${market} = ANY(s.market_countries)`
- 前端加「市场」Select，选项来自 facets 新增 `market` 维度（`SELECT unnest(market_countries) …`）
- 空数组 SPU 在任何市场筛选下都不命中；不筛选时归入「市场未接入」统计

**v2 补充**：新表可提供更实时的市场聚合（`GROUP BY spu_code, ARRAY_AGG(DISTINCT site)`），平均每 SPU 1.5 个市场。但**建议第一期仍用 `pd_spu.market_countries`**，避免两套口径；待确认新表同步稳定后再切换。

### 2.3 类目级联

**现状**：`ProductListQuery.category` 单级（前端标签就叫「一级类目」）。

**设计**：四段级联，逐级收窄。某级有值 → 该级 AND 其所有上级都必须命中（防跳级）。

- L5 砍掉（100% 空）
- 新增 `GET /api/catalog/categories/tree?level=4`，一次返回整棵树（抽样 524 节点，生产千级，**不需要懒加载**）
- 树必须从 **scope 过滤后** 的数据算（`employee` 角色不能看到无权类目的名字）

---

## 3. 主数据详情（Overview）· 质量告警设计

### 3.1 两条路，按成本排序

**路线 A（推荐先做，0.5 天）：只用新表 + 现有表，现算 3 类**

完全不碰 Dataphin，在 `overview.service.ts` 里加一个 `qualityIssues()` 查询：

| 告警 | 判定 | 数据源 | 展示 |
|---|---|---|---|
| 有在售 listing 但无内部编码 | `listing_status='online' AND sku_code IS NULL` | `ads_sal_sku_online_listing_df` | ⚠️ 黄色 |
| 映射的 SKU 不在主数据 | `sku_code NOT IN (SELECT sku_code FROM pd_sku)` | 同上 + `pd_sku` | 🔴 红色 |
| 在售商品缺关键角色 | `product_leader_name` / `planner_name` / `gtm_name` 任一为空 | `pd_spu` | ⚠️ 黄色 |
| 在售 SKU 状态与销量矛盾 | 近 30 天有销量但 `sku_state_desc <> '在销售'` | `sal_sku_day` + `pd_sku` | 🔴 红色 |

**这 4 条全部零新增链路**，数据 100% 在现有 PG 里（除第 1、2 条需先同步新表）。

**路线 B（5~8 天）：完整 9 类巡检链路**

```
Dataphin 巡检任务（改写 xlsx 9 段 SQL + 加 SPU 桥接）
  → StarRocks p360_pd_quality_issue
  → 集成任务（全量覆盖，同现有 11 个模式）
  → PG public.pd_quality_issue
  → NestJS + 前端
```

**必须先解决的取舍**：9 类里 4 类**根本不存在 SPU**（如 `configured_no_product` = ERP 有配置但 dwb 无商品）。所以：

> 质量告警必须拆两块——「SPU 详情页标签」（只用能落到 SPU 的 5 类）+「独立质量巡检页」（9 类全量）。

### 3.2 严重度与展示形态

| severity | 类型 |
|---|---|
| `high` | 映射 SKU 不在主数据、缺关键角色 |
| `medium` | 有销量但非在售、在售无编码 |
| `low` | 重复映射、待补录 |

**展示形态**：基础信息卡片右上角一个状态胶囊（`N 项数据质量问题` → 点击展开抽屉）。**不占独立卡片**——质量告警是异常信息，正常商品应零噪声。

### 3.3 明确不做

不在 product360 里重写 xlsx 的 9 段 SQL。原因：① 需 8 张 PG 里不存在的底表；② 巡检要 `dim_com_employee_df` 的飞书 ID 做推送；③ 会与数仓巡检系统形成两套口径。

---

## 4. 全渠道（Channels）· 对比矩阵设计（v2 重写）

### 4.1 数据源改判：新表是唯一正确来源

| 需求列 | v1 判定（用 `sal_sku_code`） | v2 判定（用 `ads_sal_sku_online_listing_df`） |
|---|---|---|
| 标题 | ❌ 无渠道 listing title | ✅ `title` **98.5%**，中位 125 字符 |
| 卖点 | ⚠️ `selling_point` 仅 18% | ✅ `description_summary` **51.4%** |
| 内容完整度 | ❌ 无任何字段 | ✅ `content_item_cnt` **100%**（5 项自洽）+ 4 个 `has_*` |
| 主图同步 | ⚠️ 两侧域名不同，相同 0 条 | ✅ `main_image_url` **82.9%** + `has_main_image` 标志 |
| 上架状态 | ⚠️ 只有 `在售` + 脏值 `11` | ✅ `listing_status` 3 值归一 + **`listing_status_raw` 保留原值** |
| 负责人 | ✅ `sal_operator_name` 87% | ✅ `operator_name` **89.7%** |

**额外得到**：`product_link`（96.6%，可点击跳转真实商品页）、`sale_price`/`list_price`/`currency_code`（98%+）、`rating`（16%，太低不用）、`inventory_qty`（100% 但 968/1000 为 0，**不可用**）。

### 4.2 「主图同步」的最终定义

v1 发现：`sal_sku_code.sal_image_url`（`m.media-amazon.com`）与 `pd_sku.sku_image_url`（阿里云 OSS）**域名不同域，340 条相同 0 条**，无法判「是否同一张图」。

新表的 `main_image_url` 是**平台侧主图原址**（按渠道分域：amazon → `m.media-amazon.com`；aliexpress → `ae-pic-a1.aliexpress-media.com`）。

**定义修正**：
- ✅ **能做**：「该 listing 是否已配主图」（`has_main_image`）
- ✅ **能做**：同渠道内，多个 listing 的主图 URL 是否相同（判断是否复用同一张图，`GROUP BY main_image_url HAVING count(*)>1`）
- ❌ **不能做**：「渠道主图是否与内部素材库一致」——需要图片指纹，第一期不做

### 4.3 布局设计

**粒度决策**：行 = **SPU 分组下的 listing**，列 = **渠道**。

理由（基于 1.3 实测）：
- 新表每行 = 一个店铺下的一个 listing，`channel + site + shop_code + msku` 唯一
- 每 SPU 的「渠道 × 站点」组合**最多只有 6 个**，按渠道做列不会溢出
- 每 SPU 最多 20 个 listing 行 → 用 AntD `Table` 的 `expandable` 或行分组承载

**列宽预算（1280px 最小宽度）**：

```
商品列 260 + 主图 48 + 渠道 6×132=792 + 负责人 100 + 操作 60 = 1260
```

渠道数 > 6 → 横向滚动（`scroll={{ x: 'max-content' }}` + `tableLayout="fixed"`），**不压缩到不可读**。

**单元格内容（三层紧凑布局）**：

```
┌─────────────────┐
│ ● 在售  4/5     │  ← 状态点 + 内容完整度
│ CA · DE         │  ← 站点缩略（≤2 个 + "+N"）
│ 张三 · 运营组    │  ← 负责人
└─────────────────┘
点击 → 展开抽屉：title / description_summary / main_image_url 大图 / product_link / 价格
```

**必须的默认过滤**：`listing_status = 'online'`。

依据 1.3 的实测——`offline` 749 行里 421 行缺描述、186 行缺价格、160 行缺主图，`online` 222 行里 178 行内容满分。混在一起看，完整度列完全是噪声。

提供 Segmented 切换：`仅在线(默认)` / `全部` / `仅下架`，并在「全部」模式下对 `offline` 行的完整度做**弱化显示**（灰字 + Tooltip「下架商品不维护内容属正常」）。

### 4.4 `listing_status` 脏值处理

新表已解决（`listing_status` 归一 + `listing_status_raw` 保留原值）。**但需要确认归一规则**：

```
下架|正常      → offline
下架|发布中    → offline
上架|正常      → online
AVAILABLE_FOR_SALE → online
NOT_FOR_SALE   → offline
(deleted 29 行来自哪个 raw 值？抽样里未见 → 需确认)
```

`deleted` 的 29 行对应的 `listing_status_raw` 在抽样中是哪个值**尚未确认**——需要向数仓确认归一映射表，否则前端无法解释「为什么 29 个商品显示已删除」。

---

## 5. 交付建议

| 优先级 | 事项 | 数据就绪 | 预估 | 依赖 |
|---|---|---|---|---|
| **P2-0** | **接入 `ads_sal_sku_online_listing_df`**（PG 建表 + 同步 SQL + 集成任务） | 🟢 **已完成（代码/SQL 侧）**，SR 侧待上线执行 | 1 天 | 无 |
| **P2-1** | 市场筛选 | 🟢 **已完成** | 0.5 天 | 无 |
| **P2-2** | 类目四级级联 | 🟢 **已完成** | 1 天 | 无 |
| **P2-3** | 生命周期列（先 4 个粗粒度） | 🟢 **已完成**（加载期落列） | 1 天 | 无 |
| **P2-4** | **渠道对比矩阵**（在线 listing × 渠道） | 🟢 依赖 P2-0 | 2.5 天 | P2-0 |
| **P2-5** | 详情页质量告警（路线 A，4 条现算） | 🟢 依赖 P2-0 | 1 天 | P2-0 |
| **P2-6** | 质量告警全链路（路线 B，剩 5 类） | 🔴 | 5~8 天 | 巡检启用决策 |

**建议顺序**：P2-0 → P2-1/P2-2/P2-3（并行）→ P2-4/P2-5。合计约 **7 天**拿到 ①②③ 全部可交付形态，P2-6 单独立项。

---

## 6. 阻塞问题

1. **`listing_status = 'deleted'` 的 29 行来自哪个 `listing_status_raw`？** 抽样里 5 个 raw 值只能映射到 online/offline，deleted 来源不明。（阻塞 P2-4 的「已删除」展示）
2. **`ads_sal_sku_online_listing_df` 的调度频率与全量口径？** `pt` 是任务执行时间、`ds` 是数据日期。是否每次全量覆盖？覆盖范围是所有渠道还是仅 `dwb_sal_sku_amazon_df` + `dwb_sal_sku_jijia_listing_df` 两张源表（`src_table` 只有这 2 个值）——**意味着当前只有 amazon + aliexpress 两个渠道**，其他 17 个渠道（tiktok/shopify/lazada/noon/ebay…）**没有数据**。
3. **`has_status` 恒为 1**，无区分度。是设计如此（状态一定存在）还是漏了？若剔除，`content_item_cnt` 应改成 4 项制——**但源端已固化为 5 项，改动需数仓确认**。
4. `pd_spu.market_countries` 在生产全量下的非空覆盖率？（抽样 23% 不足以决策）
5. `pd_spu.selling_point` 仅 18% —— 源端没填还是同步丢了？
6. 9 类巡检中 **6 类未启用**（3 类明确 `是否启用=0`）。P2-6 要接哪几类？
7. 巡检结果**是否已有落库表**（xlsx 的「子表格名」暗示主-子表结构）？若有，P2-6 可从 8 天降到 2 天。
8. 「运营生命周期」的业务定义是否与 2.1 的猜测一致？「新品期」用 `is_new_spu` 还是「上架 N 天内」？

---

## 附：已核实存在的现状（不要重复做）

**商品库**
- 「商品状态」列 + 筛选 + 分布环图（`CatalogPage.tsx:275` / `:166` / `:195`）
- `SPU_STATE_LABEL` / `SKU_STATE_LABEL`（`packages/shared/src/index.ts:49` / `:58`）
- 列表已返回 `spuState` / `spuStateLabel` / `marketCountries` / `categoryPath`（`catalog.service.ts:88-93` / `:278`）

**详情页**
- 已有：基础信息 / 标签 / 完整度与变体 / 包装信息 / 变体（SKU）（`OverviewPage.tsx:117-302`）

**渠道页**
- 已有：渠道 / 站点店铺 / 平台SKU / 挂牌状态 / 建议售价 / 销量 / 销售额 / 在库 / 在途（`ChannelsPage.tsx:178`）

**不可用字段（明确排除）**
- `pd_spu.spu_desc`：0/1303 全空
- `pd_spu.category_code_level5`：100% 空
- `ads.inventory_qty`：968/1000 为 0
- `ads.rating`：仅 16.3%
- `sal_sku_code.listing_status`：脏值 `11`，改用新表
