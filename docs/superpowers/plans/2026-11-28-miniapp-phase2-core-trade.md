# Miniapp Phase 2 Core Trade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新 uni-app 小程序中交付工作台、客户、商品/色卡、销售订单、收款、打印与销售退货的真实核心交易链路。

**Architecture:** 沿用 `features/<domain>` 模块化单体，页面只编排交互，composable 管理状态，service 通过 Zod 校验真实 `/api/v1/erp` 响应；共享交易纯函数负责 Decimal、分页和状态词表。后端仅在某能力确实缺失时增量扩展。

**Tech Stack:** uni-app、Vue 3、TypeScript、Pinia、Wot Design Uni、Zod、Vitest、Vue Test Utils、miniprogram-automator、Rust/Axum/SeaORM/PostgreSQL。

**Spec:** `docs/superpowers/specs/2026-11-27-miniapp-rebuild-design.md`

## Global Constraints

- 新工程目录固定为 `miniapp/`；旧 `miniprogram/` 与 `.github/workflows/ci-cd.yml` 不得修改。
- 只调用真实 `/api/v1/erp` 端点；禁止 `/app-api`、`/oauth-api`、假数据、404 占位和静默兜底。
- 成功响应读取 `data`；标准分页为 `{items,total,page,page_size}`，AR 收款列表唯一例外为 `{list,...}`。
- Decimal 在 API 边界保持字符串；订单状态为小写，退货状态为 uppercase。
- 权限来自 `/auth/me`，页面、路由和按钮共用 `session.can` 与 `PermissionButton`。
- 文案只放 `miniapp/src/shared/i18n/zh-CN.ts`；英文按当前阶段口径延期，不新增裸中文业务 token。
- 每个服务响应必须通过 `z.strictObject` 校验；缺键、类型错误、未知状态显式抛 `INVALID_RESPONSE`。
- 本地允许定向 Vitest、typecheck、lint、Prettier 与静态门；uni-app 完整构建、Rust 编译和 automator 以 CI 为最终证据。
- 每项交付一个 Conventional Commit，scope 必填，显式路径暂存；推送仅在用户授权范围内进行。

---

## File Structure

### 共享交易层

- `miniapp/src/shared/trade.ts`：精确 Decimal、分页、订单/退货状态词表。
- `miniapp/src/shared/api/contracts.ts`：Phase 2 端点常量。
- `miniapp/src/shared/api/download.ts`：GET 文件下载与类型/长度校验。
- `miniapp/src/shared/ui/StatusTag.vue`：销售订单/退货/收款/客户/商品状态标签。
- `miniapp/src/shared/ui/MoneyText.vue`：Decimal 字符串展示，不做浮点累加。

### 功能域

- `features/workspace/{services,composables,pages,index.ts}`
- `features/customers/{services,composables,pages,components,types.ts,index.ts}`
- `features/catalog/{services,composables,pages,components,types.ts,index.ts}`
- `features/orders/{services,composables,pages,components,types.ts,index.ts}`
- `features/payments/{services,composables,pages,types.ts,index.ts}`
- `features/printing/{services,composables,pages,types.ts,index.ts}`
- `features/sales-returns/{services,composables,pages,components,types.ts,index.ts}`

### 测试

- `miniapp/tests/unit/trade-primitives.test.ts`
- `miniapp/tests/unit/<domain>-service.test.ts`
- `miniapp/tests/unit/<domain>-page.test.ts`
- `miniapp/tests/contract/phase2-contract.test.ts`
- `miniapp/tests/e2e/{workspace,orders,customers,catalog,sales-returns}.spec.ts`

---

### Task 0: Trade Primitives

**Files:**
- Create: `miniapp/src/shared/trade.ts`
- Test: `miniapp/tests/unit/trade-primitives.test.ts`

**Interfaces:**
- Produces: `normalizeDecimals(values: readonly string[]): string[]`
- Produces: `calculateLineTotal(quantity: string, unitPrice: string): string`
- Produces: `compareDecimals(left: string, right: string): -1 | 0 | 1`
- Produces: `normalizePageQuery(query: Record<string, unknown>): { page: number; page_size: number }`
- Produces: `mergeUniqueById<T extends { id: number | string }>(current: readonly T[], incoming: readonly T[]): T[]`
- Produces: `normalizeSalesOrderStatus(value: string): SalesOrderStatus`
- Produces: `normalizeSalesReturnStatus(value: string): SalesReturnStatus`

