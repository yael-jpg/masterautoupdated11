# Configuration Management Module - Implementation Guide

## Overview

The Configuration Management Module provides admin users with a centralized interface to control global system settings, business rules, and operational behavior without requiring code changes.

## Architecture

### Database Layer
- **configuration_settings**: Stores all configuration key-value pairs organized by category
- **configuration_audit_logs**: Immutable audit trail of all configuration changes

### Backend Layer
- **ConfigurationService**: Core service handling all configuration operations
- **configRoutes.js**: RESTful API endpoints

### Frontend Layer
- **SettingsPage.jsx**: Single-page interface with 8 categorized tabs
- **SettingsPage.css**: Enterprise-grade professional styling

## Features

### 1. General Settings (⚙️)
- System name
- Default currency
- Time zone
- Date format
- System logo
- System email
- Default language

### 2. Business Information (🏢)
- Business name
- Address
- Contact number
- Email
- VAT/Tax rate
- Registration number
- Operating hours (JSON)

### 3. Vehicle Configuration (🚗)
- Enable/disable vehicle makes management
- Enable/disable vehicle models management
- Enable/disable variants
- Plate number validation (with regex patterns)
- Default vehicle categories (JSON array)
- Allow placeholder plates

### 4. Booking Rules (📅)
- Guest booking eligibility
- Allow cancellation after partial payment
- Allow editing after approval
- Auto-complete when fully paid
- Auto-cancel unpaid bookings (hours)
- Minimum booking notice
- Multiple services per booking
- Phone verification requirement

### 5. Payment Configuration (💳)
- Enable/disable partial payments
- Minimum down payment percentage
- Accepted payment methods (JSON array)
- Enable/disable refunds
- Refund eligibility period (days)
- Payment due date
- Online payment gateway integration
- Online payment provider selection

### 6. Sales Configuration (📊)
- Include archived records in reports
- Default service pricing rules
- Daily sales auto-calculation
- Report generation time
- Sales target enablement
- Sales target amount
- Tax calculation method (inclusive/exclusive)

### 7. User Roles & Permissions (👥)
- Role definitions and permissions (JSON)
- Two-factor authentication requirement
- Session timeout
- Max login attempts before lockout
- Password expiry policy

### 8. Audit Logs (🔍)
- View all configuration changes
- Filter by category
- User identification
- Timestamp tracking
- Before/after values
- Pagination support

## API Endpoints

### Get All Settings
```
GET /api/config
Query Params: none
Response: { data: { category: [...settings] } }
```

### Get Category Settings
```
GET /api/config/:category
Authentication: Required (Admin only)
Response: { category, settings: {...}, count }
```

### Validate Input
```
POST /api/config/validate
Body: { category, key, value }
Response: { valid: true/false, error?: string }
```

### Update Setting
```
PUT /api/config/:category/:key
Body: { value, reason?: string }
Response: { success, message, newValue }
```

### Reset Category to Defaults
```
POST /api/config/:category/reset
Response: { success, message }
```

### Get Audit Logs
```
GET /api/config/logs/audit
Query Params: ?category=&limit=50&offset=0
Response: { data: [...logs], pagination: {...} }
```

### Get Frontend Configuration
```
GET /api/config/display/frontend
Response: { data: { general, features, payment, business } }
```

### Check Feature Enabled
```
GET /api/config/features/:feature
Param Format: category.key (e.g., "booking.enable_guest_booking")
Response: { feature, enabled: true/false }
```

## UI Features

### Tab Navigation
- 8 main tabs for different configuration categories
- Indicators for unsaved changes (orange dot)
- Quick switching between categories

### Form Fields
- **Text Input**: For string values, with placeholder hints
- **Toggle Switches**: For boolean values (ON/OFF)
- **JSON Editor**: For complex data types
- **Number Input**: For numeric values with validation

### Actions
- **Save Changes**: Submit form with dirty tracking
- **Reset to Defaults**: Revert category to default values
- **Audit Log View**: Complete change history

### Validation
- Client-side validation for improved UX
- Server-side validation for security
- Clear error messages with remedial guidance
- Type checking (string, boolean, number, JSON)

## Workflow

### 1. Admin Logs In
- Only users with `role === 'Admin'` see Configuration menu item
- Non-admin users cannot access settings page

### 2. Navigate to Settings
- Click "Configuration" in sidebar
- Load all configuration data from database
- Initialize draft state with current values

### 3. Edit Configuration
- Click toggle for boolean settings
- Type in input fields for text settings
- Unsaved changes marked with orange indicator

### 4. Save Changes
- Click "Save Changes" button
- Validate all inputs server-side
- Update database
- Log change in audit trail
- Reload configuration to sync

### 5. Audit Trail
- View all changes in "System Logs" tab
- See who changed what and when
- Filter by category
- Previous and new values visible
- Cannot be deleted (compliance)

