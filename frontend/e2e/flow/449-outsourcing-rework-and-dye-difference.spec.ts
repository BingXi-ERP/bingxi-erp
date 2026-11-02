import { test } from '@playwright/test';

/**
 * 功能：委外染整（outsourcing dyeing）反向腿端到端闭环 —— 染整批次合格入库后登记缸差、
 * 发起返工、回写返工结果、再次入库，并校验返工前后数量守恒与非法状态跃迁被拒。
 * 调用方：Playwright 分片 e2e（frontend/.github workflow 的 e2e 分片按 e2e/flow/*.spec.ts 收集）。
 * 入参：无外部入参；会话与单据句柄全部在本文件内通过 ./helpers 的登录与建单夹具构造。
 * 传给谁：backend 生产域路由 /production/dye-batches*、/production/dye-batch-reworks*
 * （路径与方法的事实来源为 frontend/scripts/route-snapshot.txt）。
 * 存什么：缸差登记、返工发起与结果回写所落的状态、米数、卷数、损耗与扣款字段。
 * 存哪里：染整批次表与染整返工表（模型定义见 backend/src/models/），状态词表见 backend/src/models/status/。
 */
test.describe('449 委外染整返工与缸差登记', () => {});
