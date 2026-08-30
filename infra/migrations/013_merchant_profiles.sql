-- Storefront identity for merchants.
--
-- Until now a product's seller was a bare users.id — an email address at best.
-- A customer buying on a marketplace has a right to know WHO they are buying
-- from, and the assistant should be able to say it out loud. That needs a real
-- store identity: a name, a slug for the URL, a line about the shop.
--
-- One row per merchant, not per product: the store is the brand, and a product's
-- `vendor` column stays what it always was — the manufacturer, which is a
-- different thing from the seller.

CREATE TABLE IF NOT EXISTS merchant_profiles (
  merchant_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug         text UNIQUE NOT NULL,
  store_name   text NOT NULL,
  tagline      text NOT NULL DEFAULT '',
  about        text NOT NULL DEFAULT '',
  logo         text NOT NULL DEFAULT '',   -- emoji or image url; emoji keeps the seed offline
  accent       text NOT NULL DEFAULT '#e8552d',
  location     text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Every merchant gets a profile, including ones that signed up before this
-- table existed. Without the backfill their products would show no seller at
-- all, which is worse than showing a plain name derived from the email.
INSERT INTO merchant_profiles (merchant_id, slug, store_name)
SELECT u.id,
       -- split_part on '@' then strip anything that is not url-safe; the id tail
       -- guarantees uniqueness when two merchants share a local part.
       regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9]+', '-', 'g')
         || '-' || left(replace(u.id::text, '-', ''), 6),
       initcap(replace(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'), '  ', ' '))
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id AND r.name IN ('merchant', 'admin')
 ON CONFLICT (merchant_id) DO NOTHING;

-- Cross-store reads (the storefront directory, "sold by" on every card) always
-- start from the product, so this is the index that matters.
CREATE INDEX IF NOT EXISTS products_merchant_status_idx ON products(merchant_id, status);
