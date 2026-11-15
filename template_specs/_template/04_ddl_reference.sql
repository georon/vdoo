-- eb_<module> — DDL REFERENCE (PostgreSQL)
--
-- !! DERIVED, NOT AUTHORITATIVE !!
-- Odoo's ORM creates/alters these tables from models/*.py on module install/upgrade.
-- Keep this file only for: DB reviews, reporting/BI queries, or mapping legacy MySQL data.
--
-- Naming: model 'eb_<module>.<entity>' -> table 'eb_<module>_<entity>'
-- Odoo auto-adds to every table: id, create_uid, create_date, write_uid, write_date
-- Many2many tables are named eb_<module>_<entity>_<other>_rel unless `relation=` is set.

CREATE TABLE eb_module_entity (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    description   TEXT,
    member_id     INTEGER NOT NULL REFERENCES res_users(id) ON DELETE RESTRICT,
    state         VARCHAR NOT NULL,            -- Selection stored as varchar
    total         NUMERIC,                     -- stored compute
    active        BOOLEAN,
    create_uid    INTEGER REFERENCES res_users(id) ON DELETE SET NULL,
    create_date   TIMESTAMP WITHOUT TIME ZONE,
    write_uid     INTEGER REFERENCES res_users(id) ON DELETE SET NULL,
    write_date    TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT eb_module_entity_name_uniq UNIQUE (name, member_id)
);
CREATE INDEX eb_module_entity__member_id_index ON eb_module_entity (member_id);

-- Many2many relation table
CREATE TABLE eb_module_entity_eb_module_tag_rel (
    eb_module_entity_id INTEGER NOT NULL REFERENCES eb_module_entity(id) ON DELETE CASCADE,
    eb_module_tag_id    INTEGER NOT NULL REFERENCES eb_module_tag(id) ON DELETE CASCADE,
    PRIMARY KEY (eb_module_entity_id, eb_module_tag_id)
);
