# Promo Code Configuration - Quick Start

## Step 1: Apply Migration

```bash
cd backend
npm run db:migrate
# OR manually:
mysql -u root -p masterauto < sql/migrations/082_promo_code_configuration.sql
```

Verify settings were created:
```bash
mysql -u root -p masterauto -e "SELECT * FROM configuration_settings WHERE category = 'promo';"
```

## Step 2: Access Configuration in UI

1. Login as SuperAdmin
2. Navigate to **Configuration** → **Promo Codes** tab
3. Adjust settings as needed:
   - **Enable Promo Codes** - Turn on/off globally
   - **Max Discount %** - Prevent excessive discounts (default 50%)
   - **Max Uses Per Code** - Default usage limit
   - **Discount Types** - Allow fixed, percentage, or both
   - **Email Blast Only** - Restrict codes to campaigns
   - **And more...**

## Step 3: Test Configuration

### Test Promo Code Creation
```bash
# Try creating a code exceeding max discount
curl -X POST http://localhost:5000/api/promo-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "code": "TEST100",
    "discount_type": "percent",
    "discount_value": 100,
    "campaign_id": 1
  }'
# Should fail if default max_discount_percentage (50%) is less than 100
```

### Test Promo Validation on Quotation
```bash
curl -X GET http://localhost:5000/api/promo-codes/validate/TEST10
# Returns error if promo codes disabled in config
```

## Step 4: Create Email Blast with Promo Code

1. Create email campaign
2. Create promo code linked to campaign
3. Include code in email template
4. Send blast to customers
5. Customers apply code during quotation

## Configuration Settings Reference

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| enable_promo_codes | boolean | true | Master on/off switch |
| max_discount_percentage | number | 50 | Validates % discounts |
| max_uses_per_code | number | 100 | Default max uses |
| default_expiration_days | number | 30 | Expires new codes after N days |
| allow_fixed_discount | boolean | true | Allow PHP amount discounts |
| allow_percentage_discount | boolean | true | Allow % off discounts |
| require_minimum_purchase | boolean | false | Enforce min purchase |
| minimum_purchase_amount | number | 100 | Min purchase amount for code |
| allow_stacking_promos | boolean | false | Allow multiple codes per quote |
| restrict_to_email_blast | boolean | true | Only codes from campaigns |
| auto_disable_expired | boolean | true | Auto-deactivate expired codes |
| enable_usage_tracking | boolean | true | Log usage in audit |

## API Quick Reference

### Get Configuration
```bash
curl http://localhost:5000/api/config/category/promo \
  -H "Authorization: Bearer TOKEN"
```

### Update Setting (SuperAdmin)
```bash
curl -X PUT http://localhost:5000/api/config/promo/max_discount_percentage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"value": "40"}'
```

### Create Promo Code
```bash
curl -X POST http://localhost:5000/api/promo-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "code": "SAVE15",
    "discount_type": "percent",
    "discount_value": 15,
    "campaign_id": 1,
    "max_uses": 200,
    "expires_at": "2026-12-31T23:59:59Z"
  }'
```

### Validate Code (Public)
```bash
curl http://localhost:5000/api/promo-codes/validate/SAVE15
```

## Common Use Cases

### 1. Enable Promo Codes for Email Campaigns (Default)
Configuration is already optimized for email blast promotions:
- Codes restricted to campaigns
- Disabled codes prevent use
- Auto-expiration supported
- Usage tracked

### 2. Prevent Excessive Discounts
```sql
UPDATE configuration_settings 
SET value = '25' 
WHERE category = 'promo' AND "key" = 'max_discount_percentage';
```

### 3. Allow Only Fixed Amount Discounts
```sql
UPDATE configuration_settings 
SET value = 'false' 
WHERE category = 'promo' AND "key" = 'allow_percentage_discount';
```

### 4. Require Minimum Purchase
```sql
UPDATE configuration_settings 
SET value = 'true' 
WHERE category = 'promo' AND "key" = 'require_minimum_purchase';

UPDATE configuration_settings 
SET value = '5000' 
WHERE category = 'promo' AND "key" = 'minimum_purchase_amount';
```

## Troubleshooting

**Issue:** "Promo codes are disabled"
- **Solution:** Set `enable_promo_codes` to `true` in configuration

**Issue:** "Discount percentage cannot exceed X%"
- **Solution:** Lower the `max_discount_percentage` config if needed, or increase discount value if config allows

**Issue:** "Percentage-based discounts are not allowed"
- **Solution:** Set `allow_percentage_discount` to `true`

**Issue:** "This promo code has expired"
- **Solution:** Update the promo code's `expires_at` field or disable auto-disable

**Issue:** "Promo code must be linked to email campaign"
- **Solution:** Either set `restrict_to_email_blast` to false, or link code to an email_campaign

## Files Changed

- **Migration:** `backend/sql/migrations/082_promo_code_configuration.sql`
- **Services:** `backend/src/services/configurationService.js` (added promo defaults)
- **Routes:** `backend/src/routes/promoCodes.js` (added config validation)
- **Docs:** `PROMO_CODE_CONFIGURATION.md` (detailed guide)
