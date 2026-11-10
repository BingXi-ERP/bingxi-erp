//! audit_logs 与 omni_audit_logs 只追加约束的库侧行为锁。
//!
//! 锁住的契约面：
//! 1. 就位性：四枚行级触发器与共用触发器函数确实挂在系统目录里，两张表各两枚。
//!    只判"没报错"会让"迁移被跳过、门根本没建上"当成通过，故按实数核。
//! 2. 拒改性：对 audit_logs 的 UPDATE 一律被库侧拒绝，拒因带表名与"禁止 UPDATE"。
//! 3. 拒删与放行同源性：未声明保留期清理通道的 DELETE 被拒；在同一事务内声明
//!    `app.audit_purge = 'on'` 后放行，声明收回后立即回到拒绝——证明放行只认事务内的
//!    显式声明，而不是认连接（否则清理任务用过的那条池化连接会永久带洞）。
//! 4. 写腿与门同源：清理服务的源码必须真的用 SET LOCAL 在同一事务内声明通道，
//!    且不在事务之外发 DELETE；否则第 3 条验的是门，门与写腿的接缝处仍会漂移。
//!
//! 调用方：cargo test（CI backend job，经 test_common 夹具连到已迁移的 PostgreSQL）。
//! 入参：仅 setup_test_db 给的连接与探针行。传给谁：断言即终态。
//! 存什么/存哪里：全部写腿在显式开启且永不提交的事务内，随事务回滚消失，不落任何持久行。

mod test_common;

use sea_orm::{ConnectionTrait, DbBackend, Statement, TransactionTrait};
use test_common::setup_test_db;

/// 受管表上的四枚触发器实名（与迁移侧 trigger_name 派生一致）
const GUARD_TRIGGERS: &str = "'trg_audit_logs_no_update', 'trg_audit_logs_no_delete', \
                             'trg_omni_audit_logs_no_update', 'trg_omni_audit_logs_no_delete'";

/// 探针行的 action 取值：audit_logs 仅 action 列 NOT NULL，且该列无词表 CHECK
const PROBE_ACTION: &str = "GUARD";

async fn count_in_catalog<C: ConnectionTrait>(conn: &C, sql: &str, label: &str) -> i64 {
    let row = conn
        .query_one_raw(Statement::from_string(DbBackend::Postgres, sql.to_string()))
        .await
        .unwrap_or_else(|e| panic!("系统目录计数失败（{label}）：{e}"))
        .unwrap_or_else(|| panic!("系统目录计数未返回行（{label}）"));
    row.try_get::<i64>("", "cnt")
        .unwrap_or_else(|e| panic!("系统目录计数解码失败（{label}）：{e}"))
}

/// 事务内插入探针行：两张审计表里只有 audit_logs 的列形状可被本夹具静态确定，
/// omni_audit_logs 的 NOT NULL 列集不在本锁范围（它的门由第 1 条就位性断言覆盖）。
async fn insert_probe<C: ConnectionTrait>(conn: &C, marker: &str) {
    let sql = format!(
        "INSERT INTO audit_logs (action, table_name) VALUES ('{PROBE_ACTION}', '{marker}')"
    );
    match conn.execute_unprepared(&sql).await {
        Ok(_) => {}
        Err(e) => panic!("探针行插入失败（marker={marker}）：{e}"),
    }
}

/// 把执行结果压成"要么按预期被拒并返回拒因，要么判红"。
fn require_rejected(res: Result<u64, sea_orm::DbErr>, needle: &str, label: &str) -> String {
    match res {
        Ok(_) => panic!("{label} 未被只追加门拒绝（期望库侧报 {needle}）"),
        Err(e) => {
            let msg = e.to_string();
            assert!(
                msg.contains(needle),
                "{label} 的拒因不含预期片段 {needle}，实际：{msg}"
            );
            msg
        }
    }
}

#[tokio::test]
async fn audit_append_only_guard_objects_attached() {
    let db = setup_test_db().await;

    let total = count_in_catalog(
        &db,
        &format!(
            "SELECT COUNT(*) AS cnt FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid \
             WHERE NOT t.tgisinternal AND c.relname IN ('audit_logs', 'omni_audit_logs') \
             AND t.tgname IN ({GUARD_TRIGGERS})"
        ),
        "四枚只追加触发器总数",
    )
    .await;
    assert_eq!(
        total, 4,
        "只追加触发器应恰为 4 枚（两张表各 UPDATE 与 DELETE 一枚），实际 {total} 枚——\
         少于 4 说明迁移未执行或部分执行，判红而非静默通过"
    );

    for table in ["audit_logs", "omni_audit_logs"] {
        let per_table = count_in_catalog(
            &db,
            &format!(
                "SELECT COUNT(*) AS cnt FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid \
                 WHERE NOT t.tgisinternal AND c.relname = '{table}' \
                 AND t.tgname IN ({GUARD_TRIGGERS})"
            ),
            table,
        )
        .await;
        assert_eq!(
            per_table, 2,
            "表 {table} 上应恰有 UPDATE 与 DELETE 两枚只追加触发器，实际 {per_table} 枚"
        );
    }

    let funcs = count_in_catalog(
        &db,
        "SELECT COUNT(*) AS cnt FROM pg_proc WHERE proname = 'fn_audit_logs_append_only'",
        "触发器函数",
    )
    .await;
    assert_eq!(
        funcs, 1,
        "共用触发器函数 fn_audit_logs_append_only 应恰为 1 枚，实际 {funcs} 枚"
    );
}

