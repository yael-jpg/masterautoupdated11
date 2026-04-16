# Promo Code Configuration Guide

## Overview

The promo code configuration system allows administrators to control how promo codes work across the entire system, particularly for email blast campaigns. Configuration settings are centralized and can be managed through the Configuration Management interface.

## Database

### Configuration Settings Table
All promo code settings are stored in the `configuration_settings` table with `category = 'promo'`.

**Migration:** `082_promo_code_configuration.sql`

## Available Configuration Settings

### 1. **enable_promo_codes** (boolean)
- **Default:** `true`
- **Description:** Enable/disable promo code functionality system-wide
- **Usage:** When disabled, all promo code validation endpoints return errors
- **Impact:** Disables discount applications in quotations, prevents new code creation

### 2. **max_discount_percentage** (number)
- **Default:** `50`
- **Description:** Maximum discount percentage allowed for any single promo code
- **Range:** 0-100
- **Usage:** Validates percentage-type discounts during code creation and updates
- **Example:** If set to 50, no promo code can offer more than 50% discount

### 3. **max_uses_per_code** (number)
- **Default:** `100`
- **Description:** Default maximum uses for new promo codes (0 = unlimited)
- **Usage:** Used as default when creating new codes without specifying max_uses
- **Note:** Can be overridden per promo code

### 4. **default_expiration_days** (number)
- **Default:** `30`
- **Description:** Default expiration period in days for new promo codes
- **Usage:** Can be used during promo code creation to auto-calculate expires_at
- **Example:** If set to 30, new codes expire 30 days from creation

### 5. **allow_fixed_discount** (boolean)
- **Default:** `true`
- **Description:** Allow flat/fixed amount discounts in promo codes
- **Example:** Discount of PHP 500 off
- **Impact:** When disabled, only percentage discounts are allowed

### 6. **allow_percentage_discount** (boolean)
- **Default:** `true`
- **Description:** Allow percentage-based discounts in promo codes
- **Example:** Discount of 10% off
- **Impact:** When disabled, only fixed amount discounts are allowed

### 7. **require_minimum_purchase** (boolean)
- **Default:** `false`
- **Description:** Require minimum purchase amount to apply promo code
- **Usage:** When true, quotation total must exceed `minimum_purchase_amount`

### 8. **minimum_purchase_amount** (number)
- **Default:** `100`
- **Description:** Minimum purchase amount required for promo code application (in default currency)
- **Usage:** Only applies if `require_minimum_purchase` is true
- **Example:** If set to 500, promo only applies to purchases >=500

### 9. **allow_stacking_promos** (boolean)
- **Default:** `false`
- **Description:** Allow multiple promo codes to be stacked on single quotation
- **Example:** Apply Code A (10% off) + Code B (PHP 200 off)
- **Note:** When false, only one promo code per quotation

### 10. **restrict_to_email_blast** (boolean)
- **Default:** `true`
- **Description:** Restrict promo codes only to those included in email campaigns
- **Usage:** When true, only codes linked to `email_campaigns` can be used
- **Impact:** Codes without campaign_id are not usable

### 11. **auto_disable_expired** (boolean)
- **Default:** `true`
- **Description:** Automatically disable expired promo codes
- **Usage:** When true, expired codes have `is_active` set to false
- **Note:** Manual validation also checks expiration

### 12. **enable_usage_tracking** (boolean)
- **Default:** `true`
- **Description:** Track promo code usage in audit logs
- **Usage:** When true, each promo application is logged for compliance/reporting

## API Endpoints

### Configuration Endpoints

**Get Promo Configuration**
```bash
curl -X GET http://localhost:5000/api/config/category/promo \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Update Promo Setting (SuperAdmin only)**
```bash
curl -X PUT http://localhost:5000/api/config/promo/max_discount_percentage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"value": "75"}'
```

### Promo Code Endpoints

**Create Promo Code**
```bash
curl -X POST http://localhost:5000/api/promo-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "SAVE10",
    "description": "10% off all services",
    "discount_type": "percent",
    "discount_value": 10,
    "campaign_id": 1,
    "expires_at": "2026-06-30T23:59:59Z",
    "max_uses": 100
  }'