## Security

### Access Control
- Admin role required to view/edit settings
- Role check on backend for all mutations
- Frontend validation for responsiveness
- Backend validation for security

### Audit Logging
- Every change logged with:
  - Category and key
  - Old and new values
  - User ID who made change
  - Timestamp
  - Optional change reason
- Audit logs are immutable (cannot be deleted)
- Retention policy: 365 days (configurable)

### Data Type Validation
- **Boolean**: Must be true/false
- **Number**: Must be numeric
- **String**: Free text with length limits
- **JSON**: Must be valid JSON format

## Database Installation

Run the migration to create tables and seed defaults:
```sql
mysql -u root -p masterauto < backend/sql/migrations/030_configuration_management.sql
```

## Backend File Locations

```
backend/src/
  services/
    configurationService.js     # Core configuration logic
  routes/
    configRoutes.js            # API endpoints
backend/sql/migrations/
  030_configuration_management.sql  # Database schema
```

## Frontend File Locations

```
frontend/src/
  pages/
    SettingsPage.jsx           # Main settings interface
    SettingsPage.css           # Professional styling
```

## Integration with Existing Features

### Using Configurations in Code

**Backend Example:**
```javascript
const ConfigurationService = require('./services/configurationService');

// Check if feature enabled
const guestBookingEnabled = await ConfigurationService.isFeatureEnabled('booking.enable_guest_booking');

// Get specific value
const minimumDownPayment = await ConfigurationService.get('payment', 'minimum_down_payment_percentage');

// Get all business info
const businessName = await ConfigurationService.get('business', 'business_name');
```

**Frontend Example:**
```javascript
// Fetch configuration on app load
const config = await fetch('/api/config/display/frontend').then(r => r.json());

// Use in logic
if (config.data.features.guestBooking) {
  // Show guest booking form
}

// Get business name for invoice
const businessName = config.data.business.name;
```

## Configuration Categories Reference

| Category | Purpose | Editable |
|----------|---------|----------|
| **general** | System display settings | Yes |
| **business** | Business identity & contact | Yes |
| **vehicle** | Vehicle rules & validation | Yes |
| **booking** | Appointment/booking rules | Yes |
| **payment** | Payment processing rules | Yes |
| **sales** | Sales & reporting rules | Yes |
| **roles** | User roles & security | Yes |
| **system** | System logs & status | Mixed |

## Default Values Reference

### General Settings
- System Name: "Master Auto"
- Default Currency: "PHP"
- Time Zone: "Asia/Manila"
- Date Format: "MM/DD/YYYY"

### Business Settings
- VAT Rate: 12%
- Business Name: "Master Auto Service Center"

### Booking Rules
- Auto-cancel after: 48 hours
- Minimum booking notice: 24 hours
- Guest booking: Disabled
- Edit after approval: Disabled

### Payment Configuration
- Partial payments: Enabled
- Minimum down payment: 30%
- Refunds: Enabled
- Refund eligibility: 30 days

## Troubleshooting

### Settings Not Saving

**Problem**: Changes don't persist after save  
**Solution**:
1. Check user role is 'Admin'
2. Verify database connection
3. Check browser console for errors
4. Try clearing browser cache

### Missing Configuration Menu

**Problem**: Configuration menu doesn't appear  
**Solution**:
1. Verify user is logged in as Admin
2. Check App.jsx routing is correct
3. Verify SettingsPage.jsx imported
4. Check role in localStorage

### Audit Logs Not Appearing

**Problem**: Configuration changes not logged  
**Solution**:
1. Verify configuration_audit_logs table exists
2. Check database user has INSERT permission
3. Verify ConfigurationService._logChange() called
4. Check server logs for SQL errors

## Performance Considerations

- Configuration is loaded on page mount
- No pagination for configuration (max ~50 entries)
- Audit logs use pagination (20 per page)
- Consider caching with TTL for high-frequency reads
- Lazy load if config grows beyond 100+ entries

## Scalability

For high-volume deployments:

1. **Cache Configuration**: Implement Redis caching with 5-minute TTL
2. **Audit Log Archival**: Move old logs to archive table after 365 days
3. **Database Indexing**: Already indexed on (category, key)
4. **Read Replicas**: Use read replica for audit log queries

## Compliance

- ✅ All changes logged with user identification
- ✅ Immutable audit trail (no deletion)
- ✅ Change timestamps for compliance
- ✅ Role-based access control
- ✅ Data type validation

## Future Enhancements

- [ ] Configuration versioning with rollback
- [ ] Batch configuration import/export
- [ ] Configuration templates by business type
- [ ] Scheduled configuration changes
- [ ] Configuration change notifications
- [ ] Advanced audit filtering and search
- [ ] Configuration dependency tracking
- [ ] A/B testing configuration variants
