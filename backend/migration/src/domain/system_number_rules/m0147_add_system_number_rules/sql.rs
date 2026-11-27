//! 编码规则迁移 SQL；迁移与真实 PostgreSQL 回归共用同源常量。

pub const UP_SCHEMA_SQL: &str = r#"CREATE TABLE IF NOT EXISTS "system_number_rules" (
    "id" SERIAL PRIMARY KEY,
    "rule_key" VARCHAR(50) NOT NULL UNIQUE,
    "name" VARCHAR(100) NOT NULL,
    "prefix" VARCHAR(50) NOT NULL CHECK (length(trim("prefix")) > 0),
    "seq_width" INTEGER NOT NULL DEFAULT 3 CHECK ("seq_width" BETWEEN 1 AND 12),
    "reset_mode" VARCHAR(10) NOT NULL DEFAULT 'day' CHECK ("reset_mode" IN ('day', 'month', 'never')),
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "system_number_rule_revisions" (
    "id" SERIAL PRIMARY KEY,
    "rule_id" INTEGER NOT NULL REFERENCES "system_number_rules"("id") ON DELETE CASCADE,
    "version" INTEGER NOT NULL CHECK ("version" >= 1),
    "config" JSONB NOT NULL,
    "change_reason" VARCHAR(500) NOT NULL CHECK (length(trim("change_reason")) > 0),
    "changed_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("rule_id", "version")
);
CREATE TABLE IF NOT EXISTS "system_number_sequences" (
    "id" BIGSERIAL PRIMARY KEY,
    "rule_key" VARCHAR(50) NOT NULL REFERENCES "system_number_rules"("rule_key") ON DELETE CASCADE,
    "entity_table" VARCHAR(100) NOT NULL,
    "column_name" VARCHAR(100) NOT NULL,
    "output_prefix" VARCHAR(100) NOT NULL,
    "period" VARCHAR(8) NOT NULL DEFAULT '',
    "last_seq" BIGINT NOT NULL DEFAULT 0 CHECK ("last_seq" >= 0),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_system_number_sequences_namespace"
        UNIQUE ("rule_key", "entity_table", "column_name", "output_prefix", "period")
);
CREATE INDEX IF NOT EXISTS "idx_system_number_rule_revisions_rule_version"
    ON "system_number_rule_revisions" ("rule_id", "version" DESC);"#;

pub const UP_TRIGGER_SQL: &str = r#"CREATE OR REPLACE FUNCTION "prevent_system_number_rule_revision_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'system_number_rule_revisions is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trg_system_number_rule_revisions_immutable"
    ON "system_number_rule_revisions";
CREATE TRIGGER "trg_system_number_rule_revisions_immutable"
BEFORE UPDATE OR DELETE ON "system_number_rule_revisions"
FOR EACH ROW EXECUTE FUNCTION "prevent_system_number_rule_revision_mutation"();"#;

pub const UP_SEED_SQL: &str = r#"INSERT INTO "system_number_rules"
    ("rule_key", "name", "prefix", "seq_width", "reset_mode", "version")
VALUES
    ('SO', '销售订单', 'SO', 3, 'day', 1),
    ('PO', '采购订单', 'PO', 3, 'day', 1),
    ('QT', '销售报价', 'QT', 3, 'day', 1),
    ('PR', '采购收货', 'PR', 3, 'day', 1),
    ('DN', '送货单', 'DN', 3, 'day', 1),
    ('LD', '染色批次', 'LD', 3, 'day', 1)
ON CONFLICT ("rule_key") DO NOTHING;
INSERT INTO "system_number_rule_revisions"
    ("rule_id", "version", "config", "change_reason", "changed_by")
SELECT
    r."id",
    1,
    jsonb_build_object(
        'prefix', r."prefix",
        'seq_width', r."seq_width",
        'reset_mode', r."reset_mode"
    ),
    '系统初始化',
    0
FROM "system_number_rules" AS r
WHERE NOT EXISTS (
    SELECT 1
    FROM "system_number_rule_revisions" AS rev
    WHERE rev."rule_id" = r."id" AND rev."version" = 1
)
ON CONFLICT ("rule_id", "version") DO NOTHING;
INSERT INTO "role_permissions"
    ("role_id", "resource_type", "resource_id", "action", "allowed", "permission_code", "created_at", "updated_at")
SELECT r."id", 'number-rules', NULL, action."name", true,
       'system.number-rules.' || action."name", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" AS r
CROSS JOIN (VALUES ('read'), ('update')) AS action("name")
WHERE r."code" = 'system_admin'
AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" AS rp
    WHERE rp."role_id" = r."id"
      AND rp."resource_type" = 'number-rules'
      AND rp."resource_id" IS NULL
      AND rp."action" = action."name"
);"#;

pub const DOWN_SQL: &str = r#"DELETE FROM "role_permissions" AS rp
USING "roles" AS r
WHERE rp."role_id" = r."id"
  AND r."code" = 'system_admin'
  AND rp."resource_type" = 'number-rules'
  AND rp."resource_id" IS NULL
  AND rp."action" IN ('read', 'update')
  AND rp."permission_code" IN ('system.number-rules.read', 'system.number-rules.update');
DROP TRIGGER IF EXISTS "trg_system_number_rule_revisions_immutable"
    ON "system_number_rule_revisions";
DROP FUNCTION IF EXISTS "prevent_system_number_rule_revision_mutation"();
DROP TABLE IF EXISTS "system_number_sequences";
DROP TABLE IF EXISTS "system_number_rule_revisions";
DROP TABLE IF EXISTS "system_number_rules";"#;