- [x] **Step 1: Write failing tests for decimal exactness, malformed input, pagination and status case**
- [x] **Step 2: Run tests and verify failure because `shared/trade` does not exist**
- [x] **Step 3: Implement BigInt-based decimal helpers and exact backend status sets**
- [x] **Step 4: Run tests and verify 8 tests pass**

```ts
expect(calculateLineTotal('12.345', '7.890')).toBe('97.40205')
expect(() => normalizeSalesOrderStatus('PARTIAL_SHIPPED')).toThrow('Unknown sales order status')
expect(() => normalizeSalesReturnStatus('submitted')).toThrow('Unknown sales return status')
```

---

### Task 1: Phase 2 API Contract Constants and Shared Status UI

**Files:**
- Modify: `miniapp/src/shared/api/contracts.ts`
- Create: `miniapp/src/shared/ui/StatusTag.vue`
- Create: `miniapp/src/shared/ui/MoneyText.vue`
- Test: `miniapp/tests/unit/status-tag.test.ts`
- Test: `miniapp/tests/contract/phase2-contract.test.ts`

**Interfaces:**
- Produces: endpoint constants for dashboard, customers, products, colors, color-cards, orders, payments, print-tasks and sales-returns.
- Produces: `StatusTag` props `{ domain: 'sales-order'|'sales-return'|'payment'|'customer'|'product'|'color-card'; value: string }`.
- Produces: `MoneyText` props `{ value: string; currency?: boolean }`.

- [ ] **Step 1: Write failing contract test that imports every required endpoint constant**
- [ ] **Step 2: Run test and verify missing export failures**
- [ ] **Step 3: Add endpoint constants only after matching `frontend/scripts/route-snapshot.txt`**

```ts
export const DASHBOARD_OVERVIEW_PATH = `${API_BASE_PATH}/dashboard/overview`
export const CUSTOMERS_PATH = `${API_BASE_PATH}/crm/customers`
export const ORDERS_PATH = `${API_BASE_PATH}/sales/orders`
export const PAYMENTS_PATH = `${API_BASE_PATH}/ar/payments`
export const SALES_RETURNS_PATH = `${API_BASE_PATH}/sales/sales-returns`
```

- [ ] **Step 4: Write failing status component tests for valid and unknown tokens**
- [ ] **Step 5: Implement `StatusTag` and `MoneyText` using `shared/trade` normalizers**
- [ ] **Step 6: Run tests, typecheck and contract gate**

```ts
expect(StatusTag.props.domain).toBe('sales-order')
expect(() => normalizeSalesReturnStatus('submitted')).toThrow()
```

---

### Task 2: Workspace Dashboard and Trade Navigation

**Files:**
- Modify: `miniapp/src/features/workspace/pages/index/index.vue`
- Create: `miniapp/src/features/workspace/services/dashboard.ts`
- Create: `miniapp/src/features/workspace/composables/useDashboard.ts`
- Modify: `miniapp/src/features/workspace/index.ts`
- Modify: `miniapp/src/pages.json`
- Modify: `miniapp/src/shared/ui/AppTabBar.vue`
- Modify: `miniapp/src/shared/i18n/zh-CN.ts`
- Test: `miniapp/tests/unit/workspace-page.test.ts`

**Interfaces:**
- Produces: `dashboardService.overview(): Promise<DashboardOverview>`
- Produces: `useDashboard(): { status, message, overview, load }`
- Consumes: `DASHBOARD_OVERVIEW_PATH`, `apiClient.get<unknown>`, `normalizeSuccess`.

- [ ] **Step 1: Write failing service test with a complete `DashboardOverview` fixture**
- [ ] **Step 2: Verify failure because `dashboardService` is missing**
- [ ] **Step 3: Implement strict schema and service**

```ts
const dashboardOverviewSchema = z.strictObject({
  total_products: z.number().int(),
  total_warehouses: z.number().int(),
  total_orders: z.number().int(),
  total_sales: z.string(),
  low_stock_count: z.number().int(),
  pending_orders: z.number().int(),
  monthly_sales: z.string(),
  inventory_total: z.string(),
  inventory_weight_kg: z.string(),
  customer_count: z.number().int(),
  today_orders: z.number().int(),
  fabric_count: z.number().int(),
})
```

- [ ] **Step 4: Write failing workspace test for metrics and permission-gated navigation**
- [ ] **Step 5: Implement dashboard composable and workspace cards**
- [ ] **Step 6: Add Orders tab and register Phase 2 page paths**
- [ ] **Step 7: Run tests, typecheck, lint and page inventory**

