# Configuration Management Module - Setup & Testing Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Apply Database Migration
```bash
cd backend
mysql -u root -p masterauto < sql/migrations/030_configuration_management.sql
```

**Expected Output:**
```
mysql> Query OK, X rows affected (0.10 sec)
```

### Step 2: Verify Tables Created
```bash
mysql -u root -p masterauto
mysql> SHOW TABLES LIKE 'configuration%';

# Should show:
# +--------------------------+
# | Tables_in_masterauto     |
# +--------------------------+
# | configuration_audit_logs |
# | configuration_settings   |
# +--------------------------+
```

### Step 3: Start Backend
```bash
cd backend
npm start

# Should show:
# Server running on port 5000
# Database connected
```

### Step 4: Start Frontend
```bash
cd frontend
npm run dev

# Should show:
# VITE v5.x.x build ready in XXXms
```

### Step 5: Login and Test
1. Open http://localhost:5173
2. Login with Admin credentials
3. Look for "Configuration" in sidebar (gear icon)
4. Click to open Settings

**Success**: You should see 8 tabs with settings organized by category

---

## ✅ Verification Tests

### Test 1: Database Verification
```bash
# Check tables exist
mysql -u root -p masterauto -e "SELECT COUNT(*) FROM configuration_settings;"

# Expected: 60+ rows

mysql -u root -p masterauto -e "SELECT category FROM configuration_settings GROUP BY category;"

# Expected:
# +---------+
# | general |
# | business|
# | vehicle |
# | booking |
# | payment |
# | sales   |
# | roles   |
# | system  |
# +---------+
```

### Test 2: API Verification
```bash
# 1. Get auth token first
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@masterauto.com",
    "password": "your_password"
  }' | jq .token

# Save token as: TOKEN=<token_from_above>

# 2. Test GET all config
curl -X GET http://localhost:5000/api/config \
  -H "Authorization: Bearer $TOKEN"

# 3. Test GET specific category
curl -X GET http://localhost:5000/api/config/general \
  -H "Authorization: Bearer $TOKEN"

# 4. Test feature flag check
curl -X GET http://localhost:5000/api/config/features/booking.enable_guest_booking \
  -H "Authorization: Bearer $TOKEN"
```

### Test 3: UI Verification

#### General Settings Tab
1. Click "General" tab
2. Should see:
   - system_name text input
   - default_currency text input
   - time_zone text input
   - date_format text input
3. Edit system_name to "My Test Shop"
4. Click "Save Changes"
5. Should see green success message

#### Booking Tab
1. Click "Booking" tab
2. Should see "enable_guest_booking" toggle
3. Click toggle to turn ON
4. Click "Save Changes"
5. Verify in audit logs tab

#### Audit Logs Tab
1. Click "Audit Logs" tab
2. Should see table with recent changes
3. Columns: Date, Category, Setting, Old Value, New Value, Changed By
4. Should show your recent system_name change

### Test 4: Reset to Defaults
1. Go to "General" tab
2. Change system_name to something
3. Click "Reset to Defaults"
4. Confirm dialog
5. Verify system_name reverted to "Master Auto"

### Test 5: Access Control
1. Logout as Admin
2. Login as non-Admin user (Mechanic, Cashier, etc.)
3. Verify "Configuration" menu item NOT visible
4. Try direct URL: http://localhost:5173/settings
5. Should show "Admin Access Required" message

---

## 📝 Manual Configuration

After successful setup, configure your business:

### Recommended Configuration Order

#### 1. General Settings (⚙️)
```
system_name = "Your Business Name"
default_currency = "PHP"
time_zone = "Asia/Manila"
date_format = "MM/DD/YYYY"
system_email = "your@email.com"
```

#### 2. Business Information (🏢)
```
business_name = "Your Full Business Name"
business_address = "123 Main Street, Manila"
business_contact = "+63 2 1234 5678"
business_email = "contact@yourbusiness.com"
tax_vat_rate = "12"  (adjust for your location)
```

#### 3. Vehicle Configuration (🚗)
```
enable_vehicle_makes = true (if not already)
plate_validation_enabled = true (Philippine format by default)
```

#### 4. Booking Rules (📅)
```
enable_guest_booking = true/false (your preference)
allow_cancel_after_partial_payment = true (most common)
auto_cancel_unpaid_hours = "48" (or your preference)
minimum_booking_notice = "24" (hours)
```

#### 5. Payment Configuration (💳)
```
enable_partial_payments = true
minimum_down_payment_percentage = "30" (or your rate)
accepted_payment_methods = ["Cash","Bank Transfer","GCash"]
enable_refunds = true
refund_eligibility_days = "30"
```

#### 6. Review Audit Logs
- Confirm all changes logged correctly
- Verify your user ID appears for each change
- Check timestamps

---

## 🔎 Troubleshooting

### Issue: "Configuration" menu not appearing
**Cause**: User not Admin role  
**Solution**:
1. Logout
2. Login with actual Admin user
3. Check user table: `SELECT role FROM users WHERE email='your@email.com';`
4. Should show: `Admin`

