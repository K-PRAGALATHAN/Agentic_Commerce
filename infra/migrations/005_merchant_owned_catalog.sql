-- Door 1 (internet catalogue fetch) removed: every product is merchant-created.
-- Adopt the existing unowned products for the merchant rather than discarding
-- them, so the store keeps a full, editable catalogue.
UPDATE products SET merchant_id = (
  SELECT ur.user_id
    FROM user_roles ur JOIN roles r ON r.id = ur.role_id
   WHERE r.name = 'merchant'
   ORDER BY ur.user_id
   LIMIT 1)
 WHERE merchant_id IS NULL
   -- Safe no-op on a fresh database that has no merchant yet.
   AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE r.name = 'merchant');

-- source_id only ever held identifiers from the fetched feed.
DROP INDEX IF EXISTS idx_products_source;
ALTER TABLE products DROP COLUMN IF EXISTS source_id;
