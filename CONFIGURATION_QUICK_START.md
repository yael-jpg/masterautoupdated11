# Configuration Management - Quick Start Guide

## For Developers

### 1. Database Setup

```bash
# Apply migration
mysql -u root -p masterauto < backend/sql/migrations/030_configuration_management.sql

# Verify tables created
mysql -u root -p masterauto -e "SHOW TABLES LIKE 'configuration%';"
```

### 2. Test Backend API

```bash
# Get all config
curl -X GET http://localhost:5000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get general settings
curl -X GET http://localhost:5000/api/config/general \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update a setting
curl -X PUT http://localhost:5000/api/config/general/system_name \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"value": "My Auto Shop"}'

# View audit logs
curl -X GET http://localhost:5000/api/config/logs/audit \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check if feature enabled
curl -X GET http://localhost:5000/api/config/features/booking.enable_guest_booking \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Login and Access Settings

1. Start backend: `npm start` in `/backend`
2. Start frontend: `npm run dev` in `/frontend`
3. Login as Admin user
4. Click "Configuration" in sidebar
5. Edit settings and click "Save Changes"

### 4. Using Configuration in Your Code

**Backend Service:**
```javascript
const ConfigurationService = require('../services/configurationService');

// In your route or service
const guestBookingAllowed = await ConfigurationService.isFeatureEnabled('booking.enable_guest_booking');
if (guestBookingAllowed) {
  // Allow guest booking logic
}
```

**Frontend Component:**
```javascript
// Fetch on load
useEffect(() => {
  const loadConfig = async () => {
    const response = await fetch('/api/config/display/frontend');
    const config = await response.json();
    setConfig(config.data);
  };
  loadConfig();
}, []);

// Use in JSX
{config.features.guestBooking && <GuestBookingForm />}
```

## For Admins

### Recommended Configuration Order

1. **General Settings** - Set system name, currency, timezone
2. **Business Information** - Company details, tax rate
3. **Vehicle Configuration** - Enable required vehicle features
4. **Booking Rules** - Set appointment creation rules
5. **Payment Configuration** - Set payment requirements
6. **Sales Configuration** - Set reporting preferences
7. **User Roles** - Define team member access
8. **Review Audit Logs** - Verify all changes

### Common Configuration Scenarios

#### Scenario 1: Enable Guest Booking
1. Go to Settings
2. Click "Bookings" tab
3. Toggle "enable_guest_booking" to ON
4. Click "Save Changes"
5. Change takes effect immediately

#### Scenario 2: Change Payment Rules
1. Go to Settings
2. Click "Payments" tab
3. Update "minimum_down_payment_percentage"
4. Toggle payment methods as needed
5. Click "Save Changes"

#### Scenario 3: Audit Trail - Who Changed What
1. Go to Settings
2. Click "Audit Logs" tab
3. See all configuration changes with timestamps
4. Filter by category if needed
5. View old values and new values

## File Structure

```
MasterAuto/
├── backend/
│   ├── sql/migrations/
│   │   └── 030_configuration_management.sql
│   └── src/
│       ├── services/
│       │   └── configurationService.js
│       └── routes/
│           └── configRoutes.js
├── frontend/
│   └── src/
│       └── pages/
│           ├── SettingsPage.jsx
│           └── SettingsPage.css
└── CONFIGURATION_MANAGEMENT_IMPLEMENTATION.md
```

## Key Classes and Methods

### ConfigurationService

```javascript
// Get single value
await ConfigurationService.get(category, key);

// Get all settings by category
await ConfigurationService.getByCategory(category);

// Get all settings (grouped)
await ConfigurationService.getAllSettings();

// Update a setting
await ConfigurationService.update(category, key, value, userId, changeReason);

// Validate input
await ConfigurationService.validateInput(category, key, value);

// Check if feature enabled
await ConfigurationService.isFeatureEnabled('category.key');

// Get audit logs
await ConfigurationService.getAuditLogs(category, limit, offset);

// Reset to defaults
await ConfigurationService.resetToDefaults(category, userId);

// Get config for frontend
await ConfigurationService.getConfigForFrontend();
```

## Debugging Tips

### Check Database
```sql
-- View all settings
SELECT * FROM configuration_settings;

-- Check specific category
SELECT * FROM configuration_settings WHERE category = 'booking';

-- View recent changes
SELECT * FROM configuration_audit_logs ORDER BY created_at DESC LIMIT 10;

-- Find who changed what
SELECT category, `key`, old_value, new_value, changed_by, created_at 
FROM configuration_audit_logs 
WHERE category = 'payment' 
ORDER BY created_at DESC;
```

### Check Logs
```bash
# Backend logs
tail -f backend/logs/app.log

# Check for configuration errors
grep -i configuration backend/logs/app.log | tail -20
```

### Browser Developer Tools
- Network: Check `/api/config` responses
- Console: Look for React warnings
- Application: Check localStorage for token

## Common Issues

| Issue | Solution |
|-------|----------|
| 404 on /api/config | Check configRoutes.js is registered in app.js |
| 403 Forbidden | Verify user role is 'Admin' |
| Changes not saving | Check database connection and permissions |
| Audit logs empty | Verify configuration_audit_logs table exists |
| Settings showing old values | Clear browser cache and reload |

## Next Steps

1. ✅ Database migration applied
2. ✅ Backend services deployed
3. ✅ Frontend UI accessible
4. Configure initial settings for your business
5. Train admins on usage
6. Monitor audit logs for compliance
7. Set backup and archival policies
