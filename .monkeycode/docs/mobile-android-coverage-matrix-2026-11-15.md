# 安卓优化W0.1全路由静态矩阵

基线：`ef4a70554ebea302ca346a92f5fdd63575e734c6`。仅静态取证，全部运行与角色验收未执行。

## 提取口径

TypeScript AST只读解析routes数组及children；父子路径拼合，保留动态参数。分类互斥：含children为布局，其次component为组件页，其次仅redirect为重定向，其余为其他。auth和permission按父meta继承；未声明不是不需要认证，实际守卫另验。public/hidden仅记显式true。导航仅提取NAV_TREE内L调用，遍历仅提取TRAVERSAL_MODULES内route属性；均按完整URL模板精确匹配并记对象／调用首行。未命中不等于不可达，命中不等于运行通过。数组权限完整保留，不将其直接认作部署角色授予。

源码列router对应`frontend/src/router/index.ts`，nav对应`frontend/src/config/navigation.ts`，traversal对应`frontend/e2e/traversal/modules.config.ts`。后端route-snapshot.txt不是前端页面分母。组件路径按顶层import或lazy import解析并检查文件存在。

## 静态汇总

```json
{
  "records": 155,
  "counts": {
    "重定向": 10,
    "组件页": 144,
    "布局": 1
  },
  "componentMissing": [],
  "navLeaves": 119,
  "traversalRecords": 101,
  "navUnknownPaths": [],
  "traversalUnknownPaths": []
}
```

统计为路由记录及组件页模板数，不是页内全部功能或真实可达率。根布局与根重定向可同为`/`，按记录分别列出。各页Tab、弹窗、动作和角色有效权限仍需W0.2补证，不据本表宣布W0整体完成。

## 逐项路由