---

### Task 3: Customer Management and Customer Picker

**Files:**
- Create: `miniapp/src/features/customers/types.ts`
- Create: `miniapp/src/features/customers/services/customers.ts`
- Create: `miniapp/src/features/customers/composables/useCustomers.ts`
- Create: `miniapp/src/features/customers/pages/list/index.vue`
- Create: `miniapp/src/features/customers/pages/detail/index.vue`
- Create: `miniapp/src/features/customers/pages/form/index.vue`
- Create: `miniapp/src/features/customers/components/CustomerPicker.vue`
- Create: `miniapp/src/features/customers/index.ts`
- Test: `miniapp/tests/unit/customer-service.test.ts`
- Test: `miniapp/tests/unit/customer-picker.test.ts`

**Interfaces:**
- Produces: `customerService.list(query): Promise<CustomerPage>`
- Produces: `customerService.detail(id: number): Promise<Customer>`
- Produces: `customerService.create(payload: CustomerInput): Promise<Customer>`
- Produces: `customerService.update(id: number, payload: Partial<CustomerInput>): Promise<Customer>`
- Produces: `CustomerPicker` props `{ modelValue?: number | ''; disabled?: boolean }`, emits `update:modelValue`, `change`.

- [ ] **Step 1: Write failing list/detail/create tests including `credit_limit` string and PII field suppression**
- [ ] **Step 2: Verify missing service failure**
- [ ] **Step 3: Implement strict customer schemas and CRUD service**
- [ ] **Step 4: Implement paginated list composable with keyword/type/status filters**
- [ ] **Step 5: Implement detail and form pages using `ListPageTemplate`/`FormPageTemplate`**
- [ ] **Step 6: Implement customer picker with route return and selected label**
- [ ] **Step 7: Run tests, typecheck, lint and permission checks**

```ts
const customerSchema = z.strictObject({
  id: z.number().int(),
  customer_code: z.string(),
  customer_name: z.string().min(1),
  contact_person: z.string().nullable(),
  phone: z.string().nullable().optional(),
  credit_limit: z.string(),
  customer_type: z.enum(['retail', 'wholesale', 'distributor', 'manufacturer', 'other']),
  status: z.enum(['active', 'inactive', 'merged', 'blacklist']),
})
```

---

### Task 4: Catalog Products, Product Colors and Color Cards

**Files:**
- Create: `miniapp/src/features/catalog/types.ts`
- Create: `miniapp/src/features/catalog/services/products.ts`
- Create: `miniapp/src/features/catalog/services/colorCards.ts`
- Create: `miniapp/src/features/catalog/composables/useCatalog.ts`
- Create: `miniapp/src/features/catalog/pages/products/index.vue`
- Create: `miniapp/src/features/catalog/pages/products/detail.vue`
- Create: `miniapp/src/features/catalog/pages/color-cards/index.vue`
- Create: `miniapp/src/features/catalog/components/ProductPicker.vue`
- Create: `miniapp/src/features/catalog/index.ts`
- Test: `miniapp/tests/unit/catalog-service.test.ts`
- Test: `miniapp/tests/unit/product-picker.test.ts`

**Interfaces:**
- Produces: `productService.list(query): Promise<ProductPage>`
- Produces: `productService.colors(productId: number): Promise<ProductColor[]>`
- Produces: `colorCardService.list(query): Promise<ColorCardPage>`
- Produces: `ProductPicker` props `{ modelValue?: number | '' }`, emits selection with product and color.

- [ ] **Step 1: Write failing tests for product response extras, color `extra_cost` number and color-card status set**
- [ ] **Step 2: Verify missing service failure**
- [ ] **Step 3: Implement product/color/color-card schemas and services**
- [ ] **Step 4: Implement product list/detail and color-card list/detail pages**
- [ ] **Step 5: Implement product picker that loads colors after product selection**
- [ ] **Step 6: Run tests, typecheck, lint and contract gate**

```ts
const productColorSchema = z.strictObject({
  id: z.number().int(),
  product_id: z.number().int(),
  color_no: z.string(),
  color_name: z.string(),
  extra_cost: z.number(),
})
```

---

### Task 5: Sales Order List, Detail and Create