#[tokio::test]
async fn audit_append_only_guard_blocks_update_and_unflagged_delete() {
    let db = setup_test_db().await;
    // 全程待在一条不提交的事务里：既让行级触发器必然命中本用例自建的行
    // （并发用例的 TRUNCATE 会被本事务的行锁挡在门外，不会把探针行清成 0 行而假通过），
    // 又让探针行随事务结束消失，不给共享库留残留。
    let txn = db.begin().await.expect("测试夹具：开启只验证事务失败");
    insert_probe(&txn, "guard_upd").await;
    insert_probe(&txn, "guard_del").await;

    // 每条预期被拒的语句各裹一个保存点：PostgreSQL 里语句一旦报错整条事务即进入 aborted 态，
    // 后续语句只回 current transaction is aborted 而拿不到触发器拒因。ROLLBACK TO SAVEPOINT
    // 是 aborted 态下仍被允许的清态命令；探针行在保存点之前插入故不受影响，外层事务始终不提交。
    txn.execute_unprepared("SAVEPOINT sp_upd")
        .await
        .expect("开启 UPDATE 探针保存点失败");
    let upd = txn
        .execute_unprepared(
            "UPDATE audit_logs SET action = 'GUARD2' WHERE table_name = 'guard_upd'",
        )
        .await;
    let msg = require_rejected(upd.map(|_| 0), "禁止 UPDATE", "对 audit_logs 的 UPDATE");
    assert!(
        msg.contains("audit_logs"),
        "UPDATE 拒因应点名被拦的表，便于运维定位，实际：{msg}"
    );
    txn.execute_unprepared("ROLLBACK TO SAVEPOINT sp_upd")
        .await
        .expect("回滚到 UPDATE 探针保存点清除 aborted 态失败");

    txn.execute_unprepared("SAVEPOINT sp_del")
        .await
        .expect("开启 DELETE 探针保存点失败");
    let del = txn
        .execute_unprepared("DELETE FROM audit_logs WHERE table_name = 'guard_del'")
        .await;
    require_rejected(
        del.map(|_| 0),
        "禁止未声明保留期清理通道的 DELETE",
        "未声明通道的 DELETE",
    );
    txn.execute_unprepared("ROLLBACK TO SAVEPOINT sp_del")
        .await
        .expect("回滚到 DELETE 探针保存点清除 aborted 态失败");

    // 反向对照：被拦之后两条探针行都必须仍在——若为 0 行，上面那两条语句就是空转
    // （表里本无匹配行，行级触发器根本不会触发），"被拒"就成了假绿。
    let still = count_in_catalog(
        &txn,
        "SELECT COUNT(*) AS cnt FROM audit_logs WHERE table_name IN ('guard_upd', 'guard_del')",
        "被拦后探针行仍在",
    )
    .await;
    assert_eq!(
        still, 2,
        "两条被拦语句之后两条探针行都应仍在库里，实际 {still} 行——若为 0 说明上面是空转而非被拦"
    );
}

/// 只追加门的放行侧与写腿同源锁。
#[tokio::test]
async fn audit_purge_channel_allows_delete_only_while_declared() {
    let db = setup_test_db().await;
    let txn = db
        .begin()
        .await
        .expect("测试夹具：开启清理通道验证事务失败");
    insert_probe(&txn, "guard_purge_on").await;
    insert_probe(&txn, "guard_purge_off").await;

    match txn
        .execute_unprepared("SET LOCAL app.audit_purge = 'on'")
        .await
    {
        Ok(_) => {}
        Err(e) => panic!("在同一事务内声明保留期清理通道失败：{e}"),
    }
    let deleted = match txn
        .execute_unprepared("DELETE FROM audit_logs WHERE table_name = 'guard_purge_on'")
        .await
    {
        Ok(res) => res,
        Err(e) => panic!(
            "已声明 app.audit_purge 的 DELETE 仍被拒——清理通道与触发器判据不同源，\
             保留期清理会在生产被打死：{e}"
        ),
    };
    assert_eq!(
        deleted.rows_affected(),
        1,
        "声明通道后应恰删掉 1 行探针，实际 {} 行",
        deleted.rows_affected()
    );

    // 收回声明：同事务内把开关置空，删除必须立刻回到被拒状态。
    match txn
        .execute_unprepared("SET LOCAL app.audit_purge = ''")
        .await
    {
        Ok(_) => {}
        Err(e) => panic!("收回清理通道声明失败：{e}"),
    }
    let after_reset = txn
        .execute_unprepared("DELETE FROM audit_logs WHERE table_name = 'guard_purge_off'")
        .await;
    require_rejected(
        after_reset.map(|_| 0),
        "禁止未声明保留期清理通道的 DELETE",
        "收回声明后的 DELETE",
    );
}

/// 写腿侧同源锁：清理服务必须在事务内用 SET LOCAL 声明通道，事务外不得发 DELETE。
#[test]
fn audit_cleanup_service_declares_purge_channel_in_transaction() {
    let src = std::fs::read_to_string(format!(
        "{}/src/services/audit_cleanup_service.rs",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("读取 audit_cleanup_service.rs 失败（文件被移动或删除必须显式判红）");
    let src = src.replace("\r\n", "\n");

    assert!(
        src.contains("SET LOCAL app.audit_purge = 'on'"),
        "清理服务未以 SET LOCAL 声明保留期通道：GUC 名或写法与触发器判据漂移，清理会被库侧拒死"
    );
    assert!(
        src.contains("(*self.db).begin()"),
        "清理服务未把删除放进事务：SET LOCAL 在事务外无效，通道声明无法覆盖 DELETE"
    );
    assert!(
        !src.contains("self.db.as_ref().execute_raw"),
        "清理服务仍存在事务外的 execute_raw 删除腿：该 DELETE 会被只追加门拒绝"
    );
}