### Issue: API returns 404 on /api/config
**Cause**: Routes not registered  
**Solution**:
1. Check `/backend/src/routes/index.js` has:
   ```javascript
   const configRoutes = require('./configRoutes');
   router.use('/config', configRoutes);
   ```
2. Restart backend server
3. Try API call again

### Issue: API returns 403 Forbidden
**Cause**: Not authenticated or not admin  
**Solution**:
1. Get valid token: `curl ... /api/auth/login`
2. Include in header: `Authorization: Bearer TOKEN`
3. Verify token not expired (check localStorage in browser)
4. Verify user is Admin role

### Issue: Changes not saving
**Cause**: Database error or validation failure  
**Solution**:
1. Check browser DevTools > Network tab
2. Look at response from PUT /api/config/...
3. Check error message
4. Common errors:
   - "Invalid JSON": Check JSON format if JSON field
   - "Not valid number": Check field expects number type
   - "Database connection": Check MySQL is running

### Issue: Audit logs empty
**Cause**: Table exists but no changes recorded  
**Solution**:
```bash
# Check table
mysql -u root -p masterauto -e "SELECT COUNT(*) FROM configuration_audit_logs;"

# Should show > 0 after making changes
# If 0, check server logs for errors:
tail -f backend/logs/error.log
```

---

## 📊 Database Verification Queries

### View All Settings
```sql
SELECT category, `key`, value, data_type, is_editable 
FROM configuration_settings 
ORDER BY category, `key`;
```

### View Recently Changed Settings
```sql
SELECT 
  CAL.category, CAL.`key`, 
  CAL.old_value, CAL.new_value,
  CAL.changed_by, DATE_FORMAT(CAL.created_at, '%Y-%m-%d %H:%i:%s') as changed_at
FROM configuration_audit_logs CAL
ORDER BY CAL.created_at DESC
LIMIT 20;
```

### Find Changes by User
```sql
SELECT *
FROM configuration_audit_logs
WHERE changed_by = 1
ORDER BY created_at DESC;
```

### Find Changes by Category
```sql
SELECT *
FROM configuration_audit_logs
WHERE category = 'payment'
ORDER BY created_at DESC;
```

### Check Data Types
```sql
SELECT category, `key`, data_type, COUNT(*) 
FROM configuration_settings 
GROUP BY category, data_type;
```

---

## 🧪 Advanced Testing

### Test Data Type Validation

#### Boolean Field
```bash
# This should work
curl -X PUT http://localhost:5000/api/config/booking/enable_guest_booking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": true}'

# This should fail with 400
curl -X PUT http://localhost:5000/api/config/booking/enable_guest_booking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": "maybe"}'
```

#### Number Field
```bash
# This should work
curl -X PUT http://localhost:5000/api/config/payment/minimum_down_payment_percentage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": 35}'

# This should fail with 400
curl -X PUT http://localhost:5000/api/config/payment/minimum_down_payment_percentage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": "high"}'
```

#### JSON Field
```bash
# This should work
curl -X PUT http://localhost:5000/api/config/business/operating_hours \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": "{\"mon_fri\":\"9am-5pm\",\"sat\":\"9am-1pm\"}"}'

# This should fail with 400
curl -X PUT http://localhost:5000/api/config/business/operating_hours \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": "{bad json"}'
```

### Load Testing
```bash
# Make 100 sequential API calls
for i in {1..100}; do
  curl -s -X GET http://localhost:5000/api/config \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "Request $i completed"
done

# Check response time
time curl -X GET http://localhost:5000/api/config \
  -H "Authorization: Bearer $TOKEN"

# Should be <100ms
```

---

## 📌 Checklist Before Going Live

- [ ] Database migration applied and verified
- [ ] All 8 tabs visible in Settings
- [ ] Can edit all setting types (text, toggle, etc.)
- [ ] Save/Reset buttons work
- [ ] Audit logs show all changes
- [ ] Non-admin users cannot access Settings
- [ ] API endpoints respond correctly
- [ ] Business information configured
- [ ] Staff trained on Settings usage
- [ ] Backup strategy in place
- [ ] Monitoring alerts set up

---

## 📞 Support

For issues or questions:

1. **Check Documentation**
   - CONFIGURATION_MANAGEMENT_IMPLEMENTATION.md
   - CONFIGURATION_QUICK_START.md
   - CONFIGURATION_MANAGEMENT_MODULE_OVERVIEW.md

2. **Check Logs**
   ```bash
   tail -f backend/logs/error.log
   tail -f backend/logs/app.log
   ```

3. **Check Database**
   ```bash
   mysql -u root -p masterauto
   SELECT * FROM configuration_settings LIMIT 5;
   SELECT * FROM configuration_audit_logs LIMIT 5;
   ```

4. **Check API**
   - Use curl or Postman
   - Verify token in Authorization header
   - Check response status codes

---

## ✨ You're All Set!

Your Configuration Management system is ready to use. Visit the Settings page to start configuring your business rules and operational behavior.

**Next Steps:**
1. Configure business information
2. Set up payment rules
3. Configure booking rules
4. Train your team on usage
5. Monitor audit logs for compliance