**Files:**
- Create: `miniapp/src/features/orders/types.ts`
- Create: `miniapp/src/features/orders/services/orders.ts`
- Create: `miniapp/src/features/orders/composables/useOrders.ts`
- Create: `miniapp/src/features/orders/composables/useOrderDraft.ts`
- Create: `miniapp/src/features/orders/pages/list/index.vue`
- Create: `miniapp/src/features/orders/pages/detail/index.vue`
- Create: `miniapp/src/features/orders/pages/create/index.vue`
- Create: `miniapp/src/features/orders/components/OrderGoodsEditor.vue`
- Create: `miniapp/src/features/orders/index.ts`
- Test: `miniapp/tests/unit/order-service.test.ts`
- Test: `miniapp/tests/unit/order-draft.test.ts`
- Test: `miniapp/tests/unit/order-page.test.ts`

**Interfaces:**
- Produces: `orderService.list(query): Promise<OrderPage>`
- Produces: `orderService.detail(id: number): Promise<SalesOrderDetail>`
- Produces: `orderService.create(payload: CreateOrderPayload): Promise<SalesOrderDetail>`
- Produces: `orderService.action(id, action, payload?): Promise<SalesOrderDetail>`
- Produces: `useOrderDraft(): { draft, errors, addItem, updateItem, removeItem, submit }`

- [ ] **Step 1: Write failing service tests for list filters, detail items and create payload**
- [ ] **Step 2: Verify missing service failure**
- [ ] **Step 3: Implement strict order schemas and service**
- [ ] **Step 4: Write failing draft tests for exact totals and invalid zero rows**
- [ ] **Step 5: Implement draft composable using `calculateLineTotal`**
- [ ] **Step 6: Implement list/detail/create pages and goods editor**
- [ ] **Step 7: Add permission-gated submit/approve/reject/cancel actions**
- [ ] **Step 8: Run tests, typecheck, lint and contract gate**

```ts
const createOrderSchema = z.strictObject({
  customer_id: z.number().int().positive(),
  order_date: z.string(),
  contact_person: z.string().min(1),
  contact_phone: z.string().min(1),
  shipping_address: z.string().min(1),
  items: z.array(z.strictObject({
    product_id: z.number().int().positive(),
    quantity: z.string().refine((v) => compareDecimals(v, '0') > 0),
    unit_price: z.string().refine((v) => compareDecimals(v, '0') > 0),
    color_no: z.string().optional(),
    quantity_tolerance_pct: z.string().optional(),
    notes: z.string().optional(),
  })).min(1),
})
```

---

### Task 6: AR Payments and Print Tasks

**Files:**
- Create: `miniapp/src/features/payments/types.ts`
- Create: `miniapp/src/features/payments/services/payments.ts`
- Create: `miniapp/src/features/payments/composables/usePaymentForm.ts`
- Create: `miniapp/src/features/payments/pages/collect/index.vue`
- Create: `miniapp/src/features/payments/index.ts`
- Create: `miniapp/src/features/printing/types.ts`
- Create: `miniapp/src/features/printing/services/printing.ts`
- Create: `miniapp/src/features/printing/pages/preview/index.vue`
- Create: `miniapp/src/features/printing/index.ts`
- Create: `miniapp/src/shared/api/download.ts`
- Test: `miniapp/tests/unit/payment-service.test.ts`
- Test: `miniapp/tests/unit/payment-form.test.ts`
- Test: `miniapp/tests/unit/printing-service.test.ts`

**Interfaces:**
- Produces: `paymentService.list(query): Promise<{ list: ArPayment[]; total: number; page: number; page_size: number }>`
- Produces: `paymentService.create(payload): Promise<ArPayment>`
- Produces: `paymentService.confirm(id): Promise<ArPayment>`
- Produces: `printingService.create(payload): Promise<PrintTask>`
- Produces: `printingService.get(id): Promise<PrintTask>`
- Produces: `downloadFile(path): Promise<{ tempFilePath: string; size: number }>`

- [ ] **Step 1: Write failing payment list test using `list`, not `items`**
- [ ] **Step 2: Verify missing service failure**
- [ ] **Step 3: Implement AR payment schemas and service**
- [ ] **Step 4: Write failing form tests for amount precision, method vocabulary and upper bound**
- [ ] **Step 5: Implement collect form and confirmation flow**
- [ ] **Step 6: Write failing print task tests for accepted vs terminal states**
- [ ] **Step 7: Implement print task service, polling and binary download**
- [ ] **Step 8: Run tests, typecheck, lint and contract gate**