| 类别 | 最终path | name | component／redirect | permission | requiresAuth | 标记 | 导航证据 | 遍历证据 | 路由证据 |
|---|---|---|---|---|---|---|---|---|---|
| 重定向 | `/` | 未声明 | `redirect /dashboard` | 未声明 | 未声明（未声明） | 无显式标记 | 未命中 | 未命中 | router:33 |
| 组件页 | `/login` | `Login` | `@/views/Login.vue` | 未声明 | 未声明（未声明） | 无显式标记 | 未命中 | 未命中 | router:37 |
| 组件页 | `/terms` | `Terms` | `@/views/legal/TermsView.vue` | 未声明 | 未声明（未声明） | public=true | 未命中 | 未命中 | router:43 |
| 组件页 | `/privacy` | `Privacy` | `@/views/legal/PrivacyView.vue` | 未声明 | 未声明（未声明） | public=true | 未命中 | 未命中 | router:49 |
| 组件页 | `/setup` | `Setup` | `@/views/Setup.vue` | 未声明 | 未声明（未声明） | 无显式标记 | 未命中 | 未命中 | router:55 |
| 布局 | `/` | 未声明 | `@/components/Layout/MainLayout.vue` | 未声明 | `true`（显式） | 无显式标记 | 未命中 | 未命中 | router:61 |
| 组件页 | `/dashboard` | `Dashboard` | `@/views/Dashboard.vue` | `"dashboard:read"` | `true`（显式） | 无显式标记 | nav:47 | traversal:39 | router:66 |
| 重定向 | `/system` | `SystemLegacy` | `redirect /users` | 未声明 | `true`（显式） | hidden=true | 未命中 | 未命中 | router:77 |
| 组件页 | `/users` | `Users` | `@/views/users/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:240 | traversal:42 | router:84 |
| 组件页 | `/roles` | `Roles` | `@/views/roles/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:241 | traversal:43 | router:90 |
| 组件页 | `/company` | `CompanyProfile` | `@/views/company/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:243 | traversal:44 | router:101 |
| 组件页 | `/permissions` | `RolePermissions` | `@/views/permissions/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:247 | traversal:45 | router:112 |
| 组件页 | `/field-permissions` | `FieldPermissions` | `@/views/field-permissions/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:248 | traversal:46 | router:118 |
| 组件页 | `/webhooks` | `Webhooks` | `@/views/webhooks/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:259 | traversal:47 | router:124 |
| 组件页 | `/system/oa-announcements` | `SystemOaAnnouncements` | `@/views/system/oa-announcements/index.vue` | `"oa-announcements:read"` | `true`（显式） | 无显式标记 | nav:262 | 未命中 | router:135 |
| 组件页 | `/system/audit-log` | `SystemAuditLog` | `@/views/system/audit-log/index.vue` | `"audit-logs:read"` | `true`（显式） | 无显式标记 | nav:268 | traversal:57 | router:146 |
| 组件页 | `/system/export-approvals` | `SystemExportApprovals` | `@/views/system/ExportApprovals.vue` | `"audit-logs:read"` | `true`（显式） | 无显式标记 | nav:255 | traversal:58 | router:157 |
| 组件页 | `/system/slow-query` | `SystemSlowQuery` | `@/views/system/slow-query/index.vue` | `"audit-logs:read"` | `true`（显式） | 无显式标记 | nav:269 | traversal:59 | router:168 |
| 组件页 | `/finance` | `Finance` | `@/views/finance/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:162 | traversal:79 | router:179 |
| 组件页 | `/period-adjustments` | `PeriodAdjustments` | `@/views/period-adjustments/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:166 | 未命中 | router:185 |
| 组件页 | `/budgets` | `BudgetApprovals` | `@/views/budgets/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:180 | 未命中 | router:196 |
| 组件页 | `/invoice-details` | `InvoiceDetails` | `@/views/invoice-details/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:174 | 未命中 | router:207 |
| 重定向 | `/periods` | `AccountingPeriods` | `redirect /accounting-period` | `"finance:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:218 |
| 组件页 | `/ap` | `AP` | `@/views/ap/index.vue` | `["ap-invoices:read","ap-payments:read","ap-payment-requests:read","ap-verifications:read","ap-reconciliations:read","ap-aging:read","ap-daily:read","ap-monthly:read","ap-statistics:read"]` | `true`（显式） | 无显式标记 | nav:171 | traversal:97 | router:231 |
| 组件页 | `/ar` | `AR` | `@/views/ar/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:170 | traversal:98 | router:259 |
| 重定向 | `/fabric` | 未声明 | `redirect /greige-fabrics` | 未声明 | `true`（父继承） | 无显式标记 | 未命中 | 未命中 | router:267 |
| 重定向 | `/fabric/greige` | 未声明 | `redirect /greige-fabrics` | 未声明 | `true`（父继承） | 无显式标记 | 未命中 | 未命中 | router:271 |
| 组件页 | `/inventory` | `Inventory` | `@/views/inventory/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:144 | traversal:175 | router:275 |
| 组件页 | `/sales` | `Sales` | `@/views/sales/index.vue` | `"sales:read"` | `true`（显式） | 无显式标记 | nav:65 | traversal:102 | router:281 |
| 组件页 | `/sales/orders/:id` | `SalesOrderDetail` | `@/views/sales/OrderDetail.vue` | `"sales:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:292 |
| 组件页 | `/purchase` | `Purchase` | `@/views/purchase/index.vue` | `"purchases:read"` | `true`（显式） | 无显式标记 | nav:92 | traversal:120 | router:303 |
| 组件页 | `/purchase/sku-mapping` | `SkuMapping` | `@/views/sku-mapping/index.vue` | `"sku-mappings:read"` | `true`（显式） | 无显式标记 | nav:102 | 未命中 | router:314 |
| 组件页 | `/purchase/supplier-product` | `SupplierProduct` | `@/views/supplier-product/index.vue` | `"supplier-products:read"` | `true`（显式） | 无显式标记 | nav:103 | 未命中 | router:325 |
| 组件页 | `/customer` | `Customer` | `@/views/customer/index.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:54 | traversal:153 | router:336 |
| 组件页 | `/supplier` | `Supplier` | `@/views/supplier/index.vue` | `"suppliers:read"` | `true`（显式） | 无显式标记 | nav:87 | traversal:160 | router:342 |
| 组件页 | `/product` | `Product` | `@/views/product/index.vue` | `"products:read"` | `true`（显式） | 无显式标记 | nav:101 | traversal:163 | router:353 |
| 组件页 | `/warehouse` | `Warehouse` | `@/views/warehouse/index.vue` | `"warehouses:read"` | `true`（显式） | 无显式标记 | nav:145 | traversal:176 | router:359 |
| 组件页 | `/departments` | `Departments` | `@/views/departments/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:242 | traversal:48 | router:365 |
| 组件页 | `/greige-fabrics` | `GreigeFabrics` | `@/views/greige-fabrics/index.vue` | `["greige-fabrics:read"]` | `true`（显式） | 无显式标记 | nav:104 | traversal:166 | router:371 |
| 组件页 | `/sales-returns` | `SalesReturns` | `@/views/sales-returns/index.vue` | `"sales:read"` | `true`（显式） | 无显式标记 | nav:66 | traversal:106 | router:382 |
| 组件页 | `/supplier-evaluation` | `SupplierEvaluation` | `@/views/supplier-evaluation/index.vue` | `"suppliers:read"` | `true`（显式） | 无显式标记 | nav:88 | traversal:129 | router:393 |
| 组件页 | `/customer-credit` | `CustomerCredit` | `@/views/customer-credit/index.vue` | `"customer-credits:read"` | `true`（显式） | 无显式标记 | nav:55 | traversal:154 | router:404 |
| 组件页 | `/inventory-count` | `InventoryCount` | `@/views/inventory-count/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:147 | traversal:177 | router:416 |
| 组件页 | `/inventory-transfer` | `InventoryTransfer` | `@/views/inventory-transfer/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:148 | traversal:180 | router:422 |
| 组件页 | `/inventory-adjustment` | `InventoryAdjustment` | `@/views/inventory-adjustment/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:149 | traversal:181 | router:428 |
| 组件页 | `/ar-reconciliation` | `ArReconciliation` | `@/views/ar-reconciliation/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:172 | traversal:90 | router:434 |
| 组件页 | `/finance-report` | `FinanceReport` | `@/views/finance-report/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:185 | traversal:87 | router:440 |
| 组件页 | `/purchase-receipt` | `PurchaseReceipt` | `@/views/purchase-receipt/index.vue` | `"purchases:read"` | `true`（显式） | 无显式标记 | nav:93 | traversal:121 | router:446 |
| 组件页 | `/fixed-assets` | `FixedAssets` | `@/views/fixed-assets/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:177 | traversal:91 | router:457 |
| 组件页 | `/bpm` | `BPM` | `@/views/bpm/index.vue` | `["bpm-tasks:read","bpm-monitor:read"]` | `true`（显式） | 无显式标记 | nav:219 | traversal:215 | router:468 |
| 组件页 | `/quality` | `Quality` | `@/views/quality/index.vue` | `["quality-standards:read","quality-inspections:read"]` | `true`（显式） | 无显式标记 | nav:198 | traversal:199 | router:482 |
| 重定向 | `/crm` | 未声明 | `redirect /customer` | 未声明 | `true`（父继承） | 无显式标记 | 未命中 | 未命中 | router:493 |
| 组件页 | `/crm/pool` | `CRMPool` | `@/views/crm/pool.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:56 | traversal:148 | router:499 |
| 组件页 | `/crm/assignment` | `CRMAssignment` | `@/views/crm/assignment.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:57 | traversal:149 | router:510 |
| 组件页 | `/crm/detail/:id` | `CRMDetail` | `@/views/crm/detail.vue` | `"customers:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:516 |
| 组件页 | `/crm/leads` | `CRMLeads` | `@/views/crm/leads/index.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:58 | traversal:150 | router:529 |
| 组件页 | `/crm/opportunities` | `CRMOpportunities` | `@/views/crm/opportunities/index.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:59 | traversal:151 | router:536 |
| 组件页 | `/advanced` | `Advanced` | `@/views/advanced/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:225 | traversal:221 | router:542 |
| 组件页 | `/production` | `Production` | `@/views/production/index.vue` | `["production-orders:read"]` | `true`（显式） | 无显式标记 | nav:115 | traversal:187 | router:548 |
| 组件页 | `/customer-collab` | `CustomerCollab` | `@/views/customer-collab/index.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:61 | 未命中 | router:559 |
| 组件页 | `/labor-contracts` | `LaborContracts` | `@/views/labor-contracts/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:132 | 未命中 | router:570 |
| 组件页 | `/social-insurance` | `SocialInsurance` | `@/views/social-insurance/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:133 | 未命中 | router:576 |
| 组件页 | `/environmental-compliance` | `EnvironmentalCompliance` | `@/views/environmental-compliance/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:206 | 未命中 | router:582 |
| 组件页 | `/occupational-health` | `OccupationalHealth` | `@/views/occupational-health/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:134 | 未命中 | router:593 |
| 组件页 | `/system-governance` | `SystemGovernance` | `@/views/system-governance/index.vue` | `"admin:read"` | `true`（显式） | 无显式标记 | nav:250 | 未命中 | router:604 |
| 组件页 | `/export-compliance` | `ExportCompliance` | `@/views/export-compliance/index.vue` | `"sales:read"` | `true`（显式） | 无显式标记 | nav:205 | 未命中 | router:615 |
| 组件页 | `/textile-safety` | `TextileSafety` | `@/views/textile-safety/index.vue` | `["textile-submissions:read"]` | `true`（显式） | 无显式标记 | nav:207 | traversal:205 | router:621 |
| 组件页 | `/textile-safety-master` | `TextileSafetyMaster` | `@/views/textile-safety/master.vue` | `["textile-test-items:read"]` | `true`（显式） | 无显式标记 | nav:208 | traversal:206 | router:632 |
| 组件页 | `/wage` | `Wage` | `@/views/wage/index.vue` | `"production:read"` | `true`（显式） | 无显式标记 | nav:131 | 未命中 | router:643 |
| 组件页 | `/chemicals` | `Chemicals` | `@/views/chemicals/index.vue` | `["chemicals:read"]` | `true`（显式） | 无显式标记 | nav:128 | 未命中 | router:654 |
| 组件页 | `/fabric-inspections` | `FabricInspections` | `@/views/fabric-inspections/index.vue` | `["fabric-inspections:read"]` | `true`（显式） | 无显式标记 | nav:201 | 未命中 | router:665 |
| 组件页 | `/quality-8d` | `Quality8d` | `@/views/quality-8d/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:199 | 未命中 | router:676 |
| 组件页 | `/bad-debts` | `BadDebts` | `@/views/bad-debts/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:173 | 未命中 | router:687 |
| 组件页 | `/outsourcing` | `Outsourcing` | `@/views/outsourcing/index.vue` | `["outsourcing-orders:read","outsourcing-receipts:read"]` | `true`（显式） | 无显式标记 | nav:98 | 未命中 | router:693 |
| 组件页 | `/flow-cards` | `FlowCards` | `@/views/flow-cards/index.vue` | `["flow-cards:read"]` | `true`（显式） | 无显式标记 | nav:127 | 未命中 | router:704 |
| 组件页 | `/lab-dip` | `LabDip` | `@/views/lab-dip/index.vue` | `["lab-dip:read"]` | `true`（显式） | 无显式标记 | nav:124 | 未命中 | router:715 |
| 组件页 | `/bulk-color-approval` | `BulkColorApproval` | `@/views/bulk-color-approval/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:125 | 未命中 | router:726 |
| 组件页 | `/production-recipes` | `ProductionRecipes` | `@/views/production-recipes/index.vue` | `["production-recipes:read"]` | `true`（显式） | 无显式标记 | nav:126 | 未命中 | router:737 |
| 组件页 | `/capacity` | `Capacity` | `@/views/capacity/index.vue` | `["capacity:read"]` | `true`（显式） | 无显式标记 | nav:116 | traversal:188 | router:748 |
| 组件页 | `/material-shortage` | `MaterialShortage` | `@/views/material-shortage/index.vue` | `["material-shortage:read"]` | `true`（显式） | 无显式标记 | nav:117 | traversal:189 | router:754 |
| 组件页 | `/cost` | `Cost` | `@/views/cost/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:181 | traversal:92 | router:765 |
| 组件页 | `/budget` | `Budget` | `@/views/budget/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:179 | traversal:93 | router:771 |
| 组件页 | `/fund` | `Fund` | `@/views/fund/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:178 | traversal:94 | router:777 |
| 组件页 | `/financial-analysis` | `FinancialAnalysis` | `@/views/financial-analysis/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:187 | traversal:95 | router:783 |
| 组件页 | `/currency` | `Currency` | `@/views/currency/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:182 | traversal:96 | router:789 |
| 组件页 | `/notification` | `Notification` | `@/views/notification/index.vue` | `"notifications:read"` | `true`（显式） | 无显式标记 | nav:261 | traversal:49 | router:800 |
| 组件页 | `/data-permission` | `DataPermission` | `@/views/data-permission/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:249 | traversal:50 | router:811 |
| 组件页 | `/inventory-batch` | `InventoryBatch` | `@/views/inventory-batch/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:146 | traversal:182 | router:822 |
| 组件页 | `/five-dimension` | `FiveDimension` | `@/views/five-dimension/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:152 | traversal:183 | router:828 |
| 组件页 | `/assist-accounting` | `AssistAccounting` | `@/views/assist-accounting/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:167 | traversal:99 | router:834 |
| 组件页 | `/business-trace` | `BusinessTrace` | `@/views/business-trace/index.vue` | `"audit-logs:read"` | `true`（显式） | 无显式标记 | nav:204 | traversal:52 | router:840 |
| 组件页 | `/barcode-scanner` | `BarcodeScanner` | `@/views/barcode-scanner/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:151 | traversal:184 | router:851 |
| 组件页 | `/omni-audit` | `OmniAudit` | `@/views/omni-audit/index.vue` | `"audit-logs:read"` | `true`（显式） | 无显式标记 | nav:230 | traversal:51 | router:857 |
| 组件页 | `/scheduling` | `Scheduling` | `@/views/scheduling/index.vue` | `["scheduling:read"]` | `true`（显式） | 无显式标记 | nav:118 | traversal:190 | router:868 |
| 组件页 | `/scheduling/gantt` | `SchedulingGantt` | `@/views/scheduling/gantt.vue` | `["scheduling:read"]` | `true`（显式） | 无显式标记 | nav:119 | traversal:191 | router:879 |
| 组件页 | `/components-demo` | `ComponentsDemo` | `@/views/components-demo/index.vue` | `"users:read"` | `true`（显式） | hidden=true | 未命中 | traversal:53 | router:890 |
| 组件页 | `/voucher` | `Voucher` | `@/views/voucher/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:163 | traversal:80 | router:903 |
| 组件页 | `/account-subject` | `AccountSubject` | `@/views/account-subject/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:164 | traversal:84 | router:910 |
| 组件页 | `/accounting-period` | `AccountingPeriod` | `@/views/accounting-period/index.vue` | `"finance:read"` | `true`（显式） | 无显式标记 | nav:165 | traversal:86 | router:922 |
| 组件页 | `/report-templates` | `ReportTemplates` | `@/views/report-templates/index.vue` | `"audit-logs:read"` | `true`（显式） | 无显式标记 | nav:186 | traversal:62 | router:935 |
| 组件页 | `/bpm/definitions` | `BPMDefinitions` | `@/views/bpm/definitions.vue` | `"bpm-definitions:read"` | `true`（显式） | 无显式标记 | nav:220 | traversal:216 | router:947 |
| 组件页 | `/bpm/templates` | `BPMTemplates` | `@/views/bpm/templates.vue` | `"bpm-templates:read"` | `true`（显式） | 无显式标记 | nav:221 | traversal:217 | router:960 |
| 组件页 | `/bpm/approval` | `BPMApproval` | `@/views/bpm/approval/index.vue` | `["bpm-tasks:read","bpm-approvals:create"]` | `true`（显式） | 无显式标记 | nav:222 | traversal:218 | router:973 |
| 重定向 | `/ar-reconciliation/enhanced` | 未声明 | `redirect /ar-reconciliation?tab=enhanced` | 未声明 | `true`（父继承） | 无显式标记 | 未命中 | 未命中 | router:988 |
| 组件页 | `/crm-enhanced` | `CrmEnhanced` | `@/views/crm/enhanced/index.vue` | `"customers:read"` | `true`（显式） | 无显式标记 | nav:60 | traversal:147 | router:994 |
| 组件页 | `/supplier-enhanced` | `SupplierEnhanced` | `@/views/supplier/enhanced/index.vue` | `"suppliers:read"` | `true`（显式） | 无显式标记 | nav:89 | 未命中 | router:1006 |
| 组件页 | `/sales-analysis` | `SalesAnalysis` | `@/views/sales-analysis/index.vue` | `"sales:read"` | `true`（显式） | 无显式标记 | nav:77 | traversal:110 | router:1018 |
| 组件页 | `/security` | `Security` | `@/views/security/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:244 | traversal:73 | router:1030 |
| 组件页 | `/security/two-factor-setup` | `SecurityTwoFactorSetup` | `@/views/security/TwoFactorSetup.vue` | `"users:read"` | `true`（显式） | hidden=true | 未命中 | traversal:74 | router:1037 |
| 组件页 | `/security/change-password` | `SecurityChangePassword` | `@/views/security/ChangePassword.vue` | `"users:read"` | `true`（显式） | hidden=true | 未命中 | traversal:75 | router:1050 |
| 组件页 | `/dye-recipe` | `DyeRecipe` | `@/views/dye-recipe/index.vue` | `["dye-recipes:read"]` | `true`（显式） | 无显式标记 | nav:122 | traversal:171 | router:1062 |
| 组件页 | `/dye-batch` | `DyeBatch` | `@/views/dye-batch/index.vue` | `["dye-batches:read"]` | `true`（显式） | 无显式标记 | nav:123 | traversal:172 | router:1073 |
| 组件页 | `/purchase-contract` | `PurchaseContract` | `@/views/purchase-contract/index.vue` | `"purchases:read"` | `true`（显式） | 无显式标记 | nav:96 | traversal:125 | router:1084 |
| 组件页 | `/sales-contract` | `SalesContract` | `@/views/sales-contract/index.vue` | `"sales:read"` | `true`（显式） | 无显式标记 | nav:67 | traversal:107 | router:1095 |
| 组件页 | `/purchase-price` | `PurchasePrice` | `@/views/purchase-price/index.vue` | `"purchases:read"` | `true`（显式） | 无显式标记 | nav:97 | traversal:126 | router:1106 |
| 组件页 | `/sales-price` | `SalesPrice` | `@/views/sales-price/index.vue` | `"sales:read"` | `true`（显式） | 无显式标记 | nav:71 | traversal:108 | router:1117 |
| 组件页 | `/email` | `Email` | `@/views/email/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:263 | traversal:72 | router:1129 |
| 组件页 | `/admin/failover` | `AdminFailover` | `@/views/admin/failover.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:267 | traversal:71 | router:1136 |
| 组件页 | `/purchase-inspection` | `PurchaseInspection` | `@/views/purchase-inspection/index.vue` | `"purchases:read"` | `true`（显式） | 无显式标记 | nav:94 | traversal:127 | router:1148 |
| 组件页 | `/purchase-return` | `PurchaseReturn` | `@/views/purchase-return/index.vue` | `"purchases:read"` | `true`（显式） | 无显式标记 | nav:95 | traversal:128 | router:1160 |
| 组件页 | `/logistics` | `Logistics` | `@/views/logistics/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:150 | traversal:117 | router:1172 |
| 组件页 | `/quality-standards` | `QualityStandards` | `@/views/quality-standards/index.vue` | `["quality-standards:read"]` | `true`（显式） | 无显式标记 | nav:200 | traversal:200 | router:1178 |
| 组件页 | `/data-import` | `DataImport` | `@/views/data-import/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:260 | traversal:76 | router:1189 |
| 组件页 | `/print-templates` | `PrintTemplates` | `@/views/print-templates/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:253 | traversal:64 | router:1195 |
| 组件页 | `/print-targets` | `PrintTargets` | `@/views/print-targets/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:254 | traversal:67 | router:1201 |
| 组件页 | `/api-gateway` | `ApiGateway` | `@/views/api-gateway/index.vue` | `"users:read"` | `true`（显式） | 无显式标记 | nav:258 | traversal:68 | router:1207 |
| 组件页 | `/system-update` | `SystemUpdate` | `@/views/system-update/index.vue` | `"system-update-check:read"` | `true`（显式） | 无显式标记 | nav:266 | traversal:69 | router:1213 |
| 组件页 | `/system/profile` | `UserProfile` | `@/views/user-profile/index.vue` | `"users:read"` | `true`（显式） | hidden=true | 未命中 | traversal:70 | router:1224 |
| 组件页 | `/quotations` | `QuotationList` | `@/views/quotations/list.vue` | `"quotations:read"` | `true`（显式） | 无显式标记 | nav:64 | traversal:111 | router:1241 |
| 组件页 | `/quotations/new` | `QuotationCreate` | `@/views/quotations/create.vue` | `"quotations:read"` | `true`（显式） | hidden=true | 未命中 | traversal:112 | router:1252 |
| 组件页 | `/quotations/:id` | `QuotationDetail` | `@/views/quotations/detail.vue` | `"quotations:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1264 |
| 组件页 | `/quotations/:id/edit` | `QuotationEdit` | `@/views/quotations/edit.vue` | `"quotations:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1276 |
| 组件页 | `/quotations/:id/approval` | `QuotationApproval` | `@/views/quotations/approval.vue` | `"quotations:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1288 |
| 组件页 | `/custom-orders` | `CustomOrderList` | `@/views/custom-orders/list.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:68 | traversal:113 | router:1301 |
| 组件页 | `/custom-orders/new` | `CustomOrderCreate` | `@/views/custom-orders/create.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1312 |
| 组件页 | `/custom-orders/:id` | `CustomOrderDetail` | `@/views/custom-orders/detail.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1324 |
| 组件页 | `/custom-orders/:id/edit` | `CustomOrderEdit` | `@/views/custom-orders/edit.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1336 |
| 组件页 | `/custom-orders/:id/track` | `CustomOrderTracking` | `@/views/custom-orders/tracking.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1347 |
| 组件页 | `/color-cards/list` | `ColorCardList` | `@/views/color-cards/list.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:72 | traversal:167 | router:1360 |
| 组件页 | `/color-cards/create` | `ColorCardCreate` | `@/views/color-cards/create.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1371 |
| 组件页 | `/color-cards/detail/:id` | `ColorCardDetail` | `@/views/color-cards/detail.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1383 |
| 组件页 | `/color-cards/issues` | `ColorCardIssue` | `@/views/color-cards/issues.vue` | `"color_card_issue:read"` | `true`（显式） | 无显式标记 | nav:73 | traversal:168 | router:1395 |
| 组件页 | `/color-prices/list` | `ColorPriceList` | `@/views/color-prices/list.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:74 | traversal:169 | router:1408 |
| 组件页 | `/color-prices/create` | `ColorPriceCreate` | `@/views/color-prices/create.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1419 |
| 组件页 | `/color-prices/detail/:id` | `ColorPriceDetail` | `@/views/color-prices/detail.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1432 |
| 组件页 | `/color-prices/batch-adjust` | `ColorPriceBatchAdjust` | `@/views/color-prices/batch-adjust.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:75 | traversal:170 | router:1444 |
| 组件页 | `/ai-extend` | `AiExtendOverview` | `@/views/ai-extend/index.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:226 | traversal:222 | router:1456 |
| 组件页 | `/ai-extend/process-optimization` | `AiExtendProcessOptimization` | `@/views/ai-extend/process-optimization.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:227 | traversal:223 | router:1467 |
| 组件页 | `/ai-extend/process-detail/:id` | `AiExtendProcessDetail` | `@/views/ai-extend/process-detail.vue` | `"inventory:read"` | `true`（显式） | hidden=true | 未命中 | 未命中 | router:1478 |
| 组件页 | `/ai-extend/quality-prediction` | `AiExtendQualityPrediction` | `@/views/ai-extend/quality-prediction.vue` | `"inventory:read"` | `true`（显式） | 无显式标记 | nav:228 | traversal:224 | router:1490 |
| 重定向 | `/bi/sales-analysis` | 未声明 | `redirect /sales-analysis?tab=bi` | 未声明 | `true`（父继承） | 无显式标记 | 未命中 | 未命中 | router:1501 |
| 重定向 | `/workflow` | 未声明 | `redirect /bpm` | 未声明 | 未声明（未声明） | 无显式标记 | 未命中 | traversal:54 | router:1508 |
| 组件页 | `/403` | `403` | `@/views/403.vue` | 未声明 | 未声明（未声明） | public=true，hidden=true | 未命中 | 未命中 | router:1512 |
| 组件页 | `/404` | `404` | `@/views/404.vue` | 未声明 | 未声明（未声明） | public=true，hidden=true | 未命中 | 未命中 | router:1519 |
| 重定向 | `/:pathMatch(.*)*` | 未声明 | `redirect /404` | 未声明 | 未声明（未声明） | 无显式标记 | 未命中 | 未命中 | router:1526 |

## 运行验收状态

本轮未启动服务、浏览器、模拟器、真机或CI。全部记录的视觉、交互、业务、设备、网络、系统、安全、发布验证均为未执行；本表只满足静态路由记录整理，不将角色与设备验证折算为通过。