```

**Validate Promo Code (Public)**
```bash
curl -X GET http://localhost:5000/api/promo-codes/validate/SAVE10
```

Response (if valid):
```json
{
  "valid": true,
  "id": 1,
  "code": "SAVE10",
  "description": "10% off all services",
  "discount_type": "percent",
  "discount_value": 10
}
```

## Implementation Examples

### Backend Service Usage

```javascript
const ConfigurationService = require('../services/configurationService');

// Check if promo codes are enabled
const enabled = await ConfigurationService.get('promo', 'enable_promo_codes');
if (enabled !== 'true') {
  throw new Error('Promo codes disabled');
}

// Get max discount percentage
const maxDiscount = await ConfigurationService.get('promo', 'max_discount_percentage');
if (promoValue > maxDiscount) {
  throw new Error(`Discount cannot exceed ${maxDiscount}%`);
}

// Check if stacking is allowed
const stackingAllowed = await ConfigurationService.isFeatureEnabled('promo.allow_stacking_promos');
```

### Frontend Implementation

```javascript
// Fetch promo configuration for display
const response = await fetch('/api/config/category/promo');
const promoConfig = await response.json();

// Show/hide discount input based on config
const allowFixed = promoConfig.find(s => s.key === 'allow_fixed_discount')?.value === 'true';
const allowPercentage = promoConfig.find(s => s.key === 'allow_percentage_discount')?.value === 'true';

if (allowFixed) {
  showFixedDiscountField();
}
if (allowPercentage) {
  showPercentageDiscountField();
}
```

### Email Campaign Integration

When creating email blasts with promotional offers:

1. Set default expiration in config if needed
2. Create promo code linked to email_campaign
3. Include code in email template
4. System automatically validates codes on customer quotations

## Common Scenarios

### Scenario 1: Limited Time Offer (20% Max)
```sql
-- Update via API
PUT /api/config/promo/max_discount_percentage
value: 20

-- Create limited campaign code
POST /api/promo-codes
{
  "code": "SUMMER20",
  "discount_type": "percent",
  "discount_value": 20,
  "expires_at": "2026-07-31T23:59:59Z"
}
```

### Scenario 2: Loyalty Reward (Fixed Amount)
```javascript
// Configure to allow fixed amounts
const config = {
  allow_fixed_discount: true,
  allow_percentage_discount: false,
  require_minimum_purchase: true,
  minimum_purchase_amount: 1000
};

// Create code
const code = {
  code: "LOYALTY500",
  discount_type: "fixed",
  discount_value: 500,
  max_uses: 50
};
```

### Scenario 3: Black Friday (Multiple Codes, No Stacking)
```javascript
// Configure for multiple independent codes
const config = {
  allow_stacking_promos: false,
  restrict_to_email_blast: true,
  auto_disable_expired: true
};

// Create separate codes for different customer segments
const codes = [
  { code: "BF_NEWCUST_15", discount_value: 15, discount_type: "percent" },
  { code: "BF_LOYAL_25", discount_value: 25, discount_type: "percent" },
  { code: "BF_VIP_2000", discount_value: 2000, discount_type: "fixed" }
];
```

## Audit & Monitoring

All configuration changes are logged:

```bash
# View promo configuration change logs
curl -X GET 'http://localhost:5000/api/config/logs/audit?category=promo' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Reset to Defaults

```bash
curl -X POST http://localhost:5000/api/config/reset/promo \
  -H "Authorization: Bearer YOUR_TOKEN"
```

This resets all promo settings to defaults defined in `configurationService.js`.

## FAQ

**Q: How do promo codes interact with email campaigns?**
A: If `restrict_to_email_blast` is true, promo codes must be linked to an email_campaign to be valid. This ensures all promotional offers are tracked and associated with specific campaigns.

**Q: Can I have unlimited uses for a promo code?**
A: Yes, set `max_uses` to null/0 or leave unspecified. The code will remain valid as long as it's active and hasn't expired.

**Q: What happens to expired codes if `auto_disable_expired` is true?**
A: On validation, expired codes return an error message. The `is_active` flag may be set to false by maintenance jobs (configure as needed).

**Q: Are promo codes case-sensitive?**
A: No, codes are stored and matched in uppercase for consistency.

**Q: How do I prevent abuse of promo codes?**
A: Use combination of:
- Set reasonable `max_uses_per_code`
- Set `require_minimum_purchase` to prevent tiny discounts
- Enable `enable_usage_tracking` for audit trail
- Monitor via logs