```ts
const paymentMethods = ['wechat', 'alipay', 'cash', 'card', 'bank_transfer'] as const
expect(validatePaymentAmount('0.001', '100.00')).toThrow('最多两位小数')
expect(validatePaymentAmount('100.01', '100.00')).toThrow('不得超过待收金额')
```

---

### Task 7: Sales Returns

**Files:**
- Create: `miniapp/src/features/sales-returns/types.ts`
- Create: `miniapp/src/features/sales-returns/services/salesReturns.ts`
- Create: `miniapp/src/features/sales-returns/composables/useReturnDraft.ts`
- Create: `miniapp/src/features/sales-returns/pages/list/index.vue`
- Create: `miniapp/src/features/sales-returns/pages/detail/index.vue`
- Create: `miniapp/src/features/sales-returns/pages/create/index.vue`
- Create: `miniapp/src/features/sales-returns/components/ReturnItemEditor.vue`
- Create: `miniapp/src/features/sales-returns/index.ts`
- Test: `miniapp/tests/unit/sales-return-service.test.ts`
- Test: `miniapp/tests/unit/return-draft.test.ts`
- Test: `miniapp/tests/unit/sales-return-page.test.ts`

**Interfaces:**
- Produces: `salesReturnService.list(query): Promise<SalesReturnPage>`
- Produces: `salesReturnService.createHeader(payload): Promise<SalesReturn>`
- Produces: `salesReturnService.createItem(returnId, payload): Promise<SalesReturnItem>`
- Produces: `salesReturnService.action(id, action, payload?): Promise<SalesReturnView>`
- Produces: `useReturnDraft(): { header, items, errors, addFromOrder, submit }`

- [ ] **Step 1: Write failing tests for uppercase statuses and header/item split**
- [ ] **Step 2: Verify missing service failure**
- [ ] **Step 3: Implement return schemas and service**
- [ ] **Step 4: Write failing draft tests for quantity upper bounds and duplicate submit guard**
- [ ] **Step 5: Implement return draft composable**
- [ ] **Step 6: Implement list/detail/create pages and item editor**
- [ ] **Step 7: Add print entry and permission-gated actions**
- [ ] **Step 8: Run tests, typecheck, lint and contract gate**

```ts
expect(normalizeSalesReturnStatus('SUBMITTED')).toBe('SUBMITTED')
expect(() => normalizeSalesReturnStatus('submitted')).toThrow()
expect(validateReturnQuantity('11', '10')).toThrow('不得超过可退数量')
```

---

### Task 8: Phase 2 Runtime E2E and Acceptance

**Files:**
- Modify: `miniapp/tests/e2e/smoke.spec.ts`
- Create: `miniapp/tests/e2e/workspace.spec.ts`
- Create: `miniapp/tests/e2e/orders.spec.ts`
- Create: `miniapp/tests/e2e/customers.spec.ts`
- Create: `miniapp/tests/e2e/catalog.spec.ts`
- Create: `miniapp/tests/e2e/sales-returns.spec.ts`
- Modify: `docs/plans/miniapp-phase2-acceptance.md`

**Interfaces:**
- Consumes: all Phase 2 services and pages.
- Produces: completed automator evidence with no mock/route interception.

- [ ] **Step 1: Add real-backend workspace navigation assertions**
- [ ] **Step 2: Add customer create/select and product select assertions**
- [ ] **Step 3: Add order create/list/detail assertions using unique test data**
- [ ] **Step 4: Add payment validation and return creation assertions**
- [ ] **Step 5: Run full local Vitest, typecheck, lint, Prettier and static gates**
- [ ] **Step 6: Push authorized commits and bind evidence to PR head SHA**
- [ ] **Step 7: Run Windows E2E and record job/artifact conclusions**
- [ ] **Step 8: Update Phase 2 acceptance without claiming unrun features passed**

---

## Self-Review

- Spec coverage：Phase 2 七个业务域均由 Task 2–7 覆盖；Task 1 负责共享契约与状态 UI，Task 8 负责运行时证据。
- Backend gaps：当前核心端点已存在；若实现中发现确实缺失，只新增 handler/service/permission/OpenAPI/migration/test，不改变既有响应。
- Type consistency：订单状态小写、退货状态大写、AR 分页 `list`、客户 `credit_limit` 字符串、色号 `extra_cost` 数字均在任务接口中固定。
- Placeholder scan：无 TODO/TBD；每个任务均给出文件、接口、失败测试与实现步骤。
